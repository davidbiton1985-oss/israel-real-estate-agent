// ==UserScript==
// @name         RE-Agent Facebook Groups Watcher
// @namespace    israel-real-estate-agent
// @version      11.1
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
          try { d = JSON.parse(res.responseText); } catch {}
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
  var SCROLL_STEPS = 25;   // how many viewport-steps to scroll through the feed
  var STEP_DELAY_MS = 1800; // pause per step so posts + "See more" render before we read

  // --- status badge --------------------------------------------------------
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#4f46e5;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.9;direction:ltr;";
  badge.textContent = "RE-Agent FB: starting…";
  function setBadge(m) { badge.textContent = "RE-Agent FBv11.1: " + m; }
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

  // cheap stable hash of a string → dedup key (per-scan only; the SERVER is the
  // source of truth for dedup/suppression across scans, via listing fingerprints)
  function hash(s) {
    var h = 0, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); h = ((h << 5) - h + c) | 0; }
    return "h" + h;
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

  // Only OUTERMOST articles are real posts — nested [role=article] are COMMENTS.
  function outermostArticles() {
    var all = document.querySelectorAll('[role="article"]');
    return Array.prototype.filter.call(all, function (a) {
      return !(a.parentElement && a.parentElement.closest('[role="article"]'));
    });
  }

  // A post's innerText INCLUDES its visible comments (they live inside the post
  // article). Hide the nested comment articles, read the post's own text with
  // layout-aware innerText, then restore — otherwise a commenter's "7 אלף שקל
  // לדירת 3 חדרים??" becomes a fake listing or pollutes the post's parsed fields.
  function postOwnText(article) {
    var nested = article.querySelectorAll('[role="article"]');
    var saved = [];
    for (var i = 0; i < nested.length; i++) {
      saved.push(nested[i].style.display);
      nested[i].style.display = "none";
    }
    var txt = (article.innerText || "").trim();
    for (var j = 0; j < nested.length; j++) nested[j].style.display = saved[j];
    return txt;
  }

  // Click every "See more" / "הצג עוד" so long posts (where the price/rooms
  // usually live) are fully expanded before we read them.
  function expandSeeMore() {
    var nodes = document.querySelectorAll('[role="button"], div[tabindex], span');
    nodes.forEach(function (n) {
      var t = (n.innerText || "").trim();
      if (t === "See more" || t === "הצג עוד" || t === "ראה עוד") {
        try { n.click(); } catch {}
      }
    });
  }

  // The group's name (for city/deal context) from the page title.
  function groupName() {
    return (document.title || "").replace(/\s*[|·].*$/, "").replace(/^\(\d+\)\s*/, "").trim();
  }

  // Facebook virtualizes the feed — posts are removed from the page as they
  // scroll out of view. So at EVERY scroll step we harvest each post ([role=
  // article]) as {text, permalink}, deduped, so we keep the post's own link.
  var posts = {};
  function countPosts() { var n = 0; for (var k in posts) if (posts.hasOwnProperty(k)) n++; return n; }
  function harvestPosts() {
    expandSeeMore();
    // Outermost articles only (comments are nested articles), and each post's
    // OWN text (comments hidden while reading) — comments must never become
    // "listings" nor leak prices/rooms into the post they sit under.
    var arts = outermostArticles();
    for (var i = 0; i < arts.length; i++) {
      var txt = postOwnText(arts[i]);
      if (txt.length < 40) continue;
      var key = hash(txt.slice(0, 160));
      if (posts[key]) continue;
      posts[key] = { text: txt.slice(0, 3000), url: findPermalink(arts[i]) };
    }
  }
  function scrollAndHarvest(step) {
    harvestPosts();
    if (step < SCROLL_STEPS && countPosts() < 400) {
      setBadge("scanning feed… step " + (step + 1) + "/" + SCROLL_STEPS + " · posts:" + countPosts());
      window.scrollBy(0, Math.round(window.innerHeight * 0.85)); // one viewport down — renders next batch
      setTimeout(function () { scrollAndHarvest(step + 1); }, STEP_DELAY_MS);
    } else {
      sendPosts();
    }
  }
  function sendPosts() {
    var arr = [];
    for (var k in posts) if (posts.hasOwnProperty(k)) arr.push(posts[k]);
    if (arr.length === 0) { setBadge("no posts found on page " + new Date().toLocaleTimeString()); return; }
    setBadge("analyzing " + arr.length + " posts…");
    postToApp({ posts: arr, groupName: groupName(), url: location.href }, function (d, err) {
      if (d && d.ok) {
        setBadge("posts:" + d.posts + " · listings:" + d.listings + " · new:" + d["new"] +
          " · alerts:" + d.alertsSent + (d.topScore != null ? " · top:" + d.topScore : "") +
          " · " + new Date().toLocaleTimeString());
      } else {
        setBadge("could not reach app (" + (err || "?") + ") — is `npm run dev` running? " + new Date().toLocaleTimeString());
      }
    });
  }

  setTimeout(function () { scrollAndHarvest(0); }, 6000); // let the feed render first
  setTimeout(function () { location.reload(); }, CHECK_EVERY_MS + Math.floor(Math.random() * JITTER_MS));
})();
