# Mesozooa Game Slice (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable Mesozooa slice — a complete Practice-mode game where you guess dinosaur genera and get MRCA-based warmth feedback across a guess list, a warmest-trail breadcrumb, and a graphical reveal-as-you-go cladogram.

**Architecture:** A set of pure, unit-tested engine modules under `src/lib/game/` (tree adapter, warmth provider, autocomplete search, game-state reducer, cladogram layout) consumed by thin Svelte 5 components. All game feedback is a pointer to a node in the one tree (the MRCA of guess + target) — the guess row, the warmest trail, and the tree highlight all reference the same node objects, so they cannot desync. Pure logic is TDD-tested against the foundation's existing fixture; Svelte components are validated by type-checking and running the app.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 6, Vitest 2. Consumes the foundation's `src/lib/tree/` pure library and committed `src/data/tree.json`.

## Global Constraints

- **One tree, one source of truth.** Every feedback surface references node objects from `treeStore`. Never build a parallel rank ladder or a second representation of the tree.
- **Warmth = `descendantGenusCount`** of the shared clade, via a swappable `WarmthProvider` selected by one config constant. Default is `CountWarmth`. Do not hardcode a warmth formula at call sites.
- **Playable pool only.** Guesses and the random Practice target come exclusively from the playable genera (`treeStore.playableGenera()` / `isPlayable`). The reference pool (all genera) is not guessable.
- **Practice mode has no guess budget** (unlimited guesses). No 20-guess limit, no hints, no daily mode, no share grid, no `localStorage` — those are deferred (Plan 2b).
- **`verbatimModuleSyntax` is ON** (from the foundation tsconfig). Type-only imports MUST use `import type`; runtime values/functions use normal imports. **Vitest does NOT catch violations** (esbuild strips types) — a bad import passes tests but breaks the build. Every task MUST run `npx tsc --noEmit` and confirm it is clean before committing.
- **Component tasks** additionally MUST pass `npx svelte-check --tsconfig ./tsconfig.json` clean and `npm run build` succeeding before committing (these are the compile gates for `.svelte` files, which `vitest` does not type-check).
- **No runtime network calls for game data.** The app imports the committed `src/data/tree.json`; it never queries Wikidata at runtime.
- **All new game code lives under `src/lib/game/`.** Pure modules are `.ts`; Svelte-rune modules that use `$state` are `.svelte.ts`; components are `.svelte`.
- **Test fixture:** pure-logic tests build a fixture tree from the foundation's `FIXTURE_RAWS` (playable genera: `TR`, `TB`, `TC`; root `Q430` has `descendantGenusCount` 4). Reuse it; do not invent new fixtures.

---

### Task 1: Game types + `treeStore`

**Files:**
- Create: `src/lib/game/types.ts`, `src/lib/game/treeStore.ts`, `src/lib/game/treeStore.test.ts`

**Interfaces:**
- Consumes: `TreeData`, `TreeNode` from `../tree/types`; `mrca`, `pathToRoot` from `../tree/mrca`; `playableGenera` from `../tree/playable`; `assembleTree`, `pruneSubtree`, `markPlayable`, `FIXTURE_RAWS`, `NEORNITHES`, `DINOSAURIA` for the test.
- Produces:
  - `Warmth`, `GuessResult`, `GameStatus`, `GameState` types.
  - `TreeStore` interface + `createTreeStore(data: TreeData): TreeStore` with methods `getNode`, `children`, `pathToRoot`, `mrca`, `playableGenera`, `isPlayable`, and props `data`, `rootCount`.

- [ ] **Step 1: Write the game types**

`src/lib/game/types.ts`:
```ts
export interface Warmth {
  value: number;
  display: string;
  fraction: number;
}

export interface GuessResult {
  guessId: string;
  sharedNodeId: string;
  warmth: Warmth;
}

export type GameStatus = "playing" | "won";

export interface GameState {
  target: string;
  guesses: GuessResult[];
  status: GameStatus;
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/game/treeStore.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("createTreeStore", () => {
  it("gets a node by id", () => {
    expect(store.getNode("TR")?.name).toBe("Tyrannosaurus");
    expect(store.getNode("nope")).toBeUndefined();
  });
  it("returns children nodes", () => {
    expect(store.children("TF").map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("exposes pathToRoot and mrca over the tree", () => {
    expect(store.pathToRoot("TR")).toEqual(["TR", "TF", "T", "Q430"]);
    expect(store.mrca("TR", "TC")).toBe("Q430");
  });
  it("lists playable genera", () => {
    expect(store.playableGenera().map((n) => n.id).sort()).toEqual(["TB", "TC", "TR"]);
  });
  it("reports playability", () => {
    expect(store.isPlayable("TR")).toBe(true);
    expect(store.isPlayable("LO")).toBe(false); // genus but not playable
    expect(store.isPlayable("TF")).toBe(false); // family, not a genus
    expect(store.isPlayable("nope")).toBe(false);
  });
  it("exposes rootCount = root descendantGenusCount", () => {
    expect(store.rootCount).toBe(4);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- treeStore`
