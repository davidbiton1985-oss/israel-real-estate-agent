// ==UserScript==
// @name         RE-Agent Facebook Notification Reader
// @namespace    israel-real-estate-agent
// @version      12.5
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

  var VERSION = "12.5";
  var APP = "http://localhost:3000/api/capture";
  var SEEN_KEY = "reAgentSeenFbPosts_v12"; // localStorage: post URLs already ingested
  var SEEN_MAX = 1200;
  var QUEUE_KEY = "reAgentQueue_v12"; // sessionStorage (per-tab): pending items
  var READER_KEY = "reAgentReader_v12"; // sessionStorage: this tab is the reader
  var POST_WAIT_MS = 20000; // max wait — FB streams post text in progressively
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
  function setBadge(m) { badge.textContent = "RE-Agent v" + VERSION + ": " + m; }
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
  // "group_activity" notifications batch the new posts as
  //   /groups/<gid>/?multi_permalinks=<id1>,<id2>,…  (verified real shape) —
  // Facebook hands us the exact new-post IDs; build each post's permalink.
  function permalinksFromMulti(href) {
    var g = (href || "").match(/https:\/\/www\.facebook\.com\/groups\/([^/?#]+)\//);
    var mp = (href || "").match(/[?&]multi_permalinks=([^&#]+)/);
    if (!g || !mp) return [];
    var ids = decodeURIComponent(mp[1]).split(",").filter(function (id) { return /^[A-Za-z0-9]+$/.test(id); });
    return ids.map(function (id) { return "https://www.facebook.com/groups/" + g[1] + "/posts/" + id + "/"; });
  }

  // ---- cadence: 5 min daytime, 30 min overnight (+jitter) -------------------
  function nextDelayMs() {
    var h = new Date().getHours();
    var base = h >= 7 ? 5 * 60000 : 30 * 60000;
    return base + Math.floor(Math.random() * 60000);
  }

  var NOTIF_URL = "https://www.facebook.com/notifications";
  var lastFound = ""; // shown in the idle badge so "+0" scans are visible

  // `msg` (e.g. "✓ sent 480 chars") stays on the badge during the pacing pause
  // so progress is actually visible — the old code overwrote it instantly.
  function goNext(msg) {
    var q = loadQueue();
    if (q.length > 0) {
      setBadge((msg ? msg + " · " : "") + q.length + " left in queue");
      setTimeout(function () {
        setBadge("opening post (" + q.length + " left)…");
        location.href = q[0].url;
      }, 2500 + Math.random() * 2000); // gentle pacing
    } else {
      var d = nextDelayMs();
      setBadge((msg ? msg + " · " : "") + "idle" + (lastFound ? " · last scan: " + lastFound : "") + " · next check in ~" + Math.round(d / 60000) + "m");
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
      function enqueuePost(url, groupName) {
        if (seen.indexOf(url) !== -1 || queued[url]) return;
        q.push({ url: url, group: groupName, kind: "post" });
        queued[url] = 1;
        foundPosts++;
      }
      for (var i = 0; i < anchors.length; i++) {
        var entryGroup = groupNameFromEntry(anchors[i]);
        // 1) group_activity batch: multi_permalinks carries every new post ID
        var multi = permalinksFromMulti(anchors[i].href);
        if (multi.length > 0) {
          for (var k = 0; k < multi.length; k++) enqueuePost(multi[k], entryGroup);
          continue;
        }
        // 2) direct post/permalink link
        var post = canonPostUrl(anchors[i].href);
        if (post) {
          enqueuePost(post, entryGroup);
          continue;
        }
        // 3) plain group link with "posted" wording — chronological sweep fallback
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
      // heartbeat: even a +0 scan proves the reader is alive (dashboard freshness)
      postToApp({ heartbeat: "FACEBOOK" }, function () {});
      lastFound = "+" + foundPosts + " post(s)" + (foundGroups ? " +" + foundGroups + " sweep(s)" : "");
      setBadge("notifications: " + lastFound);
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

  function finishItem(item, msg) {
    markSeen(item.seenKey || item.url);
    var q = loadQueue();
    q = q.filter(function (it) { return it.url !== item.url; });
    saveQueue(q);
    goNext(msg);
  }

  // Best available post text on the CURRENT page, in order of reliability:
  //   1. FB's post-message containers (data-ad-preview / data-ad-comet-preview
  //      ="message") — the long-standing hook for the post body itself.
  //   2. Articles inside a dialog (permalinks often open as a modal over the
  //      group feed — the modal holds the right post, the feed behind doesn't).
  //   3. The LARGEST outermost article (never blindly the first).
  function bestPostText() {
    var hooks = document.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
    var best = "";
    var via = "none";
    for (var i = 0; i < hooks.length; i++) {
      var t = (hooks[i].innerText || "").trim();
      if (t.length > best.length) { best = t; via = "message-hook"; }
    }
    if (best.length >= 25) return { text: best, via: via, hooks: hooks.length };

    var dialog = document.querySelector('[role="dialog"]');
    var scopes = dialog ? [dialog, document] : [document];
    for (var s = 0; s < scopes.length; s++) {
      var arts = scopes[s].querySelectorAll('[role="article"]');
      var outer = Array.prototype.filter.call(arts, function (a) {
        return !(a.parentElement && a.parentElement.closest('[role="article"]'));
      });
      for (var j = 0; j < outer.length; j++) {
        var tx = postOwnText(outer[j]);
        if (tx.length > best.length) { best = tx; via = s === 0 && dialog ? "dialog-article" : "article"; }
      }
      if (best.length >= 25) break;
    }
    return { text: best, via: via, hooks: hooks.length };
  }

  function sendDiag(item, info) {
    postToApp({ diag: Object.assign({ queued: item.url, here: location.href.split("?")[0].slice(0, 120) }, info) }, function () {});
  }

  function handlePostPage(item) {
    var waited = 0;
    setBadge("reading… (" + loadQueue().length + " in queue)");
    var timer = setInterval(function () {
      waited += STEP_MS;
      // nudge lazy content + expand truncation while we wait (below-fold text)
      if (waited === STEP_MS * 3 || waited === STEP_MS * 7) {
        try { window.scrollBy(0, 700); } catch {}
        expandSeeMore();
      }
      var probe = bestPostText();
      var ready = probe.text.length >= 25;
      if (!ready && waited < POST_WAIT_MS) return;
      clearInterval(timer);
      if (!ready) {
        // Partial text = the page was still streaming in (seen live: a post cut
        // off at "🏡 למכירה – 4.5" after 12s). One fresh reload usually
        // completes it; only skip after the retry also fails.
        var canRetry = probe.text.length > 0 && !(item.readTries && item.readTries > 0);
        sendDiag(item, { ready: false, retry: canRetry, via: probe.via, len: probe.text.length, sample: probe.text.slice(0, 40), hooks: probe.hooks, arts: outermostArticles().length });
        if (canRetry) {
          item.readTries = 1;
          var q2 = loadQueue();
          for (var qi = 0; qi < q2.length; qi++) if (q2[qi].url === item.url) q2[qi].readTries = 1;
          saveQueue(q2);
          setBadge("slow render — reloading for retry…");
          setTimeout(function () { location.reload(); }, 2000);
          return;
        }
        setBadge("post did not render — skipping");
        finishItem(item, "✗ unreadable");
        return;
      }
      expandSeeMore();
      setTimeout(function () {
        var probe2 = bestPostText();
        var text = (probe2.text.length >= probe.text.length ? probe2.text : probe.text).slice(0, 3000);
        sendDiag(item, { ready: true, via: probe2.via, len: text.length, hooks: probe2.hooks, arts: outermostArticles().length });
        postToApp(
          { posts: [{ text: text, url: item.url }], groupName: item.group || (document.title || ""), url: item.url },
          function (d) {
            finishItem(item, d && d.ok ? "✓ sent " + text.length + " chars" : "✗ send failed");
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
  // Match queue items by POST ID, never by URL prefix: Facebook rewrites the
  // address on arrival (numeric group ID → vanity name, posts/ ↔ permalink/),
  // so prefix comparison breaks and loops. The post ID survives every rewrite.
  function postIdOf(url) {
    var m = (url || "").match(/\/(?:posts|permalink)\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    var s = (url || "").match(/[?&]story_fbid=([A-Za-z0-9]+)/);
    return s ? s[1] : null;
  }

  var here = location.href.split("#")[0];
  var q0 = loadQueue();
  var hereId = postIdOf(here);
  var current = null;
  for (var i = 0; i < q0.length; i++) {
    if (q0[i].kind === "post" && hereId && postIdOf(q0[i].url) === hereId) { current = q0[i]; break; }
    if (q0[i].kind === "group" && here.indexOf(q0[i].url.split("?")[0]) === 0) { current = q0[i]; break; }
  }

  if (current && current.kind === "post") {
    handlePostPage(current);
  } else if (current && current.kind === "group") {
    handleGroupSweep(current);
  } else if (/facebook\.com\/notifications/.test(here)) {
    handleNotificationsPage();
  } else if (q0.length > 0) {
    // Landed on an unrecognized URL while work is pending — we navigated to the
    // queue head and Facebook redirected us here (photo viewer, vanity URL…),
    // so whatever is on THIS page is most likely the head's content. Try to
    // read it in place; cap attempts so one odd post never stalls the queue.
    var head = q0[0];
    head.tries = (head.tries || 0) + 1;
    saveQueue(q0);
    if (head.tries > 3) {
      setBadge("skipping unreachable post…");
      finishItem(head, "✗ skipped");
    } else if (head.kind === "post") {
      handlePostPage(head);
    } else {
      handleGroupSweep(head);
    }
  } else {
    // Reader tab woke up somewhere unexpected with nothing to do — go home.
    setBadge("returning to notifications…");
    setTimeout(function () { location.href = NOTIF_URL; }, 4000);
  }
})();
