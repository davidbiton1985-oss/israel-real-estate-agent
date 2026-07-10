// ==UserScript==
// @name         RE-Agent Yad2 Tab Watcher
// @namespace    israel-real-estate-agent
// @version      1.2
// @description  Watches YOUR open Yad2 search tab: every few minutes it re-checks the results and sends new listings to your local Israel Real Estate Agent (localhost:3000), which scores them and WhatsApps you strong matches. Runs only in your own browser session — no CAPTCHA bypass, no fake fingerprints, no login automation. If Yad2 ever shows a verification page, solve it yourself like normal and the watcher resumes.
// @match        https://www.yad2.co.il/realestate/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";
  var CHECK_EVERY_MS = 5 * 60 * 1000; // 5 minutes
  var JITTER_MS = 60 * 1000; // +0..60s random, so refreshes aren't robotic-regular
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
  function processPage() {
    var cards = collectCards();
    if (cards.length === 0) {
      // Either still loading, or Yad2 is showing a verification/empty page.
      // We do nothing special — no bypassing. You'll see it when you check the tab.
      setBadge("no listings visible (loading or verification page?)");
      return;
    }
    var seen = loadSeen();
    var fresh = cards.filter(function (c) {
      return seen.indexOf(c.id) === -1;
    });
    if (fresh.length === 0) {
      setBadge("watching · " + cards.length + " listings · nothing new " + new Date().toLocaleTimeString());
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
  // Wait for the page to render, process it, then reload after the interval
  // (+ jitter). A reload fetches fresh results exactly like pressing ⌘R.
  setTimeout(processPage, 6000); // let the SPA render listings first
  setTimeout(function () {
    location.reload();
  }, CHECK_EVERY_MS + Math.floor(Math.random() * JITTER_MS));
})();
