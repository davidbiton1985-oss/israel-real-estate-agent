// ==UserScript==
// @name         RE-Agent Facebook Notification Reader
// @namespace    israel-real-estate-agent
// @version      12.0
// @description  Notification-driven reader: one designated tab checks facebook.com/notifications every few minutes; every "posted in group" notification links to the post's own page, which the tab then opens and reads IN FULL — parsed, scored, WhatsApp'd by your local RE-Agent (localhost:3000). Runs only in your own logged-in browser session — no scraping server, no login/CAPTCHA bypass. Your other Facebook tabs are untouched (the reader runs only in the tab you start with #re-agent).
// @match        https://www.facebook.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

// HOW IT WORKS (v12 — replaces feed scrolling entirely):
//   1. You set each group to notifications "כל הפוסטים" (all posts), so EVERY
//      new post creates a notification with a permalink.
//   2. You open ONE tab at:  https://www.facebook.com/notifications#re-agent
//      The #re-agent marker designates it as the reader tab (stored per-tab, so
//      it stays the reader as it navigates; your normal FB tabs are passive).
//   3. The reader collects new post links from the notifications page, then
//      visits each post's own page — where the full text renders on load
//      (verified: permalink pages carry the complete post without scrolling),
//      expands "ראה עוד", extracts the post (comments excluded), and sends it
//      to the app with the post's link. Then returns to notifications.
//   4. Cadence: ~5 min (07:00–24:00), ~30 min overnight. The notification
//      backlog persists — nothing is missed while the Mac sleeps.

