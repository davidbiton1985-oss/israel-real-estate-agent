// ==UserScript==
// @name         RE-Agent Facebook Groups Watcher
// @namespace    israel-real-estate-agent
// @version      1.0
// @description  Watches YOUR combined Facebook groups feed (facebook.com/groups/feed) in your own logged-in browser, and sends new posts to your local Israel Real Estate Agent (localhost:3000) — parsed, scored, WhatsApp'd. One tab covers all your groups. Runs only in your own session — no scraping server, no login/CAPTCHA bypass, no account automation. Facebook's page is messy, so this is best-effort and may need tuning.
// @match        https://www.facebook.com/groups/feed*
// @match        https://www.facebook.com/groups/feed/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";

  // POST via Tampermonkey's privileged request — bypasses Facebook's strict
  // page security policy (CSP), which blocks a plain fetch() to localhost.
  function postToApp(body, onDone) {
    try {
      GM_xmlhttpRequest({
        method: "POST",
        url: APP,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(body),
        timeout: 15000,
        onload: function (res) {
          var d = null;
          try { d = JSON.parse(res.responseText); } catch (e) {}
          onDone(d);
        },
        onerror: function () { onDone(null, "neterror"); },
        ontimeout: function () { onDone(null, "timeout"); },
      });
    } catch (e) {
      onDone(null, "exception");
    }
  }

  var CHECK_EVERY_MS = 5 * 60 * 1000;
  var JITTER_MS = 60 * 1000;
  var SEEN_KEY = "reAgentSeenFbPosts2"; // v2: fresh start (old key had stale entries from failed sends)
  var SEEN_MAX = 1000;
  var SCROLL_STEPS = 6; // how many times to scroll to load more posts before sending

  // --- status badge --------------------------------------------------------
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#4f46e5;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.9;direction:ltr;";
  badge.textContent = "RE-Agent FB: starting…";
  function setBadge(m) { badge.textContent = "RE-Agent FB: " + m; }
  function addBadge() { if (document.body) document.body.appendChild(badge); }
  if (document.body) addBadge(); else window.addEventListener("DOMContentLoaded", addBadge);

  // --- seen memory ---------------------------------------------------------
  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch (e) { return []; } }
  function saveSeen(a) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(a.slice(-SEEN_MAX))); } catch (e) {} }

  // cheap stable hash of a string → dedup key
  function hash(s) {
    var h = 0, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); h = ((h << 5) - h + c) | 0; }
    return "h" + h;
  }

  // Facebook UI chrome to strip (Hebrew + English), matched as whole lines.
  var UI_LINE = /^(like|comment|share|see more|all reactions|follow|join|write a comment|active|top contributor|see translation|לייק|אהבתי|תגובה|תגובות|שיתוף|שתף|הצג עוד|הצג את התרגום|כל התגובות|הצטרף|עקוב|כתוב תגובה|פעיל|כתוב\/כתבי תגובה|\d+[wdhms]|·|)$/i;

  function cleanPostText(raw) {
    return raw.split("\n").map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0 && !UI_LINE.test(l); })
      .join("\n").slice(0, 2000);
  }

  // Try to find a real post permalink inside an article element.
  function findPermalink(article) {
    var links = article.querySelectorAll('a[href*="/groups/"]');
    for (var i = 0; i < links.length; i++) {
      var h = links[i].href || "";
      if (/\/groups\/\d+\/(posts|permalink)\//.test(h)) return h.split("?")[0];
    }
    return null;
  }

  function collectPosts() {
    var articles = document.querySelectorAll('[role="article"]');
    var out = [];
    articles.forEach(function (a) {
      var txt = cleanPostText(a.innerText || "");
      // A real listing post has substance; skip reaction-only / tiny fragments.
      if (txt.length < 40) return;
      out.push({ text: txt, url: findPermalink(a) || location.href, key: hash(txt.slice(0, 140)) });
    });
    return out;
  }

  function sendNew() {
    var posts = collectPosts();
    if (posts.length === 0) { setBadge("no posts visible (loading, or Facebook layout changed?)"); return; }
    var seen = loadSeen();
    var fresh = posts.filter(function (p) { return seen.indexOf(p.key) === -1; });
    if (fresh.length === 0) { setBadge("watching · " + posts.length + " posts · nothing new " + new Date().toLocaleTimeString()); return; }
    setBadge("sending " + fresh.length + " new post(s)…");
    var sent = 0, alerts = 0, sentKeys = [], lastErr = null;
    function next(i) {
      if (i >= fresh.length) {
        // Only remember posts that ACTUALLY reached the app, so a blocked/failed
        // send retries next cycle instead of being lost.
        if (sentKeys.length) { seen = seen.concat(sentKeys); saveSeen(seen); }
        if (sent === 0 && lastErr) setBadge("could not reach app (" + lastErr + ") — is `npm run dev` running? " + new Date().toLocaleTimeString());
        else setBadge("sent " + sent + " new · " + alerts + " alert(s) 📱 · " + new Date().toLocaleTimeString());
        return;
      }
      var p = fresh[i];
      postToApp({ text: p.text, url: p.url, title: document.title }, function (d, err) {
        if (d && d.ok) { sent++; sentKeys.push(p.key); if (d.alertsSent > 0) alerts++; }
        else if (err) { lastErr = err; }
        setTimeout(function () { next(i + 1); }, 500);
      });
    }
    next(0);
  }

  // Scroll a few times to load more of the feed, then send, then reload later.
  function loadThenSend(step) {
    if (step < SCROLL_STEPS) {
      window.scrollTo(0, document.body.scrollHeight);
      setBadge("loading feed… (" + (step + 1) + "/" + SCROLL_STEPS + ")");
      setTimeout(function () { loadThenSend(step + 1); }, 2500);
    } else {
      window.scrollTo(0, 0);
      sendNew();
    }
  }

  setTimeout(function () { loadThenSend(0); }, 7000); // let the feed render first
  setTimeout(function () { location.reload(); }, CHECK_EVERY_MS + Math.floor(Math.random() * JITTER_MS));
})();
