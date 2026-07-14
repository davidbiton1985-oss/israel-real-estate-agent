// ==UserScript==
// @name         RE-Agent Facebook Notification Reader
// @namespace    israel-real-estate-agent
// @version      12.16
// @description  Notification-driven reader: one designated tab checks facebook.com/notifications every 7–12 min (randomized, slower overnight); every "posted in group" notification links to the post's own page, which the tab then opens and reads IN FULL — parsed, scored, WhatsApp'd by your local RE-Agent (localhost:3000). It also sweeps one target group's chronological feed per cycle (round-robin, scroll-until-overlap) so posts Facebook never notified about are still caught, and survives browser restarts via a localStorage reader lease. Runs only in your own logged-in browser session — no scraping server, no login/CAPTCHA bypass; if Facebook shows a checkpoint the reader BACKS OFF instead of hammering it. Your other Facebook tabs are untouched (the reader runs only in the tab you start with #re-agent).
// @match        https://www.facebook.com/*
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @updateURL    https://raw.githubusercontent.com/davidbiton1985-oss/israel-real-estate-agent/main/docs/facebook-groups-watcher.user.js
// @downloadURL  https://raw.githubusercontent.com/davidbiton1985-oss/israel-real-estate-agent/main/docs/facebook-groups-watcher.user.js
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
//   4. Cadence: 7–12 min daytime, 30–35 min overnight (randomized — no round,
//      repeating beat). The notification backlog persists, so a longer gap
//      never misses a post. On a Facebook checkpoint/login page the reader
//      backs off (20→30 min) instead of the old 4-second bounce loop.
//   5. Completeness net (v12.8): Facebook does not notify on every post (video
//      posts especially get dropped even with "all posts" on), so each cycle
//      ALSO sweeps ONE target group's chronological feed (round-robin) — every
//      group is read ~hourly regardless of notifications. New posts found this
//      way go through the same score→WhatsApp path; dedup avoids repeat alerts.

