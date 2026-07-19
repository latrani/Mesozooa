# Desktop layout rework — design

**Issues:** #1 (Update page layout), folds relevant parts of #22 (look-and-feel / visual polish).
**Scope:** Desktop only. Responsive/narrow behavior is explicitly parked for a later pass.
**Date:** 2026-07-19

## Problem

The current desktop game screen (see `screenshots/02-practice-8guesses.png`) has two named
problems from #1, and one reframe underneath them:

- **Dead space in the guess list.** The bottom band reserves ~5 rows of fixed height, but each
  guess row (`[warmth bar] Name shared: Taxon`) only fills the left ~40%. The right ~60% of the
  band is permanently empty, and the reserve doesn't shrink with fewer guesses.
- **The flow feels weird.** The play loop is *look at goal → type → read feedback*, but those
  live in different corners (specimen top-right, input bottom, tree middle) with the guess history
  as a fourth zone (bottom-left). The eye zigzags every turn.
- **Reframe:** during the core loop the two biggest chrome regions — the specimen plaque and the
  guess band — are both mostly empty (the plaque shows `? ? ?` / "Coming soon" until the terminal
  clue or solve), while the tree, the actual high-value surface, fights them for space. The real
  goal is *rebalance space toward the tree and collapse the zigzag.*

## Organizing metaphor

**You are prepping a museum exhibit.** The specimen plaque is a persistent fixture (that's why it
reads "Coming soon" during play — the exhibit is being assembled, not identified yet), not a data
panel that appears and disappears. This conceit is load-bearing for the plaque's behavior below.

## Region architecture

Four regions become three. The fixed bottom band is **eliminated** — its dead space isn't reduced,
the region that held it no longer exists.

