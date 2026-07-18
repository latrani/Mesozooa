# Mesozooa — Monotypy Handling Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm), pending implementation plan

## Problem

A **monotypic** step in the tree — descending from a node to a child that carries the same
set of genera — narrows nothing. In this data it is common, not an edge case: **108 of 386
internal nodes (28%) have exactly one child**, in chains up to 4 deep, and **every one has an
identical `descendantGenusCount` to its child** (verified: 108 same, 0 differ). This surfaces
as two distinct defects.

1. **Explore — phantom fork.** Focusing a node that begins a monotypic run (e.g.
   `Eurypoda → Stegosauria`) splays the lone child off the spine diagonally, so a non-choice
   *looks* like a branching choice. Root cause: `layoutSpine` keeps an **interior** spine
   node's single continuing child straight (the `nextSpine` check), but the **frontier** (spine
   tip) has no `nextSpine`, so every frontier child — including an only-child — is splayed as a
   `frontierBlock`.

2. **Play — hint burn.** `nextHintNode` walks exactly one lineage step per hint press. When
   that step lands on a monotypic node the hint reveals a clade *name* but does not move warmth
   (identical `descendantGenusCount`). The player pays a guess-slot for zero narrowing.

**Definition used throughout.** "Monotypic / no-op" means **reveals no narrowing**: a lineage
node whose `descendantGenusCount` equals that of the deepest already-revealed node above it.
This is *count-based*, matching the existing `terminalClade` (which skips
`descendantGenusCount === 1` parents). It is deliberately **not** "has exactly one child" — a
node can branch structurally yet still not lower the genus count.

## Terminology (precondition)

Commit `ed2b9ee` established the vocabulary: the two hint **mechanics** are `branchHint`
(walks a clade node) and `leafHint` (leaf-terminal hint), and **"clue"** is reserved for the
*player-facing paleo data* a leaf-hint surfaces (`clueFor()`, `store.clue`). Two function names
predate that decision and now misname mechanics as "clue":

- `applyHintOrClue` — the "OrClue" implies a coordinate action; it is just applying a hint that
  internally forks on kind. → **`applyHint`**.
- `terminalClueActive` — really "a leaf-hint is now the available move." → **`leafHintActive`**.

`clueFor()` and the `store.clue` getters are correct (player-facing data) and are **kept**.
The `persistence.ts` legacy `"clue"` normalizer is kept (it maps pre-`ed2b9ee` saves onto
`leafHint`).

## Design

Three sequenced pieces. Each lands as its own commit; build + tests green before the next.

### Piece 0 — Rename refactor (no behavior change)

Pure rename so later pieces read cleanly:

- `applyHintOrClue → applyHint`
- `terminalClueActive → leafHintActive`

Touch points (from grep): `engine-core.ts` (defs + internal call sites), `gameStore.svelte.ts`,
`dailyStore.svelte.ts`, `engine-core.test.ts`, `gallery/fixtures.ts`, and the comments that use
the old names. No literal string, `GuessKind`, `SpecimenState.kind`, or player-facing text
changes. Verify: `npx tsc --noEmit`, `npx svelte-check`, `npm test` all green with zero
behavior diff.

### Piece 1 — Explore layout: straighten the monotypic frontier

**File:** `src/lib/game/spine-layout.ts` (shared by game + Explore via `SpineTree`).

After building the base spine `pathToRoot(warmestId)`, **extend it downward through monotypic
frontier continuation**: while the current tip has exactly one *revealed* child, absorb that
child onto the spine. The existing straight-spine machinery (`nextSpine`) then draws it straight;
splaying resumes only at a genuine branch point.

- **Reveal boundary.** Explore's `revealedSpine` reveals `tip + its direct children` only, so
  the extension absorbs the monotypic child one level past focus; the branch point below then
  renders its "more here" stub. This is sufficient for "straighten only" — focusing the top of a
  2-run straightens one level; clicking down straightens the next. We do **not** change
  `revealedSpine` (that would auto-descend, which was rejected).
