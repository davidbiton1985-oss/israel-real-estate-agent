// ==UserScript==
// @name         RE-Agent Yad2 Tab Watcher
// @namespace    israel-real-estate-agent
// @version      1.5
// @description  Watches YOUR open Yad2 search tab: every 7–10 min (randomized, slower overnight) it re-checks the results and sends new listings to your local Israel Real Estate Agent (localhost:3000), which scores them and WhatsApps you strong matches. Runs only in your own browser session — no CAPTCHA bypass, no fake fingerprints, no login automation. If Yad2 shows a verification page the watcher BACKS OFF and stops hammering it; solve it yourself like normal and it resumes.
// @match        https://www.yad2.co.il/realestate/*
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
    return Number(localStorage.getItem(EMPTY_KEY) || "0");
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
  function scheduleReload(ms) {
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
    scheduleReload(inQuietHours() ? BACKOFF_MS : randInterval());
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
      if (text.length >= 25) found[id] = { id: id, url: href, text: text.slice(0, 1200) };
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
      fetch(APP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heartbeat: "YAD2" }) });
    } catch {}
  }

  function processPage() {
    var cards = collectCards();
    if (cards.length === 0) {
      // Either still loading, or Yad2 is showing a verification/empty page.
      // We do nothing special — no bypassing. planNext backs off instead of
      // hammering, and after a few empty reads assumes a challenge and crawls.
      planNext("empty"); // sets its own badge; NO heartbeat (unreadable ≠ healthy)
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
      fetch(APP, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: c.text, url: c.url, title: document.title }),
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
  setTimeout(processPage, 6000 + Math.floor(Math.random() * 3000)); // jittered render wait
})();
