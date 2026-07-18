# Boton V3 — "הגלריה" · Architecture & Design Plan

**Date:** 2026-07-18 · **Status:** awaiting David's approval on mockups before any code.

## 1. Why a rebuild

Four design rounds taught one lesson: imitation reads as imitation. White City (invented calm),
the Gold Mine port ("feels like BGM"), three council concepts ("חובבני"), and the monday.com
port (approved, then felt derivative next to Keyz) — all shared one flaw: the design was ABOUT
another product. V3 is designed about the subject itself: apartments are SEEN before they are
read. Since the sensors now capture photos, the photo can finally be the interface.

## 2. Thesis — "הגלריה" (The Private Gallery)

Boton is a private gallery of one person's possible homes. The bot is the curator: it hangs
new pieces on the wall every few minutes; David walks the gallery, stops at what catches his
eye, and lifts the phone to the seller. The UI therefore behaves like a gallery, not a
dashboard: photography carries the interface, type speaks only where a decision lives
(price, score), chrome disappears.

**The one aesthetic risk:** almost no color. The interface is porcelain, ink and glass; the
apartments' own photography provides all the color. One deep green — drawn from the Landing
logo's "settled dot" — marks exactly two things: the primary action and a strong match.

## 3. What explicitly dies (anti-goals)

- monday's language: colored side-strips, solid status blocks, bordered row-boxes, 4px
  radii, blue #0073ea — none of it survives.
- Full-width bottom tab bar → replaced by a floating glass dock.
- The battery bar, group headers with ▼, stat chips — gone; the feed itself is the status.
- The clichés (per the frontend-design skill): cream+serif+terracotta, black+acid-accent,
  broadsheet hairlines. Also every previously rejected palette (plaster/ultramarine,
  navy/gold, asphalt/dayglo, charcoal/ember).

**What survives:** the name Boton, the Landing logo, the subtitle, ALL functionality
(sensors, scoring, alerts, triage, pursuit, phone, review queue), and the data model.

## 4. Design system (from scratch)

### Color — "porcelain & ink"
| token | hex | role |
|---|---|---|
| porcelain | `#F6F5F2` | ground |
| surface | `#FFFFFF` | cards, dock |
| ink | `#16181B` | primary text |
| stone | `#75787E` | secondary text |
| hairline | `#EAE8E4` | the few unavoidable separators |
| landed | `#0B7A55` | THE accent: primary actions, strong score, live |
| amber | `#A16207` | sparse warnings / review |
| brick | `#BE4040` | sparse errors / dismissed |
Glass: `rgba(255,255,255,.82)` + blur — placards and dock.

### Type
- **Display: Secular One** — big prices, screen titles, the score numeral. Used sparingly;
  its character IS the brand voice. Never below 20px.
- **UI: Assistant** 400/600/700 — everything else. Hebrew-first, quiet, modern.
- Scale: display 34/28/22 · body 15 · secondary 13 · caption 11.5. Numbers tabular.

### Shape & depth
- Cards radius **20px**; photos edge-to-edge inside card tops; buttons are **pills** (999).
- Depth via soft ambient shadow (`0 8px 30px rgba(22,24,27,.08)`) and SPACE — not borders.
  The bordered-box look is the previous system; V3 floats.

### Signature element — **the placard (הפלקט)**
Every photo carries a small glass placard (bottom-start corner): the price in Secular One
on frosted glass — like a gallery label beside an artwork. It is the one element a user
will remember, and it moves with the brand into alerts and the listing page. Photo-less
listings get a quiet text card — no fake imagery, the placard only ever sits on truth.

### Motion
One orchestrated moment: gallery cards fade-rise 240ms staggered on load. Dock is static.
Reduced-motion collapses everything.

## 5. Information architecture

Dock (floating, 4): **גלריה** (home) · **חיפוש/כל ההתאמות** · **בטיפול** · **פרופיל**.
"בטיפול" is promoted to a top-level destination (the pursuit is the second half of the
product); the profile tab keeps its edit-first behavior; הוספה ידנית moves into פרופיל
screen (rare action, off the dock).

### Screens
1. **הגלריה (home):** logo row (mark 26 + Boton + status dot-cluster; tap = sensors sheet) →
   one greeting line ("הבוקר נתלו 3 עבודות חדשות") → the feed: full-width photo cards
   (photo 16:10, placard, then title/facts/score-line inside the card) grouped by quiet
   whisper-labels: חדשות · לבדיקה · בטיפול. No-photo → compact text card.
2. **כל ההתאמות:** sticky segmented chips (חדשות / הכל / לבדיקה / שנדחו) + compact gallery
   rows (96px photo start). Filters live behind one chip (the current collapsed form logic).
3. **דף דירה:** full-bleed photo (h-60) with floating back-chip; content sheet rounds up
   over the photo; placard on photo; sticky bottom action bar: [📞 חייג] pill in landed,
   [וואטסאפ] [מודעה] as quiet circles; triage as 4 quiet chips; analysis/script/pursuit/post
   as whisper-labeled sections — no boxes-in-boxes.
4. **בטיפול:** pursuit cards with viewing date as the placard content (date instead of price).

## 6. Migration plan (after approval)

Phase A: new tokens + primitives (`globals.css` v3, Pill, GalleryCard, Placard, Dock, Sheet)
— clean break, old monday components deleted, not themed.
Phase B: screens in order home → matches → listing → pursuit/profile; screenshot-verify each.
Phase C: alerts/PWA cosmetics (manifest theme, icons unchanged — logo stays), delete dead code.
Tests/typecheck/build green at every phase; commits per phase.

## 7. Open questions for David (asked via mockup, not text)

- Does the near-monochrome canvas feel "expensive" or "empty"? (The mockup answers this.)
- Dock: 4 destinations okay?