Expected: FAIL — `createTreeStore` not exported.

- [ ] **Step 4: Write the implementation**

`src/lib/game/treeStore.ts`:
```ts
import type { TreeData, TreeNode } from "../tree/types";
import { mrca as mrcaOf, pathToRoot as pathToRootOf } from "../tree/mrca";
import { playableGenera as playableOf } from "../tree/playable";

export interface TreeStore {
  data: TreeData;
  rootCount: number;
  getNode(id: string): TreeNode | undefined;
  children(id: string): TreeNode[];
  pathToRoot(id: string): string[];
  mrca(a: string, b: string): string;
  playableGenera(): TreeNode[];
  isPlayable(id: string): boolean;
}

export function createTreeStore(data: TreeData): TreeStore {
  const getNode = (id: string): TreeNode | undefined => data.nodes[id];
  return {
    data,
    rootCount: data.nodes[data.rootId]?.descendantGenusCount ?? 0,
    getNode,
    children(id) {
      const node = getNode(id);
      if (!node) return [];
      return node.childrenIds.map((cid) => data.nodes[cid]).filter((n): n is TreeNode => !!n);
    },
    pathToRoot: (id) => pathToRootOf(data, id),
    mrca: (a, b) => mrcaOf(data, a, b),
    playableGenera: () => playableOf(data),
    isPlayable: (id) => getNode(id)?.playable === true,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- treeStore`
Expected: PASS (6 cases).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit` → must be clean.
```bash
git add src/lib/game/types.ts src/lib/game/treeStore.ts src/lib/game/treeStore.test.ts
git commit -m "feat: game types and treeStore adapter"
```

---

### Task 2: `WarmthProvider` (`CountWarmth`)

**Files:**
- Create: `src/lib/game/warmth.ts`, `src/lib/game/warmth.test.ts`

**Interfaces:**
- Consumes: `TreeNode` from `../tree/types`.
- Produces:
  - `WarmthProvider` interface `{ warmth(node: TreeNode): Warmth }` (re-using `Warmth` from `./types`).
  - `createCountWarmth(rootCount: number): WarmthProvider` — `value = node.descendantGenusCount`; `display = "<value> genus|genera"`; `fraction = clamp01(1 - ln(value)/ln(rootCount))`.

- [ ] **Step 1: Write the failing test**

`src/lib/game/warmth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createCountWarmth } from "./warmth";
import type { TreeNode } from "../tree/types";

function node(count: number): TreeNode {
  return {
    id: "x", name: "X", rankId: null, parentId: null, childrenIds: [],
    depth: 0, descendantGenusCount: count, isGenus: false, playable: false,
  };
}

const warmth = createCountWarmth(4); // fixture root count

