# Mesozooa — Desktop placard scrolls when too tall

*Design for #65: the floating desktop specimen placard clips off-screen on a short viewport with
no way to reach its lower content.*
Date: 2026-07-23

The desktop specimen placard floats absolutely in the top cluster and visually overhangs the tree
body. On a short viewport a tall placard (end-state: photo + fields + Wikipedia link) runs past the
bottom of the window, and because the app shell is locked `overflow: hidden`, that overflow is
**unreachable** — the document does not scroll. The fix mirrors the mobile placard's model: the
card is a single physical block on a fixed layer above the header, the top-floating element of the
interface. When it is taller than the space available, scrolling slides the whole block — riding
over the header above and the footer below, clipped only by the viewport edges — and the zoom
controls shift clear when the block grows tall.

## 1. Problem (reproduced)

At 1280×380 (desktop width, short height), end-state daily:

- The placard runs y=78 → y=492, **overflowing the viewport by 112px**.
- The Wikipedia link (bottom of the placard) sits at y=479, **below the 380px fold**.
- `document.scrollingElement.scrollHeight === clientHeight` — **the document is not scrollable**
  (shell is `overflow: hidden`), so the clipped 112px cannot be reached by any means.

The mobile placard does not have this problem: it is a `BottomSheet` on a `position: fixed`
drawer-layer (`z-index: 8`, above the header's 4) that translates as a rigid block and publishes its
retracted footprint (`--drawer-peek-h`) so the floating zoom controls clear it. **Desktop should use
the same model** — a fixed layer whose card is one physical object — but driven by native scroll
instead of drag. Today's `position: absolute` card, scoped inside the cluster's stacking context,
simply clips.

## 2. Decisions (settled in brainstorming)

1. **The whole card is one rigid physical object that TRANSLATES, and it is the top-floating element
   of the interface.** It is not a pinned frame with content scrolling inside — the entire block
   (title, photo, fields, link) moves as a unit. When it is taller than the space below the header,
   scrolling slides the whole block UP, and its top **rides OVER the header** (drawn on top, not
   clipped at the header's edge). If it is tall enough at rest, its bottom **rides over the footer** —
   explicitly OK in this case to occlude the footer's attribution strip. Clipped only by the two
   viewport edges, never by the header or footer. This is the mobile drawer model, desktop-scrolled.
2. **Zoom controls shift LEFT only when the placard is tall.** Mirrors the mobile "clear the
   drawer" logic (`--drawer-peek-h`), rotated to the horizontal axis. Short placard → controls stay
   bottom-right exactly as today. Tall placard → controls slide left, clear of the card's column.
3. **Unify by MIRRORING mobile's model, not by sharing a code shell.** Mobile is the reference:
   desktop copies its structure (fixed layer, `z-index: 8`, `pointer-events` juggling, footprint
   var). But the working `BottomSheet` is left untouched — no extraction of a shared `FloatingLayer`
   primitive. Rationale: the layout is locked (no future floating panels to reuse a shell for), so
   extraction buys a reuse benefit that won't be collected while spending regression risk on the
   drag mechanism's subtle logic. Crucially, **look-and-feel is already unified** independent of
   this: both breakpoints render the same `SpecimenPlacard` component reading the same tokens
   (`--specimen-surface`, `--radius-card`, `--shadow-placard`), so a material/type/spacing tweak
   lands on both in one edit today. What differs is pure behavior plumbing (drag vs scroll) — the
   part not being tweaked. If a second floating panel ever appears, extract the shell then, against
   two real consumers. (This is a current decision, not a commitment — cheap to revisit.)

## 3. Mechanism

### 3.1 A fixed desktop placard-layer that scrolls the whole block (desktop only)

Give the desktop placard the same shape as the mobile drawer-layer: a `position: fixed` layer
spanning the viewport, above the header in z-order, with the card as a rigid child that the layer
scrolls. Scroll — not drag — is the desktop-native affordance for "move the block."

```css
@media (min-width: 641px) {
  .specimen-float {
    /* fixed to the VIEWPORT (not absolute in the cluster) so it can travel over the header and
       footer and is clipped only by the viewport edges. z-index clears the header's 4, matching
       the mobile drawer-layer's intent. */
    position: fixed;
    top: 0; right: var(--space-5); z-index: 8;
    /* the whole viewport height is the scroll box; a top spacer (below) sets the resting position */
    max-height: 100dvh; overflow-y: auto; overscroll-behavior: contain;
    /* the layer itself is inert so the tree stays interactive; the card re-enables pointers */
    pointer-events: none;
  }
  .specimen-float > :global(*) { pointer-events: auto; }
}
```

**Resting position preserved.** The card must sit below the header at rest (today's look), yet be
able to travel above it when scrolled. A top spacer inside the scroll box does this: a
`margin-top`/pad on the card equal to the header's height + today's `--space-4`, so at `scrollTop: 0`
the card sits exactly where it does now. As content grows past the viewport, scroll appears and the
whole block slides up over the header; at max scroll the bottom clears down over the footer.

- **Short/normal content (tall window):** total height < viewport → no scrollbar → the card sits at
  its resting spot below the header. **Zero visual change in the common case** (it's now painted on
  the fixed layer rather than the cluster, but the pixel position is identical).
- **Tall content / short window:** scroll reveals the whole block; it rides over header and footer;
  `overscroll-behavior: contain` stops scroll-chaining to the tree behind it.

**Two details settled in-browser during implementation (bounded, with fallbacks):**

1. **Scroll ownership under `pointer-events: none`.** A wheel over the card (pointer-events auto)
   should scroll its `overflow-y: auto` ancestor (the layer). Verified working = keep it. If the
   `pointer-events: none` layer refuses to scroll from a descendant's wheel, the fallback is to move
   `overflow-y: auto` onto the card's own wrapper and drop `pointer-events` juggling — the card is
   top-right and narrow, so an inert empty layer is a nicety, not load-bearing.
2. **Scrollbar vs. the card's shadow/rounded corners.** If the scrollbar clips the card's frame,
   pad the layer so the scrollbar rides in the gutter outside the card, or accept a thin inner
   scrollbar. Whichever renders clean wins — verified, not assumed.

The move from `absolute`-in-cluster to `fixed`-to-viewport also means `.cluster-main`'s
`padding-right: 22rem` (which reserves space so wrapping cluster text never slides under the
placard) still applies — the reserved column is unchanged; only the placard's containing block moves.

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
  guard in the effect. The phone `BottomSheet` path is untouched (mirror, not shared code — §2.3).
- **Files:**
  - `BoardLayout.svelte` — `.specimen-float` becomes the fixed desktop placard-layer (position,
    z-index, scroll box, pointer-events, resting-position spacer); the `--placard-clearance`
    measurement effect.
  - `SpineTree.svelte` — the zoom `right` reads `--placard-clearance`.
  - `SpecimenPlacard.svelte` — only if the scroll owner / resting spacer must live on the card
    rather than the layer wrapper (settled in-browser during implementation).
- **No engine/data/logic changes.** Pure layout.

## 5. Verification

- **Type/build:** `npx tsc --noEmit` + `npx svelte-check` clean.
- **Bug fixed (in-browser, 1280×380, end-state daily):** scrolling the placard slides the whole
  block up and reaches the Wikipedia link at its bottom; the block rides OVER the header (drawn on
  top, not clipped at the header edge) and its bottom rides over the footer; `overscroll-behavior`
  keeps the scroll from chaining to the tree.
- **Z-order (probed with `elementFromPoint`):** where the block overlaps the header, the placard is
  the top element; same over the footer. (Confirmed feasible in brainstorming: forcing the placard
  to overlap either band, it wins the hit-test and is not clipped.)
- **No regression in the common case (1280×900):** the placard sits at its resting spot below the
  header, pixel-identical to today; no scrollbar; zoom controls stay bottom-right
  (`--placard-clearance` resolves to 0).
- **Tree stays interactive behind the layer:** a click/pan on the tree in the region under the
  fixed layer still reaches the tree (the `pointer-events: none` layer + `auto` card).
- **Zoom clearance (short viewport):** controls shift left, clear of the placard column. (The #64
  opaque-fill fix already means they don't vanish over the placard, but they should no longer
  overlap it at all when tall.)
- **Gallery:** the desktop board panels render the new behavior; walk `/gallery.html`.

## 6. Out of scope

- Any change to the mobile `BottomSheet`, and extraction of a shared floating-layer primitive
  (mirror, not share — §2.3; revisit if a second floating panel ever appears).
- Retuning the placard's 20rem width or its content.
- A drag affordance on desktop (scroll is the desktop-native affordance; drag is the phone one).
