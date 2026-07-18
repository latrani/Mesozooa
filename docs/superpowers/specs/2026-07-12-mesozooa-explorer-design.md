# Mesozooa — Reference Explorer (Plan 3) Design

*A design for the walkable dinosaur cladogram — the reference explorer surface.*
Date: 2026-07-12

Refines the overall [Mesozooa design spec](./2026-07-11-mesozooa-design.md) §6 for the
reference explorer. Where silent, the main spec governs; where they differ, this governs
for Plan 3. This plan also does **reuse-driven refactoring of the already-merged game
code** (Plan 2) — explicitly endorsed — to share components between the two surfaces.

## 1. Concept & scope

A walkable explorer of the **full reference pool** (~2072 genera, non-playable included) —
co-equal with the game, sharing the same tree. You start at Dinosauria and walk down the
cladogram one clade at a time, jump anywhere via search, and open a detail pane for any
taxon.

**In scope:** view toggle; walk-down navigation over the graphical cladogram; breadcrumb;
group sizes on every node; search-to-jump over all named taxa; genus/clade detail pane
with image, Wikipedia link, lineage, group size, and a non-playable marker.

**Out of scope (unchanged from main spec §7):** runtime Wikidata calls, species-level
detail, egg/footprint parataxonomy. **Deferred:** URL/deep-link state; all visual polish
(the look-and-feel pass owns color, spacing, typography, animation, and pan/zoom — the
explorer ships visually minimal, structurally correct).

## 2. App navigation & state preservation

`App.svelte` gains a lightweight top-level **view toggle** — "Play" / "Explore" — swapping
between `<Game>` and a new `<Explorer>`. No routing library, no URL state.

**Hard requirement:** toggling MUST preserve each surface's state. Switching to Explore and
back leaves the game's target, guesses, and status intact (and vice-versa for the
explorer's focus/selection).

**Mechanism:** the game and explorer stores are **module-level singletons** created once at
import (`export const game = createGame()`; `export const explorer = createExplorer()`),
not instantiated inside their components. Components read the singleton, so unmounting on
toggle does not reset engine/navigation state. (Trivial component-local view state such as
the game's `highlightId` selection may reset on toggle; the meaningful game state does not.)

This requires refactoring the merged game so `Game.svelte` consumes the singleton instead
of calling `createGame()` itself.

## 3. Shared `TreeView` (generalized)

The game's SVG cladogram `TreeView` is generalized into a neutral renderer reused by both
surfaces. Prop renames (game call site updated accordingly):

- `warmestPath: Set<string>` → **`emphasizedPath: Set<string>`** — node/edge emphasis set.
- `guessNodes: Map<string, string[]>` → **`nodeTooltips: Map<string, string[]>`** — hover
  tooltip lines per node.
- New optional **`onnodeselect?: (id: string) => void`** — invoked when a tree node is
  clicked. The game leaves it unset (its nodes aren't clickable); the explorer wires it to
  descend/select.
- Existing `revealed`, `highlightId` unchanged in meaning.

`layoutCladogram` is unchanged and reused as-is.

## 4. Walk-down navigation model

The explorer keeps a **focus node** (default: root) and a **selected genus** (nullable).
It shows the spine from the root down to the focus, with the focus's children fanned out:

- **revealed** = `pathToRoot(focusId) ∪ children(focusId)` — fed to `TreeView`, so the
  existing layout renders "spine + one level of children".
- **emphasizedPath** = `new Set(pathToRoot(focusId))` — emphasizes the current spine.
- **highlightId** = `selectedGenusId ?? focusId`.
- **nodeTooltips** = empty (explorer has no per-node annotations in v1).

Interactions:

- **Click a child clade** (internal node in the fan) → `focus(id)` (descend).
- **Click a breadcrumb ancestor** → `focus(id)` (ascend).
- **Click a genus** (leaf) → `selectGenus(id)` (open detail pane; genera do not descend).
- **Search pick** → `focus(node)` if a clade; if a genus, `focus(parent)` and
  `selectGenus(genus)` so it appears in the fan and its detail opens.

As you descend, the spine lengthens; the revealed set stays bounded to one path plus one
child level, so `TreeView`'s auto-fit remains adequate (interactive pan/zoom deferred).

## 5. Explorer modules & components (`src/lib/explorer/`)

Mirrors the game's pure-core / thin-component split.

- **`explorer-core.ts`** (pure, TDD-tested): given a `TreeStore`, `focusId`, and
  `selectedGenusId`, computes `revealedForFocus(store, focusId)`, `emphasizedForFocus`, and
  resolves a search pick to a `{focusId, selectedGenusId}` pair (clade → focus it; genus →
  focus parent + select it). Also `searchSource(store)` → the `{id, name}[]` of all named
  taxa (genera + clades) for autocomplete.
- **`explorerStore.svelte.ts`**: singleton `$state` store holding `focusId`,
  `selectedGenusId`; methods `focus`, `selectGenus`, `jumpTo(searchResultId)`; derived
  `revealed`, `emphasizedPath`, `highlightId`. Delegates all logic to `explorer-core`.
- **`Explorer.svelte`**: wires `Breadcrumb` + `TreeView` (with `onnodeselect`) + a
  `SearchBox`-style input (over the full-taxa source) + `NodeDetail`.
- **`Breadcrumb.svelte`**: `pathToRoot(focus)` reversed; each crumb clickable → `focus`.

## 6. Reuse: shared detail rendering

Extract a shared **`TaxonCard.svelte`** (name, image if present, Wikipedia link if present,
full root→taxon lineage) from the game's current `RevealCard`.

- `RevealCard` (game) = `TaxonCard` + guess count + "New round" button.
- `NodeDetail` (explorer) = `TaxonCard` + group size (`descendantGenusCount`) + a
  **non-playable marker** shown for genera with `playable === false` (a plain text badge in
  v1; styling deferred). For a focused clade with no genus selected, `NodeDetail` shows the
  clade's name + group size.

`SearchBox` is generalized to accept its **entry source as a prop** (currently it hardcodes
`treeStore.playableGenera()`): the game passes the playable genera, the explorer passes all
named taxa, and both share the same input + autocomplete markup and the `onpick`/`onguess`
callback shape. The game's call site is updated to pass its entries explicitly.

## 7. Search-to-jump

Explorer search covers **all named taxa** (genera *and* clades), via `createSearch` over
`searchSource(store)` — so you can jump to "Theropoda" or an unresolved genus, unlike the
game's playable-only search. Picking a result calls `explorer.jumpTo(id)`.

## 8. Testing

Pure logic gets TDD unit tests against the foundation fixture (same discipline as Plans 1–2):

- `explorer-core`: `revealedForFocus` (spine ∪ children) for a fixture focus;
  `emphasizedForFocus`; search-pick resolution (clade vs genus → parent+select);
  `searchSource` includes clades and genera.

Components validated by tsc + svelte-check + build + running on real data. Because Plan 3
refactors merged game code (TreeView props, gameStore singleton, RevealCard→TaxonCard), the
existing 44 tests must still pass and the game round is re-exercised on real data to confirm
no regression.

## 9. Reuse summary (what Plan 3 shares vs adds)

**Reuses:** `treeStore`, `layoutCladogram`, `createSearch`, the generalized `TreeView`, the
extracted `TaxonCard`, `SearchBox` markup.
**Refactors (game code):** `TreeView` prop names + `onnodeselect`; `gameStore` singleton;
`Game.svelte` consuming the singleton; `RevealCard` built on `TaxonCard`.
**Adds:** `explorer-core`, `explorerStore`, `Explorer`, `Breadcrumb`, `NodeDetail`, and the
App view toggle.
