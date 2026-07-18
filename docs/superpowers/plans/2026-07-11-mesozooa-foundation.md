# Mesozooa Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Mesozooa project and produce the committed cladogram data files (`tree.json`, `genera-index.json`) that every later feature depends on.

**Architecture:** A Vite + Svelte + TypeScript static app scaffold, plus a pure, framework-agnostic tree library (types, `pathToRoot`, `mrca`, tree assembly, resolution filter) unit-tested with a tiny fixture, plus two Node scripts that harvest Wikidata at build time and bake the pure library's output to JSON. This plan produces no game UI — only the scaffold, the tested tree library, and the data.

**Tech Stack:** Node 20+ (dev on 25), TypeScript, Vite 6, Svelte 5, Vitest 2, `tsx` for running TS scripts, Wikidata SPARQL endpoint.

## Global Constraints

- Fully static; **no backend and no runtime network calls for game data**. Wikidata is queried only by build scripts.
- Root taxon: **Dinosauria = `Q430`**. Prune the modern-bird crown **Neornithes = `Q19163`**.
- Rank QIDs: **genus = `Q34740`**, **family = `Q35409`**.
- Wikidata SPARQL endpoint: `https://query.wikidata.org/sparql`; every request MUST send a descriptive `User-Agent` header (WDQS blocks blank UAs).
- All QIDs stored bare (e.g. `Q430`), stripped of the `http://www.wikidata.org/entity/` prefix.
- Reference pool = all Mesozoic genera (~2,074). Playable pool = genera resolved into a family AND having an English Wikipedia article (~800). `playable` is a flag on genus nodes; it does NOT remove them from the tree.
- Warmth number = a node's `descendantGenusCount`.
- Data files are committed to the repo under `src/data/`.

---

### Task 1: Project scaffold (Vite + Svelte + TS + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `src/App.svelte`, `src/vite-env.d.ts`, `.gitignore`
- Test: `src/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` (Vitest) and `npm run dev` (Vite) for all later tasks.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "mesozooa",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "fetch:wikidata": "tsx scripts/fetch-wikidata.ts",
    "build:data": "tsx scripts/build-tree.ts"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tsconfig/svelte": "^5.0.4",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({ plugins: [svelte()] });
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node", include: ["src/**/*.test.ts"] },
});
```

`src/vite-env.d.ts`:
```ts
/// <reference types="svelte" />
/// <reference types="vite/client" />
```

`.gitignore`:
```
node_modules
dist
data/raw-taxa.json
```

- [ ] **Step 3: Write minimal app shell**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Mesozooa</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

`src/App.svelte`:
```svelte
<h1>Mesozooa</h1>
```

`src/main.ts`:
```ts
import { mount } from "svelte";
import App from "./App.svelte";

export default mount(App, { target: document.getElementById("app")! });
```

- [ ] **Step 4: Write the sanity test**

`src/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Install and run**

Run: `npm install && npm test`
Expected: install succeeds; Vitest reports 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Svelte + TS + Vitest"
```

---

### Task 2: Tree types and shared fixture

**Files:**
- Create: `src/lib/tree/types.ts`, `src/lib/tree/fixture.ts`

**Interfaces:**
- Produces:
  - `RawTaxon = { id: string; name: string; rankId: string | null; parentId: string | null; imageUrl?: string; wikipediaUrl?: string }`
  - `TreeNode = { id: string; name: string; rankId: string | null; parentId: string | null; childrenIds: string[]; depth: number; descendantGenusCount: number; isGenus: boolean; playable: boolean; imageUrl?: string; wikipediaUrl?: string }`
  - `TreeData = { dataVersion: string; rootId: string; nodes: Record<string, TreeNode> }`
  - Constants `DINOSAURIA="Q430"`, `NEORNITHES="Q19163"`, `RANK_GENUS="Q34740"`, `RANK_FAMILY="Q35409"`.
  - `FIXTURE_RAWS: RawTaxon[]` — the small hand-built taxonomy used by all tree tests.

- [ ] **Step 1: Write the types file**

`src/lib/tree/types.ts`:
```ts
export const DINOSAURIA = "Q430";
export const NEORNITHES = "Q19163";
export const RANK_GENUS = "Q34740";
export const RANK_FAMILY = "Q35409";

