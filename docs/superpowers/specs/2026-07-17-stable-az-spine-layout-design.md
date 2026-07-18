# Stable A-Z spine layout (branch-ordering rework)

**Date:** 2026-07-17
**Status:** Design approved; ready for implementation plan.
**Context:** Reworks `src/lib/game/spine-layout.ts` (`layoutSpine`), shared by Explore and the game
board. Prompted by Explore: selecting a new clade currently **reorders** the splayed siblings
(side-assignment + deepest-innermost packing), so branches hop around and the vertical order is
opaque (sometimes A-Z, sometimes reversed). Goal: make sibling order a fixed invariant and express
selection purely as vertical translation.

## Problem

`layoutSpine` today assigns off-spine siblings to above/below by a **collision-avoidance heuristic**
(alternate side per interior spine node, then sort deepest-attached-innermost — lines 113-146). The
vertical order is an artifact of that heuristic, not of anything the user can predict. Selecting a
different child recomputes the whole above/below split → branches jump between sides and slots, which
is visually hard to track and makes the ordering look arbitrary.

## The rework (approved model)

**Sibling order becomes an invariant; selection becomes translation.**

- **A-Z, always.** At *every* level of the spine, a node's revealed children are ordered
  alphabetically top-to-bottom. Children alphabetically **before** the on-spine child pack **above**
  the axis (negative y); children **after** pack **below**. Reading the whole tree top-to-bottom is
  always A→Z through the axis.
- **Selection = which child anchors to y=0.** The spine (root→focus/warmest) stays pinned at y=0 and
  never moves. Picking a different child re-anchors the fan so that child lands on the axis; the fan
  slides vertically, order preserved. Nothing reorders.