describe("createCountWarmth", () => {
  it("reports the genus count as value", () => {
    expect(warmth.warmth(node(2)).value).toBe(2);
  });
  it("pluralizes the display", () => {
    expect(warmth.warmth(node(1)).display).toBe("1 genus");
    expect(warmth.warmth(node(4)).display).toBe("4 genera");
  });
  it("fraction is 1 at the answer (count 1) and 0 at the whole tree", () => {
    expect(warmth.warmth(node(1)).fraction).toBeCloseTo(1, 6);
    expect(warmth.warmth(node(4)).fraction).toBeCloseTo(0, 6);
  });
  it("fraction is monotonic: smaller clade is warmer", () => {
    expect(warmth.warmth(node(2)).fraction).toBeGreaterThan(warmth.warmth(node(4)).fraction);
    expect(warmth.warmth(node(1)).fraction).toBeGreaterThan(warmth.warmth(node(2)).fraction);
  });
  it("clamps fraction to [0,1]", () => {
    const f = warmth.warmth(node(1000)).fraction; // count > rootCount
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- warmth`
Expected: FAIL — `createCountWarmth` not exported.

- [ ] **Step 3: Write the implementation**

`src/lib/game/warmth.ts`:
```ts
import type { TreeNode } from "../tree/types";
import type { Warmth } from "./types";

export interface WarmthProvider {
  warmth(node: TreeNode): Warmth;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function createCountWarmth(rootCount: number): WarmthProvider {
  const denom = Math.log(rootCount) || 1;
  return {
    warmth(node: TreeNode): Warmth {
      const value = node.descendantGenusCount;
      const fraction = clamp01(1 - Math.log(value) / denom);
      const display = `${value} ${value === 1 ? "genus" : "genera"}`;
      return { value, display, fraction };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- warmth`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/warmth.ts src/lib/game/warmth.test.ts
git commit -m "feat: CountWarmth provider"
```

---

### Task 3: Autocomplete `search`

**Files:**
- Create: `src/lib/game/search.ts`, `src/lib/game/search.test.ts`

**Interfaces:**
- Consumes: nothing from other game modules (takes a plain `SearchEntry[]`).
- Produces:
  - `SearchEntry = { id: string; name: string }`.
  - `createSearch(genera: SearchEntry[]): (query: string, limit?: number) => SearchEntry[]` — prefix matches first, then diacritic/case-insensitive substring matches, alphabetical within each tier, bounded by `limit` (default 10). Empty/whitespace query → `[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/game/search.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createSearch } from "./search";

// ASCII-only dataset for ordering assertions (avoids locale-dependent accent collation).
const search = createSearch([
  { id: "1", name: "Tyrannosaurus" },
  { id: "2", name: "Tarbosaurus" },
  { id: "3", name: "Triceratops" },
  { id: "4", name: "Allosaurus" },
]);
// Separate single-entry store for the diacritic check (no sort to depend on).
const diacritic = createSearch([{ id: "5", name: "Écrasaurus" }]);

describe("createSearch", () => {
  it("returns [] for empty/whitespace query", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });
  it("orders substring matches alphabetically", () => {
    // 'saurus' is a substring of these three (not Triceratops); none start with it.
    const names = search("saurus").map((r) => r.name);
    expect(names).toEqual(["Allosaurus", "Tarbosaurus", "Tyrannosaurus"]);
  });
  it("ranks prefix matches before substring matches", () => {
    const names = search("t").map((r) => r.name);
    // prefix tier (alphabetical): Tarbosaurus, Triceratops, Tyrannosaurus. Allosaurus has no 't'.
    expect(names).toEqual(["Tarbosaurus", "Triceratops", "Tyrannosaurus"]);
  });
  it("is case- and diacritic-insensitive", () => {
    expect(diacritic("ecra").map((r) => r.name)).toEqual(["Écrasaurus"]);
    expect(diacritic("ECRA").map((r) => r.name)).toEqual(["Écrasaurus"]);
  });
  it("respects the limit", () => {
    expect(search("saurus", 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- search`
Expected: FAIL — `createSearch` not exported.

- [ ] **Step 3: Write the implementation**

`src/lib/game/search.ts`:
```ts
export interface SearchEntry {
  id: string;
  name: string;
}

function normalize(s: string): string {
  // NFD splits accents into combining marks (U+0300–U+036F); strip them for accent-insensitivity.
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function createSearch(genera: SearchEntry[]): (query: string, limit?: number) => SearchEntry[] {
  const entries = genera.map((g) => ({ id: g.id, name: g.name, norm: normalize(g.name) }));
  const byName = (a: SearchEntry, b: SearchEntry) => a.name.localeCompare(b.name);

  return function search(query: string, limit = 10): SearchEntry[] {
    const q = normalize(query.trim());
    if (!q) return [];
    const prefix: SearchEntry[] = [];
    const substr: SearchEntry[] = [];
    for (const e of entries) {
      const idx = e.norm.indexOf(q);
      if (idx === 0) prefix.push({ id: e.id, name: e.name });
      else if (idx > 0) substr.push({ id: e.id, name: e.name });
    }
    prefix.sort(byName);
    substr.sort(byName);
    return [...prefix, ...substr].slice(0, limit);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- search`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/search.ts src/lib/game/search.test.ts
git commit -m "feat: playable-genus autocomplete search"
```

---

### Task 4: Game engine core (pure reducer + selectors)

**Files:**
- Create: `src/lib/game/engine-core.ts`, `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Consumes: `GameState`, `GuessResult` from `./types`; `TreeStore` from `./treeStore`; `WarmthProvider` from `./warmth`.
- Produces:
  - `applyGuess(state, guessId, store, warmth): GameState` — pure; rejects a non-playable id (throws), no-ops a duplicate guess or a finished game, otherwise appends a `GuessResult` with `sharedNodeId = mrca(guessId, target)` and sets `status="won"` when `guessId===target`.
  - `newRoundState(store, rng?): GameState` — picks a uniform-random playable target, empty guesses, `status="playing"`. `rng` defaults to `Math.random` (injectable for tests).
  - `warmestSharedNodeId(state, store): string | null` — the guessed shared node with the smallest `descendantGenusCount` (warmest), or `null` if no guesses.
  - `revealedNodeIds(state, store): Set<string>` — union of `pathToRoot(guessId)` over all guesses.

- [ ] **Step 1: Write the failing test**

`src/lib/game/engine-core.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyGuess, newRoundState, warmestSharedNodeId, revealedNodeIds } from "./engine-core";
import { createTreeStore } from "./treeStore";
import { createCountWarmth } from "./warmth";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";
import type { GameState } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const warmth = createCountWarmth(store.rootCount);
const start = (target: string): GameState => ({ target, guesses: [], status: "playing" });

describe("applyGuess", () => {
  it("appends a result referencing mrca(guess, target)", () => {
    const s = applyGuess(start("TC"), "TR", store, warmth);
    expect(s.guesses).toHaveLength(1);
    expect(s.guesses[0].sharedNodeId).toBe("Q430"); // mrca(Tyrannosaurus, Triceratops)
    expect(s.guesses[0].warmth.value).toBe(4);
    expect(s.status).toBe("playing");
  });
  it("wins when the guess is the target", () => {
    const s = applyGuess(start("TC"), "TC", store, warmth);
    expect(s.status).toBe("won");
    expect(s.guesses[0].sharedNodeId).toBe("TC");
  });
  it("rejects a non-playable id", () => {
    expect(() => applyGuess(start("TC"), "LO", store, warmth)).toThrow();
    expect(() => applyGuess(start("TC"), "nope", store, warmth)).toThrow();
  });
  it("no-ops a duplicate guess", () => {
    const s1 = applyGuess(start("TC"), "TR", store, warmth);
    const s2 = applyGuess(s1, "TR", store, warmth);
    expect(s2.guesses).toHaveLength(1);
  });
  it("no-ops once the game is won", () => {
    const won = applyGuess(start("TC"), "TC", store, warmth);
    const after = applyGuess(won, "TR", store, warmth);
    expect(after.guesses).toHaveLength(1);
    expect(after.status).toBe("won");
  });
});

describe("newRoundState", () => {
  it("picks a playable target and resets", () => {
    const s = newRoundState(store, () => 0);
    expect(store.isPlayable(s.target)).toBe(true);
    expect(s.guesses).toEqual([]);
    expect(s.status).toBe("playing");
  });
});

describe("warmestSharedNodeId", () => {
  it("returns null with no guesses", () => {
    expect(warmestSharedNodeId(start("TC"), store)).toBeNull();
  });
  it("returns the smallest-clade shared node", () => {
    // guess TR vs target TB -> mrca TF (count 2); guess TC vs target TB -> mrca Q430 (count 4)
    let s = start("TB");
    s = applyGuess(s, "TR", store, warmth);
    s = applyGuess(s, "TC", store, warmth);
    expect(warmestSharedNodeId(s, store)).toBe("TF");
  });
});

describe("revealedNodeIds", () => {
  it("unions the root paths of all guesses", () => {
    let s = start("TB");
    s = applyGuess(s, "TR", store, warmth);
    expect([...revealedNodeIds(s, store)].sort()).toEqual(["Q430", "T", "TF", "TR"].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- engine-core`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/game/engine-core.ts`:
```ts
import type { GameState, GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import type { WarmthProvider } from "./warmth";

export function applyGuess(
  state: GameState,
  guessId: string,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.status !== "playing") return state;
  if (!store.isPlayable(guessId)) {
    throw new Error(`Not a playable genus: ${guessId}`);
  }
  if (state.guesses.some((g) => g.guessId === guessId)) return state;

  const sharedNodeId = store.mrca(guessId, state.target);
  const sharedNode = store.getNode(sharedNodeId)!;
  const result: GuessResult = { guessId, sharedNodeId, warmth: warmth.warmth(sharedNode) };
  const status = guessId === state.target ? "won" : "playing";
  return { ...state, guesses: [...state.guesses, result], status };
}

export function newRoundState(store: TreeStore, rng: () => number = Math.random): GameState {
  const pool = store.playableGenera();
  const target = pool[Math.floor(rng() * pool.length)].id;
  return { target, guesses: [], status: "playing" };
}

export function warmestSharedNodeId(state: GameState, store: TreeStore): string | null {
  if (state.guesses.length === 0) return null;
  let bestId = state.guesses[0].sharedNodeId;
  let bestCount = store.getNode(bestId)!.descendantGenusCount;
  for (const g of state.guesses) {
    const count = store.getNode(g.sharedNodeId)!.descendantGenusCount;
    if (count < bestCount) {
      bestCount = count;
      bestId = g.sharedNodeId;
    }
  }
  return bestId;
}

export function revealedNodeIds(state: GameState, store: TreeStore): Set<string> {
  const ids = new Set<string>();
  for (const g of state.guesses) {
    for (const id of store.pathToRoot(g.guessId)) ids.add(id);
  }
  return ids;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engine-core`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat: pure game engine core (guess reducer + selectors)"
```

---

### Task 5: Cladogram layout function

**Files:**
- Create: `src/lib/game/layout.ts`, `src/lib/game/layout.test.ts`

**Interfaces:**
- Consumes: `TreeStore` from `./treeStore`.
- Produces:
  - `LayoutNode = { id: string; x: number; y: number; depth: number }` (x = depth, y in leaf-order units).
  - `LayoutEdge = { parentId: string; childId: string }`.
  - `Layout = { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number }` (width = max depth, height = max y).
  - `layoutCladogram(store: TreeStore, revealed: Set<string>): Layout` — left-to-right tidy layout of the revealed subtree rooted at `store.data.rootId`. Leaves (revealed nodes with no revealed children) get sequential y = 0,1,2,…; internal nodes y = midpoint of first/last child; children ordered alphabetically by name. Empty layout if the root is not revealed.

- [ ] **Step 1: Write the failing test**

`src/lib/game/layout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { layoutCladogram } from "./layout";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("layoutCladogram", () => {
  it("is empty when the root is not revealed", () => {
    const l = layoutCladogram(store, new Set(["TR"]));
    expect(l.nodes).toEqual([]);
    expect(l.edges).toEqual([]);
  });

  it("places a single revealed chain by depth with y=0", () => {
    const l = layoutCladogram(store, new Set(["Q430", "T", "TF", "TR"]));
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    expect(byId.get("Q430")).toMatchObject({ x: 0, y: 0, depth: 0 });
    expect(byId.get("T")).toMatchObject({ x: 1, y: 0 });
    expect(byId.get("TF")).toMatchObject({ x: 2, y: 0 });
    expect(byId.get("TR")).toMatchObject({ x: 3, y: 0 });
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { parentId: "Q430", childId: "T" },
        { parentId: "T", childId: "TF" },
        { parentId: "TF", childId: "TR" },
      ]),
    );
    expect(l.width).toBe(3);
    expect(l.height).toBe(0);
  });

  it("spreads sibling leaves and centers their parent", () => {
    const l = layoutCladogram(store, new Set(["Q430", "T", "TF", "TR", "TB"]));
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    // children of TF ordered alphabetically: Tarbosaurus(TB)=0, Tyrannosaurus(TR)=1
    expect(byId.get("TB")!.y).toBe(0);
    expect(byId.get("TR")!.y).toBe(1);
    expect(byId.get("TF")!.y).toBe(0.5);
    expect(byId.get("Q430")!.y).toBe(0.5);
    expect(l.height).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- layout`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/game/layout.ts`:
```ts
import type { TreeStore } from "./treeStore";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export interface LayoutEdge {
  parentId: string;
  childId: string;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function layoutCladogram(store: TreeStore, revealed: Set<string>): Layout {
  const rootId = store.data.rootId;
  if (!revealed.has(rootId)) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const revealedChildren = (id: string) =>
    store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let nextLeafY = 0;
  let maxDepth = 0;
  let maxY = 0;

  function visit(id: string, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const kids = revealedChildren(id);
    let y: number;
    if (kids.length === 0) {
      y = nextLeafY++;
    } else {
      const childYs = kids.map((k) => {
        edges.push({ parentId: id, childId: k.id });
        return visit(k.id, depth + 1);
      });
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    maxY = Math.max(maxY, y);
    nodes.push({ id, x: depth, y, depth });
    return y;
  }

  visit(rootId, 0);
  return { nodes, edges, width: maxDepth, height: maxY };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- layout`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/layout.ts src/lib/game/layout.test.ts
git commit -m "feat: left-to-right cladogram layout function"
```

---

### Task 6: Game store + first playable shell (SearchBox, GuessList, Game, App)

This task produces the first end-to-end playable round (text feedback only; the tree comes in Task 8). Components are validated by type-check + build, then by running the app.

**Files:**
- Create: `src/lib/game/treeData.ts`, `src/lib/game/gameStore.svelte.ts`, `src/lib/game/components/SearchBox.svelte`, `src/lib/game/components/GuessList.svelte`, `src/lib/game/components/Game.svelte`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `createTreeStore` (Task 1), `createCountWarmth` (Task 2), `createSearch` (Task 3), `applyGuess`/`newRoundState`/`warmestSharedNodeId`/`revealedNodeIds` (Task 4); `src/data/tree.json`.
- Produces:
  - `treeStore` singleton (`treeData.ts`) built from the committed tree.
  - `createGame()` (`gameStore.svelte.ts`) — a `$state`-backed store exposing `get state()`, `get warmestId()`, `get revealed()`, `guess(id)`, `newRound()`.
  - `SearchBox` (prop `onguess: (id: string) => void`), `GuessList` (props `guesses`, `onselect`), `Game` (no props), and `App` rendering `Game`.

- [ ] **Step 1: Write the tree singleton**

`src/lib/game/treeData.ts`:
```ts
import type { TreeData } from "../tree/types";
import treeJson from "../../data/tree.json";
import { createTreeStore } from "./treeStore";

export const treeStore = createTreeStore(treeJson as unknown as TreeData);
```

- [ ] **Step 2: Write the game store**

`src/lib/game/gameStore.svelte.ts`:
```ts
import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { createCountWarmth } from "./warmth";
import { applyGuess, newRoundState, warmestSharedNodeId, revealedNodeIds } from "./engine-core";

const warmth = createCountWarmth(treeStore.rootCount);

export function createGame() {
  let state = $state<GameState>(newRoundState(treeStore));
  return {
    get state(): GameState {
      return state;
    },
    get warmestId(): string | null {
      return warmestSharedNodeId(state, treeStore);
    },
    get revealed(): Set<string> {
      return revealedNodeIds(state, treeStore);
    },
    guess(id: string) {
      state = applyGuess(state, id, treeStore, warmth);
    },
    newRound() {
      state = newRoundState(treeStore);
    },
  };
}
```

- [ ] **Step 3: Write `SearchBox.svelte`**

`src/lib/game/components/SearchBox.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { createSearch } from "../search";

  let { onguess }: { onguess: (id: string) => void } = $props();

  const search = createSearch(
    treeStore.playableGenera().map((n) => ({ id: n.id, name: n.name })),
  );

  let query = $state("");
  let results = $derived(search(query));

  function pick(id: string) {
    onguess(id);
    query = "";
  }
</script>

<div class="searchbox">
  <input placeholder="Guess a dinosaur…" bind:value={query} autocomplete="off" />
  {#if results.length}
    <ul>
      {#each results as r (r.id)}
        <li><button type="button" onclick={() => pick(r.id)}>{r.name}</button></li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 4: Write `GuessList.svelte`**

`src/lib/game/components/GuessList.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import type { GuessResult } from "../types";

  let { guesses, onselect }: { guesses: GuessResult[]; onselect: (nodeId: string) => void } =
    $props();
</script>

<ul class="guesses">
  {#each guesses as g (g.guessId)}
    {@const guess = treeStore.getNode(g.guessId)}
    {@const shared = treeStore.getNode(g.sharedNodeId)}
    <li>
      <button type="button" onclick={() => onselect(g.sharedNodeId)}>
        <span class="guess-name">{guess?.name}</span>
        <span class="clade">shared: {shared?.name}</span>
        <span class="warmth">{g.warmth.display}</span>
        <span class="bar"><span class="fill" style="width: {Math.round(g.warmth.fraction * 100)}%"></span></span>
      </button>
    </li>
  {/each}
</ul>
```

- [ ] **Step 5: Write `Game.svelte`**

`src/lib/game/components/Game.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { createGame } from "../gameStore.svelte";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";

  const game = createGame();
  let highlightId = $state<string | null>(null);

  function onguess(id: string) {
    game.guess(id);
  }
</script>

<main class="game">
  <header>
    <h1>Mesozooa</h1>
    <button type="button" onclick={() => game.newRound()}>New round</button>
  </header>

  {#if game.state.status === "won"}
    <p class="win">You got it: <strong>{treeStore.getNode(game.state.target)?.name}</strong> in {game.state.guesses.length} guesses.</p>
  {:else}
    <SearchBox {onguess} />
  {/if}

  <GuessList guesses={game.state.guesses} onselect={(id) => (highlightId = id)} />
</main>
```

- [ ] **Step 6: Wire `App.svelte`**

Replace `src/App.svelte` with:
```svelte
<script lang="ts">
  import Game from "./lib/game/components/Game.svelte";
</script>

<Game />
```

- [ ] **Step 7: Type-check, compile-check, build**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors (warnings about unused CSS are acceptable).
Run: `npm run build` → succeeds.
Run: `npm test` → all prior suites still pass.

- [ ] **Step 8: Run the app and verify a round**

Run: `npm run dev` and open the printed URL.
Verify: typing filters to playable genera; clicking a suggestion adds a guess row showing the guessed name, the shared-clade name, the warmth count, and a filled bar; guessing more narrows warmth; guessing the target shows the win line; "New round" resets. (Stop the dev server when done.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/treeData.ts src/lib/game/gameStore.svelte.ts src/lib/game/components/ src/App.svelte
git commit -m "feat: playable practice round (search + guess list)"
```

---

### Task 7: Warmest trail + reveal card

**Files:**
- Create: `src/lib/game/components/WarmestTrail.svelte`, `src/lib/game/components/RevealCard.svelte`
- Modify: `src/lib/game/components/Game.svelte`

**Interfaces:**
- Consumes: `treeStore` singleton; `game.warmestId`, `game.state`.
- Produces:
  - `WarmestTrail` (prop `warmestId: string | null`) — renders the root→warmest-clade breadcrumb, each crumb annotated with its `descendantGenusCount`.
  - `RevealCard` (props `targetId: string`, `guessCount: number`, `onnew: () => void`) — target name, image, Wikipedia link, guess count, full Dinosauria→target lineage, and a "New round" button.

- [ ] **Step 1: Write `WarmestTrail.svelte`**

`src/lib/game/components/WarmestTrail.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";

  let { warmestId }: { warmestId: string | null } = $props();

  // Root -> warmest clade (pathToRoot is node-first; reverse for root-first breadcrumb).
  let trail = $derived(warmestId ? treeStore.pathToRoot(warmestId).slice().reverse() : []);
</script>

{#if trail.length}
  <nav class="trail" aria-label="Warmest shared lineage">
    {#each trail as id, i (id)}
      {@const node = treeStore.getNode(id)}
      <span class="crumb">
        {node?.name} <em>({node?.descendantGenusCount})</em>{#if i < trail.length - 1}<span class="sep"> › </span>{/if}
      </span>
    {/each}
  </nav>
{/if}
```

- [ ] **Step 2: Write `RevealCard.svelte`**

`src/lib/game/components/RevealCard.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";

  let { targetId, guessCount, onnew }: { targetId: string; guessCount: number; onnew: () => void } =
    $props();

  let node = $derived(treeStore.getNode(targetId));
  let lineage = $derived(treeStore.pathToRoot(targetId).slice().reverse());
</script>

<div class="reveal">
  <h2>{node?.name}</h2>
  {#if node?.imageUrl}
    <img src={node.imageUrl} alt={node.name} />
  {/if}
  <p>Found in {guessCount} {guessCount === 1 ? "guess" : "guesses"}.</p>
  {#if node?.wikipediaUrl}
    <a href={node.wikipediaUrl} target="_blank" rel="noopener noreferrer">Wikipedia</a>
  {/if}
  <p class="lineage">
    {#each lineage as id, i (id)}{treeStore.getNode(id)?.name}{#if i < lineage.length - 1} › {/if}{/each}
  </p>
  <button type="button" onclick={onnew}>New round</button>
</div>
```

- [ ] **Step 3: Wire both into `Game.svelte`**

Replace `src/lib/game/components/Game.svelte` with:
```svelte
<script lang="ts">
  import { createGame } from "../gameStore.svelte";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import RevealCard from "./RevealCard.svelte";

  const game = createGame();
  let highlightId = $state<string | null>(null);

  function onguess(id: string) {
    game.guess(id);
  }
</script>

<main class="game">
  <header>
    <h1>Mesozooa</h1>
    <button type="button" onclick={() => game.newRound()}>New round</button>
  </header>

  {#if game.state.status === "won"}
    <RevealCard
      targetId={game.state.target}
      guessCount={game.state.guesses.length}
      onnew={() => game.newRound()}
    />
  {:else}
    <SearchBox {onguess} />
  {/if}

  <WarmestTrail warmestId={game.warmestId} />
  <GuessList guesses={game.state.guesses} onselect={(id) => (highlightId = id)} />
</main>
```

- [ ] **Step 4: Type-check, compile-check, build**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → prior suites still pass.

- [ ] **Step 5: Run the app and verify**

Run: `npm run dev`. Verify: after guesses, the warmest-trail breadcrumb shows the root→warmest-clade path with group sizes and updates as warmth improves; on winning, the reveal card shows the name, image (if any), guess count, a working Wikipedia link, and the full lineage; "New round" resets. (Stop the dev server when done.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/
git commit -m "feat: warmest trail and reveal card"
```

---

### Task 8: Graphical cladogram `TreeView`

**Files:**
- Create: `src/lib/game/components/TreeView.svelte`
- Modify: `src/lib/game/components/Game.svelte`

**Interfaces:**
- Consumes: `treeStore` singleton; `layoutCladogram` (Task 5); `game.revealed`, `game.warmestId`, `game.state.guesses`; the `highlightId` selected by clicking a guess row.
- Produces:
  - `TreeView` (props `revealed: Set<string>`, `warmestPath: Set<string>`, `guessNodes: Map<string, string[]>`, `highlightId: string | null`) — an SVG left-to-right cladogram of the revealed subtree that auto-fits its viewport, emphasizes the warmest path, marks guess-landing nodes, highlights `highlightId`, and on node hover shows which guesses landed there.

- [ ] **Step 1: Write `TreeView.svelte`**

`src/lib/game/components/TreeView.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { layoutCladogram } from "../layout";

  let {
    revealed,
    warmestPath,
    guessNodes,
    highlightId,
  }: {
    revealed: Set<string>;
    warmestPath: Set<string>;
    guessNodes: Map<string, string[]>;
    highlightId: string | null;
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
  <svg class="tree" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMinYMid meet" role="img" aria-label="Cladogram of your guesses">
    {#each layout.edges as e (e.parentId + ">" + e.childId)}
      <path
        class="edge"
        class:warm={warmestPath.has(e.parentId) && warmestPath.has(e.childId)}
        d={edgePath(e.parentId, e.childId)}
        fill="none"
      />
    {/each}

    {#each layout.nodes as n (n.id)}
      {@const node = treeStore.getNode(n.id)}
      {@const landed = guessNodes.get(n.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="node"
        class:warm={warmestPath.has(n.id)}
        class:highlight={n.id === highlightId}
        class:genus={node?.isGenus}
        transform={`translate(${px(n.x)} ${py(n.y)})`}
        onmouseenter={() => (hover = n.id)}
        onmouseleave={() => (hover = null)}
      >
        <circle r={node?.isGenus ? 5 : 3.5} />
        <text x="9" dy="0.32em">
          {node?.name}{#if !node?.isGenus} <tspan class="count">({node?.descendantGenusCount})</tspan>{/if}
        </text>
        {#if hover === n.id && landed}
          <text class="tip" x="9" dy="1.5em">guesses: {landed.join(", ")}</text>
        {/if}
      </g>
    {/each}
  </svg>
{:else}
  <p class="tree-empty">Make a guess to start revealing the tree.</p>
{/if}
```

- [ ] **Step 2: Wire `TreeView` into `Game.svelte`**

Replace `src/lib/game/components/Game.svelte` with:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { createGame } from "../gameStore.svelte";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import RevealCard from "./RevealCard.svelte";
  import TreeView from "./TreeView.svelte";

  const game = createGame();
  let highlightId = $state<string | null>(null);

  function onguess(id: string) {
    game.guess(id);
  }

  // Warmest path = root -> warmest shared clade, as a set for O(1) membership in the tree.
  let warmestPath = $derived(
    game.warmestId ? new Set(treeStore.pathToRoot(game.warmestId)) : new Set<string>(),
  );

  // Map each guess-landing (shared) node -> the guessed genus names that landed there.
  let guessNodes = $derived.by(() => {
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
    <button type="button" onclick={() => game.newRound()}>New round</button>
  </header>

  {#if game.state.status === "won"}
    <RevealCard
      targetId={game.state.target}
      guessCount={game.state.guesses.length}
      onnew={() => game.newRound()}
    />
  {:else}
    <SearchBox {onguess} />
  {/if}

  <WarmestTrail warmestId={game.warmestId} />

  <div class="board">
    <GuessList guesses={game.state.guesses} onselect={(id) => (highlightId = id)} />
    <TreeView
      revealed={game.revealed}
      {warmestPath}
      {guessNodes}
      {highlightId}
    />
  </div>
</main>
```

- [ ] **Step 3: Type-check, compile-check, build**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → all suites pass.

- [ ] **Step 4: Run the app and verify the full slice**

Run: `npm run dev`. Verify: each guess reveals its branch from Dinosauria down to the guessed genus (untouched branches stay absent); the warmest path is emphasized; clicking a guess row highlights its shared node in the tree; hovering a node lists which guesses landed there; the layout re-fits as more branches appear; winning still shows the reveal card. (Stop the dev server when done.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/TreeView.svelte src/lib/game/components/Game.svelte
git commit -m "feat: graphical reveal-as-you-go cladogram TreeView"
```

---

## Notes for Plan 2b / Plan 3 (not implemented here)

- **Plan 2b (game completion):** daily mode + deterministic `dailyAnswer` (seed off `genera-index.json`; pin `dataVersion` timezone before selection, per spec §8 and the foundation review); hints (walk one step down the target's true path from the warmest shared node); 20-guess budget for daily; shareable emoji-grid result; `localStorage` persistence.
- **Plan 3 (reference explorer):** reuses `treeStore`, `search`, and `TreeView`. `TreeView` currently renders only a *revealed* subtree via a `Set` of ids — the explorer will drive it with an expand/collapse-managed reveal set and full-tree navigation. Consider whether interactive pan/zoom (deferred here in favor of auto-fit) is needed once large subtrees are shown.
- **Look-and-feel pass:** all components ship visually minimal by design. The dedicated styling pass owns the warmth color-temperature scale, layout/spacing, typography, and any animation.
