// Telegram setup helper.
//   - With TELEGRAM_BOT_TOKEN set: calls getUpdates and prints the chat id(s)
//     of anyone who has messaged the bot (send your bot a message first).
//   - With TELEGRAM_CHAT_ID also set: sends a test message to confirm delivery.
import { readFileSync } from "fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional */
  }
}

async function main() {
  loadEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("Set TELEGRAM_BOT_TOKEN in .env first (get it from @BotFather → /newbot).");
    return;
  }
  const chat = process.env.TELEGRAM_CHAT_ID;

  if (!chat) {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const j: any = await r.json();
    if (!j.ok) {
      console.log("getUpdates failed:", JSON.stringify(j).slice(0, 200));
      return;
    }
    const chats = new Map<string, string>();
    for (const u of j.result || []) {
      const c = u.message?.chat || u.channel_post?.chat;
      if (c) chats.set(String(c.id), `${c.type} ${c.first_name || c.title || ""} @${c.username || ""}`.trim());
    }
    if (chats.size === 0) {
      console.log("No messages seen yet. Open your bot in Telegram, send it any message, then re-run this.");
      return;
    }
    console.log("Chat id(s) that have messaged the bot — put the right one in TELEGRAM_CHAT_ID:");
    for (const [id, who] of chats) console.log(`  ${id}   (${who})`);
    return;
  }

  // Both set → send a test
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: "✅ RE-Agent Telegram alerts are working. This is the channel your apartment alerts will now use." }),
  });
  const j: any = await res.json();
  console.log(res.ok ? `Test sent OK to chat ${chat} — check Telegram.` : `Test FAILED: ${JSON.stringify(j).slice(0, 200)}`);
}

main().catch((e) => {
  console.error("[telegram-setup]", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
