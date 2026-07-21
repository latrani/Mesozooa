# Ring-glide: animate the focus ring as a continuity aid

**Status:** design approved; **revised 2026-07-21** after a first implementation exposed a relayout race (see *Motion architecture* below)
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
single SVG `<rect>` positioned from the currently-ringed node's coordinates. It's rendered
**between the branch-edges loop and the `{#each layout.nodes}` loop**, so (SVG paint order =
document order) it sits *above* the branch lines but *behind* every node's page-color backplate
and glyph — restoring the original per-node ring's tucked-behind stacking (it frames the glyph
disc rather than covering it). See *Z-order* below.

Each ring move plays **collapse → skate → bloom**:

1. **Collapse** — the label-ring shrinks toward the source node's glyph center, becoming a
   **glyph-sized** disc (dot diameter = the node's own glyph size), and the **whole puck fades to
   `PUCK_TRAVEL_OPACITY`** (a tuning knob, currently 0.5) so in transit it's a semi-transparent
   disc bounding the glyph — reading like a focus puck that rhymes with the node glyph discs.
2. **Skate** — the glyph-sized disc translates in a straight line from the **source glyph** to
   the **target glyph**. Glyphs (not labels) are the anchors: the puck lands on real tree
   structure at both ends, and its size matching the glyph makes it read as the focus "snapping
   onto" each disc.
3. **Bloom** — at the target the disc re-expands into the full label-ring, hugging that node's
   label, returns to full opacity, and its **fill drops to a translucent tint** (so the label
   shows through the settled box).

The traveling marker is always a tight, unambiguous "here's your focus" puck that frames the
node's own glyph, rather than a full-width filled box sliding over whitespace and unrelated
labels.

Implementation note — paint animates via **CSS transitions**, not the JS tween (which owns only
the shape). Two independent opacity levers, both transitioned over `--glide-ms`:
- **element `opacity`** carries the whole-puck travel fade: `PUCK_TRAVEL_OPACITY` (~0.5) while a
  dot, `1` when bloomed. This fades fill *and* stroke together.
- **`fill-opacity`** carries the fill tint: `1` (solid) while a dot, `0.18` when bloomed (the
  `0.18` reproduces the earlier `color-mix(… 18%, transparent)` look; the label shows through).
The fill/stroke *color* is the solid highlight color and also CSS-transitions (glides node→node);
no JS color math. `PUCK_DOT_PAD` adds px to the dot's radius beyond the glyph edge (currently 0).

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

## Motion architecture — separate "phase" from "position" (revised)

**Why this section exists.** The first implementation drove one `$effect` off both the
selection (`ringId`) *and* the node coordinates (`posOf`, a `$derived` of `layoutSpine`). Those
are two semantically different events the effect could not tell apart: *the user moved focus*
(should restart collapse→skate→bloom) vs. *the layout rebuilt under a stable selection* (should
NOT). In Explore a single click mutates `highlightId`, `tipId`, AND `revealed`, so the layout
re-derives 2–3 times in a cascade; each re-run reset the phase to `dot` and re-armed the settle
timer, so the timer was repeatedly cleared before it could fire — **the ring collapsed to a dot
and never bloomed** (confirmed live: a clicked node's ring sat at `DOT_R` for >1s while its
label measured 105px wide). This is the same coupling as #52's second half: *relayout and
refocus were one signal.* The fix is to make them two.

The animation is split into two independent concerns:

1. **Phase machine** — an effect keyed to **`ringId` only** (tracks the previous id; reacts
   only to a genuine focus change). On a real move: set `phase="dot"`, arm the settle timer,
   and on settle set `phase="bloom"`. It must read the node center **without** taking a
   reactive dependency on the layout (Svelte `untrack`), so layout churn never trips it. This
   is the sole owner of `phase` and the settle timer.

2. **Position/geometry** — a **`$derived`** target: `ringGeom(phase, center(ringId), labelBox,
   …)`. The tween target recomputes whenever `phase`, the ringed node's coordinates, OR
   `labelBox` change. When a relayout moves the node, this updates the target and the ring
   **follows at its current phase** — a bloomed ring stays bloomed and simply repositions; it
   never resets to a dot.

**Why this is the right seam for slice 2.** "Position follows relayout" *is* the hook the
Explore relayout FLIP (slice 2) plugs into. Today the layout snaps, so the ring snaps to the
node's new position (correct, and no worse than the pre-animation teleport). When slice 2 adds
the FLIP over the node set, the ring rides the same transition for free — the "one coordinated
transition" the #52 comment requires — with no further change to this component's ring logic.

This replaces the earlier "small `$state` machine tracking phase + fromId + toId + timer" as a
single effect. `fromId`/`toId` are unnecessary: the `Tween` already interpolates from its
in-flight value, so "from" is implicit.

## Speed — one duration for all moves (revised)

**Every** ring move glides — keyboard hops, clicks, and guess-row selection alike (all are
either a `focusId`/keyboard-cursor change or a committed `highlightId` change; the ring
follows `ringId`, which is derived from both). Consistency means the ring is always one
coherent object, never teleporting in one interaction and gliding in another.

**One speed for everything.** The earlier design had two trigger-selected durations (a snappy
click glide, a slower keyboard skate). Playtest verdict: the snappy timing feels good enough
that *every* move should use it — this is a game, and the quick glide gives good feel on click
navigation too. So the trigger distinction (and its `GlideTrigger`/`glideDuration`/`nextTrigger`
plumbing) is **removed** in favor of a single `GLIDE_MS` constant. Re-splitting later is cheap
if a slower commit is ever wanted; carrying dead two-speed machinery is not worth it.

`GLIDE_MS` is a named constant at the top of the component, still tunable in the look-and-feel
pass.

## Click moves focus into the tree

A pointer click on a node **selects it and moves keyboard focus onto that treeitem**, so the
user can immediately continue with arrow keys — no separate Tab-into-the-tree step. This is the
canonical ARIA tree-view behavior (a clicked `treeitem` takes focus under roving tabindex), not
a focus-steal: focus lands on exactly the element the user clicked, so WCAG 3.2.1 (On Focus)
doesn't apply.

Scoped and safe by construction:
- Guarded on `onnodeselect` — a no-op in the game (SVG node clicks do nothing there); only
  Explore, where clicking *is* navigation, grabs focus.
- Mouse-only users see no change: the visible ring already tracks the focused node
  (`treeFocused ? currentId : highlightId`), and post-click both point at the clicked node.
- The Explore re-center rebuilds the sr-tree `<li>`s; the existing focus-restore `$effect`
  (added for keyboard-nav-triggers-relayout) re-focuses the rebuilt item, so focus survives.

Implemented as `onNodeClick(id)`: call `onnodeselect(id)`, then `focusItem(id)`.

**Selecting from the "Recently viewed" trail does the same.** A history chip lives *outside* the
tree (a different control, not a `treeitem`), so the ARIA-roving rationale above doesn't directly
cover it — but selecting from the trail is just another way to select a node, and consistency
with tree-click argues for matching behavior. Since focus moves on *activation* (not on focus),
WCAG 3.2.1 still doesn't apply. SpineTree exposes `focusNode(id)` (like `panTo`); Explorer's chip
handler calls `jumpTo(id)` then `spine.focusNode(id)`. `focusNode` sets `treeFocused` so the
focus-restore `$effect` grabs the rebuilt `<li>` after the jump's relayout — necessary because a
jump target often isn't in the pre-jump layout, so the immediate `focus()` is a no-op.

## Reduced motion

`prefers-reduced-motion: reduce` → **no puck animation at all**. The ring places instantly at
the target, exactly like today's teleport. Reuses the existing `reduceMotion` const
(line 206–207), which already gates the focus-follows `scrollTo`. This is mandatory: motion
done wrong hurts exactly the vestibular/motion-sensitive users the a11y work serves.

## Structural changes

**New:**
- A persistent ring/puck `<rect>` rendered once, **between the edges loop and the nodes loop**
  (so it stacks behind glyphs, above branch lines — see *Z-order*).
- **Phase machine** — a `phase` (`"dot" | "bloom"`) `$state` plus the settle timer, owned by a
  single effect keyed to `ringId` **only**. Reads the node center under `untrack` so layout
  churn cannot re-trigger it. Sets one `GLIDE_MS` duration (no trigger distinction), and
  clears/re-arms the settle timer on a genuine focus change (and on teardown).
- **Geometry `$derived`** — the tween target = `ringGeom(phase, center(ringId), labelBox, …)`,
  recomputed on any of {`phase`, ringed-node coordinates, `labelBox`}. Driving the tween off
  this derived value is what makes the ring follow a relayout at its current phase. The dot
  branch sizes the ring to the ringed node's **own glyph** (`dotRadiusFor` picks `GLYPH_GENUS`
  or `GLYPH_CLADE` — they're sized independently — plus `PUCK_DOT_PAD`) so the collapsed ring
  frames that node's disc exactly.
- **Paint via CSS, not the JS tween** — the tween carries only shape (`RingGeom`: x/y/w/h/radius).
  Fill, stroke, element `opacity`, and `fill-opacity` are set as inline attrs and animated by CSS
  transitions over `--glide-ms` (so color interpolates natively — no JS color math). Two opacity
  levers: element `opacity` = `PUCK_TRAVEL_OPACITY` (dot) → `1` (bloom) fades the whole puck;
  `fill-opacity` = `1` (dot) → `0.18` (bloom) carries the fill tint. See *Motion model*.

**Removed:**
- The per-node `{#if isHi && labelBox}` `<rect class="label-ring">` block (originally lines
  524–535; the first implementation already removed it — this stays removed).

**Reused / unchanged:**
- `labelBox` + `measureLabel`: bloom still needs the per-label bbox to size the ring; that
  measurement logic stays, feeding the geometry `$derived`.
- `scrollFocusIntoView` / `scrollToNode`: **not touched.** The scroll policy is complementary
  to the motion smoothing (per the #52 comment); scroll-coordination bites in the Explore
  relayout FLIP (slice 2), not here.
- `reduceMotion`.

**Extracted as pure helpers (TDD'd):**
- Glyph-center endpoint from a node position — `glyphCenter`. *(already built, unchanged)*
- Phase→geometry resolution — `ringGeom`. The dot radius is a **parameter** (the caller passes
  `GLYPH_GENUS / 2`), so "dot = glyph size" holds by construction rather than via a magic
  number that could desync. Replaces the old fixed `DOT_R` const.

**Removed helper:** `glideDuration` + `GlideTrigger` + `GLIDE_MS_KEYBOARD`/`GLIDE_MS_COMMIT`
(one speed now — see *Speed*). The component's `nextTrigger` state and the `focusItem` trigger
set go with it.

## Z-order

SVG has no `z-index`; paint order **is** document order. The original per-node ring was drawn
first inside each node's `<g>`, so it tucked *behind* that node's page-color backplate + glyph
(the label read on top). The persistent puck must reproduce that stacking, so it's emitted
**after the branch-edges loop but before the `{#each layout.nodes}` loop** — above branch lines,
behind every node's backplate/glyph/label. It frames the glyph disc rather than covering it.

The collapsed-clade "more here" stubs (the right-fading `<line>` past an unexpanded clade) get
the same treatment: they were originally drawn inside each node's `<g>` (which now renders
*after* the puck), so they painted *in front of* the ring while an expanded clade's branch edge
sat behind it — inconsistent. They're lifted into their own pass alongside the edges (before the
puck), so both tree-line kinds stack behind the ring identically.

## Testing

- Motion is DOM/visual: validated in `/gallery.html` with `prefers-reduced-motion` both on and
  off, plus build + running the app. Not unit-tested directly.
- Pure extracted helpers (`glyphCenter`, `ringGeom`) are TDD'd per the working agreement.
- Runtime reactivity/motion bugs (the relayout race, the coordinate-frame jump, focus-follows-
  click) are verified live via Playwright — they don't surface in unit tests.
- `npx tsc --noEmit` + `npx svelte-check` before commit (`verbatimModuleSyntax` is on; Vitest
  won't catch type-only-import violations).

## Out of scope

- The Explore relayout FLIP (#52 slice 2).
- Any specific easing curve, duration value, or aesthetic flourish — look-and-feel pass.
- Scroll-policy changes.
