// ==UserScript==
// @name         RE-Agent Yad2 Tab Watcher
// @namespace    israel-real-estate-agent
// @version      1.19
// @description  Watches YOUR open Yad2 search tab: every 7–10 min (randomized, slower overnight) it re-checks the results and sends new listings to your local Israel Real Estate Agent (localhost:3000), which scores them and WhatsApps you strong matches. Runs only in your own browser session — no CAPTCHA bypass, no fake fingerprints, no login automation. If Yad2 shows a verification page the watcher BACKS OFF and stops hammering it; solve it yourself like normal and it resumes.
// @match        https://www.yad2.co.il/realestate/*
// @noframes
// @grant        none
// @updateURL    https://raw.githubusercontent.com/davidbiton1985-oss/israel-real-estate-agent/main/docs/yad2-tab-watcher.user.js
// @downloadURL  https://raw.githubusercontent.com/davidbiton1985-oss/israel-real-estate-agent/main/docs/yad2-tab-watcher.user.js
// ==/UserScript==

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";
  // Polite, human-ish pacing. A fixed 5-min reload, 24/7, is BOTH a robotic
  // signature and needless load — anti-bot systems (Yad2 runs PerimeterX) flag
  // exactly that regularity. Each cycle now waits a fresh random gap in
  // [MIN,MAX] — e.g. 7m05s, then 8m31s, then 9m48s — never a round, repeating
  // number. This isn't evasion: a well-behaved client backs off and jitters;
  // we still never touch the CAPTCHA itself.
  // v1.11: slower cadence — 7–10 min was ~7 full page loads/hour, which soft-
  // throttled the browser session (Yad2 served its error page; verified Yad2
  // itself was fine via a phone on cellular). New listings don't appear every
  // 8 min, so 12–18 min still catches them while roughly halving our footprint.
  var MIN_MS = 12 * 60 * 1000;
  var MAX_MS = 18 * 60 * 1000;
  // When the page shows nothing readable — still loading, OR a "prove you're
  // human" checkpoint — do NOT keep reloading on the normal cadence. A human
  // stuck on a CAPTCHA doesn't refresh every few minutes, and reloading a
  // challenge page is what escalates a soft check into a hard block (this is
  // exactly how both tabs got wedged). Back off hard, then crawl.
  var BACKOFF_MS = 20 * 60 * 1000; // 1st–2nd empty read: slow retry
  var PAUSE_RETRY_MS = 30 * 60 * 1000; // after that: assume challenge, crawl + nag
  var EMPTY_BEFORE_PAUSE = 3;
  // Humans sleep. Reloads landing on the dot at 03:00 are an easy tell, and no
  // rentals post overnight — so pace down (not off, so it self-heals) at night.
  var QUIET_START_HOUR = 0;
  var QUIET_END_HOUR = 7;
  // Persisted because the userscript re-runs FROM SCRATCH on every reload — an
  // in-memory counter would reset to 0 each cycle and never reach the pause.
  var EMPTY_KEY = "reAgentYad2EmptyStreak";
  // v2 key: v1.1 fixed per-card capture, so previously mis-captured listings must
  // be re-sent once with correct text↔URL pairing. Rotating the key does that.
  var SEEN_KEY = "reAgentSeenYad2Ids_v2";
  var SEEN_MAX = 800;

  // v1.12: single-instance lease. TWO Yad2 tabs each running this script both
  // reload the results page on their own cadence → double the request rate,
  // which soft-throttled the session (this actually happened — a forgotten
  // second tab in another window). A localStorage lease (Yad2 does NOT prune
  // it) elects ONE active watcher; other tabs stay fully passive (zero Yad2
  // requests) and take over only if the active tab's lease goes stale.
  var LEASE_KEY = "reAgentYad2Lease"; // { id, at }
  // v1.13: the active tab RENEWS the lease every RENEW_MS (a heartbeat, not only
  // on the 12–18 min reloads), so a stale lease reliably means the owner tab is
  // gone. v1.12 renewed only on reload, so a closed tab's lease looked "fresh"
  // for up to 28 min and wedged the survivor as passive (what happened here).
  var RENEW_MS = 90 * 1000; // active tab re-stamps the lease this often
  var LEASE_STALE_MS = 4 * 60000; // no renewal in this long → owner is gone (>> RENEW_MS)
  var TAB_ID = (function () {
    var k = "reAgentYad2TabId";
    var v = sessionStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem(k, v); } catch (e) {} }
    return v;
  })();
  function readLease() { try { return JSON.parse(localStorage.getItem(LEASE_KEY) || "null"); } catch (e) { return null; } }
  function renewLease() { try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id: TAB_ID, at: Date.now() })); } catch (e) {} }
  // Another tab is actively watching only if it holds the lease AND renewed it
  // recently. A stale timestamp (closed tab) frees the lease for takeover.
  function leaseOwnedByOther() {
    var l = readLease();
    return !!l && l.id !== TAB_ID && Date.now() - l.at < LEASE_STALE_MS;
  }

  // --- tiny status badge (bottom-right) ------------------------------------
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:99999;background:#1e293b;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.85;direction:ltr;";
  // Show the ACTUAL installed version in the badge (read from Tampermonkey), so
  // we can tell at a glance whether a paste/update really took effect.
  var VERSION = (typeof GM_info !== "undefined" && GM_info.script && GM_info.script.version) || "?";
  badge.textContent = "RE-Agent v" + VERSION + ": starting…";
  function setBadge(msg) {
    badge.textContent = "RE-Agent v" + VERSION + ": " + msg;
  }
  function addBadge() {
    if (document.body) document.body.appendChild(badge);
  }
  if (document.body) addBadge();
  else window.addEventListener("DOMContentLoaded", addBadge);

  // --- seen-listing memory (survives reloads via localStorage) --------------
  function loadSeen() {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveSeen(arr) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-SEEN_MAX)));
    } catch {}
  }

  // --- consecutive empty/challenge reads (persisted across reloads) ----------
  function getEmptyStreak() {
    try {
      var n = Number(localStorage.getItem(EMPTY_KEY) || "0");
      return isNaN(n) ? 0 : n; // guard read + corrupt value (was unwrapped → could throw/NaN-wedge)
    } catch {
      return 0;
    }
  }
  function setEmptyStreak(n) {
    try {
      localStorage.setItem(EMPTY_KEY, String(n));
    } catch {}
  }

  // --- pacing: decide when (if at all) to reload next ------------------------
  function randInterval() {
    // continuous ms across [MIN_MS, MAX_MS] → 7m05s, 8m31s, 9m48s, …
    return MIN_MS + Math.floor(Math.random() * (MAX_MS - MIN_MS + 1));
  }
  function inQuietHours() {
    var h = new Date().getHours();
    return h >= QUIET_START_HOUR && h < QUIET_END_HOUR;
  }
  function quietInterval() {
    // random 20–30 min overnight — slower, but still non-robotic (no on-the-dot beat)
    return 20 * 60000 + Math.floor(Math.random() * 10 * 60000);
  }
  // Hard "never wedge" guarantee: a fallback reload is armed on every page load
  // and cancelled by the first real scheduleReload. If a cycle ever throws or
  // hangs before scheduling (e.g. the local server accepts the socket but never
  // responds), this still reloads and the watcher recovers on its own.
  var fallbackTimer = setTimeout(function () { location.reload(); }, MAX_MS + 5 * 60000);
  function scheduleReload(ms) {
    try { clearTimeout(fallbackTimer); } catch {}
    setTimeout(function () {
      location.reload();
    }, ms);
  }
  // Called once per page cycle. status "ok" = listings were readable; "empty" =
  // nothing readable (loading or a verification checkpoint).
  function planNext(status) {
    if (status === "empty") {
      var n = getEmptyStreak() + 1;
      setEmptyStreak(n);
      if (n >= EMPTY_BEFORE_PAUSE) {
        setBadge("verification page? solve it in THIS tab — slow-retrying every " + Math.round(PAUSE_RETRY_MS / 60000) + "m");
        scheduleReload(PAUSE_RETRY_MS);
      } else {
        setBadge("no listings (loading or verification?) — backing off " + Math.round(BACKOFF_MS / 60000) + "m");
        scheduleReload(BACKOFF_MS);
      }
      return;
    }
    setEmptyStreak(0);
    scheduleReload(inQuietHours() ? quietInterval() : randInterval());
  }

  // --- collect listing cards from the page ---------------------------------
  // Deliberately generic: find links to /item/<id> (the stable part of Yad2's
  // URL structure) and take the surrounding card's visible text. The app's
  // Hebrew parser does the real field extraction, so DOM redesigns rarely matter.

  // Distinct Yad2 item ids linked inside `el` (dedupes the image+title links that
  // both point at the same listing). Used to detect when a container bundles more
  // than one apartment.
  function itemIdsIn(el) {
    var out = {};
    var as = el.querySelectorAll('a[href*="/item/"]');
    for (var j = 0; j < as.length; j++) {
      var mm = (as[j].href || "").match(/\/item\/([A-Za-z0-9]+)/);
      if (mm) out[mm[1]] = 1;
    }
    return Object.keys(out);
  }

  // v1.19: read the SSR data (__NEXT_DATA__) instead of scraping rendered cards.
  // Yad2 virtualizes the list — only ~20 of ~40 cards render with text at a
  // time, so DOM scraping missed the rest (incl. new PRIVATE listings buried
  // under promoted broker ads). The Next.js payload holds the FULL page feed
  // (feed.private + feed.agency, ~40 listings) as structured JSON, present the
  // instant the page loads — no scrolling, no render race, exact fields.
  function nd2text(L) {
    var a = L.address || {}, ad = L.additionalDetails || {};
    var city = (a.city && a.city.text) || "";
    var hood = (a.neighborhood && a.neighborhood.text) || (a.area && a.area.text) || "";
    var street = (a.street && a.street.text) || "";
    var houseNum = a.house && a.house.number ? " " + a.house.number : "";
    var floor = a.house && a.house.floor != null ? a.house.floor : null;
    var p = ["להשכרה"];
    if (city) p.push(city);
    if (hood) p.push("שכונת " + hood);
    if (street) p.push("רחוב " + street + houseNum);
    if (ad.roomsCount != null) p.push(ad.roomsCount + " חדרים");
    if (floor != null) p.push("קומה " + floor);
    if (ad.squareMeter != null) p.push(ad.squareMeter + ' מ"ר');
    if (L.price != null) p.push(L.price + " ₪");
    if (L.adType === "private") p.push("מהבעלים ללא תיווך");
    return p.filter(Boolean).join(", ");
  }
  function collectCardsFromData() {
    var el = document.getElementById("__NEXT_DATA__");
    if (!el) return null;
    var feed;
    try { feed = JSON.parse(el.textContent).props.pageProps.feed; } catch (e) { return null; }
    if (!feed || (!feed.private && !feed.agency)) return null;
    var lists = (feed.private || []).concat(feed.agency || []);
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      var L = lists[i], id = L && L.token;
      if (!id || seen[id]) continue;
      seen[id] = 1;
      var text = nd2text(L);
      if (text.length < 15) continue;
      out.push({
        id: id,
        url: "https://www.yad2.co.il/realestate/item/" + id,
        text: text,
        image: (L.metaData && L.metaData.coverImage) || null,
      });
    }
    return out;
  }
  function collectCards() {
    var fromData = collectCardsFromData();
    if (fromData && fromData.length) return fromData;
    return collectCardsFromDom(); // fallback if the SSR payload shape ever changes
  }
  function collectCardsFromDom() {
    var anchors = document.querySelectorAll('a[href*="/item/"]');
    var found = {};
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.href ? a.href.split("?")[0] : "";
      var m = href.match(/\/item\/([A-Za-z0-9]+)/);
      if (!m) continue;
      var id = m[1];
      if (found[id]) continue;
      var node = a;
      for (var up = 0; up < 8 && node.parentElement; up++) {
        var parent = node.parentElement;
        if (itemIdsIn(parent).length > 1) break;
        node = parent;
      }
      var text = (node.innerText || "").replace(/\s+\n/g, "\n").trim();
      var image = null;
      var imgs = node.querySelectorAll("img");
      for (var k = 0; k < imgs.length; k++) {
        var src = imgs[k].currentSrc || imgs[k].src || "";
        if (!/^https?:/.test(src)) continue;
        if ((imgs[k].naturalWidth || imgs[k].width || 0) < 120) continue;
        image = src;
        break;
      }
      if (text.length >= 25) found[id] = { id: id, url: href, text: text.slice(0, 1200), image: image };
    }
    return Object.keys(found).map(function (k) { return found[k]; });
  }

  // --- send new cards to the app -------------------------------------------
  // "Alive, nothing new" — without this, a quiet market looks identical to a
  // dead tab and the watchdog sends false WhatsApp nudges.
  function heartbeat() {
    try {
      fetch(APP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heartbeat: "YAD2" }) }).catch(function () {});
    } catch {}
  }

  // Poll the SPA a few times before concluding the page is empty — a slow render
  // must not be misread as a challenge (which would false-nag and drop cadence).
  function readCardsWithRetry(attempt, done) {
    var cards = collectCards();
    if (cards.length > 0 || attempt >= 4) { done(cards); return; }
    setTimeout(function () { readCardsWithRetry(attempt + 1, done); }, 3000);
  }
  // A PerimeterX/verification page is near-empty; a normal Yad2 results page —
  // even one with zero matches — still renders the full header/filter chrome.
  function pageLooksBlocked() {
    try {
      if (document.querySelector('#px-captcha, [id*="px-captcha"], iframe[src*="captcha" i]')) return true;
      return document.querySelectorAll("a, button").length < 8;
    } catch {
      return false;
    }
  }

  // v1.15: Yad2 VIRTUALIZES the results list — only the ~20 cards currently in
  // view are rendered WITH TEXT; the rest (~30 more, incl. new private listings
  // buried under promoted broker ads) have their link in the DOM but no readable
  // text yet, so collectCards skipped them and the bot missed live apartments.
  // Scroll through the page in steps, harvesting at EACH position, so every card
  // is read as it renders. No extra page loads — just scrolling (gentle).
  // v1.16: Yad2 renders the results progressively — reading right after load
  // sees only the ~20 cards rendered so far, so 30+ (incl. new private listings
  // buried under promoted ads) were missed on TIMING alone. Scroll through the
  // page harvesting at each step, and keep going until the harvested count stops
  // growing (fully rendered) before reading. No extra page loads — just scroll.
  // v1.19: the full feed is in __NEXT_DATA__ the instant the page loads, so a
  // single read (with a short retry for SPA hydration) captures all ~40 — no
  // scrolling, no render race.
  function processPage() {
    readCardsWithRetry(0, function (cards) { handleCards(cards); });
  }

  // v1.9: photo backfill — the app only received images for NEW cards, so
  // everything captured before v1.8 hangs photo-less. Report url→image for
  // EVERY visible card each cycle; the server attaches photos to known
  // listings that lack one (cheap: server ignores already-photographed).
  function sendImageBackfill(cards) {
    try {
      var pairs = [];
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].image) pairs.push({ url: cards[i].url, image: cards[i].image });
      }
      if (pairs.length === 0) return;
      fetch(APP, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBackfill: pairs }),
      }).catch(function () {});
    } catch (e) {}
  }

  // v1.10: Yad2's generic error/overload page ("אופס... תקלה! זה לא אתם, זה
  // אנחנו — המתינו כמה דקות ונסו שנית"). It is NOT a captcha and has full nav
  // chrome, so pageLooksBlocked() misses it — the watcher was treating it as
  // "healthy · 0 listings" and reloading into it every 7–10 min (and falsely
  // heartbeating). Detect it and stand down, like a verification page.
  function yad2Erroring() {
    try {
      var t = (document.body && document.body.innerText) || "";
      return /אופס|זה לא אתם,?\s*זה אנחנו|המתינו כמה דקות ונסו|נסו שנית מאוחר יותר/i.test(t);
    } catch (e) {
      return false;
    }
  }

  function handleCards(cards) {
    sendImageBackfill(cards);
    if (cards.length === 0) {
      if (yad2Erroring()) {
        // Error page — back off hard, do NOT reload every few minutes and do
        // NOT heartbeat (a refusing Yad2 is not a healthy sensor).
        setBadge("⚠ יד2 מציג שגיאה — לא מרענן, מנסה שוב בעוד " + Math.round(PAUSE_RETRY_MS / 60000) + "m");
        scheduleReload(PAUSE_RETRY_MS);
        return;
      }
      if (pageLooksBlocked()) {
        // Verification/blank page — back off, don't hammer, don't bypass.
        planNext("empty"); // sets its own badge; NO heartbeat (unreadable ≠ healthy)
      } else {
        // Genuinely empty results on a healthy page (or still-thin render): report
        // alive so the watchdog doesn't false-alarm, and keep the normal cadence.
        heartbeat();
        setEmptyStreak(0);
        setBadge("watching · 0 listings · " + new Date().toLocaleTimeString());
        scheduleReload(inQuietHours() ? quietInterval() : randInterval());
      }
      return;
    }
    var seen = loadSeen();
    var fresh = cards.filter(function (c) {
      return seen.indexOf(c.id) === -1;
    });
    if (fresh.length === 0) {
      heartbeat();
      setBadge("watching · " + cards.length + " listings · nothing new " + new Date().toLocaleTimeString());
      planNext("ok");
      return;
    }
    setBadge("sending " + fresh.length + " new listing(s)…");
    var sent = 0;
    var alerts = 0;
    var okIds = []; // mark seen ONLY what the server CONFIRMED — a failed send
    // (server restarting/unreachable) must be retried next cycle, not lost.
    function next(idx) {
      if (idx >= fresh.length) {
        seen = seen.concat(okIds);
        saveSeen(seen);
        setBadge("sent " + sent + "/" + fresh.length + " new · " + alerts + " alert(s) 📱 · " + new Date().toLocaleTimeString());
        planNext("ok");
        return;
      }
      var c = fresh[idx];
      // Timeout: a local server that accepts the socket but never responds would
      // otherwise leave this promise unsettled forever → the chain (and the next
      // reload) would never advance. Abort after 15s so the cycle always finishes.
      var ctrl = new AbortController();
      var to = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 15000);
      fetch(APP, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: c.text, url: c.url, title: document.title, image: c.image || undefined }),
        signal: ctrl.signal,
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && d.ok) {
            sent++;
            okIds.push(c.id);
            if (d.alertsSent > 0) alerts++;
          }
          // d.ok=false (e.g. merged-capture guard) also counts as handled:
          if (d && d.ok === false) okIds.push(c.id);
        })
        .catch(function () {
          setBadge("app not reachable — will retry these next cycle");
        })
        .then(function () {
          clearTimeout(to);
          setTimeout(function () {
            next(idx + 1);
          }, 400); // gentle pacing between posts
        });
    }
    next(0);
  }

  // --- main loop -------------------------------------------------------------
  // Wait for the SPA to render, process the page once, then let planNext()
  // decide the next reload: a fresh random 7–10 min gap when healthy, a long
  // back-off when the page looks blocked. There is deliberately NO unconditional
  // reload timer here anymore — that was what kept reloading the verification
  // page every 5 minutes and escalated the block.
  // v1.19: Yad2's map view appends &bBox=… (+ &zoom=) which CROPS the feed to
  // the map bounds, hiding listings outside it — this is what buried the private
  // Kiryat Ono listings in one tab. Always read the FULL, uncropped feed: if the
  // URL carries a bbox/zoom, reload the clean search first (before anything else).
  (function () {
    var u = location.href;
    if (/[?&](bBox|zoom)=/i.test(u)) {
      var clean = u.split("#")[0].replace(/[?&](bBox|zoom)=[^&]*/gi, "").replace(/([?&])&+/g, "$1").replace(/[?&]+$/, "");
      if (clean !== u.split("#")[0]) { location.replace(clean); }
    }
  })();

  setTimeout(function () {
    // Single-instance guard: if another tab is the active watcher, stay fully
    // passive — no scan, NO reload (zero Yad2 requests) — and just poll the
    // lease so we can take over if that tab is closed.
    if (leaseOwnedByOther()) {
      try { clearTimeout(fallbackTimer); } catch (e) {} // a passive tab must NOT reload
      setBadge("passive · טאב אחר של יד2 הוא החיישן הפעיל");
      setInterval(function () {
        if (!leaseOwnedByOther()) { renewLease(); location.reload(); } // owner gone → take over (~within a minute)
      }, 60 * 1000);
      return;
    }
    renewLease(); // claim ownership
    // Heartbeat: keep the lease warm while alive (so a survivor never waits long
    // for a closed tab), and yield to passive if another tab wins the lease.
    setInterval(function () {
      if (leaseOwnedByOther()) { location.reload(); } // another tab took over → become passive
      else renewLease();
    }, RENEW_MS);
    // Guard the synchronous entry: if processPage throws before scheduling, the
    // fallback timer (armed above) still reloads, but back it off explicitly too.
    try { processPage(); } catch (e) { scheduleReload(BACKOFF_MS); }
  }, 6000 + Math.floor(Math.random() * 3000)); // jittered render wait
})();
