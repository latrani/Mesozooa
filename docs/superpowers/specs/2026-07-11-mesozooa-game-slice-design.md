# Mesozooa — Game Slice (Plan 2) Design

*A design refinement for the first playable slice of the Mesozooa game.*
Date: 2026-07-11

This document refines the overall [Mesozooa design spec](./2026-07-11-mesozooa-design.md)
for the **first implementation slice** of the game. It records the decisions made while
scoping Plan 2. Where this document is silent, the main design spec governs; where it
differs (scope, deferrals, the cladogram rendering choice), this document governs for
Plan 2.

## 1. Scope — a vertical slice

Plan 2 builds a **complete, playable Practice-mode game** and nothing more. The goal is
to get the core turn loop and feedback model working end-to-end so it can be played and
reacted to, before layering on secondary features.

**In scope (Plan 2):**

- `treeStore`, `WarmthProvider`, `search`, `gameEngine` engine modules.
- Practice mode: unlimited guesses, a new random playable target each round.
- The turn loop: guess → `mrca(guess, target)` feedback → warmth → tree reveal.
- Guess rows, warmest-trail breadcrumb, the graphical cladogram `TreeView`, win reveal card.

**Deferred to Plan 2b:**

- Daily mode + deterministic `dailyAnswer`.
- Hints (spec §5.3).
- Shareable emoji-grid result.
- `localStorage` persistence.

**Deferred to a dedicated look-and-feel pass (after functional):**

- All visual polish — color, typography, spacing, animation, the warmth color-temperature
  scale. Plan 2 renders everything structurally correct but visually minimal. The user
  will drive detailed aesthetic direction once the game is functional; visual choices are
  interconnected and are made together, not piecemeal.

## 2. Module architecture

All new game code lives under `src/lib/game/`. Each module has one responsibility and a
well-defined interface, consuming the foundation's pure tree library
(`src/lib/tree/`: `mrca`, `pathToRoot`, `TreeData`, node `descendantGenusCount`).

### `treeStore` (`src/lib/game/treeStore.ts`)
Loads the committed `src/data/tree.json` once and indexes it. Exposes `getNode(id)`,
`children(id)`, `pathToRoot(id)`, `mrca(a, b)`, and `playableGenera()`. A thin adapter
over the pure lib + the baked data — no game logic.

### `WarmthProvider` (`src/lib/game/warmth.ts`)
Interface: `warmth(sharedNode) → { value: number; display: string; fraction: number }`.

- **Default `CountWarmth`** (per spec pillar 2): `value = sharedNode.descendantGenusCount`;
  `display = "<value> genera"`; `fraction` is a **log-scaled 0–1** for the warmth bar:
  `fraction = 1 - ln(value) / ln(rootCount)`, clamped to `[0, 1]`. Smaller shared clade →
  `fraction` closer to 1 (hotter); the whole tree → ~0; the answer (count 1) → 1.
- `PercentWarmth` is NOT built in Plan 2 but the interface + single config constant
  (`WARMTH_PROVIDER`) make it a future one-line swap.

The `fraction` drives the bar's fill only. Mapping `fraction` to *color* is deferred to
the look-and-feel pass.

### `search` (`src/lib/game/search.ts`)
Autocomplete over the **playable** genera only (the guessable/answerable pool). Ranking:
exact/prefix matches first, then case- and diacritic-insensitive substring matches,
alphabetical within each tier. Returns a bounded list (e.g. top ~10). Heavier fuzzy/typo
tolerance is deferred (YAGNI for the slice).

### `gameEngine` (`src/lib/game/engine.ts`)
Svelte 5 `$state`-backed store holding `{ target: string; guesses: GuessResult[];
status: "playing" | "won" }`. A `GuessResult` is `{ guessId; sharedNodeId; warmth }`
where `sharedNodeId = mrca(guessId, target)` and `warmth` comes from the `WarmthProvider`.