```
┌────────────────────────────────────────────────────────────┐
│ HEADER: ▲ Mesozooa  tagline            Daily Practice Explore │
├────────────────────────────────────────────────────────────┤
│ INPUT CLUSTER (top-left, grows down)          ┌───────────┐  │
│ [ Guess a dinosaur……… ] [Hint (3)] [Forfeit]  │  PLAQUE    │  │
│ ● Diplodocus → Eusaurischia  ● Allosaurus → …  │  (floats   │  │
│ ● Hint: Eusaurischia  ● Ankylosaurus → Dino…   │  top-right)│  │
│                                               └───────────┘  │
│                                                   [− │ ⌂ │ +]│  ← segmented secondary
│  TREE — the whole body below the cluster, left-anchored,     │
│  scrolls.                                                     │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

- **Input cluster** (top-left) = input row + wrapping guess chips, one visual unit. It is *input*
  — the chips are the state of what you've spent, sitting next to where you spend the next guess,
  so they belong with the input, not filed away at the bottom.
- **Plaque** floats top-right, over the cluster's right end (#1 move: "float the specimen over the
  search area"). Zoom controls sit to its left / below as today.
- **Tree** owns the entire body below the cluster.

### Cluster growth

The cluster grows downward as guesses accumulate; the **tree viewport shrinks to fit** — no height
cap, no push-content logic, no internal chip-scroll. Rationale: the guess budget is bounded (~20),
chips share name prefixes and wrap compactly, so the cluster realistically stays ≤2–3 lines. Even
worst case is a small bounded bite off the top of the tree. Because the tree is left-anchored and
scrollable (shipped in the zoom fixes), "less room" never clips content.

## The guess chip

Chips replace rows. Every item in the cluster is a chip; the guess/hint distinction is carried by
**structure**, not decoration.

```
guess        ● Diplodocus → Eusaurischia     dot = warmth (ore→gem ramp) · genus name (link) · → shared clade (link)
branchHint   ● Hint: Eusaurischia            dot = warmth of the revealed clade · "Hint:" label · clade (link)
leafHint     Field clue                      no dot, text only
answer       Answer: Tamarro                   filled chip — outcome color as BACKGROUND (win = gem end; loss = most-recent guess warmth)
```

- **guess:** warmth dot + genus name (link) + `→` + shared clade (link). The dot uses the same
  ore→gem warmth ramp today's bar uses. The fat warmth bar is **retired** — the tree already renders
  each guess as a warmth-colored node, so the chip is an *index into the tree*, not a second
  rendering. Hovering/activating a chip rings/pans its tree node (existing `onselect` seam).
- **branchHint:** a hint reveals a **clade, not a typed genus** — so there is no genus name. The
  chip is `● Hint: Clade` with the dot warmth-colored by the revealed clade. (Corrects the old row,
  which borrowed guess-name scaffolding it never really had.)
- **leafHint** ("Field clue"): no node, no warmth, no shared clade — it spent moves to unlock the
  plaque's field clue. Text-only chip, **no dot or glyph**.
- **Hint styling family:** branchHint and leafHint **share one consistent color/text styling**, set
  apart from guess chips, so "this was a hint, not my guess" reads at a glance without per-chip tags.
- **answer:** `Answer: {name}` — a filled chip whose **background** is the outcome color (win = gem
  end of the ramp + glow; loss = most-recent guess's warmth), the name reading over it. The explicit
  "Answer:" label carries the meaning; the color is the fill, not a separate badge. Pinned in the
  cluster as today; newest-first ordering preserved.

**Retired from the old rows:** the fixed-width warmth bar, the empty-bar special case for leafHint,
the `HINT −n` / `CLUE −n` cost tags, and the `Name shared: Taxon` sentence scaffolding. **Move cost
is dropped from chips** and lives only in the budget readout ("Moves used: N") — the budget is
already shown, and lean chips are the goal.

## Plaque: reposition + light trim

- **Reposition:** float top-right, over the input cluster's right end.
- **Light trim:** during play, the empty `Lived: ???` / `Found in: ???` rows are made quieter /
  smaller so the placeholder plaque reads calmer — WITHOUT breaking the "exhibit being assembled /
  Coming soon" conceit. The photo shadow-box and the rich terminal-clue / solved state are unchanged.

## Zoom control

The three bare browser-default buttons (`− ⌂ +`) become one **segmented control** using the
existing `.btn-secondary` style (transparent fill, 2px mahogany border, mahogany ink, 12%-tint
hover; `src/lib/styles/base.css`). Connected segments with hairline dividers: `[− │ ⌂ │ +]`. Same
float position over the tree canvas. Disabled segments keep the existing `opacity:.5` treatment.

## #22 triage

- **Absorbed by this relayout (close when it lands):** empty-state tree column flex-fill; tree
  scroll-centering (already fixed in the zoom work); deep-lineage trail height (trail already gone on
  desktop); the bottom-band dead space.
- **Stale / already done (close now):** warmth color scale (shipped), tab / hint-button /
  active-tab styling (styled), non-playable badge (Explore grades by playability), share styling
  (share was removed).
- **Solved here:** hint-row-vs-guess-row distinction — now a chip-variant problem, resolved above
  (structure-carried, shared hint styling family).
- **Still live, layout-independent → stays in #22 for the later responsive pass:** narrow-screen
  specimen `align-items: baseline` jitter.

## Explicitly out of scope

- All responsive / narrow-viewport behavior. Desktop first; narrow layout revisited separately.
- Plaque content reconception beyond the light trim (deferred).

## Components touched (map, not a plan)

- `src/lib/game/components/GameBoard.svelte` — region layout: input cluster (input + chips) at top,
  plaque floats top-right, tree fills the body; remove the fixed bottom band.
- `src/lib/game/components/GuessList.svelte` → becomes the chip cluster: retire bars/rows, render
  the four chip variants; keep newest-first, `onselect` node-ring seam, answer badge.
- `SpineTree.svelte` — segmented zoom control styling (structural position already there).
- `SpecimenPlacard.svelte` — light trim of the empty-clue rows during play.
- Explorer is unaffected (it doesn't use the game cluster); it already has its own inline "recent"
  trail, which was the visual reference for the compact chip idea.
