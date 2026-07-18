// ==UserScript==
// @name         RE-Agent Yad2 Tab Watcher
// @namespace    israel-real-estate-agent
// @version      1.9
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
  var MIN_MS = 7 * 60 * 1000; // never refresh faster than every 7 min
  var MAX_MS = 10 * 60 * 1000; // …nor slower than every 10 min when healthy
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

  // --- tiny status badge (bottom-right) ------------------------------------
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:99999;background:#1e293b;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.85;direction:ltr;";
  badge.textContent = "RE-Agent: starting…";
  function setBadge(msg) {
    badge.textContent = "RE-Agent: " + msg;
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

  function collectCards() {
    var anchors = document.querySelectorAll('a[href*="/item/"]');
    var found = {};
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.href ? a.href.split("?")[0] : "";
      var m = href.match(/\/item\/([A-Za-z0-9]+)/);
      if (!m) continue;
      var id = m[1];
      if (found[id]) continue;
      // Climb to the SINGLE card: the largest ancestor that still references only
      // THIS item id. Stop before an ancestor that also links a different /item/ —
      // the old "first ancestor over 60 chars" rule grabbed the whole results grid,
      // merging many apartments into one record with a mismatched URL.
      var node = a;
      for (var up = 0; up < 8 && node.parentElement; up++) {
        var parent = node.parentElement;
        if (itemIdsIn(parent).length > 1) break; // parent holds another listing → stop
        node = parent;
      }
      var text = (node.innerText || "").replace(/\s+\n/g, "\n").trim();
      // v1.8: grab the card's apartment photo (first real-size <img>) —
      // the app localizes it and shows it on rows and the listing page.
      var image = null;
      var imgs = node.querySelectorAll("img");
      for (var k = 0; k < imgs.length; k++) {
        var src = imgs[k].currentSrc || imgs[k].src || "";
        if (!/^https?:/.test(src)) continue;
        if ((imgs[k].naturalWidth || imgs[k].width || 0) < 120) continue; // icons/avatars
        image = src;
        break;
      }
      if (text.length >= 25) found[id] = { id: id, url: href, text: text.slice(0, 1200), image: image };
    }
    return Object.keys(found).map(function (k) {
      return found[k];
    });
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

  function processPage() {
    readCardsWithRetry(0, function (cards) {
      handleCards(cards);
    });
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

  function handleCards(cards) {
    sendImageBackfill(cards);
    if (cards.length === 0) {
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
  setTimeout(function () {
    // Guard the synchronous entry: if processPage throws before scheduling, the
    // fallback timer (armed above) still reloads, but back it off explicitly too.
    try { processPage(); } catch (e) { scheduleReload(BACKOFF_MS); }
  }, 6000 + Math.floor(Math.random() * 3000)); // jittered render wait
})();
