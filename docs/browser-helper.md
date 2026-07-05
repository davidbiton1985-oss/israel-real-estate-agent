# Browser capture helper (one-click Facebook/any-site ingestion)

The app's fully-automatic paths are saved-search **email alerts** (Yad2 etc.)
and **Facebook notification emails** (groups/pages you subscribed to) — see the
README. This helper covers everything else on Facebook: **public posts by
strangers, profiles, broker pages, shared posts, marketplace** — any post you
can see while browsing normally.

## One-click capture bookmarklet (recommended)

Select the post text on the page, click the bookmarklet — it POSTs the
selection + page URL + title straight into the app (`/api/capture`), which
runs the full pipeline immediately: parse → dedup → score → **WhatsApp if
strong**. No copy/paste, no app tab needed. A popup tells you the outcome and
top score.

**What it does and doesn't do:**
- ✅ User-initiated, one post at a time, on a page you're already viewing.
- ✅ Sends only what your browser already rendered (your selection + URL + title).
- ❌ No login/CAPTCHA bypass, no crawling, no background scanning, nothing
  automated on Facebook's side. Your account is never touched.

**Setup:** show the bookmarks bar, create a new bookmark, paste this as its
URL (requires the app running at `http://localhost:3000`):

```
javascript:(function(){var t=window.getSelection().toString().trim();if(t.length<20){alert('Select the post text first (at least a sentence), then click again.');return;}fetch('http://localhost:3000/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t,url:location.href,title:document.title})}).then(function(r){return r.json();}).then(function(d){if(!d.ok){alert('Capture failed: '+(d.error||'unknown'));return;}var msg='Captured ('+d.outcome+')';if(d.topScore!=null){msg+='\nTop score: '+d.topScore+'/100 ('+d.topStatus+')';}if(d.alertsSent>0){msg+='\n📱 WhatsApp alert sent!';}alert(msg);}).catch(function(e){alert('Capture failed — is the app running on localhost:3000? '+e);});})();
```

**Usage on Facebook:** open the post ("See more" if truncated), select its
text, click the bookmarklet. The popup shows the score; strong matches WhatsApp
you instantly. The post's surface type (group/page/profile/share/marketplace)
is detected from the URL automatically.

**Note:** the `/api/capture` endpoint accepts requests from any origin so the
bookmarklet can call it from facebook.com. The server binds to localhost only
(personal single-user tool), so nothing is exposed to the network.

## Fallback: clipboard bookmarklet / manual paste

If clipboard-only is preferred, the old approach still works — copy the post
text and paste it into **Manual Add** in the app. Functionally identical
pipeline, more clicks.
