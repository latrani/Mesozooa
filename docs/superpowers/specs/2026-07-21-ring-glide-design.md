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
single SVG element at the top level of the `<svg>` (a sibling of the `{#each layout.nodes}`
block, drawn *last* so it paints over the nodes), positioned from the currently-ringed node's
coordinates.

Each ring move plays **collapse → skate → bloom**:

1. **Collapse** — the label-ring shrinks toward the source node's glyph center, becoming a
   **glyph-sized** ring (dot diameter = the node glyph size, 24px), and its **fill fades to
   fully transparent** so in transit it's a hollow, stroke-only ring exactly bounding the
   glyph disc — no muddy translucent overlap sitting on top of the glyph.
2. **Skate** — the hollow glyph-sized ring translates in a straight line from the **source
   glyph** to the **target glyph**. Glyphs (not labels) are the anchors: the puck lands on
   real tree structure at both ends, and its size matching the glyph makes it read as the
   focus "snapping onto" each disc.
3. **Bloom** — at the target the ring re-expands into the full label-ring, hugging that
   node's label, and its **fill fades back in** to the translucent tint.

Collapsing to a hollow glyph-sized ring mid-flight avoids a "ring around nothing" — a
full-width filled ring sliding over whitespace and unrelated labels. The traveling marker is
always a tight, unambiguous "here's your focus" that frames the node's own glyph.

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

## Reduced motion

`prefers-reduced-motion: reduce` → **no puck animation at all**. The ring places instantly at
the target, exactly like today's teleport. Reuses the existing `reduceMotion` const
(line 206–207), which already gates the focus-follows `scrollTo`. This is mandatory: motion
done wrong hurts exactly the vestibular/motion-sensitive users the a11y work serves.

## Structural changes

**New:**
- A persistent ring/puck element rendered once at SVG top level (drawn last, over the nodes).
- **Phase machine** — a `phase` (`"dot" | "bloom"`) `$state` plus the settle timer, owned by a
  single effect keyed to `ringId` **only**. Reads the node center under `untrack` so layout
  churn cannot re-trigger it. Sets one `GLIDE_MS` duration (no trigger distinction), and
  clears/re-arms the settle timer on a genuine focus change (and on teardown).
- **Geometry `$derived`** — the tween target = `ringGeom(phase, center(ringId), labelBox, …)`,
  recomputed on any of {`phase`, ringed-node coordinates, `labelBox`}. Driving the tween off
  this derived value is what makes the ring follow a relayout at its current phase. The dot
  branch sizes the ring to the **glyph diameter** (passed in, = `GLYPH_GENUS`) so the collapsed
  ring frames the disc exactly.
- **Fill-opacity tween** — a second tweened scalar, 1 while bloomed → 0 while dot, interpolated
  alongside the geometry so the fill washes out on collapse and back in on bloom. Stroke opacity
  is unchanged (the ring is always visible as an outline; only the tint fades).

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
