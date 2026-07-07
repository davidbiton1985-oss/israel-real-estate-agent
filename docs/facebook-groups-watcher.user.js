// ==UserScript==
// @name         RE-Agent Facebook Groups Watcher
// @namespace    israel-real-estate-agent
// @version      9.0
// @description  Watches YOUR combined Facebook groups feed (facebook.com/groups/feed) in your own logged-in browser, and sends new posts to your local Israel Real Estate Agent (localhost:3000) — parsed, scored, WhatsApp'd. One tab covers all your groups. Runs only in your own session — no scraping server, no login/CAPTCHA bypass, no account automation. Facebook's page is messy, so this is best-effort and may need tuning.
// @match        https://www.facebook.com/groups/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";

  // POST via Tampermonkey's privileged request — bypasses Facebook's strict
  // page security policy (CSP), which blocks a plain fetch() to localhost.
  function postToApp(body, onDone) {
    if (typeof GM_xmlhttpRequest !== "function") { onDone(null, "NO_GM_API"); return; }
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
          onDone(d, d ? null : "HTTP" + res.status);
        },
        onerror: function (res) { onDone(null, "neterr" + (res && res.status ? res.status : "")); },
        ontimeout: function () { onDone(null, "timeout"); },
      });
    } catch (e) {
      onDone(null, "throw:" + (e && e.message ? e.message.slice(0, 20) : "?"));
    }
  }

  var CHECK_EVERY_MS = 5 * 60 * 1000;
  var JITTER_MS = 60 * 1000;
  var SEEN_KEY = "reAgentSeenFbPosts4";
  var SEEN_MAX = 1000;
  var SCROLL_STEPS = 25;   // how many viewport-steps to scroll through the feed
  var STEP_DELAY_MS = 1800; // pause per step so posts + "See more" render before we read

  // --- status badge --------------------------------------------------------
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#4f46e5;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.9;direction:ltr;";
  badge.textContent = "RE-Agent FB: starting…";
  function setBadge(m) { badge.textContent = "RE-Agent FBv9: " + m; }
  // Manual "capture selected post" button — the reliable path. Facebook makes
  // posts and comments look identical to code, so auto-reading grabs comments;
  // but YOU can see which is a real apartment post. Select its text, click this.
  var capBtn = document.createElement("button");
  capBtn.textContent = "📩 Send selected apartment";
  capBtn.style.cssText =
    "position:fixed;bottom:44px;right:10px;z-index:2147483647;background:#16a34a;color:#fff;border:none;" +
    "font:12px/1.4 -apple-system,Arial;padding:8px 11px;border-radius:8px;cursor:pointer;opacity:.95;";
  function resetBtn() { capBtn.textContent = "📩 Send selected apartment"; }
  capBtn.onclick = function () {
    var t = (window.getSelection().toString() || "").trim();
    if (t.length < 20) { capBtn.textContent = "⚠ select the post text first"; setTimeout(resetBtn, 2500); return; }
    capBtn.textContent = "sending…";
    postToApp({ text: t, url: location.href, title: "" }, function (d, err) {
      if (d && d.ok) capBtn.textContent = "✓ sent · score " + (d.topScore != null ? d.topScore : "?") + (d.alertsSent > 0 ? " · 📱 alert!" : "");
      else capBtn.textContent = "✗ failed (" + (err || "?") + ")";
      setTimeout(resetBtn, 4000);
    });
  };

  function addBadge() { if (document.body) { document.body.appendChild(badge); document.body.appendChild(capBtn); } }
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
    // Only OUTERMOST articles = real posts. Nested articles are comments — skip them.
    var all = document.querySelectorAll('[role="article"]');
    var articles = Array.prototype.filter.call(all, function (a) {
      return !(a.parentElement && a.parentElement.closest('[role="article"]'));
    });
    var out = [];
    articles.forEach(function (a) {
      var txt = cleanPostText(a.innerText || "");
      // A real listing post has substance; skip reaction-only / tiny fragments.
      if (txt.length < 40) return;
      out.push({ text: txt, url: findPermalink(a) || location.href, key: hash(txt.slice(0, 140)) });
    });
    return out;
  }

  // Send the whole harvested page text; the SERVER finds the apartment listings
  // inside it (by content), so we don't have to identify posts in Facebook's DOM.
  function sendBulk(text) {
    if (text.length < 60) { setBadge("no text harvested (page didn't load?) " + new Date().toLocaleTimeString()); return; }
    setBadge("analyzing " + Math.round(text.length / 1000) + "KB of feed text…");
    postToApp({ bulk: true, text: text, url: location.href }, function (d, err) {
      if (d && d.ok) {
        setBadge("listings found:" + d.candidates + " · new:" + d["new"] + " · alerts:" + d.alertsSent +
          (d.topScore != null ? " · topScore:" + d.topScore : "") + " · " + new Date().toLocaleTimeString());
      } else {
        setBadge("could not reach app (" + (err || "?") + ") — is `npm run dev` running? " + new Date().toLocaleTimeString());
      }
    });
  }

  // Click every "See more" / "הצג עוד" so long posts (where the price/rooms
  // usually live) are fully expanded before we read them.
  function expandSeeMore() {
    var clicked = 0;
    var nodes = document.querySelectorAll('[role="button"], div[tabindex], span');
    nodes.forEach(function (n) {
      var t = (n.innerText || "").trim();
      if (t === "See more" || t === "הצג עוד" || t === "ראה עוד") {
        try { n.click(); clicked++; } catch (e) {}
      }
    });
    return clicked;
  }

  // Facebook virtualizes the feed — posts are deleted from the page as they
  // scroll out of view. So we accumulate the text of everything on screen at
  // EVERY scroll step (after expanding "See more"), building one big blob of the
  // whole feed, then send it for server-side listing extraction.
  var bulkText = "";
  var MAX_BULK = 300000; // ~300KB cap
  function harvestText() {
    expandSeeMore();
    var arts = document.querySelectorAll('[role="article"]');
    for (var i = 0; i < arts.length && bulkText.length < MAX_BULK; i++) {
      bulkText += "\n\n" + (arts[i].innerText || "");
    }
  }
  function scrollAndHarvest(step) {
    harvestText();
    if (step < SCROLL_STEPS && bulkText.length < MAX_BULK) {
      setBadge("scanning feed… step " + (step + 1) + "/" + SCROLL_STEPS + " · " + Math.round(bulkText.length / 1000) + "KB");
      window.scrollBy(0, Math.round(window.innerHeight * 0.85)); // one viewport down — renders the next batch
      setTimeout(function () { scrollAndHarvest(step + 1); }, STEP_DELAY_MS);
    } else {
      sendBulk(bulkText);
    }
  }

  setTimeout(function () { scrollAndHarvest(0); }, 6000); // let the feed render first
  setTimeout(function () { location.reload(); }, CHECK_EVERY_MS + Math.floor(Math.random() * JITTER_MS));
})();
