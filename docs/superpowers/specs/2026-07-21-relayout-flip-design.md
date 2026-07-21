# Relayout FLIP: animate the tree reflow as a continuity aid (#52 slice 2)

**Status:** design approved, pending implementation plan
**Issue:** [#52](https://github.com/latrani/Mesozooa/issues/52) (slice 2 of 2 — the Explore relayout FLIP; slice 1, the focus-ring glide, is merged). Also resolves [#54](https://github.com/latrani/Mesozooa/issues/54).
**Component:** `src/lib/game/components/SpineTree.svelte` (+ a new pure helper module)

## Problem

In Explore, activating a node re-centers the tree: `revealed` changes, so `layoutSpine` yields a
**different node set at different positions**. Today that **snaps** — the whole tree teleports to
its new arrangement. The user loses spatial orientation across the jump ("where did everything
go?"). Slice 1 made the *focus ring* glide; this makes the *tree itself* glide, so nodes visibly
slide from their old positions to their new ones and the user can track the reflow.

This is the "maintain spatial context across a transition" job (IA, not decoration) — the same
rationale as slice 1. Aesthetic flourish beyond that belongs to the look-and-feel pass.

## Scope (this slice = "A", built as groundwork for "C")

A relayout partitions nodes (by id) into three lifecycle classes. This slice animates:

- **Persisting** (in both old and new layout) — **FLIP**: slide from old position to new. *The
  load-bearing continuity cue.*
- **Entering** (only in new layout) — **fade in** (opacity 0→1). Cheap, SVG-safe, and the
  degenerate case of the eventual grow-in.
- **Leaving** (only in old layout) — **vanish** (instant, as today).
- **Edges** (branch `<path>`s) — **snap** to final positions. No path-`d` morphing.

Deliberately **out of scope now** (a later choreography pass, "scope C"): grow-in *with scale
from the parent*, shrink-out toward the parent, edge morphing. The design below is structured so
C is **purely additive** — richer enter/leave animations at the same timing knobs, **no new
constants and no new structure**. See *Groundwork for C*.

## Mechanism — hand-rolled FLIP (NOT Svelte's `animate:flip`)

**Spike result (verified live):** Svelte's `animate:flip` and `in:`/`out:` transitions **do not
work on SVG `<g>` elements**. `animate:flip` builds a CSS `transform: translate(<dx>px,<dy>px)`
keyframe from HTML box metrics; on an SVG group the deltas compute to `NaN`, the browser discards
the keyframe, and the node **snaps** to final (console spams `Invalid keyframe value` per frame).
This is a fundamental HTML-vs-SVG limitation, not a tuning issue.

So the FLIP is **hand-rolled**, the same mechanism as slice 1's ring puck (which already tweens an
SVG element's geometry): snapshot old positions, diff against new, drive each node's `transform`
attribute. Persisting nodes tween `translate`; entering nodes tween `opacity`; leaving nodes are
removed (or tween `opacity` 1→0 at `LEAVE_FRACTION`, which is 0 = instant).

## Groundwork for C — the `layoutDiff` seam

A **pure, TDD'd** function classifies the reflow. This is the seam that makes scope-C additive:

```
layoutDiff(old: Map<id, Pos>, new: Map<id, Pos>, parentOf: (id) => id | null) => {
  persisting: Array<{ id, from: Pos, to: Pos }>,
  entering:   Array<{ id, to: Pos,   parentFrom: Pos | null, parentTo: Pos | null }>,
  leaving:    Array<{ id, lastPos: Pos, parentFrom: Pos | null, parentTo: Pos | null }>,
}
```

- Slice-2-A consumes **only `persisting.from/to`** (FLIP) and `entering.to` (fade).
- `parentFrom`/`parentTo` on entering/leaving, and `leaving.lastPos`, are **baked in now purely
  for scope C**: grow-in scales *from the parent's position*, shrink-out collapses *toward it*, so
  C needs each entering/leaving node's parent from/to. Capturing them now (cheap) avoids
  reconstructing gone-node data later (expensive/impossible).
- **Capture "First" positions before the new layout commits** — especially leaving nodes' last
  position, which is unrecoverable once they're out of the DOM.

The runtime consumes the diff via a **per-node animation driver keyed on lifecycle class** — a
`switch` whose branches are today `persisting → slide`, `entering → fade`, `leaving → vanish`. C
fills in richer branches (grow/shrink) at the same call sites.

## Coordination — one clock, staggered by completion

Everything that moves on a relayout shares **one start (t = 0)** and **one envelope**. Staggered
*completion* (not staggered starts) produces cause→effect legibility — structure resolves first,
focus arrives last — without sequencing's latency or interruption problems.

- **`GLIDE_MS`** — the envelope length (the existing slice-1 ring-puck duration; the puck spans the
  full envelope, so it *is* the master clock; unchanged).
- **`FLIP_FRACTION`** (~0.6) — persisting nodes finish sliding at `FLIP_FRACTION × GLIDE_MS`.
- **`ENTER_FRACTION`** (~0.8) — entering nodes finish appearing at `ENTER_FRACTION × GLIDE_MS`.
  Named for the *role* (enter), not the mechanism (fade), so it survives the scope-C grow-in
  upgrade without a rename.
- **`LEAVE_FRACTION`** (**0**) — leaving nodes finish disappearing at `LEAVE_FRACTION × GLIDE_MS`.
  0 = instant vanish (today's behavior, expressed as the boundary value of the general knob). The
  driver **reads** the fraction (leave = opacity 1→0 over `LEAVE_FRACTION × GLIDE_MS`), so the knob
  is honest — bumping it actually animates the leave — rather than hardcoded-instant.

Completion order: **FLIP (~0.6) → enter (~0.8) → puck (1.0)**; leave at 0. Read: the tree settles,
new branches materialize into the settled space, focus (the ring) arrives last confirming where
you landed.

Fraction *values* are provisional (look-and-feel pass). The **structure** — one envelope, shared
t=0, four completion knobs with `LEAVE < FLIP < ENTER < puck` — is what's locked.

### This resolves #54

#54 (deferred from slice 1) was "when a relayout moves the ringed node, the ring follows over the
leftover `glideMs` instead of snapping — spec says snaps." Under this design that's **not a bug to
patch — it's the design**: the ring and the persisting nodes both glide to the new layout on the
one shared clock. "Relayout-follow" and "the FLIP" are the *same* coordinated motion — exactly the
"one coordinated transition" the #52 comment required. #54 closes when this ships.

## Reduced motion

`prefers-reduced-motion: reduce` → the whole envelope is **instant**: persisting nodes, entering
fades, and the ring all snap to final; no FLIP, no fade, no glide. Reuses the existing
`reduceMotion` const (same gate as slice 1). Mandatory — motion done wrong hurts exactly the
vestibular/motion-sensitive users the a11y work serves.

## Interaction with slice-1 machinery

- Rapid Enter-nav (fast Explore hopping) retargets the one shared glide, same clean interrupt
  behavior slice 1 established — no per-hop sequencing to stutter.
- **Scroll re-center joins the shared clock** (revised — see below). It's the *third* mover on a
  relayout, and it must ride the same envelope as the FLIP, or the two race.
- **The ring position joins the shared clock too** (revised — see below). Slice 1 gave the ring
  its own private `Tween`; that turned out to be the last mover NOT on the shared clock, and it
  wheeled once scroll started animating.

## The ring position must ride the shared clock (revised — "deep-unify")

**Why this section exists.** Slice 1's ring puck had its OWN `Tween` (linear, full `GLIDE_MS`).
Once the scroll re-center was put on the shared clock (`flipProgress(_, FLIP_FRACTION)`, complete
at ~60%), the ring was the only mover left on a *different* time-warp. The ring is drawn INSIDE the
scrolled SVG, so its on-screen position is `ringSVG(t) − scroll(t)`. With the ring on one curve and
scroll on another, that difference traces a **curved on-screen path** — the ring visibly "wheels
around" its node during a relayout (observed live). This is the same "one coordinated transition"
requirement, now applied to the last hold-out.

**The fix — ring POSITION on the shared clock; ring SIZE stays its own:**

- **Position** (x/y of the ring) interpolates old-ringed-node-center → new-ringed-node-center in
  **pixels**, on the **same** master progress + `flipProgress(_, FLIP_FRACTION)` curve the nodes
  and scroll use. Because `lerp` is linear, `screen(t) = ringSVG(t) − scroll(t)` is then a straight,
  monotonic path — the wheel is *provably* gone (both terms share the one curve). The ring's private
  position `Tween` is retired.
- **Size / phase** (the dot↔bloom morph: collapse to a glyph-sized dot, settle-timer, bloom to the
  label box) stays on the ring's existing phase machine + `flipProgress`-of-its-own. Size doesn't
  wheel — only x/y traces the curved screen path — so the morph is orthogonal and unchanged.
- **Paint** (CSS opacity/color transitions) unchanged.

**Trigger coordination.** The ring fires on `ringId` (focus) changes; the FLIP/scroll fire on
`layout` (relayout) changes. On an Explore click BOTH change, and they must share ONE progress
restart, not two racing ones. So the master progress tween is restarted by a single coordinated
trigger covering "ringId and/or layout changed", and ring-from/to are snapshotted in the same place
the node-from/to and scroll-from/to are. The phase machine stays `ringId`-keyed and `untrack`s
layout, exactly as slice 1; only the ring's *position source* moves from its private tween to the
shared progress.

**Skate preserved.** On a pure focus change (game arrow-nav, no relayout): from = old node center,
to = new node center, both stationary → the ring glides between them exactly as slice 1's skate did.
Rapid-nav interrupt still retargets from the ring's current (mid-glide) position.

## Scroll must ride the shared clock (revised)

**Why this section exists.** The first implementation left the tip re-center on the native
smooth-scroll (`scrollToNode` → `scrollTo({behavior:"smooth"})`), computed from the node's
*final* layout position. But the FLIP glides the node *to* that position over `GLIDE_MS`, while
the browser's smooth-scroll finishes on its own (~300ms) curve. Measured live: on
Eusaurischia→Saurischia, the viewport scrolls to the node's destination in ~300ms while the node
is still gliding there over the full envelope, so the *selected* node drifts ~340px off-centre
and back. That's the "two competing animations" the #52 comment warns against — I animated the
nodes but not the scroll.

**Fix:** the re-center scroll animates on the **same master progress + `GLIDE_MS`** as the node
FLIP (same linear curve), not the native smooth-scroll. Node-glide and scroll-glide finish
together, so the selected node stays put on screen while the rest of the tree reflows *around*
it — the selected node is the stable anchor the whole transition pivots on. Concretely: on a
relayout the effect snapshots the current `scrollTop`/`scrollLeft` and the target (final)
scroll, and the scroll is driven from the master progress (lerp start→target) alongside the
nodes — one clock, one curve. Reduced motion → instant (progress set to 1, duration 0), same as
the FLIP. Non-relayout scroll (arrow-browse keep-visible `scrollFocusIntoView`, pinch/zoom) is
unchanged — this only governs the tip-change re-center.

**Scope note — only the re-center joins the clock, deliberately.** Scroll/zoom drivers split into
two kinds: *transitions* (glide to a known target — tip re-center, zoom-button steps, keep-visible
nudge) and *direct manipulation* (track a live input frame-by-frame — pinch-zoom, native
one-finger scroll). Only the tip re-center actually races the FLIP, so only it moves onto the
shared clock. A broader "unify all transition scrolls into one animated primitive" was considered
and **declined as YAGNI**: the other transitions don't race anything, moving them buys no behavior
change, and it would risk the load-bearing WebKit pinch-drift workaround next door. Revisit only
if a *second* transition starts racing something (then there are two real call-sites to design a
shared primitive against).

## Coordinate frame — interpolate in pixels (revised)

The FLIP must interpolate node positions in **pixel space** (with `px()`/`py()` applied at
snapshot time), NOT raw layout grid coordinates. `py(y) = base + (y − layout.minY)·Y_GAP`, and
`layout.minY` shifts when the tip changes (the spine re-anchors). Interpolating grid-`y` and
re-applying the *new* `py()` each frame renders frame 0 as `py_new(oldY)` — a spurious uniform
vertical teleport (~one screen), then a glide back. Snapshotting `from`/`to` in pixels keeps both
endpoints in one consistent frame (the same coordinate-frame-unification fix slice 1 needed for
the ring; the ring puck already lives in pixel space via `glyphCenter`).

## Testing

- **`layoutDiff` is pure → TDD'd**: partitions persist/enter/leave correctly, carries parent
  from/to and leaving lastPos, handles empty/first-layout and full-replacement edge cases.
- **FLIP motion is DOM/visual → verified live via Playwright**: persisting nodes interpolate (not
  snap) between two known layouts; FLIP completes before the puck (sample transforms over time);
  entering nodes fade 0→1; leaving nodes gone at t=0; reduced-motion snaps everything.
- `npx tsc --noEmit` + `npx svelte-check` before commit (`verbatimModuleSyntax` on).

## Out of scope

- Grow-in-with-scale / shrink-out-toward-parent / edge morphing (scope C — additive later, at the
  same knobs).
- Any specific fraction value, easing curve, or aesthetic flourish (look-and-feel pass).
- The game board's tree (no relayout-on-select there); this is Explore's re-center behavior.