export interface RawTaxon {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  imageUrl?: string;
  wikipediaUrl?: string;
}

export interface TreeNode {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  childrenIds: string[];
  depth: number;
  descendantGenusCount: number;
  isGenus: boolean;
  playable: boolean;
  imageUrl?: string;
  wikipediaUrl?: string;
}

export interface TreeData {
  dataVersion: string;
  rootId: string;
  nodes: Record<string, TreeNode>;
}
```

- [ ] **Step 2: Write the fixture**

`src/lib/tree/fixture.ts`:
```ts
import { RawTaxon, RANK_GENUS, RANK_FAMILY } from "./types";

const CLADE = "Q713623"; // "clade"

// Dinosauria
//  ├─ Theropoda
//  │   ├─ Tyrannosauridae (family)
//  │   │   ├─ Tyrannosaurus (genus, wiki)   -> playable
//  │   │   └─ Tarbosaurus (genus, wiki)     -> playable
//  │   └─ Loosey (genus, wiki, NO family)   -> NOT playable
//  ├─ Ornithischia
//  │   └─ Ceratopsidae (family)
//  │       └─ Triceratops (genus, wiki)     -> playable
//  └─ Neornithes (to be pruned)
//      └─ Passer (genus, wiki)              -> pruned away
export const FIXTURE_RAWS: RawTaxon[] = [
  { id: "Q430", name: "Dinosauria", rankId: CLADE, parentId: null },
  { id: "T", name: "Theropoda", rankId: CLADE, parentId: "Q430" },
  { id: "TF", name: "Tyrannosauridae", rankId: RANK_FAMILY, parentId: "T" },
  { id: "TR", name: "Tyrannosaurus", rankId: RANK_GENUS, parentId: "TF",
    imageUrl: "trex.jpg", wikipediaUrl: "https://en.wikipedia.org/wiki/Tyrannosaurus" },
  { id: "TB", name: "Tarbosaurus", rankId: RANK_GENUS, parentId: "TF",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tarbosaurus" },
  { id: "LO", name: "Loosey", rankId: RANK_GENUS, parentId: "T",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Loosey" },
  { id: "O", name: "Ornithischia", rankId: CLADE, parentId: "Q430" },
  { id: "CF", name: "Ceratopsidae", rankId: RANK_FAMILY, parentId: "O" },
  { id: "TC", name: "Triceratops", rankId: RANK_GENUS, parentId: "CF",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Triceratops" },
  { id: "Q19163", name: "Neornithes", rankId: CLADE, parentId: "Q430" },
  { id: "PA", name: "Passer", rankId: RANK_GENUS, parentId: "Q19163",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Passer" },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tree/types.ts src/lib/tree/fixture.ts
git commit -m "feat: tree types and test fixture"
```

---

### Task 3: `pruneSubtree` and `assembleTree`

**Files:**
- Create: `src/lib/tree/assemble.ts`, `src/lib/tree/assemble.test.ts`

**Interfaces:**
- Consumes: `RawTaxon`, `TreeData`, `TreeNode`, `RANK_GENUS` from `./types`; `FIXTURE_RAWS` from `./fixture`.
- Produces:
  - `pruneSubtree(raws: RawTaxon[], removeRootId: string): RawTaxon[]` — returns `raws` with `removeRootId` and all its descendants removed.
  - `assembleTree(raws: RawTaxon[], rootId: string, dataVersion: string): TreeData` — builds the rooted tree keeping only nodes on a `root → genus` path, computing `childrenIds`, `depth`, `descendantGenusCount`, and `isGenus`. `playable` is initialized `false` (set in Task 5).

- [ ] **Step 1: Write the failing test**

`src/lib/tree/assemble.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pruneSubtree, assembleTree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

describe("pruneSubtree", () => {
  it("removes the node and all its descendants", () => {
    const kept = pruneSubtree(FIXTURE_RAWS, NEORNITHES).map((r) => r.id);
    expect(kept).not.toContain("Q19163");
    expect(kept).not.toContain("PA");
    expect(kept).toContain("TR");
  });
});

describe("assembleTree", () => {
  const tree = assembleTree(
    pruneSubtree(FIXTURE_RAWS, NEORNITHES),
    DINOSAURIA,
    "test",
  );

  it("keeps only in-scope nodes", () => {
    expect(Object.keys(tree.nodes).sort()).toEqual(
      ["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"].sort(),
    );
  });

  it("links children", () => {
    expect(tree.nodes["TF"].childrenIds.sort()).toEqual(["TB", "TR"]);
    expect(tree.nodes["Q430"].childrenIds.sort()).toEqual(["O", "T"]);
  });

  it("computes depth from the root", () => {
    expect(tree.nodes["Q430"].depth).toBe(0);
    expect(tree.nodes["T"].depth).toBe(1);
    expect(tree.nodes["TR"].depth).toBe(3);
    expect(tree.nodes["LO"].depth).toBe(2);
  });

  it("counts descendant genera", () => {
    expect(tree.nodes["Q430"].descendantGenusCount).toBe(4);
    expect(tree.nodes["T"].descendantGenusCount).toBe(3);
    expect(tree.nodes["TF"].descendantGenusCount).toBe(2);
    expect(tree.nodes["CF"].descendantGenusCount).toBe(1);
  });

  it("flags genera", () => {
    expect(tree.nodes["TR"].isGenus).toBe(true);
    expect(tree.nodes["TF"].isGenus).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble`
Expected: FAIL — `pruneSubtree`/`assembleTree` not exported.

- [ ] **Step 3: Write the implementation**

`src/lib/tree/assemble.ts`:
```ts
import { RawTaxon, TreeData, TreeNode, RANK_GENUS } from "./types";

export function pruneSubtree(raws: RawTaxon[], removeRootId: string): RawTaxon[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of raws) {
    if (r.parentId) (childrenOf.get(r.parentId) ?? childrenOf.set(r.parentId, []).get(r.parentId)!).push(r.id);
  }
  const remove = new Set<string>([removeRootId]);
  const stack = [removeRootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenOf.get(id) ?? []) {
      if (!remove.has(c)) { remove.add(c); stack.push(c); }
    }
  }
  return raws.filter((r) => !remove.has(r.id));
}

export function assembleTree(
  raws: RawTaxon[],
  rootId: string,
  dataVersion: string,
): TreeData {
  const byId = new Map(raws.map((r) => [r.id, r]));

  // Keep only nodes on a root -> genus path: walk each genus up to the root.
  const keep = new Set<string>();
  for (const r of raws) {
    if (r.rankId !== RANK_GENUS) continue;
    const chain: string[] = [];
    let cur: RawTaxon | undefined = r;
    let reachedRoot = false;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur.id);
      if (cur.id === rootId) { reachedRoot = true; break; }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (reachedRoot) for (const id of chain) keep.add(id);
  }

  const nodes: Record<string, TreeNode> = {};
  for (const id of keep) {
    const r = byId.get(id)!;
    nodes[id] = {
      id: r.id,
      name: r.name,
      rankId: r.rankId,
      parentId: id === rootId ? null : r.parentId,
      childrenIds: [],
      depth: 0,
      descendantGenusCount: 0,
      isGenus: r.rankId === RANK_GENUS,
      playable: false,
      imageUrl: r.imageUrl,
      wikipediaUrl: r.wikipediaUrl,
    };
  }
  for (const n of Object.values(nodes)) {
    if (n.parentId && nodes[n.parentId]) nodes[n.parentId].childrenIds.push(n.id);
  }

  // Depth: BFS from root.
  const queue: string[] = [rootId];
  nodes[rootId].depth = 0;
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of nodes[id].childrenIds) {
      nodes[c].depth = nodes[id].depth + 1;
      queue.push(c);
    }
  }

  // descendantGenusCount: post-order (deepest first).
  const ordered = Object.values(nodes).sort((a, b) => b.depth - a.depth);
  for (const n of ordered) {
    let count = n.isGenus ? 1 : 0;
    for (const c of n.childrenIds) count += nodes[c].descendantGenusCount;
    n.descendantGenusCount = count;
  }

  return { dataVersion, rootId, nodes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assemble`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/assemble.ts src/lib/tree/assemble.test.ts
git commit -m "feat: prune and assemble the cladogram tree"
```

---

### Task 4: `pathToRoot` and `mrca`

**Files:**
- Create: `src/lib/tree/mrca.ts`, `src/lib/tree/mrca.test.ts`

**Interfaces:**
- Consumes: `TreeData` from `./types`; `assembleTree`, `pruneSubtree` and `FIXTURE_RAWS` for tests.
- Produces:
  - `pathToRoot(tree: TreeData, id: string): string[]` — node id up to and including the root.
  - `mrca(tree: TreeData, a: string, b: string): string` — id of the most-recent common ancestor node.

- [ ] **Step 1: Write the failing test**

`src/lib/tree/mrca.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pathToRoot, mrca } from "./mrca";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");

describe("pathToRoot", () => {
  it("walks node to root inclusive", () => {
    expect(pathToRoot(tree, "TR")).toEqual(["TR", "TF", "T", "Q430"]);
  });
});

describe("mrca", () => {
  it("finds the shared clade of two genera", () => {
    expect(mrca(tree, "TR", "TB")).toBe("TF"); // Tyrannosauridae
    expect(mrca(tree, "TR", "LO")).toBe("T"); // Theropoda
    expect(mrca(tree, "TR", "TC")).toBe("Q430"); // Dinosauria
  });
  it("is identity for the same node", () => {
    expect(mrca(tree, "TR", "TR")).toBe("TR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mrca`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/tree/mrca.ts`:
```ts
import { TreeData } from "./types";

export function pathToRoot(tree: TreeData, id: string): string[] {
  const path: string[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  return path;
}

export function mrca(tree: TreeData, a: string, b: string): string {
  const ancestorsOfA = new Set(pathToRoot(tree, a));
  for (const id of pathToRoot(tree, b)) {
    if (ancestorsOfA.has(id)) return id;
  }
  return tree.rootId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mrca`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/mrca.ts src/lib/tree/mrca.test.ts
git commit -m "feat: pathToRoot and mrca over the tree"
```

---

### Task 5: Resolution filter (`markPlayable`)

**Files:**
- Create: `src/lib/tree/playable.ts`, `src/lib/tree/playable.test.ts`

**Interfaces:**
- Consumes: `TreeData`, `RANK_FAMILY` from `./types`; `pathToRoot` from `./mrca`.
- Produces:
  - `markPlayable(tree: TreeData): void` — mutates the tree, setting `playable = true` on a genus iff it has an ancestor of rank family AND a `wikipediaUrl`. Returns nothing.
  - `playableGenera(tree: TreeData): TreeNode[]` — the genera with `playable === true`.

- [ ] **Step 1: Write the failing test**

`src/lib/tree/playable.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { markPlayable, playableGenera } from "./playable";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);

describe("markPlayable", () => {
  it("marks family-resolved genera with articles playable", () => {
    expect(tree.nodes["TR"].playable).toBe(true);
    expect(tree.nodes["TB"].playable).toBe(true);
    expect(tree.nodes["TC"].playable).toBe(true);
  });
  it("excludes genera lacking a family ancestor", () => {
    expect(tree.nodes["LO"].playable).toBe(false); // no family, directly under Theropoda
  });
  it("never marks non-genus nodes", () => {
    expect(tree.nodes["TF"].playable).toBe(false);
  });
  it("playableGenera returns exactly the playable set", () => {
    expect(playableGenera(tree).map((n) => n.id).sort()).toEqual(["TB", "TC", "TR"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- playable`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/tree/playable.ts`:
```ts
import { TreeData, TreeNode, RANK_FAMILY } from "./types";
import { pathToRoot } from "./mrca";

function hasFamilyAncestor(tree: TreeData, id: string): boolean {
  return pathToRoot(tree, id)
    .slice(1) // exclude self
    .some((aid) => tree.nodes[aid]?.rankId === RANK_FAMILY);
}

export function markPlayable(tree: TreeData): void {
  for (const n of Object.values(tree.nodes)) {
    n.playable =
      n.isGenus && !!n.wikipediaUrl && hasFamilyAncestor(tree, n.id);
  }
}

export function playableGenera(tree: TreeData): TreeNode[] {
  return Object.values(tree.nodes).filter((n) => n.playable);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- playable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat: resolution filter for the playable pool"
```

---

### Task 6: Wikidata SPARQL client

**Files:**
- Create: `scripts/wikidata.ts`, `scripts/wikidata.test.ts`

**Interfaces:**
- Produces:
  - `qid(uri: string): string` — strips the entity prefix, returning the bare QID.
  - `sparql(query: string): Promise<Record<string, string | undefined>[]>` — POSTs a query, returns one flat object per row mapping variable name → value string (missing optionals omitted). Sends the required User-Agent and retries once on HTTP 429/5xx.

- [ ] **Step 1: Write the failing test (pure helper only)**

`scripts/wikidata.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { qid } from "./wikidata";

describe("qid", () => {
  it("strips the entity prefix", () => {
    expect(qid("http://www.wikidata.org/entity/Q430")).toBe("Q430");
  });
  it("passes through a bare id", () => {
    expect(qid("Q430")).toBe("Q430");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wikidata`
Expected: FAIL — `qid` not exported.

- [ ] **Step 3: Write the implementation**

`scripts/wikidata.ts`:
```ts
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Mesozooa/0.1 (https://github.com/; dinosaur cladistics game)";

export function qid(uri: string): string {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : uri;
}

export async function sparql(
  query: string,
): Promise<Record<string, string | undefined>[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": UA,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`SPARQL ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.results.bindings.map((row: Record<string, { value: string }>) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) out[k] = v.value;
      return out;
    });
  }
  throw new Error("SPARQL retries exhausted");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wikidata`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/wikidata.ts scripts/wikidata.test.ts
git commit -m "feat: Wikidata SPARQL client"
```

---

### Task 7: Fetch script → `data/raw-taxa.json`

**Files:**
- Create: `scripts/fetch-wikidata.ts`, `data/.gitkeep`

**Interfaces:**
- Consumes: `sparql`, `qid` from `./wikidata`; `pruneSubtree`, `assembleTree` from `../src/lib/tree/assemble`; `RawTaxon`, constants from `../src/lib/tree/types`.
- Produces: writes `data/raw-taxa.json` = `RawTaxon[]` (in-scope, enriched). Not imported by the app; consumed by Task 8.

**Approach:** Phase 1 pulls the light structural edge list (id, parent, rank) for all Dinosauria descendants, paginated. We then prune Neornithes and reduce to root→genus nodes (reusing the pure lib) so Phase 2 only enriches the ~few-thousand in-scope nodes with label, image, and English Wikipedia URL.

- [ ] **Step 1: Write the script**

`scripts/fetch-wikidata.ts`:
```ts
import { writeFile, mkdir } from "node:fs/promises";
import { sparql, qid } from "./wikidata";
import { pruneSubtree, assembleTree } from "../src/lib/tree/assemble";
import { RawTaxon, DINOSAURIA, NEORNITHES } from "../src/lib/tree/types";

const PAGE = 10000;

async function fetchStructure(): Promise<RawTaxon[]> {
  const raws: RawTaxon[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sparql(`
      SELECT ?taxon ?parent ?rank WHERE {
        ?taxon wdt:P171 ?parent .
        ?taxon wdt:P171* wd:${DINOSAURIA} .
        OPTIONAL { ?taxon wdt:P105 ?rank }
      } ORDER BY ?taxon LIMIT ${PAGE} OFFSET ${offset}`);
    for (const r of rows) {
      raws.push({
        id: qid(r.taxon!),
        name: qid(r.taxon!), // filled in Phase 2
        rankId: r.rank ? qid(r.rank) : null,
        parentId: qid(r.parent!),
      });
    }
    console.log(`structure: ${raws.length} rows (offset ${offset})`);
    if (rows.length < PAGE) break;
  }
  // The root itself has parents outside Dinosauria; ensure it exists with no parent.
  if (!raws.some((r) => r.id === DINOSAURIA)) {
    raws.push({ id: DINOSAURIA, name: DINOSAURIA, rankId: null, parentId: null });
  }
  return raws;
}

async function enrich(ids: string[], byId: Map<string, RawTaxon>): Promise<void> {
  const BATCH = 400;
  for (let i = 0; i < ids.length; i += BATCH) {
    const values = ids.slice(i, i + BATCH).map((id) => `wd:${id}`).join(" ");
    const rows = await sparql(`
      SELECT ?taxon ?taxonLabel ?img ?article WHERE {
        VALUES ?taxon { ${values} }
        OPTIONAL { ?taxon wdt:P18 ?img }
        OPTIONAL { ?article schema:about ?taxon ; schema:isPartOf <https://en.wikipedia.org/> }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`);
    for (const r of rows) {
      const node = byId.get(qid(r.taxon!));
      if (!node) continue;
      if (r.taxonLabel) node.name = r.taxonLabel;
      if (r.img) node.imageUrl = r.img;
      if (r.article) node.wikipediaUrl = r.article;
    }
    console.log(`enriched ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
}

async function main() {
  const structure = await fetchStructure();
  const pruned = pruneSubtree(structure, NEORNITHES);
  // Reduce to in-scope nodes (root -> genus paths) before enrichment.
  const scoped = assembleTree(pruned, DINOSAURIA, "structural");
  const scopedIds = Object.keys(scoped.nodes);
  const byId = new Map(pruned.map((r) => [r.id, r]));
  const inScope = scopedIds.map((id) => byId.get(id)!).filter(Boolean);
  await enrich(scopedIds, new Map(inScope.map((r) => [r.id, r])));

  await mkdir("data", { recursive: true });
  await writeFile("data/raw-taxa.json", JSON.stringify(inScope, null, 0));
  console.log(`wrote data/raw-taxa.json (${inScope.length} taxa)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Create `data/.gitkeep`**

Run: `mkdir -p data && touch data/.gitkeep`
(`data/raw-taxa.json` is gitignored per Task 1; the built JSON lives in `src/data/`.)

- [ ] **Step 3: Run the fetch (network smoke test)**

Run: `npm run fetch:wikidata`
Expected: completes without error; final line reports a taxa count in the low thousands (sanity: > 1,500). If WDQS times out on a page, re-run (the client retries; pagination resumes from scratch but is idempotent).

- [ ] **Step 4: Verify the output shape**

Run: `node -e "const d=require('./data/raw-taxa.json'); console.log('taxa', d.length); console.log('genera', d.filter(x=>x.rankId==='Q34740').length); console.log('with wiki', d.filter(x=>x.wikipediaUrl).length)"`
Expected: `taxa` in the low thousands; `genera` ≈ 1,800–2,100; `with wiki` well over 1,000.

- [ ] **Step 5: Commit (script only; raw JSON is gitignored)**

```bash
git add scripts/fetch-wikidata.ts data/.gitkeep
git commit -m "feat: fetch dinosaur taxa from Wikidata"
```

---

### Task 8: Build script → committed `src/data/tree.json` + `genera-index.json`

**Files:**
- Create: `scripts/build-tree.ts`, `src/data/README.md`

**Interfaces:**
- Consumes: `RawTaxon`, constants from `../src/lib/tree/types`; `pruneSubtree`, `assembleTree` from `../src/lib/tree/assemble`; `markPlayable`, `playableGenera` from `../src/lib/tree/playable`.
- Produces (committed):
  - `src/data/tree.json` = `TreeData`.
  - `src/data/genera-index.json` = `{ id: string; name: string }[]` for the playable pool (autocomplete source in Plan 2).

- [ ] **Step 1: Write the build script**

`scripts/build-tree.ts`:
```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pruneSubtree, assembleTree } from "../src/lib/tree/assemble";
import { markPlayable, playableGenera } from "../src/lib/tree/playable";
import { RawTaxon, DINOSAURIA, NEORNITHES } from "../src/lib/tree/types";

async function main() {
  const raws: RawTaxon[] = JSON.parse(await readFile("data/raw-taxa.json", "utf8"));
  const dataVersion = new Date().toISOString().slice(0, 10);

  const tree = assembleTree(pruneSubtree(raws, NEORNITHES), DINOSAURIA, dataVersion);
  markPlayable(tree);

  const genera = Object.values(tree.nodes).filter((n) => n.isGenus);
  const playable = playableGenera(tree)
    .map((n) => ({ id: n.id, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  await mkdir("src/data", { recursive: true });
  await writeFile("src/data/tree.json", JSON.stringify(tree));
  await writeFile("src/data/genera-index.json", JSON.stringify(playable));

  // Data-quality report.
  console.log("=== Mesozooa data build ===");
  console.log("dataVersion:      ", dataVersion);
  console.log("total nodes:      ", Object.keys(tree.nodes).length);
  console.log("genera (all):     ", genera.length);
  console.log("playable genera:  ", playable.length);
  console.log("genera w/o image: ", genera.filter((n) => !n.imageUrl).length);
  console.log("root count:       ", tree.nodes[DINOSAURIA].descendantGenusCount);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Write `src/data/README.md`**

```markdown
# Generated data

Do not edit by hand. Regenerate with:

    npm run fetch:wikidata   # -> data/raw-taxa.json (gitignored)
    npm run build:data       # -> src/data/tree.json, src/data/genera-index.json

`tree.json` is the full Mesozoic cladogram (reference pool). `genera-index.json`
is the playable pool for autocomplete. See docs/superpowers/specs for design.
```

- [ ] **Step 3: Run the build**

Run: `npm run build:data`
Expected: report prints; `playable genera` ≈ 800 (target); `genera (all)` ≈ 2,000; files written.

- [ ] **Step 4: Verify the artifacts**

Run: `node -e "const t=require('./src/data/tree.json'); const g=require('./src/data/genera-index.json'); console.log('nodes',Object.keys(t.nodes).length,'playable',g.length); console.log('root warmth',t.nodes.Q430.descendantGenusCount)"`
Expected: nodes in the low thousands; `playable` ≈ 800; `root warmth` = total genera count.

- [ ] **Step 5: Commit the data**

```bash
git add scripts/build-tree.ts src/data/tree.json src/data/genera-index.json src/data/README.md
git commit -m "feat: build committed cladogram data from Wikidata"
```

---

## Notes for Plan 2 / Plan 3 (not implemented here)

- The daily-answer stability concern (spec §8) is a **game** concern: seed the daily off
  `genera-index.json` (already sorted by name), and snapshot the ordered list per
  `dataVersion` if reproducibility of past dailies is required.
- The `WarmthProvider` interface, autocomplete `search`, `TreeView` component, and game
  engine are Plan 2. They consume `tree.json` (via `treeStore`) and `mrca`/`pathToRoot`
  from this plan.
- The reference explorer (Plan 3) consumes the same `tree.json` and `TreeView`.
