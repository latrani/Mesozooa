# Unified SpineTree — Explore runs on the game's tree renderer

## Problem

`SpineTree` (game) and `TreeView` (explore) are two SVG cladogram renderers that
independently re-implement the same substrate — square elbows, `displayName`, the
count `dx` spacing, scroll-fade, per-segment gradient `<defs>`/`gradId`, dot radii,
label offsets, and nearly all CSS. They drift every time one is tuned (most recently:
elbows, count spacing, gradient selection). The shared 80% is where the drift lives;
the genuinely different 20% is layout source and color semantics.

## Decision

**One renderer, two callers.** `SpineTree` is *the* tree renderer. Explore is a second
consumer. Both feed the identical `layoutSpine(store, revealed, tipId)` — Explore's
"spine tip" is the selected node (game's is the warmest shared node). They differ in
exactly two injected inputs:

1. **What's revealed + the tip** (each store computes its own).
2. **Node color** — a per-node color function (game: warmth; explore: selection-path
   0→1). Segment gradients already blend between endpoint node colors, so supplying a
   per-node color is the whole seam.

No `mode` flags. `SpineTree` owns *rendering + scroll behavior*; callers own *semantics*.

`TreeView.svelte` is deleted. `layoutCladogram` becomes unused by the app (keep the
file + test; it's valid, tested code and a candidate future layout option).

**Explicitly deferred:** layout-pluggability. Explore uses `layoutSpine` as-is. A future
Explore-specific layout is when layout becomes an input — and the game inherits it then.

## SpineTree API changes

Add one prop — the color seam. Everything else stays.

```
nodeColor?: (id: string, isGenusDot: boolean) => string | null
```

- Returns a CSS color for a node's dot / the gradient stop at that node, or `null` to
  fall back to the default (`--node-context` / genus fill).
- Segment gradient stops call `nodeColor(parentId,false)` / `nodeColor(childId,false)`.
- The dot calls `nodeColor(id, node.isGenus)`.
- **Game** passes a function reproducing today's behavior: own-warmth for spine nodes,
  guess-warmth for guessed genus dots, `null` for off-spine context. The existing
  `guessWarmth` map + `warmthProvider` move into the function the game supplies (or the
  game keeps computing them and closes over them). Net game visual: unchanged.
- **Explore** passes: path-position 0→1 through `warmthRampColor` for nodes on the
  root→tip path (100% at tip), `null` off-path.

The highlight ring color (currently warmth-derived inline) likewise comes from
`nodeColor(highlightId,...)` so both callers drive it through the same seam.

Game-only inputs (`guessWarmth`, `rightInset`, STEM, `panTo`, frontier auto-center)
stay on `SpineTree` and are simply used by both callers now — Explore wants `rightInset`
(its floating detail card) and the tip-centering (click-to-center) too.

### Auto-center generalization

The current effect centers when the frontier *deepens*. Generalize to "center the tip
whenever it changes" (guarded by the existing rightInset re-center). In Explore, the tip
is the selected node, so clicking any node centers it — the behavior we want, for free.
Confirm this doesn't regress the game's "only follow forward" feel; if it does, gate the
backward-centering behind a prop the game leaves off. (Spec assumes generalize-and-see;
adjust in review if the game feels jumpy.)

## Explore store changes

`explorerStore` / `explorer-core`:

- **`revealed` for the spine shape** = `pathToRoot(tip)` ∪ children of *every node on that
  path* ∪ children of the tip. Rationale: the spine is root→tip; at each fork up the
  lineage the sibling clades appear (collapsed, with expandable stubs) so you can branch;
  the tip's own children appear so you can walk down. Replaces `revealedForFocus`
  (spine + tip-children only, no off-path siblings).
- **tip id** = `highlightId` (selected genus, else focus). `layoutSpine` needs a single
  tip; the selected node is it.
- `emphasizedForFocus` retired (path coloring is now internal to the renderer via
  `nodeColor`).
- `resolveSearchPick`, `searchSource` unchanged.

New pure function, TDD'd: `revealedSpine(store, tipId): Set<string>` with the union above.

## Explore view (already restructured this session)

`Explorer.svelte` already mirrors the game board (hero canvas, floating `NodeDetail`,
bottom search placard, no header/back/breadcrumb, hand-rolled `rightInset`). After the
merge it imports `SpineTree` instead of `TreeView`, drops its hand-rolled `rightInset`
measuring in favor of passing the measured width to SpineTree's `rightInset` prop, and
supplies its `nodeColor` (path-position) function.

## Expandable affordance

The "more here" right-fading stub (drawn on collapsed clades) moves into `SpineTree` so
both callers get it. A node is "expandable" when it's a non-genus with children that
aren't in the revealed layout. Game benefit: hinted-but-not-expanded clades also signal
depth.

## Testing

- `revealedSpine` — pure, TDD: path + per-path-node children + tip children; root case;
  genus-tip case.
- Existing `layoutSpine` / `layoutCladogram` tests unchanged (layout untouched).
- `SpineTree` / `Explorer` validated by build + `svelte-check` + live run (gallery + app).
- Drop `emphasizedForFocus` test; keep `layoutCladogram` test.

## Non-goals

- Layout pluggability (deferred, above).
- Any change to game visuals or the warmth model.
- Reworking `NodeDetail` / `Specimen` (they already share the specimen token role).
