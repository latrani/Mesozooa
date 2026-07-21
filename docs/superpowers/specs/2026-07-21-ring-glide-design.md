# Ring-glide: animate the focus ring as a continuity aid

**Status:** design approved, pending implementation plan
**Issue:** [#52](https://github.com/latrani/Mesozooa/issues/52) (slice 1 of 2 — the focus-ring glide; the Explore relayout FLIP is slice 2, deferred)
**Component:** `src/lib/game/components/SpineTree.svelte`

## Problem

The keyboard tree navigation added for #21 creates spatial discontinuities. ↑/↓ is
depth-first (hierarchy-honest for screen readers), so descending into a deep subtree moves
the focus ring to a different x-column. Today the ring **teleports** between nodes — it's a
per-node `<rect class="label-ring">` conditionally rendered inside whichever node `<g>` is
highlighted (lines 524–535), popping into existence at the destination. The user can lose
track of where focus went.

Animating the ring's travel — rather than teleporting it — is a "maintain spatial context
across a transition" aid. This is IA, not decoration: it's the animation's *first* job. Any
aesthetic easing/flourish is a secondary concern for the dedicated look-and-feel pass.

This spec covers **only the focus-ring glide**. The Explore relayout FLIP (the other half of
#52) is a separate, larger slice and is deferred — landing the ring glide first de-risks the
persistent-element refactor it shares.

## Motion model

The visible ring stops being a per-node `<rect>`. It becomes **one persistent "puck"** — a
single SVG element at the top level of the `<svg>` (a sibling of the `{#each layout.nodes}`
block, drawn *last* so it paints over the nodes), positioned from the currently-ringed node's
coordinates.

Each ring move plays **collapse → skate → bloom**:

1. **Collapse** — the label-ring shrinks toward the source node's glyph center, becoming a
   small dot. The dot visually rhymes with the node glyph discs (footprint / tracks), so
   focus-in-transit reads as a little puck hopping between nodes.
2. **Skate** — the dot translates in a straight line from the **source glyph** to the
   **target glyph**. Glyphs (not labels) are the anchors: the puck lands on real tree
   structure at both ends, and a straight glyph-to-glyph line rhymes with the discs.
3. **Bloom** — at the target the dot re-expands into the full label-ring, hugging that
   node's label.

Collapsing to a dot mid-flight avoids a "ring around nothing" — a full-width ring sliding
over whitespace and unrelated labels. The traveling marker is always a tight, unambiguous
"here's your focus" dot.

## Retargeting + settle (fast-nav behavior)

Arrow-nav can fire fast (holding ↓ ≈ a hop every ~50ms), faster than a
collapse→skate→bloom sequence completes. The puck's position is therefore **one
continuously-retargetable tween**, never a queue:

- A new hop arriving mid-flight → the dot keeps its current (collapsed) size and redirects
  toward the newest target. **No re-collapse, no re-bloom** mid-streak.
- **Bloom fires only on settle** — after a short idle (nav stops for a beat with no new hop),
  the dot expands into the ring at the final node.

Net feel: holding an arrow is a dot skating along the tree that settles into a ring when you
land. Bloom becomes a meaningful "you've arrived" signal, firing once per nav streak rather
than on every keystroke.

## Trigger-based speed

**Every** ring move glides — keyboard hops, clicks, and guess-row selection alike (all are
either a `focusId`/keyboard-cursor change or a committed `highlightId` change; the ring
follows `ringId`, which is derived from both). Consistency means the ring is always one
coherent object, never teleporting in one interaction and gliding in another.

Two speeds, chosen by **what caused the move** (not by travel distance):

- **Keyboard hop** — the full skate.
- **Click / guess-row commit** (any `highlightId` change) — a quick glide, same three phases
  compressed. A deliberate "put it there" shouldn't dawdle, but still reads as a glide.

Both durations are **named constants** at the top of the component, explicitly tunable. Exact
values are deliberately left for the look-and-feel pass (fine-tune later); the structural
requirement is only that two distinct, trigger-selected durations exist.

## Reduced motion

`prefers-reduced-motion: reduce` → **no puck animation at all**. The ring places instantly at
the target, exactly like today's teleport. Reuses the existing `reduceMotion` const
(line 206–207), which already gates the focus-follows `scrollTo`. This is mandatory: motion
done wrong hurts exactly the vestibular/motion-sensitive users the a11y work serves.

## Structural changes

**New:**
- A persistent ring/puck element rendered once at SVG top level (drawn last, over the nodes).
- A small `$state` machine tracking the animation: current phase, `fromId`, `toId`, and the
  settle timer. Position and size derive from `posOf` (existing per-node `{x, y, depth}`) plus
  the existing `labelBox` measurement.

**Removed:**
- The per-node `{#if isHi && labelBox}` `<rect class="label-ring">` block (lines 524–535).

**Reused / unchanged:**
- `labelBox` + `measureLabel` (lines 178–185): bloom still needs the per-label bbox to size
  the ring; that measurement logic stays, now feeding the persistent element instead of a
  per-node rect.
- `scrollFocusIntoView` / `scrollToNode`: **not touched.** The scroll policy is complementary
  to the motion smoothing (per the #52 comment); scroll-coordination bites in the Explore
  relayout FLIP (slice 2), not here.
- `reduceMotion`.

**Extracted as pure helpers (TDD'd):**
- Duration selection from trigger kind (keyboard vs. commit).
- Dot-travel endpoint computation from two node positions (source glyph center → target glyph
  center in SVG coords).

## One visual detail to verify

Today's ring is drawn *under* the glyph + backing disc so its tucked corner hides behind them
(line 527). A top-level persistent puck draws *over* everything. The bloomed ring must still
read correctly on top rather than tucked — the fill is already translucent
(`color-mix(in srgb, {hiColor} 18%, transparent)`), so the label should show through, but this
is the one detail to confirm in the gallery once built.

## Testing

- Motion is DOM/visual: validated in `/gallery.html` with `prefers-reduced-motion` both on and
  off, plus build + running the app. Not unit-tested directly.
- Pure extracted helpers (duration-from-trigger, travel-endpoints) are TDD'd per the working
  agreement.
- `npx tsc --noEmit` + `npx svelte-check` before commit (`verbatimModuleSyntax` is on; Vitest
  won't catch type-only-import violations).

## Out of scope

- The Explore relayout FLIP (#52 slice 2).
- Any specific easing curve, duration value, or aesthetic flourish — look-and-feel pass.
- Scroll-policy changes.
