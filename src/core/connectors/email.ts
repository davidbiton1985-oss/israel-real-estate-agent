// Automatic ingestion via email: polls an IMAP inbox for saved-search alert
// emails (Yad2's own alert emails, other portals, broker mailing lists) and
// feeds them into the normal parse→dedup→score→alert pipeline.
//
// This is the safe/user-authorized automatic path: the portals push new
// listings to YOUR inbox through their official alert feature; the app only
// reads your own mailbox. No scraping, no CAPTCHA/login bypass, no account
// risk. Pure text helpers are separated from IMAP I/O so they can be unit
// tested without a mail server.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Source } from "../pipeline";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REQUIRED_VARS = ["IMAP_HOST", "IMAP_USER", "IMAP_PASS"] as const;

export function emailConfigVars(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Cheap HTML→text for alert emails when no plain-text part exists. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** First listing URL in the email — Yad2 item links win over anything else. */
export function extractListingUrl(text: string): string | null {
  const yad2 = text.match(/https?:\/\/(?:www\.)?yad2\.co\.il\/[^\s"'<>)\]]+/i);
  if (yad2) return yad2[0];
  const madlan = text.match(/https?:\/\/(?:www\.)?madlan\.co\.il\/[^\s"'<>)\]]+/i);
  if (madlan) return madlan[0];
  return null;
}

/** Map the sender domain to a listing source so source-specific dedup applies. */
export function senderToSource(fromAddress: string): Source {
  const lower = fromAddress.toLowerCase();
  if (lower.includes("yad2")) return "YAD2";
  if (lower.includes("facebook")) return "FACEBOOK";
  return "EMAIL";
}

export interface EmailRawItem {
  rawText: string;
  url: string | null;
  source: Source;
  subject: string;
}

/**
 * Turn one alert email into one ingestible raw item.
 * Returns null for emails that clearly aren't listing alerts (no usable text).
 * NOTE: assumes "immediate"-style alerts (one listing per email) — configure
 * Yad2 alerts as immediate, not daily digest, for best results (see README).
 */
export function emailToRawItem(fromAddress: string, subject: string, textBody: string): EmailRawItem | null {
  const text = textBody.trim();
  if (text.length < 20) return null; // empty/stub email — nothing to parse
  const rawText = `${subject}\n${text}`;
  return {
    rawText,
    url: extractListingUrl(rawText),
    source: senderToSource(fromAddress),
    subject,
  };
}

/** Optional sender allow-list from EMAIL_ALLOWED_SENDERS ("yad2,broker@x.com"). */
export function senderAllowed(fromAddress: string, allowListCsv: string | undefined): boolean {
  const csv = (allowListCsv ?? "").trim();
  if (!csv) return true; // no filter configured → accept all senders
  const needles = csv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const lower = fromAddress.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

// ---------------------------------------------------------------------------
// IMAP I/O
// ---------------------------------------------------------------------------

export interface EmailPollResult {
  ok: boolean;
  error?: string;
  itemsFound: number; // unseen emails inspected
  items: EmailRawItem[];
}

/**
 * Fetch UNSEEN messages from the configured folder, convert each to a raw item,
 * and mark them \Seen so they are not reprocessed next tick. (The pipeline's
 * fingerprint dedup is a second safety net if anything is ever re-read.)
 */
export async function pollEmailInbox(): Promise<EmailPollResult> {
  const { configured, missing } = emailConfigVars();
  if (!configured) {
    return { ok: false, error: `IMAP not configured (missing: ${missing.join(", ")})`, itemsFound: 0, items: [] };
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? "993"),
    secure: (process.env.IMAP_SECURE ?? "true") !== "false",
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
    logger: false,
  });

  const folder = process.env.IMAP_FOLDER ?? "INBOX";
  const allowList = process.env.EMAIL_ALLOWED_SENDERS;
  const items: EmailRawItem[] = [];
  let itemsFound = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      for (const uid of uids) {
        itemsFound++;
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text ?? "";
        if (!senderAllowed(from, allowList)) {
          // Not a listing-alert sender — leave it unread for the human.
          continue;
        }
        const body = (parsed.text && parsed.text.trim()) || (parsed.html ? htmlToText(parsed.html) : "");
        const item = emailToRawItem(from, parsed.subject ?? "", body);
        if (item) items.push(item);
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true, itemsFound, items };
  } catch (e) {
    try {
      await client.logout();
    } catch {
      /* already disconnected */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e), itemsFound, items };
  }
}