(function () {
  "use strict";

  var VERSION = "12.16";
  var APP = "http://localhost:3000/api/capture";
  var SEEN_KEY = "reAgentSeenFbPosts_v12"; // localStorage: post URLs already ingested
  var SEEN_MAX = 1200;
  var BLOCK_KEY = "reAgentFbBlockStreak"; // localStorage: consecutive checkpoint hits
  var QUEUE_KEY = "reAgentQueue_v12"; // sessionStorage (per-tab): pending items
  var READER_KEY = "reAgentReader_v12"; // sessionStorage: this tab is the reader
  var POST_WAIT_MS = 20000; // max wait — FB streams post text in progressively
  var STEP_MS = 900; // render poll interval

  // ---- proactive group sweep (completeness safety net) ---------------------
  // Facebook does NOT reliably create a notification for every post — even with
  // "all posts" on, video/reel posts especially get dropped, so a real listing
  // slipped through unseen. Notifications alone are therefore not enough. Each
  // notification cycle ALSO sweeps ONE target group's chronological feed
  // (round-robin), so every group is read ~hourly regardless of notifications.
  // One extra page per cycle keeps it gentle (same detection budget concern as
  // the pacing). SWEEP_GROUP_IDS seeds the set; it self-extends with any group
  // we actually process a post from (rememberGroup), so new groups need no edit.
  var SWEEP_GROUP_IDS = [
    "1663070923962851", "109422649649946", "565702984351725", "344940935888684",
    "1464082440368419", "1008744309264610", "218147985406068",
  ];
  var SWEPT_KEY = "reAgentSweptGroups_v12"; // localStorage: groups discovered from posts
  var SWEEP_IDX_KEY = "reAgentSweepIdx_v12"; // localStorage: round-robin cursor
  var RESWEEP_KEY = "reAgentReSweep_v12"; // localStorage: a group that overflowed its last sweep

  // ---- reader-tab designation: a localStorage LEASE (survives restart) -------
  // The old design kept the role only in sessionStorage, which the browser wipes
  // on restart — and because NOTIF_URL carries no #re-agent hash, a restarted
  // tab reloaded role-less and sat silent for 22h. Now the role lives in a
  // localStorage lease that survives restarts and self-heals: a tab is the
  // reader if it set the #re-agent hash, already owns the lease, or the lease is
  // stale/orphaned (no live reader renewed it). The reader renews on every
  // navigation, so the lease stays fresh while it's working.
  var LEASE_KEY = "reAgentReaderLease_v12";
  var LEASE_STALE_MS = 45 * 60000; // > the longest idle gap between cycles (~35m overnight)
  function myTabId() {
    var id = "";
    try { id = sessionStorage.getItem(READER_KEY) || ""; } catch {}
    if (!id) {
      id = String(Date.now()) + "." + Math.random().toString(36).slice(2, 8);
      try { sessionStorage.setItem(READER_KEY, id); } catch {}
    }
    return id;
  }
  function readLease() { try { return JSON.parse(localStorage.getItem(LEASE_KEY) || "null"); } catch { return null; } }
  function claimLease(owner) { try { localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: owner, ts: Date.now() })); } catch {} }
  var ROLE_KEY = "reAgentReaderRole"; // sessionStorage: this tab has established itself as the reader
  function sessionIsReader() { try { return sessionStorage.getItem(ROLE_KEY) === "1"; } catch { return false; } }
  var TAB = myTabId();
  var lease = readLease();
  var leaseStale = !lease || Date.now() - lease.ts > LEASE_STALE_MS;
  var hasHash = location.hash.indexOf("re-agent") !== -1;
  var onNotifications = /facebook\.com\/notifications/.test(location.href.split("#")[0]);
  // Facebook periodically PRUNES the userscript's localStorage (verified live:
  // the lease + seen keys get wiped mid-session while FB's own keys survive),
  // which erased the lease and made the reader lose its role on a post page
  // after a few posts. sessionStorage is NOT pruned, so once a tab establishes
  // itself as reader we LATCH that in sessionStorage and trust it for the rest
  // of the tab's life; the localStorage lease now only bootstraps a fresh tab
  // (via the hash / notifications) and enables cross-restart self-heal.
  var IS_READER = hasHash || sessionIsReader() || (lease && lease.owner === TAB) || (leaseStale && onNotifications);
  if (IS_READER) {
    claimLease(TAB); // renew the localStorage lease when it survives (restart hint)
    try { sessionStorage.setItem(ROLE_KEY, "1"); } catch {} // latch the role where FB can't prune it
  }

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

  // ---- sweep target set (seed ∪ groups we've processed posts from) ----------
  function groupIdOf(url) { var m = (url || "").match(/\/groups\/(\d+)/); return m ? m[1] : null; }
  function knownGroups() {
    var set = {};
    SWEEP_GROUP_IDS.forEach(function (g) { set[g] = 1; });
    try { JSON.parse(localStorage.getItem(SWEPT_KEY) || "[]").forEach(function (g) { set[g] = 1; }); } catch {}
    return Object.keys(set);
  }
  function rememberGroup(gid) {
    if (!gid) return;
    try {
      var arr = JSON.parse(localStorage.getItem(SWEPT_KEY) || "[]");
      if (arr.indexOf(gid) === -1) { arr.push(gid); localStorage.setItem(SWEPT_KEY, JSON.stringify(arr.slice(-50))); }
    } catch {}
  }
  // Enqueue the next group's chronological feed for a sweep (one per call, cycling).
  function enqueueRoundRobinSweep(q, queued) {
    if (new Date().getHours() < 7) return; // overnight: skip sweeps (no posts, less activity)
    var groups = knownGroups();
    if (groups.length === 0) return;
    // Priority: a group that overflowed its last sweep (hit the scroll cap without
    // reaching overlap) is re-swept before the rotation advances, so its backlog
    // is drained instead of waiting ~an hour for the cursor to wrap back.
    var reGid = "";
    try { reGid = localStorage.getItem(RESWEEP_KEY) || ""; } catch {}
    var gid, chrono;
    if (reGid && groups.indexOf(reGid) !== -1) {
      gid = reGid;
      chrono = "https://www.facebook.com/groups/" + gid + "/?sorting_setting=CHRONOLOGICAL";
      if (queued[chrono]) return;
      try { localStorage.removeItem(RESWEEP_KEY); } catch {} // consumed; if it overflows again the sweep re-sets it
    } else {
      var idx = Number(localStorage.getItem(SWEEP_IDX_KEY) || "0") % groups.length;
      gid = groups[idx];
      chrono = "https://www.facebook.com/groups/" + gid + "/?sorting_setting=CHRONOLOGICAL";
      if (queued[chrono]) return; // already queued — bail BEFORE advancing, so this group isn't skipped
      try { localStorage.setItem(SWEEP_IDX_KEY, String((idx + 1) % groups.length)); } catch {}
    }
    q.push({ url: chrono, group: "sweep " + gid, kind: "group" }); // no seenKey → runs every rotation
    queued[chrono] = 1;
  }

  // ---- checkpoint handling --------------------------------------------------
  // Facebook answers a session it distrusts with a checkpoint / login / "confirm
  // it's you" page. The old code reacted two bad ways: the router bounced back
  // to /notifications every 4s (a tight reload loop ON the challenge), and the
  // notifications scan still sent a "FACEBOOK alive" heartbeat — falsely marking
  // the reader healthy. Both are exactly what escalates a soft check to a block.
  // We do NOT touch the challenge; we detect it, stop hammering, and nag you to
  // solve it in the tab (streak persisted — the script re-runs on each nav).
  // Deliberately conservative: a FALSE positive here silently drops coverage
  // (a backoff = missed apartments), so we only trust unambiguous checkpoint
  // signals — the /checkpoint|login|… URL Facebook redirects to, or an actual
  // captcha widget. NOT a bare password field (present in unrelated FB DOM).
  function looksBlocked() {
    var u = location.href;
    if (/\/(checkpoint|login|two_factor|recover|confirmemail)(\/|\?|$)/i.test(u)) return true;
    if (document.querySelector('input[name="captcha_response"], iframe[src*="captcha"], iframe[title*="captcha" i]')) return true;
    return false;
  }
  function getBlockStreak() { return Number(localStorage.getItem(BLOCK_KEY) || "0"); }
  function setBlockStreak(n) { try { localStorage.setItem(BLOCK_KEY, String(n)); } catch {} }
  function handleBlocked() {
    var n = getBlockStreak() + 1;
    setBlockStreak(n);
    var wait = n >= 3 ? 30 * 60000 : 20 * 60000;
    // No heartbeat: a blocked reader is NOT healthy — let its freshness go stale.
    setBadge("⚠ Facebook checkpoint/login — solve it in THIS tab · retrying in " + Math.round(wait / 60000) + "m");
    setTimeout(function () { location.href = NOTIF_URL; }, wait);
  }

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

  // ---- cadence: randomized 7–12 min daytime, 30–35 min overnight ------------
  // No round, repeating beat (a fixed 5-min reload is a robotic signature).
  // Nothing is missed by the longer gap: every post left a persistent
  // notification, so the backlog is still there on the next scan.
  function nextDelayMs() {
    var h = new Date().getHours();
    if (h < 7) return 30 * 60000 + Math.floor(Math.random() * 5 * 60000); // 30–35m
    return 7 * 60000 + Math.floor(Math.random() * 5 * 60000); // 7–12m
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
      // A checkpoint can stream in AT the /notifications URL after load — don't
      // scan or heartbeat a challenge page (that falsely reports "alive"); back off.
      if (looksBlocked()) { handleBlocked(); return; }
      var seen = loadSeen();
      var q = loadQueue();
      var queued = {};
      var queuedIds = {}; // dedup by POST ID too — FB exposes the same post as both
      q.forEach(function (it) { // /posts/<id>/ and /permalink/<id>/, different strings, same id
        queued[it.url] = 1;
        var qpid = postIdOf(it.url);
        if (qpid) queuedIds[qpid] = 1;
      });
      var anchors = document.querySelectorAll('a[href*="/groups/"]');
      var foundPosts = 0, foundGroups = 0;
      function enqueuePost(url, groupName) {
        // Seen is keyed by POST ID — Facebook renders the same post under
        // numeric-gid, vanity-slug and permalink URL forms; string keys let
        // the same dead post re-queue forever (seen live: 10+ re-reads).
        var pid = postIdOf(url);
        if (!pid || seen.indexOf(pid) !== -1 || queued[url] || queuedIds[pid]) return;
        q.push({ url: url, group: groupName, kind: "post" });
        queued[url] = 1;
        queuedIds[pid] = 1;
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
      // Completeness net: also queue ONE group's chronological feed this cycle,
      // so posts Facebook never notified about are still caught (round-robin).
      enqueueRoundRobinSweep(q, queued);
      saveQueue(q);
      setBlockStreak(0); // reached the real notifications list → clear any block backoff
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
  // FB truncates long posts behind a "see more" toggle; if it isn't clicked the
  // body is only a ~95-char preview and the parser can't read rooms/price/city.
  // Match the SHORT toggle label (length-guarded so we never click a paragraph
  // that merely contains the word), across the known FB variants.
  var SEE_MORE_LABELS = ["See more", "הצג עוד", "ראה עוד", "ראו עוד", "עוד"];
  function expandSeeMore() {
    var nodes = document.querySelectorAll('[role="button"], div[tabindex], span');
    nodes.forEach(function (n) {
      var t = (n.innerText || "").trim();
      if (t.length > 12) return; // a see-more toggle is a short label, never body text
      if (SEE_MORE_LABELS.indexOf(t) !== -1) {
        try { n.click(); } catch {}
      }
    });
  }

  function finishItem(item, msg) {
    rememberGroup(groupIdOf(item.url)); // self-extend the sweep set from real activity
    // Group sweeps have no post id — only mark the per-day fallback key, never the
    // chronological group URL, so sweeps don't burn slots in the post-seen window.
    if (item.kind === "group") {
      if (item.seenKey) markSeen(item.seenKey);
    } else {
      markSeen(item.seenKey || postIdOf(item.url) || item.url);
    }
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
      // The message-hook is often a TRUNCATED preview (~95 chars) even after the
      // post renders. Its OWN enclosing article holds the full body (same post →
      // no cross-attribution), so prefer that when it's longer.
      var art = hooks[i].closest('[role="article"]');
      if (art) {
        var at = postOwnText(art);
        if (at.length > best.length) { best = at; via = "hook-article"; }
      }
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
    var lastLen = -1;
    var stableCount = 0;
    setBadge("reading… (" + loadQueue().length + " in queue)");
    var timer = setInterval(function () {
      waited += STEP_MS;
      // nudge lazy content + expand truncation while we wait (below-fold text)
      if (waited === STEP_MS * 3 || waited === STEP_MS * 7) {
        try { window.scrollBy(0, 700); } catch {}
        expandSeeMore();
      }
      var probe = bestPostText();
      var len = probe.text.length;
      // Wait for the body to STOP GROWING before reading. Facebook hydrates the
      // post progressively — the message hook was seen starting at ~95 chars and
      // settling at ~463 — and reading at the first ≥25 chars grabbed the
      // truncated preview, so the parser got nothing. "Ready" now means the
      // length held steady for ~2 polls (or we hit the overall wait cap).
      if (len > lastLen) stableCount = 0;
      else if (len >= 25) stableCount++;
      lastLen = len;
      var stable = len >= 25 && stableCount >= 2;
      if (!stable && waited < POST_WAIT_MS) return;
      clearInterval(timer);
      var ready = len >= 25;
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
        // IDENTITY CHECK — the page must provably BE the queued post: its own
        // ID must appear in the page's links (every real post page links to
        // itself via the timestamp permalink). Deleted/unavailable posts render
        // OTHER content (suggested posts), which we must never attribute to the
        // queued URL — that cross-attribution sent a stranger's apartment under
        // a "looking for" post's link.
        var pid = postIdOf(item.url);
        var identityOk = pid && document.querySelector('a[href*="' + pid + '"]') != null;
        var probe2 = bestPostText();
        var text = (probe2.text.length >= probe.text.length ? probe2.text : probe.text).slice(0, 3000);
        if (!identityOk) {
          sendDiag(item, { ready: true, identity: false, via: probe2.via, len: text.length, sample: text.slice(0, 40) });
          setBadge("post unavailable — skipping (foreign content)");
          finishItem(item, "✗ unavailable");
          return;
        }
        sendDiag(item, { ready: true, identity: true, via: probe2.via, len: text.length, hooks: probe2.hooks, arts: outermostArticles().length });
        postToApp(
          { posts: [{ text: text, url: item.url }], groupName: item.group || (document.title || ""), url: item.url },
          function (d) {
            if (d && d.ok) { finishItem(item, "✓ sent " + text.length + " chars"); return; }
            // Transient send failure (server restarting / 500 / timeout): do NOT
            // mark seen and drop it — this is a post we successfully READ, i.e. a
            // matching apartment we'd otherwise lose. Keep re-queuing across cycles
            // for up to 6h (survives a local-server restart or a longer outage,
            // which 3 quick tries within one rotation could not) before giving up.
            var q = loadQueue().filter(function (it) { return it.url !== item.url; });
            item.sendTries = (item.sendTries || 0) + 1;
            item.firstFailedAt = item.firstFailedAt || Date.now();
            if (Date.now() - item.firstFailedAt < 6 * 3600000) {
              q.push(item);
              setBadge("✗ send failed — will retry (attempt " + item.sendTries + ")");
            } else {
              markSeen(item.seenKey || postIdOf(item.url) || item.url); // gave up after 6h of failures
              setBadge("✗ send failing 6h — skipping");
            }
            saveQueue(q);
            goNext();
          }
        );
      }, 1500); // let "see more" expansion settle
    }, STEP_MS);
  }

  function handleGroupSweep(item) {
    setBadge("group sweep: " + (item.group || ""));
    var MAX_STEPS = 6; // bound the scrolling so one busy group can't run forever
    var OVERLAP_K = 3; // consecutive already-seen posts that define the overlap
    var seen = loadSeen();
    var gid = groupIdOf(item.url);

    // Overlap = K CONSECUTIVE already-seen posts in feed order. A single seen post
    // must NOT stop the sweep: a PINNED already-seen post sits at the top of the
    // chronological feed on every sweep and would short-circuit at step 0 (the new
    // posts below it never read); one stray repost would do the same. Requiring a
    // run of K means we only stop once we're genuinely back in captured territory.
    function reachedOverlap() {
      var arts = outermostArticles();
      var run = 0;
      for (var i = 0; i < arts.length; i++) {
        var pid = null;
        var links = arts[i].querySelectorAll('a[href*="/groups/"]');
        for (var j = 0; j < links.length; j++) { var link = canonPostUrl(links[j].href); pid = link && postIdOf(link); if (pid) break; }
        if (!pid) continue; // ad / suggested / no-permalink article — ignore, don't reset the run
        if (seen.indexOf(pid) !== -1) { run++; if (run >= OVERLAP_K) return true; } else run = 0;
      }
      return false;
    }

    function collectAndSend() {
      var posts = [];
      outermostArticles().forEach(function (a) {
        var t = postOwnText(a);
        if (t.length < 40) return;
        var link = null;
        var links = a.querySelectorAll('a[href*="/groups/"]');
        for (var i = 0; i < links.length; i++) { link = canonPostUrl(links[i].href); if (link) break; }
        // No own permalink → cannot attribute reliably → drop (attribution must
        // never guess; a wrong link is worse than a missed capture).
        if (!link) return;
        var pid = postIdOf(link);
        if (pid && seen.indexOf(pid) !== -1) return; // already handled → skip (dedupe re-sends)
        posts.push({ text: t.slice(0, 3000), url: link });
      });
      if (posts.length === 0) { finishItem(item); return; }
      postToApp({ posts: posts, groupName: item.group || (document.title || ""), url: item.url }, function (d) {
        // Mark seen only on confirmed ingest, so a failed send retries next sweep.
        if (d && d.ok) posts.forEach(function (p) { var pid = postIdOf(p.url); if (pid) markSeen(pid); });
        finishItem(item);
      });
    }

    // Scroll the chronological feed until we reach overlap or hit the step cap,
    // lazy-loading deeper batches each step, then read+send.
    function step(n) {
      expandSeeMore();
      if (reachedOverlap()) { setTimeout(collectAndSend, 800); return; }
      if (n >= MAX_STEPS) {
        // Hit the scroll cap WITHOUT reaching overlap → this group had more new
        // posts than we scrolled. Flag it to be re-swept next cycle instead of
        // rotating past it, else the overflow is silently lost until the cursor
        // wraps ~an hour later.
        if (gid) { try { localStorage.setItem(RESWEEP_KEY, gid); } catch {} }
        setBadge("group sweep: " + (item.group || "") + " · overflow — will re-sweep");
        setTimeout(collectAndSend, 800);
        return;
      }
      setBadge("group sweep: " + (item.group || "") + " · scroll " + (n + 1));
      try { window.scrollBy(0, 1600); } catch {}
      setTimeout(function () { step(n + 1); }, 1400); // let the next batch render
    }

    setTimeout(function () { step(0); }, 8000); // initial group-page render
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

  if (looksBlocked()) {
    // Highest priority: a checkpoint/login can appear on ANY navigation (even
    // mid-queue). Back off instead of bouncing or reading foreign content.
    handleBlocked();
  } else if (current && current.kind === "post") {
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