- **Focus / centering unchanged.** `scrollToNode(tipId)` still centers the node the player
  clicked. The straightened run trails toward the branch point; focus does not jump.
- **"Exactly one revealed child"** is the extension test (structural single-child among revealed
  nodes), which for these 108 nodes coincides with the count-based no-op. Using the revealed-child
  count keeps the layout function dependent only on `revealed` + tree shape, no warmth reasoning.

**Bonus:** the same change straightens the game's tree whenever its warmest MRCA is a monotypic
node with a revealed child below — no game-specific code.

**Tests:** extend `spine-layout.test.ts` — a fixture where the frontier has a single revealed
child lays that child on the spine at `y=0` (not splayed); a 2-in-a-row revealed run lays fully
straight; a frontier with ≥2 revealed children still splays (regression guard).

### Piece 2 — Play mode: skip-through hints

**File:** `src/lib/game/engine-core.ts`.

Redefine the hint target from "one step down" to "the next step that actually narrows, plus the
run of no-op nodes leading to it":

1. **`nextHintNode → nextHintRun`** — returns the ordered list of lineage nodes from
   just-below-the-deepest-revealed node down to **and including** the next node whose
   `descendantGenusCount` is strictly less than the deepest-revealed node's count. Typically a
   1-element list; through a monotypic run it is `[…intermediates, branchPoint]`. Returns `[]`
   when there is no such node (already at/below terminal).

2. **`applyHint`** — records the **branch point** (last element of the run) as the `branchHint`
   `GuessResult` row (its warmth is the real narrowing). Adds the intermediate monotypic node ids
   to the revealed set so the tree draws the full straight lineage, **without** adding extra guess
   rows — one press = one row, warmth read from the branch point. Budget/`status` handling
   unchanged except that cost now derives from the branch point (below).

3. **`hintCost`** — scales by the **branch point's** lineage depth (the real narrowing bought),
   not the first intermediate's. One press, one honest price, one genuine narrowing.

4. **`leafHintActive`** — no logic change (already count-based; a monotypic reveal below terminal
   already counts as bottomed out). Add a test locking that a skip-through hint landing *on* the
   terminal clade flips the next press to the leaf-hint (clue) state.

**Guess-list presentation (taste call, decided):** the `branchHint` row names the **branch
point** (e.g. "Stegosauria"); intermediate names (e.g. "Eurypoda") appear only on the tree.

**Tests (engine-core.test.ts):**
- Hint through a monotypic run reveals all run nodes + branch point in one press, adds one row,
  and the row's warmth == branch point's warmth.
- `hintCost` for a run == cost computed at the branch point's depth.
- A hint run that reaches the terminal clade in one press → next `canHint`/press yields the leaf
  hint.
- Anchoring: when a prior hint already revealed part of a run, the next `nextHintRun` resumes from
  the deepest revealed lineage node (no double-reveal, no skip).

## Interaction / synergy

Pieces 1 and 2 reinforce: a skip-through hint reveals a monotypic run, and Piece 1 draws that run
as a straight spine segment — so the multi-node reveal *looks* like the single narrowing step it
conceptually is, rather than a sudden diagonal sprig.

## Out of scope

- Auto-advancing focus through runs in Explore (rejected — "straighten only").
- Changing `revealedSpine` reveal depth.
- Any change to `clueFor()` / `store.clue` / player-facing clue text.
- The broader clue/hint vocabulary beyond the two drifted function names.

## Files touched

- `src/lib/game/engine-core.ts` (Pieces 0, 2)
- `src/lib/game/spine-layout.ts` (Piece 1)
- `src/lib/game/gameStore.svelte.ts`, `src/lib/game/dailyStore.svelte.ts` (Piece 0 rename)
- `src/gallery/fixtures.ts` (Piece 0 rename)
- Tests: `engine-core.test.ts`, `spine-layout.test.ts`
- `src/lib/game/persistence.ts` — untouched (legacy normalizer stays)
