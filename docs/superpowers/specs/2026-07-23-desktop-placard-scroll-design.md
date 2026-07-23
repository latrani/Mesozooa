# Mesozooa — Desktop placard scrolls when too tall

*Design for #65: the floating desktop specimen placard clips off-screen on a short viewport with
no way to reach its lower content.*
Date: 2026-07-23

The desktop specimen placard floats absolutely in the top cluster and visually overhangs the tree
body. On a short viewport a tall placard (end-state: photo + fields + Wikipedia link) runs past the
bottom of the window, and because the app shell is locked `overflow: hidden`, that overflow is
**unreachable** — the document does not scroll. This makes the placard behave like the mobile
placard already does: a single physical block that scrolls as a unit inside a viewport-capped
frame, with the zoom controls shifting clear when the block grows tall.

## 1. Problem (reproduced)

At 1280×380 (desktop width, short height), end-state daily:

- The placard runs y=78 → y=492, **overflowing the viewport by 112px**.
- The Wikipedia link (bottom of the placard) sits at y=479, **below the 380px fold**.
- `document.scrollingElement.scrollHeight === clientHeight` — **the document is not scrollable**
  (shell is `overflow: hidden`), so the clipped 112px cannot be reached by any means.

The mobile placard does not have this problem: it is a `BottomSheet` that drags/scrolls as a rigid
block and publishes its retracted footprint (`--drawer-peek-h`) so the floating zoom controls clear
it. Desktop's `position: absolute` card simply clips.

## 2. Decisions (settled in brainstorming)

1. **The whole card scrolls as one** — title included. It is a single physical object; there is no
   pinned header. Under the height cap the entire card (title, photo, fields, link) scrolls
   together; above the cap, nothing changes.
2. **Zoom controls shift LEFT only when the placard is tall.** Mirrors the mobile "clear the
   drawer" logic (`--drawer-peek-h`), rotated to the horizontal axis. Short placard → controls stay
   bottom-right exactly as today. Tall/capped placard → controls slide left, clear of the card's
   column.

## 3. Mechanism

### 3.1 Placard becomes a viewport-capped scroll container (desktop only)

`.specimen-float` gets a height cap tied to the viewport and its own top offset, and becomes the
scroll container:

```css
@media (min-width: 641px) {
  .specimen-float {
    /* top offset (var(--space-4)) above + a matching breathing margin below */
    max-height: calc(100dvh - var(--space-4) - var(--space-4));
    overflow-y: auto; overscroll-behavior: contain;
  }
}
```

- **Under the cap:** the whole card scrolls as one block (title scrolls away as you go down —
  correct for a physical object). `overscroll-behavior: contain` stops scroll-chaining to anything
  behind it.
- **Above the cap (short/normal content, tall window):** `max-height` is not reached, so the card
  sits exactly where it does today. **Zero visual change in the common case.**

The scroll container is `.specimen-float` (the positioned wrapper in `BoardLayout`), NOT
`.specimen-placard` itself — the wrapper owns the geometry; the card keeps its shadow/border intact
and the rounded corners are not clipped by the scrollbar. To be confirmed against the real box
during implementation; if the shadow is clipped, move the cap to the card and accept the internal
scrollbar, or pad the wrapper. Whichever renders correctly wins — verified in-browser, not assumed.

### 3.2 Zoom controls — conditional left-shift via a published clearance var

Same channel pattern as the mobile drawer's `--drawer-peek-h`, because the measurement crosses two
stacking contexts (the placard lives in `.cluster`; the zoom controls live in `.tree-body`), and a
`documentElement`-level custom property is the clean way to bridge them.

`BoardLayout` runs a `$effect` (desktop only) that measures whether the placard's bottom edge
reaches down into the zoom controls' bottom-right zone — i.e. it is tall enough to overlap them
horizontally AND vertically. When it does, publish the horizontal clearance the controls need:

```
--placard-clearance = placardWidth + gap   (when the placard overlaps the controls' zone)
--placard-clearance = 0                     (otherwise)
```

- Measured off the real placard box (`getBoundingClientRect()` / `offsetWidth`), so a future width
  change to the 20rem card needs no edit here.
- Republished on resize and on placard content change (reuse a `ResizeObserver`, matching the
  BottomSheet's measurement effect).
- Cleaned up on unmount / when leaving desktop (remove the property), same discipline as
  `--drawer-peek-h`.

`SpineTree`'s zoom controls read it:

```css
.zoom-controls { right: calc(var(--space-4) + var(--placard-clearance, 0px)); }
```

- **Short placard** → clearance 0 → `right: var(--space-4)` (today's position, untouched).
- **Tall placard** → controls slide left by the placard's column width + gap, clear of the card.

The existing phone rule that sets `.zoom-controls { bottom: ... }` from `--drawer-peek-h` is
unaffected; `--placard-clearance` is a desktop-only horizontal analog and defaults to `0px` so the
phone and short-placard paths are byte-identical to today.

## 4. Scope / blast radius

- **Desktop only.** Every change is gated `@media (min-width: 641px)` or a `viewport.isPhone`
  guard in the effect. The phone `BottomSheet` path is untouched.
- **Files:**
  - `BoardLayout.svelte` — the `.specimen-float` height cap; the `--placard-clearance` measurement
    effect.
  - `SpineTree.svelte` — the zoom `right` reads `--placard-clearance`.
  - `SpecimenPlacard.svelte` — only if the scroll owner must be the card rather than the wrapper
    (settled during implementation).
- **No engine/data/logic changes.** Pure layout.

## 5. Verification

- **Type/build:** `npx tsc --noEmit` + `npx svelte-check` clean.
- **Bug fixed (in-browser, 1280×380, end-state daily):** the placard is capped to the viewport;
  scrolling the card reaches the Wikipedia link at its bottom; `overscroll-behavior` keeps the
  scroll from chaining.
- **No regression in the common case (1280×900):** placard sits where it does today; zoom controls
  stay bottom-right (`--placard-clearance` resolves to 0).
- **Zoom clearance (short viewport):** controls shift left, clear of the placard column, and stay
  legible (the #64 opaque-fill fix already guarantees they don't vanish over the placard, but they
  should no longer overlap it at all when tall).
- **Gallery:** the desktop board panels render the capped behavior at a short panel height; walk
  `/gallery.html`.

## 6. Out of scope

- Any change to the mobile `BottomSheet`.
- Retuning the placard's 20rem width or its content.
- A drag affordance on desktop (scroll is the desktop-native affordance; drag is the phone one).
