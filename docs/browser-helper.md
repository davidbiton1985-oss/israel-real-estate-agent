# Browser helper for Quick Capture

The app's main workflow is **automatic** (saved-search email alerts polled every
5 minutes — see the README). This helper is for the fallback path: getting a
listing that *didn't* arrive by email (a Facebook post, a broker message) into
**Manual Add** with less friction than hand-copying.

## Optional: a copy-to-clipboard bookmarklet

If you want one click instead of manual copy/paste, this bookmarklet grabs the
current page's **title, URL, and whatever text you've selected** and copies it
to your clipboard, ready to paste into the app's "Listing text" field.

**What it does and doesn't do:**
- ✅ User-initiated only — it runs once, when you click it, on the page you're
  already viewing.
- ✅ Reads only what your browser already rendered for you (title, URL, your
  text selection).
- ❌ Does not log in, bypass a paywall, solve a CAPTCHA, or fetch any other
  page.
- ❌ Does not auto-run, auto-crawl, or repeat itself.

**Setup:** show your browser's bookmarks bar, create a new bookmark, and paste
the following as its URL/address (it's plain JavaScript, not a real link):

```
javascript:(function(){var sel=window.getSelection().toString();var text=document.title+"\n"+location.href+(sel?"\n\n"+sel:"");if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){alert("Copied! Paste it into Quick Capture.");},function(){prompt("Copy this manually:",text);});}else{prompt("Copy this manually:",text);}})();
```

**Usage:** on a Yad2 or Facebook listing page, optionally select the post text
first (for a cleaner paste), then click the bookmarklet. Paste the clipboard
contents into the app's Add Listing page.

If your browser blocks bookmarklets or clipboard access, just copy the text
and URL manually — functionally identical, zero setup.