- `guess(genusId)`: rejects an id that is not a known playable genus (defensive — closes
  the foundation's "`mrca` of an unknown id silently returns root" gap); otherwise appends
  a `GuessResult`; sets `status = "won"` when `genusId === target`. A repeat of an
  already-guessed genus is **not appended** (no duplicate row); the guess list holds each
  genus at most once (the UI may surface the repeat, but it is not recorded twice).
- `newRound()`: picks a new uniform-random playable target, clears guesses, status →
  `playing`.
- Practice mode has **no guess budget** (spec §5.1).

### UI components (`src/lib/game/components/`)
`SearchBox`, `GuessRow` / `GuessList`, `WarmestTrail`, `TreeView`, `RevealCard`, and a
top-level `Game.svelte` that owns layout and wires the engine to the components. All
feedback surfaces reference the **same node objects** returned by `treeStore` — the
anti-desync core (spec §4).

## 3. The graphical cladogram `TreeView`

A renderer-agnostic component with one SVG implementation for Plan 2.

**Inputs:** the set of revealed node ids, the highlighted warmest path (root → best shared
clade), and the mapping of guess-landing nodes → which guesses landed there.

**Reveal-as-you-go:** only nodes on the path from the root to any *touched* node are drawn.
Untouched branches are **absent**, not dimmed. Revealing is monotonic across a round.

**Layout:** classic **left-to-right cladogram** — root at the left, genera at the right.
A pure, unit-testable tidy-tree layout function maps the revealed subtree to node positions
(depth → x; in-order leaf order → y) and orthogonal branch edges (elbows). Because only
touched branches are revealed, the visible graph stays small; the layout recomputes as new
guesses reveal branches. The layout function is separated from the SVG component so it can
be tested against a fixture independently.

**Behaviors (functional, not aesthetic):**

- The warmest path is drawn emphasized (e.g. heavier stroke) — one accent only.
- Each guess-landing node is marked.
- Clicking a guess row highlights its node in the tree.
- Hovering a node reveals which guesses landed there.
- The revealed subtree **auto-fits the viewport** (the whole revealed cladogram is always
  visible) — the functional baseline for Plan 2. Interactive pan/zoom is deferred to the
  look-and-feel pass / the reference explorer (Plan 3), where large subtrees make it matter.

**Styling:** plain — thin default lines, default text, a single accent for the warmest
path. No color-temperature scale, spacing polish, or animation. Deferred.

## 4. Turn loop & states

1. Round start → `newRound()` picks a random playable target.
2. Type in `SearchBox` → autocomplete (playable only) → submit a genus.
3. `gameEngine.guess()` computes `mrca` and appends a `GuessResult`.
4. A `GuessRow` appears: shared-clade **name** + warmth (value + bar). The `WarmestTrail`
   updates to the root → best-shared-clade path, each crumb annotated with its shrinking
   group size. The `TreeView` reveals the newly touched branch and re-highlights the
   warmest path.
5. Correct guess → `status = "won"` → `RevealCard`: target name, image, Wikipedia link,
   guess count, and the full Dinosauria → target path.
6. A "new round" control calls `newRound()`.

## 5. Testing

Following the foundation's TDD discipline, all **pure logic** is unit-tested:

- `WarmthProvider`: `value`, `display`, and `fraction` (including clamp and monotonicity)
  for representative counts.
- `search`: ranking tiers (prefix before substring), diacritic/case insensitivity,
  playable-only restriction, bounded results.
- `gameEngine`: `guess` appends the correct `mrca` row; win detection on the target;
  unknown-id rejection; `newRound` resets state and picks a playable target; duplicate
  handling.
- `TreeView` **layout function**: node positions and edges for a fixture revealed subtree.

Svelte components are thin and are **not** unit-tested in the slice; they are validated by
running the real app. A full Practice round is driven end-to-end in the app to confirm the
slice works before completion.

## 6. Out of scope (Plan 2)

- Daily mode, deterministic answer, hints, share grid, `localStorage` — Plan 2b.
- The reference explorer — Plan 3 (reuses `TreeView`, `search`, `treeStore`).
- All visual/aesthetic design — dedicated later pass.
- Species-level play; egg/footprint parataxonomy; runtime Wikidata calls (unchanged from
  the main spec §7).
