// ==UserScript==
// @name         RE-Agent Yad2 Tab Watcher
// @namespace    israel-real-estate-agent
// @version      1.0
// @description  Watches YOUR open Yad2 search tab: every few minutes it re-checks the results and sends new listings to your local Israel Real Estate Agent (localhost:3000), which scores them and WhatsApps you strong matches. Runs only in your own browser session — no CAPTCHA bypass, no fake fingerprints, no login automation. If Yad2 ever shows a verification page, solve it yourself like normal and the watcher resumes.
// @match        https://www.yad2.co.il/realestate/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";
  var CHECK_EVERY_MS = 5 * 60 * 1000; // 5 minutes
  var JITTER_MS = 60 * 1000; // +0..60s random, so refreshes aren't robotic-regular
  var SEEN_KEY = "reAgentSeenYad2Ids";
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
    } catch (e) {
      return [];
    }
  }
  function saveSeen(arr) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-SEEN_MAX)));
    } catch (e) {}
  }

  // --- collect listing cards from the page ---------------------------------
  // Deliberately generic: find links to /item/<id> (the stable part of Yad2's
  // URL structure) and take the surrounding card's visible text. The app's
  // Hebrew parser does the real field extraction, so DOM redesigns rarely matter.
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
      // climb to a container with enough text to parse (price/rooms/city live there)
      var node = a;
      var text = "";
      for (var up = 0; up < 6 && node; up++) {
        text = (node.innerText || "").replace(/\s+\n/g, "\n").trim();
        if (text.length > 60) break;
        node = node.parentElement;
      }
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
    function next(idx) {
      if (idx >= fresh.length) {
        seen = seen.concat(
          fresh.map(function (c) {
            return c.id;
          })
        );
        saveSeen(seen);
        setBadge("sent " + sent + " new · " + alerts + " alert(s) 📱 · " + new Date().toLocaleTimeString());
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
            if (d.alertsSent > 0) alerts++;
          }
        })
        .catch(function () {
          setBadge("app not reachable — is `npm run dev` running?");
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