- **No selection = centroid on the axis.** When no child is on the spine (Explore's initial
  root-focus with no genus selected; the game's pre-first-guess state), the A-Z fan is vertically
  centered on the axis ("alphabetically-middle-ish" falls out of the geometry — odd count straddles
  the axis, even count splits between the two middle children). Unifies with selection: selection
  anchors a child to y=0, no-selection anchors the fan's centroid to y=0.
- **Applies at every level (option B).** Every spine node independently lays its children A-Z and is
  translated so its on-spine child sits on the axis — not just the frontier fan.
- **The axis is reserved for the spine + structural-monotypic continuations ONLY.** A frontier
  clade's fan CENTERS around the axis (A-Z split at the midpoint, balanced above/below), but NO node
  is pinned to y=0. So a branch-point's lone REVEALED child SPLAYS off-axis. This matters most in the
  GAME: `warmest = MRCA(guess, target)` is a branch point, and a single wrong guess reveals only its
  own lineage — under a "center the lone child" rule that whole wrong-guess lineage would run straight
  down the axis, but the axis means "warm/correct," so it must splay. (Superseded an earlier draft of
  this spec that said the lone child centers straight — that was wrong for the game; reversed
  2026-07-17 after live testing, commit 2d37442.) The distinction is **structural**: monotypic (one
  real child in the tree) → straight continuation on the axis, handled by the existing spine-extension
  loop; branch point → always splays. The "more is hidden here" cue is the **expandable stub**
  (`SpineTree.svelte:224`), not a straight-through.

### Overlap resolution: contour push (replaces deepest-innermost)

Multiple spine depths each fanning A-Z on the same side can want overlapping vertical bands at
overlapping x-columns. Resolve exactly as the user described — "push a prior set of siblings out to
make room":

- Track the occupied **contour** on each side (above / below) as a function of x — the furthest-out y
  reached at each x-column so far.
- Place blocks; when a new block would collide with the contour in its x-range, push it **outward**
  (further from the axis) until it clears. **Always outward, never toward the spine** — so the spine
  is never threatened and already-placed blocks never reorder.
- This is contour-based tidy-tree packing. It replaces the current alternate-sides +
  deepest-innermost logic (lines 113-171) entirely.

### The trade (accepted)

Contour-push trades **compactness for stability**. A bushy ancestor (e.g. Dinosauria with ~15
revealed children) fanned A-Z on both sides with outward push can make the tree **taller** than
today's tighter packing — more vertical scroll. Accepted: stability is the goal.

## Shared by both modes (approved)

One layout, one behavior — Explore AND the game board. Verified there's no reason to diverge:

- **Position carries no meaning in the game.** Warmth is carried by *color* (the ore→gem ramp on
  segments/dots), never by side or vertical slot. So fixing vertical order to A-Z loses nothing.
- **The game benefits from the stability too.** Guesses accumulate incrementally; today each new
  guess can re-trigger side-assignment and hop prior branches. A-Z-stable + push keeps an
  already-placed branch put — arguably a bigger win mid-game than in Explore.

### Spine special-cases that MUST survive (correctness constraints, not divergence)

These concern the on-axis lineage, which A-Z-and-translate does not touch (it only repacks off-spine
siblings) — so they should compose cleanly, but are explicit acceptance checks:

1. **Monotypic continuation** (current lines 54-61): a single-child descent past the warmest/focus
   node stays straight on the axis instead of splaying as a phantom fork.
2. **`heroLen`** (current line 41): nodes past the warmest render as ordinary branches (thin edge,
   context dot) even though geometrically on-axis. Game-only signal; Explore's `heroLen ===
   spine.length` so it's a no-op there.

## Architecture

All changes are within `layoutSpine` in `src/lib/game/spine-layout.ts`. The public interface
(`SpineLayout`, `SpineNode`, `SpineEdge`, the `centerOffsetFor`/`ViewMetrics` helpers) is unchanged —
consumers (`SpineTree.svelte`, both stores) are untouched. This is an internal algorithm swap.

**What stays:**
- Spine construction: `pathToRoot(warmestId).reverse()` + monotypic continuation + `heroLen`.
- `pack(id, depth)`: leaf-packing a subtree to local ys (the recursive within-subtree layout is
  unchanged — a subtree's internal shape is already A-Z via `revealedChildren`'s `.sort()`).
- The spine emit pass (straight nodes at y=0, hero vs. branch edge classing).
- `revealedChildren`'s existing `.localeCompare` sort — it's already A-Z; the rework makes the tree
  *honor* it globally instead of overriding it with side-heuristics.

**What's replaced (current lines 113-171 — the side-assignment + cursor packing):**
- For each spine node, split its off-spine children into **before** (A-Z < on-spine child) and
  **after** (A-Z > on-spine child) — or, if no on-spine child, split the A-Z list at its midpoint.
- `before` blocks pack **above** (stacked outward from the axis, nearest-the-axis = alphabetically
  closest to the on-spine child); `after` blocks pack **below** similarly.
- A single **above contour** and **below contour** (per-x furthest-out y) accumulate across ALL spine
  depths. Each block is placed at the axis-side edge of its band and pushed outward until it clears
  the contour over its x-range; then the contour is raised to include it.
- `minY`/`maxY` track the extremes as today.

**Ordering of placement (matters for determinism):** place blocks in a fixed order — e.g. by spine
depth shallow→deep, and within a depth by A-Z — so the contour builds deterministically and the same
tree always yields the same layout. (Exact traversal order is an implementation detail to settle in
the plan, but it MUST be deterministic and independent of selection (selection only shifts the
anchor, never the placement order).)

## Components & boundaries

- `src/lib/game/spine-layout.ts` — the only file changed. `layoutSpine` internals rewritten;
  signature + return type identical.
- `src/lib/game/spine-layout.test.ts` — the existing pure tests are the safety net; extended with the
  new invariants (see Testing). No component/store changes.

## Testing

`layoutSpine` is pure (store + revealed set + warmestId → geometry), so this is TDD-friendly against
the existing fixture store. New/updated assertions:

1. **A-Z invariant:** for any spine node, its off-spine children's y-values are monotonic in name
   order (before-children strictly above the axis in A-Z order, after-children strictly below in A-Z
   order).
2. **Selection = translation:** two layouts of the same tree differing only in which sibling is
   on-spine have identical *relative* A-Z order and identical per-block shapes; only the vertical
   anchor differs. (Branches don't reorder across a selection change.)
3. **No overlap:** no two nodes share the same (x, y) cell; contour-push keeps blocks from
   overlapping within a side. (The existing "3+ same-side blocks" gap noted in deferred-findings §C
   is now directly testable — add that fixture.)
4. **Centroid when unselected:** with no on-spine child, the fan is centered on the axis (roughly
   equal extent above and below for a balanced count).
5. **Spine special-cases survive:** monotypic continuation still lays straight (existing test); nodes
   past `heroLen` still emit `onSpine:false` (existing test). Re-run both; they must stay green.
6. **Both modes:** the same `layoutSpine` output feeds Explore and the game — no mode flag. Verified
   by the shared function having no mode parameter (it doesn't today, and none is added).

**Gates:** `npx tsc --noEmit`, `npx vitest run` (all existing spine-layout tests must pass or be
deliberately updated with rationale), `npx svelte-check`. Live-verify in both Explore (walk a few
clades, confirm branches stay A-Z and slide rather than hop) and the game (accumulate guesses,
confirm prior branches don't jump) — controller/user owned.

## Explicitly out of scope

- **Animating the slide.** This spec makes the *target* layout stable + predictable; smoothly
  animating the vertical translation between selections is a separate polish pass. Not here — but
  this rework is deliberately its groundwork, so **don't foreclose it:**
  - Each node already renders as `<g transform="translate(...)">` (SpineTree.svelte ~L221), and SVG
    `transform` is CSS-transitionable — so the future pass is largely `transition: transform` on
    `.node`, no per-frame JS, no WebGL. **Stable A-Z order (this spec) is the prerequisite:** a branch
    can only glide A→B if it doesn't also *reorder* (else it teleports across siblings).
  - **Groundwork constraint to preserve:** the `{#each layout.nodes as n (n.id)}` keying is BY NODE
    ID (SpineTree.svelte ~L208). Keep it id-keyed — that's what lets Svelte reuse the same DOM `<g>`
    across a selection change (transition) instead of destroy+recreate (teleport). Do not regress to
    index-keying.
  - The real work in that future pass is EDGES: they're `<path d="...">` (L205, `edgePath`), and the
    `d` attribute is not smoothly CSS-transitionable cross-browser (Safari). Deferred with the
    animation; noted so it's not a surprise.
- **Horizontal / depth layout, `centerOffsetFor`, scroll-centering** — unchanged.
- **The `SpineTree.svelte` render** (dots, edges, labels, ring) — unchanged; it consumes the same
  node/edge lists.