(function () {
  "use strict";

  var APP = "http://localhost:3000/api/capture";
  var SEEN_KEY = "reAgentSeenFbPosts_v12"; // localStorage: post URLs already ingested
  var SEEN_MAX = 1200;
  var QUEUE_KEY = "reAgentQueue_v12"; // sessionStorage (per-tab): pending items
  var READER_KEY = "reAgentReader_v12"; // sessionStorage: this tab is the reader
  var POST_WAIT_MS = 12000; // max wait for a post page to render
  var STEP_MS = 900; // render poll interval

  // ---- reader-tab designation (per-tab; survives navigation) ---------------
  if (location.hash.indexOf("re-agent") !== -1) {
    try { sessionStorage.setItem(READER_KEY, "1"); } catch {}
  }
  var IS_READER = false;
  try { IS_READER = sessionStorage.getItem(READER_KEY) === "1"; } catch {}

  // ---- badge + manual capture button (button on all tabs, badge on reader) --
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#4f46e5;color:#fff;" +
    "font:12px/1.4 -apple-system,Arial;padding:6px 10px;border-radius:8px;opacity:.9;direction:ltr;";
  function setBadge(m) { badge.textContent = "RE-Agent v12: " + m; }
  setBadge("starting…");

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
    postToApp({ text: t, url: location.href.split("#")[0], title: "" }, function (d, err) {
      if (d && d.ok) capBtn.textContent = "✓ sent · score " + (d.topScore != null ? d.topScore : "?") + (d.alertsSent > 0 ? " · 📱 alert!" : "");
      else capBtn.textContent = "✗ failed (" + (err || "?") + ")";
      setTimeout(resetBtn, 4000);
    });
  };
  function addUi() {
    if (!document.body) return;
    document.body.appendChild(capBtn);
    if (IS_READER) document.body.appendChild(badge);
  }
  if (document.body) addUi(); else window.addEventListener("DOMContentLoaded", addUi);

  // ---- transport (GM request bypasses Facebook's CSP for localhost) --------
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
        onerror: function () { onDone(null, "neterr"); },
        ontimeout: function () { onDone(null, "timeout"); },
      });
    } catch (e) {
      onDone(null, "throw:" + (e && e.message ? e.message.slice(0, 20) : "?"));
    }
  }

  if (!IS_READER) return; // normal browsing tab: manual button only, no automation

  // ---- state: seen posts (shared) + this tab's queue ------------------------
  function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; } }
  function markSeen(url) {
    try {
      var s = loadSeen();
      if (s.indexOf(url) === -1) s.push(url);
      localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-SEEN_MAX)));
    } catch {}
  }
  function loadQueue() { try { return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } }
  function saveQueue(q) { try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} }

  // Canonical post URL: strip query/hash so ?notif_id=… variants dedupe.
  function canonPostUrl(href) {
    var m = (href || "").match(/https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:posts|permalink)\/[A-Za-z0-9]+/);
    return m ? m[0] + "/" : null;
  }
  function canonGroupUrl(href) {
    var m = (href || "").match(/https:\/\/www\.facebook\.com\/groups\/[^/?#]+/);
    return m ? m[0] + "/" : null;
  }

  // ---- cadence: 5 min daytime, 30 min overnight (+jitter) -------------------
  function nextDelayMs() {
    var h = new Date().getHours();
    var base = h >= 7 ? 5 * 60000 : 30 * 60000;
    return base + Math.floor(Math.random() * 60000);
  }

  var NOTIF_URL = "https://www.facebook.com/notifications";

  function goNext() {
    var q = loadQueue();
    if (q.length > 0) {
      setBadge("reading post 1/" + q.length + "…");
      setTimeout(function () { location.href = q[0].url; }, 2500 + Math.random() * 2000); // gentle pacing
    } else {
      var d = nextDelayMs();
      setBadge("idle · next check in ~" + Math.round(d / 60000) + "m · " + new Date().toLocaleTimeString());
      setTimeout(function () { location.href = NOTIF_URL; }, d);
    }
  }

  // ---- page handlers --------------------------------------------------------
  // The notification ENTRY text names the group ("… פרסם בקבוצה X") — capture it
  // so the server gets city/deal context even when the post omits the city.
  function groupNameFromEntry(a) {
    var node = a;
    for (var up = 0; up < 6 && node; up++) {
      var t = (node.innerText || "").replace(/\s+/g, " ");
      var m = t.match(/בקבוצה[:\s]+([^·\n]{3,60})/) || t.match(/\bin\s+([^·\n]{3,60})$/);
      if (m) return m[1].trim();
      node = node.parentElement;
    }
    return null;
  }

  function handleNotificationsPage() {
    setBadge("scanning notifications…");
    // Let the list render (initial load renders plenty of entries hidden or not).
    setTimeout(function () {
      var seen = loadSeen();
      var q = loadQueue();
      var queued = {};
      q.forEach(function (it) { queued[it.url] = 1; });
      var anchors = document.querySelectorAll('a[href*="/groups/"]');
      var foundPosts = 0, foundGroups = 0;
      for (var i = 0; i < anchors.length; i++) {
        var post = canonPostUrl(anchors[i].href);
        if (post) {
          if (seen.indexOf(post) === -1 && !queued[post]) {
            q.push({ url: post, group: groupNameFromEntry(anchors[i]), kind: "post" });
            queued[post] = 1;
            foundPosts++;
          }
          continue;
        }
        // Batched notification ("X ו־3 נוספים פרסמו") links to the group itself —
        // fall back to reading the group's newest posts.
        var entryGroup = groupNameFromEntry(anchors[i]);
        var grp = canonGroupUrl(anchors[i].href);
        if (grp && entryGroup && /פרסמ|posted/.test((anchors[i].closest("div") || anchors[i]).innerText || "")) {
          var chrono = grp + "?sorting_setting=CHRONOLOGICAL";
          var key = "grp:" + grp + ":" + new Date().toDateString(); // at most one sweep per group per day
          if (seen.indexOf(key) === -1 && !queued[chrono]) {
            q.push({ url: chrono, group: entryGroup, kind: "group", seenKey: key });
            queued[chrono] = 1;
            foundGroups++;
          }
        }
      }
      saveQueue(q);
      setBadge("notifications: +" + foundPosts + " new post(s)" + (foundGroups ? ", +" + foundGroups + " group sweep(s)" : ""));
      goNext();
    }, 6000);
  }

  // ---- extraction (same battle-tested logic as v11) --------------------------
  function outermostArticles() {
    var all = document.querySelectorAll('[role="article"]');
    return Array.prototype.filter.call(all, function (a) {
      return !(a.parentElement && a.parentElement.closest('[role="article"]'));
    });
  }
  function postOwnText(article) {
    var nested = article.querySelectorAll('[role="article"]');
    var saved = [];
    for (var i = 0; i < nested.length; i++) { saved.push(nested[i].style.display); nested[i].style.display = "none"; }
    var txt = (article.innerText || "").trim();
    for (var j = 0; j < nested.length; j++) nested[j].style.display = saved[j];
    return txt;
  }
  function expandSeeMore() {
    var nodes = document.querySelectorAll('[role="button"], div[tabindex], span');
    nodes.forEach(function (n) {
      var t = (n.innerText || "").trim();
      if (t === "See more" || t === "הצג עוד" || t === "ראה עוד") {
        try { n.click(); } catch {}
      }
    });
  }

  function finishItem(item) {
    markSeen(item.seenKey || item.url);
    var q = loadQueue();
    q = q.filter(function (it) { return it.url !== item.url; });
    saveQueue(q);
    goNext();
  }

  function handlePostPage(item) {
    var waited = 0;
    setBadge("reading post…");
    var timer = setInterval(function () {
      waited += STEP_MS;
      var arts = outermostArticles();
      var main = arts.length ? arts[0] : null;
      var ready = main && postOwnText(main).length > 40;
      if (!ready && waited < POST_WAIT_MS) return;
      clearInterval(timer);
      if (!ready) { setBadge("post did not render — skipping"); finishItem(item); return; }
      expandSeeMore();
      setTimeout(function () {
        var text = postOwnText(outermostArticles()[0]).slice(0, 3000);
        postToApp(
          { posts: [{ text: text, url: item.url }], groupName: item.group || (document.title || ""), url: item.url },
          function (d) {
            setBadge(d && d.ok ? "✓ read " + text.length + " chars · listings:" + d.listings + " · alerts:" + d.alertsSent : "send failed — will not retry");
            finishItem(item);
          }
        );
      }, 1500); // let "see more" expansion settle
    }, STEP_MS);
  }

  function handleGroupSweep(item) {
    setBadge("group sweep: " + (item.group || ""));
    setTimeout(function () {
      var posts = [];
      outermostArticles().forEach(function (a) {
        var t = postOwnText(a);
        if (t.length >= 40) {
          var link = null;
          var links = a.querySelectorAll('a[href*="/groups/"]');
          for (var i = 0; i < links.length; i++) { link = canonPostUrl(links[i].href); if (link) break; }
          posts.push({ text: t.slice(0, 3000), url: link || item.url });
        }
      });
      if (posts.length === 0) { finishItem(item); return; }
      postToApp({ posts: posts, groupName: item.group || (document.title || ""), url: item.url }, function () {
        finishItem(item);
      });
    }, 8000); // initial render of a group page
  }

  // ---- router ----------------------------------------------------------------
  var here = location.href.split("#")[0];
  var q0 = loadQueue();
  var current = null;
  for (var i = 0; i < q0.length; i++) {
    // match by canonical prefix — FB may append params on arrival
    if (here.indexOf(q0[i].url.split("?")[0]) === 0 || q0[i].url.indexOf(here.split("?")[0]) === 0) { current = q0[i]; break; }
  }

  if (current && current.kind === "post") {
    handlePostPage(current);
  } else if (current && current.kind === "group") {
    handleGroupSweep(current);
  } else if (/facebook\.com\/notifications/.test(here)) {
    handleNotificationsPage();
  } else {
    // Reader tab woke up somewhere unexpected (redirect etc.) — go home.
    setBadge("returning to notifications…");
    setTimeout(function () { location.href = NOTIF_URL; }, 4000);
  }
})();
