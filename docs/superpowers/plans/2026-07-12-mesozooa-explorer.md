# Mesozooa Reference Explorer (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the walkable reference explorer — a second surface that walks down the full dinosaur cladogram (breadcrumb, group sizes, search-to-jump, genus/clade detail with image/Wikipedia/lineage and a non-playable marker) — reusing the game's tree, search, and cladogram renderer, with a Play/Explore toggle that preserves each surface's state.

**Architecture:** A pure, unit-tested `explorer-core` (walk-down reveal/emphasis + search-pick resolution) drives a singleton `explorerStore` and thin Svelte components. To share the graphical cladogram, autocomplete, and taxon detail between game and explorer, this plan does behavior-preserving refactors of the merged game code: generalize `TreeView` props (+ `onnodeselect`), generalize `SearchBox` to take its entry source as a prop, make the game store a module singleton, and extract a shared `TaxonCard` from `RevealCard`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 6, Vitest 2. Consumes the merged foundation (`src/lib/tree/`, `src/data/tree.json`) and game (`src/lib/game/`).

## Global Constraints

- **One tree, one source of truth.** Explorer surfaces read node objects from the same `treeStore` singleton the game uses. No parallel tree/representation.
- **Reuse, maximally.** Prefer generalizing an existing game component over building a parallel one. The explorer reuses `treeStore`, `layoutCladogram`, `createSearch`, the generalized `TreeView` and `SearchBox`, and the extracted `TaxonCard`.
- **Refactors must be behavior-preserving for the game.** After each refactor task, the game must build, `svelte-check` clean, the 44 existing tests pass, and a real-data game round behave identically.
- **State preservation.** The game and explorer stores are module-level singletons (`export const game = ...`, `export const explorer = ...`) created once at import, so toggling the App view (which unmounts/remounts the surface) preserves target/guesses/status and focus/selection. Trivial component-local view state (e.g. the game's `highlightId`) may reset on toggle; engine/navigation state must not.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`; values/functions normal. **Vitest does NOT catch violations** — every task runs `npx tsc --noEmit` clean before commit.
- **Component tasks** additionally pass `npx svelte-check --tsconfig ./tsconfig.json` (0 errors; CSS/a11y warnings acceptable) and `npm run build` (succeeds) before commit.
- **Function first; styling deferred.** All new/changed markup is visually minimal (semantic class hooks only). No CSS polish, colors, animation, or pan/zoom. The non-playable marker is plain text in v1.
- **Explorer search covers all named taxa** (genera AND clades) — not the playable-only pool the game uses.
- **New explorer code lives under `src/lib/explorer/`.** Shared components stay under `src/lib/game/components/` (where they already live); the explorer imports them across directories.
- **Test fixture:** pure-logic tests build a fixture tree from the foundation's `FIXTURE_RAWS` (nodes: Q430, T, TF, TR, TB, LO, O, CF, TC; playable: TR, TB, TC). Reuse it.

---

### Task 1: `explorer-core` (pure walk-down logic)

**Files:**
- Create: `src/lib/explorer/explorer-core.ts`, `src/lib/explorer/explorer-core.test.ts`

**Interfaces:**
- Consumes: `TreeStore` from `../game/treeStore`; `SearchEntry` from `../game/search`.
- Produces:
  - `revealedForFocus(store, focusId): Set<string>` — `pathToRoot(focusId) ∪ children(focusId)`.
  - `emphasizedForFocus(store, focusId): Set<string>` — `new Set(pathToRoot(focusId))`.
  - `FocusSelection = { focusId: string; selectedGenusId: string | null }`.
  - `resolveSearchPick(store, id): FocusSelection` — clade → focus it (no selection); genus → focus its parent + select it; unknown → root, no selection.
  - `searchSource(store): SearchEntry[]` — `{id, name}` for every node (genera and clades).

- [ ] **Step 1: Write the failing test**

`src/lib/explorer/explorer-core.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { revealedForFocus, emphasizedForFocus, resolveSearchPick, searchSource } from "./explorer-core";
import { createTreeStore } from "../game/treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("revealedForFocus", () => {
  it("is the focus spine plus its direct children", () => {
    // pathToRoot(T)=[T,Q430]; children(T)=[TF,LO]
    expect([...revealedForFocus(store, "T")].sort()).toEqual(["LO", "Q430", "T", "TF"]);
  });
  it("at the root shows the root and its children", () => {
    expect([...revealedForFocus(store, "Q430")].sort()).toEqual(["O", "Q430", "T"]);
  });
});

describe("emphasizedForFocus", () => {
  it("is the root path of the focus", () => {
    expect([...emphasizedForFocus(store, "TF")].sort()).toEqual(["Q430", "T", "TF"]);
  });
});

describe("resolveSearchPick", () => {
  it("focuses a clade directly", () => {
    expect(resolveSearchPick(store, "T")).toEqual({ focusId: "T", selectedGenusId: null });
  });
  it("focuses a genus's parent and selects the genus", () => {
    expect(resolveSearchPick(store, "TR")).toEqual({ focusId: "TF", selectedGenusId: "TR" });
  });
  it("falls back to root for an unknown id", () => {
    expect(resolveSearchPick(store, "nope")).toEqual({ focusId: "Q430", selectedGenusId: null });
  });
});

describe("searchSource", () => {
  it("includes every named taxon (clades and genera)", () => {
    const ids = searchSource(store).map((e) => e.id).sort();
    expect(ids).toEqual(["CF", "LO", "O", "Q430", "T", "TB", "TC", "TF", "TR"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- explorer-core`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/explorer/explorer-core.ts`:
```ts
import type { TreeStore } from "../game/treeStore";
import type { SearchEntry } from "../game/search";

export interface FocusSelection {
  focusId: string;
  selectedGenusId: string | null;
}

export function revealedForFocus(store: TreeStore, focusId: string): Set<string> {
  const ids = new Set<string>(store.pathToRoot(focusId));
  for (const child of store.children(focusId)) ids.add(child.id);
  return ids;
}

export function emphasizedForFocus(store: TreeStore, focusId: string): Set<string> {
  return new Set(store.pathToRoot(focusId));
}

export function resolveSearchPick(store: TreeStore, id: string): FocusSelection {
  const node = store.getNode(id);
  if (!node) return { focusId: store.data.rootId, selectedGenusId: null };
  if (node.isGenus) {
    return { focusId: node.parentId ?? store.data.rootId, selectedGenusId: id };
  }
  return { focusId: id, selectedGenusId: null };
}

export function searchSource(store: TreeStore): SearchEntry[] {
  return Object.values(store.data.nodes).map((n) => ({ id: n.id, name: n.name }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- explorer-core`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/explorer/explorer-core.ts src/lib/explorer/explorer-core.test.ts
git commit -m "feat: pure explorer walk-down core"
```

---

### Task 2: Generalize game components for reuse (behavior-preserving)

Generalize `TreeView` and `SearchBox`, and make the game store a singleton — without changing game behavior. The game keeps working identically.

**Files:**
- Modify: `src/lib/game/components/TreeView.svelte`, `src/lib/game/components/SearchBox.svelte`, `src/lib/game/gameStore.svelte.ts`, `src/lib/game/components/Game.svelte`

**Interfaces:**
- `TreeView` props become: `revealed: Set<string>`, `emphasizedPath: Set<string>`, `nodeTooltips: Map<string,string[]>`, `highlightId: string | null`, `onnodeselect?: (id: string) => void`, `emptyLabel?: string`.
- `SearchBox` props become: `entries: SearchEntry[]`, `onpick: (id: string) => void`, `placeholder?: string`.
- `gameStore.svelte.ts` additionally exports `export const game = createGame()` (singleton).

- [ ] **Step 1: Generalize `TreeView.svelte`**

Replace `src/lib/game/components/TreeView.svelte` with:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { layoutCladogram } from "../layout";

  let {
    revealed,
    emphasizedPath,
    nodeTooltips,
    highlightId,
    onnodeselect,
    emptyLabel = "Nothing to show yet.",
  }: {
    revealed: Set<string>;
    emphasizedPath: Set<string>;
    nodeTooltips: Map<string, string[]>;
    highlightId: string | null;
    onnodeselect?: (id: string) => void;
    emptyLabel?: string;
  } = $props();

  const X_GAP = 180;
  const Y_GAP = 44;
  const PAD = 28;

  let layout = $derived(layoutCladogram(treeStore, revealed));
  let posOf = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
  let vbW = $derived(layout.width * X_GAP + PAD * 2 + 140);
  let vbH = $derived(layout.height * Y_GAP + PAD * 2);
  let hover = $state<string | null>(null);

  const px = (x: number) => PAD + x * X_GAP;
  const py = (y: number) => PAD + y * Y_GAP;

  function edgePath(parentId: string, childId: string): string {
    const p = posOf.get(parentId)!;
    const c = posOf.get(childId)!;
    const midX = (px(p.x) + px(c.x)) / 2;
    return `M ${px(p.x)} ${py(p.y)} H ${midX} V ${py(c.y)} H ${px(c.x)}`;
  }
</script>

{#if layout.nodes.length}
  <svg class="tree" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMinYMid meet" role="img" aria-label="Cladogram">
    {#each layout.edges as e (e.parentId + ">" + e.childId)}
      <path
        class="edge"
        class:emphasized={emphasizedPath.has(e.parentId) && emphasizedPath.has(e.childId)}
        d={edgePath(e.parentId, e.childId)}
        fill="none"
      />
    {/each}

    {#each layout.nodes as n (n.id)}
      {@const node = treeStore.getNode(n.id)}
      {@const tips = nodeTooltips.get(n.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <g
        class="node"
        class:emphasized={emphasizedPath.has(n.id)}
        class:highlight={n.id === highlightId}
        class:genus={node?.isGenus}
        class:clickable={!!onnodeselect}
        transform={`translate(${px(n.x)} ${py(n.y)})`}
        onmouseenter={() => (hover = n.id)}
        onmouseleave={() => (hover = null)}
        onclick={() => onnodeselect?.(n.id)}
      >
        <circle r={node?.isGenus ? 5 : 3.5} />
        <text x="9" dy="0.32em">
          {node?.name}{#if !node?.isGenus} <tspan class="count">({node?.descendantGenusCount})</tspan>{/if}
        </text>
        {#if hover === n.id && tips}
          <text class="tip" x="9" dy="1.5em">{tips.join(", ")}</text>
        {/if}
      </g>
    {/each}
  </svg>
{:else}
  <p class="tree-empty">{emptyLabel}</p>
{/if}
```

- [ ] **Step 2: Generalize `SearchBox.svelte`**

Replace `src/lib/game/components/SearchBox.svelte` with:
```svelte
<script lang="ts">
  import { createSearch } from "../search";
  import type { SearchEntry } from "../search";

  let {
    entries,
    onpick,
    placeholder = "Search…",
  }: { entries: SearchEntry[]; onpick: (id: string) => void; placeholder?: string } = $props();

  let search = $derived(createSearch(entries));
  let query = $state("");
  let results = $derived(search(query));

  function pick(id: string) {
    onpick(id);
    query = "";
  }
</script>

<div class="searchbox">
  <input {placeholder} bind:value={query} autocomplete="off" />
  {#if results.length}
    <ul>
      {#each results as r (r.id)}
        <li><button type="button" onclick={() => pick(r.id)}>{r.name}</button></li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 3: Make the game store a singleton**

In `src/lib/game/gameStore.svelte.ts`, append after the `createGame` function (keep `createGame` exported):
```ts
export const game = createGame();
```

- [ ] **Step 4: Update `Game.svelte` to consume the singleton and pass new props**

Replace `src/lib/game/components/Game.svelte` with:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { game } from "../gameStore.svelte";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import RevealCard from "./RevealCard.svelte";
  import TreeView from "./TreeView.svelte";

  const playableEntries = treeStore.playableGenera().map((n) => ({ id: n.id, name: n.name }));
  let highlightId = $state<string | null>(null);

  function newRound() {
    highlightId = null;
    game.newRound();
  }

  // Emphasized path = root -> warmest shared clade, as a set for O(1) membership.
  let emphasizedPath = $derived(
    game.warmestId ? new Set(treeStore.pathToRoot(game.warmestId)) : new Set<string>(),
  );

  // Tooltip per guess-landing (shared) node -> the guessed genus names that landed there.
  let nodeTooltips = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const g of game.state.guesses) {
      const name = treeStore.getNode(g.guessId)?.name ?? g.guessId;
      const list = map.get(g.sharedNodeId) ?? [];
      list.push(name);
      map.set(g.sharedNodeId, list);
    }
    return map;
  });
</script>

<main class="game">
  <header>
    <h1>Mesozooa</h1>
    <button type="button" onclick={newRound}>New round</button>
  </header>

  {#if game.state.status === "won"}
    <RevealCard
      targetId={game.state.target}
      guessCount={game.state.guesses.length}
      onnew={newRound}
    />
  {:else}
    <SearchBox entries={playableEntries} onpick={(id) => game.guess(id)} placeholder="Guess a dinosaur…" />
  {/if}

  <WarmestTrail warmestId={game.warmestId} />

  <div class="board">
    <GuessList guesses={game.state.guesses} onselect={(id) => (highlightId = id)} />
    <TreeView
      revealed={game.revealed}
      {emphasizedPath}
      {nodeTooltips}
      {highlightId}
      emptyLabel="Make a guess to start revealing the tree."
    />
  </div>
</main>
```

- [ ] **Step 5: Verify the game is unchanged**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → 44 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/TreeView.svelte src/lib/game/components/SearchBox.svelte src/lib/game/gameStore.svelte.ts src/lib/game/components/Game.svelte
git commit -m "refactor: generalize TreeView + SearchBox and make game store a singleton"
```

---

### Task 3: Extract `TaxonCard`; refactor `RevealCard`

Extract the shared taxon-detail rendering (name, image, Wikipedia link, lineage) into a `TaxonCard` reused by both surfaces; refactor `RevealCard` to build on it.

**Files:**
- Create: `src/lib/game/components/TaxonCard.svelte`
- Modify: `src/lib/game/components/RevealCard.svelte`

**Interfaces:**
- `TaxonCard` prop: `taxonId: string` — renders the taxon's name, image (if present), Wikipedia link (if present), and full root→taxon lineage.
- `RevealCard` unchanged props (`targetId`, `guessCount`, `onnew`); now renders `<TaxonCard>` + guess count + New round.

- [ ] **Step 1: Write `TaxonCard.svelte`**

`src/lib/game/components/TaxonCard.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";

  let { taxonId }: { taxonId: string } = $props();

  let node = $derived(treeStore.getNode(taxonId));
  let lineage = $derived(treeStore.pathToRoot(taxonId).slice().reverse());
</script>

<div class="taxon-card">
  <h2>{node?.name}</h2>
  {#if node?.imageUrl}
    <img src={node.imageUrl} alt={node.name} />
  {/if}
  {#if node?.wikipediaUrl}
    <a href={node.wikipediaUrl} target="_blank" rel="noopener noreferrer">Wikipedia</a>
  {/if}
  <p class="lineage">
    {#each lineage as id, i (id)}{treeStore.getNode(id)?.name}{#if i < lineage.length - 1} › {/if}{/each}
  </p>
</div>
```

- [ ] **Step 2: Refactor `RevealCard.svelte` to use it**

Replace `src/lib/game/components/RevealCard.svelte` with:
```svelte
<script lang="ts">
  import TaxonCard from "./TaxonCard.svelte";

  let { targetId, guessCount, onnew }: { targetId: string; guessCount: number; onnew: () => void } =
    $props();
</script>

<div class="reveal">
  <TaxonCard taxonId={targetId} />
  <p>Found in {guessCount} {guessCount === 1 ? "guess" : "guesses"}.</p>
  <button type="button" onclick={onnew}>New round</button>
</div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → 44 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/TaxonCard.svelte src/lib/game/components/RevealCard.svelte
git commit -m "refactor: extract shared TaxonCard from RevealCard"
```

---

### Task 4: `explorerStore` + `Breadcrumb` + `NodeDetail`

**Files:**
- Create: `src/lib/explorer/explorerStore.svelte.ts`, `src/lib/explorer/components/Breadcrumb.svelte`, `src/lib/explorer/components/NodeDetail.svelte`

**Interfaces:**
- Consumes: `treeStore` from `../game/treeData`; `revealedForFocus`/`emphasizedForFocus`/`resolveSearchPick` from `./explorer-core`; `TaxonCard` from `../game/components/TaxonCard.svelte`.
- Produces:
  - `explorer` singleton — getters `focusId`, `selectedGenusId`, `revealed`, `emphasizedPath`, `highlightId`; methods `focus(id)`, `selectGenus(id)`, `jumpTo(id)`.
  - `Breadcrumb` (props `focusId: string`, `onfocus: (id: string) => void`).
  - `NodeDetail` (prop `taxonId: string`) — `<TaxonCard>` + group size + a non-playable marker for unresolved genera.

- [ ] **Step 1: Write the explorer store**

`src/lib/explorer/explorerStore.svelte.ts`:
```ts
import { treeStore } from "../game/treeData";
import { revealedForFocus, emphasizedForFocus, resolveSearchPick } from "./explorer-core";

function createExplorer() {
  let focusId = $state<string>(treeStore.data.rootId);
  let selectedGenusId = $state<string | null>(null);
  return {
    get focusId(): string {
      return focusId;
    },
    get selectedGenusId(): string | null {
      return selectedGenusId;
    },
    get revealed(): Set<string> {
      return revealedForFocus(treeStore, focusId);
    },
    get emphasizedPath(): Set<string> {
      return emphasizedForFocus(treeStore, focusId);
    },
    get highlightId(): string {
      return selectedGenusId ?? focusId;
    },
    focus(id: string) {
      focusId = id;
      selectedGenusId = null;
    },
    selectGenus(id: string) {
      selectedGenusId = id;
    },
    jumpTo(id: string) {
      const pick = resolveSearchPick(treeStore, id);
      focusId = pick.focusId;
      selectedGenusId = pick.selectedGenusId;
    },
  };
}

export const explorer = createExplorer();
```

- [ ] **Step 2: Write `Breadcrumb.svelte`**

`src/lib/explorer/components/Breadcrumb.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../../game/treeData";

  let { focusId, onfocus }: { focusId: string; onfocus: (id: string) => void } = $props();

  let crumbs = $derived(treeStore.pathToRoot(focusId).slice().reverse());
</script>

<nav class="breadcrumb" aria-label="Lineage">
  {#each crumbs as id, i (id)}
    {@const node = treeStore.getNode(id)}
    <button type="button" class="crumb" onclick={() => onfocus(id)}>{node?.name} ({node?.descendantGenusCount})</button>{#if i < crumbs.length - 1}<span class="sep"> › </span>{/if}
  {/each}
</nav>
```

- [ ] **Step 3: Write `NodeDetail.svelte`**

`src/lib/explorer/components/NodeDetail.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import TaxonCard from "../../game/components/TaxonCard.svelte";

  let { taxonId }: { taxonId: string } = $props();

  let node = $derived(treeStore.getNode(taxonId));
</script>

<aside class="node-detail">
  <TaxonCard {taxonId} />
  <p class="group-size">{node?.descendantGenusCount} genera in this clade</p>
  {#if node?.isGenus && !node?.playable}
    <p class="unresolved">Not in the playable pool (unresolved placement).</p>
  {/if}
</aside>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → 44 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer/explorerStore.svelte.ts src/lib/explorer/components/Breadcrumb.svelte src/lib/explorer/components/NodeDetail.svelte
git commit -m "feat: explorer store, breadcrumb, and node detail"
```

---

### Task 5: `Explorer.svelte` (walk-down wiring)

**Files:**
- Create: `src/lib/explorer/components/Explorer.svelte`

**Interfaces:**
- Consumes: `treeStore` from `../../game/treeData`; `explorer` from `../explorerStore.svelte`; `searchSource` from `../explorer-core`; `TreeView`/`SearchBox` from `../../game/components/`; `Breadcrumb`/`NodeDetail` from `./`.
- Produces: `Explorer` (no props) — the full walkable surface. Clicking a clade node focuses it; clicking a genus node selects it; breadcrumb focuses; search jumps.

- [ ] **Step 1: Write `Explorer.svelte`**

`src/lib/explorer/components/Explorer.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import { explorer } from "../explorerStore.svelte";
  import { searchSource } from "../explorer-core";
  import TreeView from "../../game/components/TreeView.svelte";
  import SearchBox from "../../game/components/SearchBox.svelte";
  import Breadcrumb from "./Breadcrumb.svelte";
  import NodeDetail from "./NodeDetail.svelte";

  const taxa = searchSource(treeStore);
  const noTooltips = new Map<string, string[]>();

  function onnodeselect(id: string) {
    const node = treeStore.getNode(id);
    if (node?.isGenus) explorer.selectGenus(id);
    else explorer.focus(id);
  }
</script>

<main class="explorer">
  <header><h1>Explore</h1></header>

  <SearchBox entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
  <Breadcrumb focusId={explorer.focusId} onfocus={(id) => explorer.focus(id)} />

  <div class="board">
    <TreeView
      revealed={explorer.revealed}
      emphasizedPath={explorer.emphasizedPath}
      nodeTooltips={noTooltips}
      highlightId={explorer.highlightId}
      {onnodeselect}
    />
    <NodeDetail taxonId={explorer.highlightId} />
  </div>
</main>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → 44 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/explorer/components/Explorer.svelte
git commit -m "feat: walkable explorer surface"
```

---

### Task 6: App Play/Explore toggle + state preservation

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `Game` from `./lib/game/components/Game.svelte`; `Explorer` from `./lib/explorer/components/Explorer.svelte`.
- Produces: a top-level view toggle; both surfaces preserve their singleton-backed state across toggles.

- [ ] **Step 1: Wire the toggle in `App.svelte`**

Replace `src/App.svelte` with:
```svelte
<script lang="ts">
  import Game from "./lib/game/components/Game.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";

  let mode = $state<"play" | "explore">("play");
</script>

<nav class="modes">
  <button type="button" class:active={mode === "play"} onclick={() => (mode = "play")}>Play</button>
  <button type="button" class:active={mode === "explore"} onclick={() => (mode = "explore")}>Explore</button>
</nav>

{#if mode === "play"}
  <Game />
{:else}
  <Explorer />
{/if}
```

- [ ] **Step 2: Verify gates**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → 44 tests still pass.

- [ ] **Step 3: Verify state preservation and the walk-down flow in the app**

Run: `npm run dev` and open the printed URL. Verify:
- **State preservation:** in Play, make 2–3 guesses; switch to Explore, then back to Play — the guesses, warmest trail, and revealed tree are all intact (not reset).
- **Explorer walk-down:** starting at Dinosauria, clicking a child clade descends (breadcrumb grows, its children fan out); clicking a breadcrumb ancestor ascends; clicking a genus opens its detail (name, image if any, working Wikipedia link, lineage, group size); a non-playable genus shows the "unresolved" marker.
- **Search-to-jump:** searching a clade name focuses it; searching a genus focuses its parent and selects the genus (its detail opens).
(Stop the dev server when done.)

- [ ] **Step 4: Commit**

```bash
git add src/App.svelte
git commit -m "feat: Play/Explore view toggle"
```

---

## Notes for later (not implemented here)

- **Look-and-feel pass:** owns the warmth/emphasis color scale, layout/spacing, typography, the non-playable badge styling, active-tab styling, and interactive pan/zoom for deep subtrees (auto-fit is the interim). The root label renders as Wikidata's lowercase "dinosaur" — prettify here.
- **Deep-link / URL state** for the explorer focus (e.g. `?focus=Q…`) is deferred.
- **Plan 2b (game completion):** daily mode + deterministic answer, hints, share grid, `localStorage` — independent of this plan.
