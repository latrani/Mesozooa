# Difficulty Modes — Slice 1: The Tier Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three game rulers — genus count, `branchDepth`, `terminalClade` — read against an explicit *pool* rather than the whole tree, published beside the node's own values so every reference surface keeps true counts. No tiers are exposed yet; the only pool is today's playable set.

**Architecture:** A new pure `src/lib/tree/lens.ts` computes the three quantities for a given pool in two passes (post-order counts, BFS branch depth) and answers `terminalClade` by walking up. `TreeStore` takes an optional pool and exposes `poolCount` / `poolBranchDepth` / `terminalClade`; `engine-core` and `warmth` switch their reads onto the store. `node.descendantGenusCount` and `node.branchDepth` are never written to, so `nodeView`, Explore, `a11y-tree` and `SpineTree` labels are untouched by construction.

**Tech Stack:** TypeScript, Vitest. No new dependencies. Pure logic only — no Svelte components change in this slice.

## Why this slice exists

Design spec: `docs/superpowers/specs/2026-08-29-difficulty-modes-design.md` (§ *The lens model*, § *Counts: two surfaces, two questions*).

A tier cannot be a filter on `playableGenera()`. Warmth ramps on `branchDepth` toward the target's terminal clade, and the clue only unlocks when the warmest MRCA reaches it — so on a 100-genus pool, 39% of targets have no legal guess that reaches their terminal clade, the ramp stalls, and phase 2 never starts. Pool-relative rulers drop that to 0% for every tier. This slice installs the rulers; later slices install the tiers.

## This slice is NOT behavior-neutral for Medium — that is expected

Measured over the 734 current playable genera, switching to pool-relative rulers:

| effect | scale |
|---|---|
| targets whose **terminal clade** moves | 18 / 734 (2%), always rootward |
| targets whose **warmth denominator** changes | 297 / 734 (40%), always shorter by 1–3 |
| targets whose lens terminal clade is degenerate (`branchDepth ≤ 1`) | 1 |

The denominator shrinks because pool-relative `branchDepth` only increments where the *pool*
count narrows, which happens less often than where the full count narrows. Net effect for a
player: on ~40% of Medium targets the warm trail reaches the anchor in one to three fewer steps.
That is the intended direction — the ruler now measures the pool you are actually guessing
from — but it is a live change to the shipping game, so Task 6 pins it down rather than letting
it pass silently.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch violations; run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **One tree, one source of truth** — the lens is a set of derived values over the existing tree. Do NOT build a second tree, and do NOT mutate `TreeNode`.
- **Beside, never on top** — nothing in this slice may assign to `node.descendantGenusCount` or `node.branchDepth`. Those keep meaning *true clade size* and *true narrowing depth* forever; overwriting them would silently convert `nodeView`, the #69 panel, Explore and `a11y-tree` to tier-relative counts.
- **Pool counts are engine-facing; the node's own counts are reference-facing.** Engine reads (`warmestSharedNodeId`, `leafHintActive`, `nextHintRun`, `hintCost`, warmth) take the lens. Display reads that describe a taxon keep the node field.
- Pure logic is TDD-tested. Write the test first, watch it fail, then implement.

---

### Task 1: `createLens` — the three pool-relative rulers

The pure core. Two passes over ~2,200 nodes plus an upward walk; sub-millisecond, so a tier switch can rebuild it rather than shipping three copies of every count.

**Files:**
- Create: `src/lib/tree/lens.ts`
- Create: `src/lib/tree/lens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TreeLens {
    /** pool members at or below this node */
    poolCount(id: string): number;
    /** narrowing edges from root, counting only edges where the POOL count drops */
    branchDepth(id: string): number;
    /** lowest ancestor holding >= 2 pool members; the root if none does */
    terminalClade(id: string): string;
    inPool(id: string): boolean;
    poolIds(): string[];
  }
  export function createLens(tree: TreeData, pool: Iterable<string>): TreeLens;
  ```
- Consumed by: Task 2 (`TreeStore`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tree/lens.test.ts`. Use the existing fixtures — `FIXTURE_RAWS` (Dinosauria/Theropoda/Tyrannosauridae with TR, TB, LO, TC) and `MONO_FIXTURE_RAWS` (the monotypic run above a non-root terminal clade), both from `src/lib/tree/fixture.ts`, assembled exactly as `terminal.test.ts` does:

```ts
import { describe, it, expect } from "vitest";
import { createLens } from "./lens";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
```

Cover, at minimum:

- **counts** — a lens over `["TR", "TB"]` gives `poolCount("TF") === 2`, `poolCount("Q430") === 2`, and `poolCount("TC") === 0` (out of pool).
- **the pool is what counts, not the tree** — over `["TR", "TC"]`, `poolCount("TF") === 1` even though TF holds two genera.
- **`terminalClade` needs two POOL members** — over `["TR", "TC"]`, `terminalClade("TR")` is `"Q430"`, NOT `"TF"`: TF holds only one pool member, so the walk continues up. Contrast with `terminalClade` from `terminal.ts`, which returns `"TF"` for the same genus. This divergence is the whole point of the slice; assert both in one test so the difference is documented.
- **`branchDepth` only counts pool narrowings** — over a pool where a clade's pool count equals its parent's, the edge adds 0.
- **monotypic runs** — using `MONO_FIXTURE_RAWS`, a pool-relative terminal clade skips through the run exactly as `terminalClade` does when every member is in the pool.
- **degenerate pool** — a single-member pool: `terminalClade` returns the root rather than looping or throwing.
- **empty pool** — `poolCount(root) === 0`, `terminalClade(anything)` returns the root. Must not hang.
- **unknown id** — `poolCount("nope") === 0`; do not throw.

Run `npx vitest run src/lib/tree/lens.test.ts` and confirm every test fails for the right reason (module not found).

- [ ] **Step 2: Implement `createLens`**

Create `src/lib/tree/lens.ts`. Mirror the two passes in `assembleTree` (`src/lib/tree/assemble.ts:80-99`) so the shapes stay recognisable — post-order by descending `depth` for counts, BFS from the root for branch depth — but write into local `Map`s, never into the nodes:

```ts
import type { TreeData } from "./types";

export interface TreeLens { /* as above */ }

export function createLens(tree: TreeData, pool: Iterable<string>): TreeLens {
  const inPool = new Set<string>();
  for (const id of pool) if (tree.nodes[id]) inPool.add(id);

  // counts: post-order (deepest first), same shape as assembleTree's pass
  const count = new Map<string, number>();
  const ordered = Object.values(tree.nodes).sort((a, b) => b.depth - a.depth);
  for (const n of ordered) {
    let c = inPool.has(n.id) ? 1 : 0;
    for (const cid of n.childrenIds) c += count.get(cid) ?? 0;
    count.set(n.id, c);
  }

  // branchDepth: BFS from root, +1 only where the POOL count narrows
  const depth = new Map<string, number>([[tree.rootId, 0]]);
  const queue = [tree.rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const parentCount = count.get(id) ?? 0;
    for (const cid of tree.nodes[id].childrenIds) {
      const narrows = (count.get(cid) ?? 0) < parentCount;
      depth.set(cid, depth.get(id)! + (narrows ? 1 : 0));
      queue.push(cid);
    }
  }

  return {
    poolCount: (id) => count.get(id) ?? 0,
    branchDepth: (id) => depth.get(id) ?? 0,
    terminalClade(id) {
      let a = tree.nodes[id]?.parentId ?? null;
      while (a && (count.get(a) ?? 0) <= 1) a = tree.nodes[a].parentId;
      return a ?? tree.rootId;
    },
    inPool: (id) => inPool.has(id),
    poolIds: () => [...inPool],
  };
}
```

Note the `<= 1` in `terminalClade` where `terminal.ts` has `=== 1`: the lens must also skip ancestors holding *zero* pool members, which `terminal.ts` never encounters because every node holds at least the genus itself.

Run the tests; all green.

---

### Task 2: Give `TreeStore` a pool

`TreeStore` becomes the single place the rest of the app reaches the lens, so no caller ever constructs one itself.

**Files:**
- Modify: `src/lib/game/treeStore.ts`
- Modify: `src/lib/game/treeStore.test.ts`

**Interfaces:**
- Produces: `TreeStore` gains `poolCount(id)`, `poolBranchDepth(id)`, `terminalClade(id)`, and `createTreeStore(data, pool?)` where `pool` defaults to the genera flagged `playable`. Existing members are unchanged.
- Consumed by: Tasks 3 and 4.

- [ ] **Step 1: Extend the interface**

In `src/lib/game/treeStore.ts`, add to `TreeStore`:

```ts
  /** pool members at or below this node — the count the ENGINE reasons with. Display code that
      describes a taxon must use node.descendantGenusCount (the true clade size) instead. */
  poolCount(id: string): number;
  /** narrowing edges from root, counting only edges where the pool count drops */
  poolBranchDepth(id: string): number;
  /** lowest ancestor holding >= 2 pool members */
  terminalClade(id: string): string;
```

- [ ] **Step 2: Build the lens in `createTreeStore`**

Add the optional pool parameter, defaulting to today's behavior so every existing call site keeps working:

```ts
export function createTreeStore(data: TreeData, pool?: Iterable<string>): TreeStore {
  const poolIds = pool ?? playableOf(data).map((n) => n.id);
  const lens = createLens(data, poolIds);
  // …
```

Then delegate the three new members to `lens`, and re-point the two existing pool members at it so a store built with an explicit pool is internally consistent:

- `playableGenera()` → `lens.poolIds().map((id) => data.nodes[id])`
- `isPlayable(id)` → `lens.inPool(id)`

Keep `rootCount` reading `data.nodes[data.rootId].descendantGenusCount` — it is reference context, not an engine ruler.

- [ ] **Step 3: Test it**

Extend `src/lib/game/treeStore.test.ts`: a store built with an explicit two-genus pool reports `isPlayable` and `playableGenera` from that pool, not from the `playable` flag; a store built with no pool reproduces today's playable set exactly.

---

### Task 3: Move `engine-core` onto the lens

Four reads of `descendantGenusCount` and one `terminalClade` import.

**Files:**
- Modify: `src/lib/game/engine-core.ts`
- Modify: `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Produces: no signature changes — every touched function already takes `store`.

- [ ] **Step 1: Swap the reads**

In `src/lib/game/engine-core.ts`:

- `warmestSharedNodeId` (lines ~105-107): `store.getNode(bestId)!.descendantGenusCount` → `store.poolCount(bestId)`, and the same for the loop's `count`.
- `leafHintActive` (lines ~124-125): both `warmestCount` and `terminalCount` → `store.poolCount(...)`; `terminalClade(store.data, state.target)` → `store.terminalClade(state.target)`.
- `nextHintRun` (lines ~183, ~188): `deepestCount` and the narrowing test → `store.poolCount(...)`.
- Drop the now-unused `import { terminalClade } from "../tree/terminal";`.

Leave `terminal.ts` in place and exported — Explore and the build still use the true-tree version.

- [ ] **Step 2: Update the tests**

`engine-core.test.ts` builds stores from the fixtures. Where a test's expectation depended on non-pool genera being counted (`LO` in `FIXTURE_RAWS` is a genus but not playable), the pool-relative answer differs — update the expectation and add a comment saying which ruler it is asserting. Add one test that pins the new semantics directly: with a pool excluding a sibling genus, `leafHintActive` becomes true one guess *earlier* than it would under the true-tree count.

---

### Task 4: Move `warmth` onto the lens

**Files:**
- Modify: `src/lib/game/warmth.ts`
- Modify: `src/lib/game/warmth.test.ts`
- Modify: `src/lib/game/dailyStore.svelte.ts` (2 call sites: `loadOrCreate`, the `$derived` provider)
- Modify: `src/lib/game/practiceStore.svelte.ts` (1)
- Modify: `src/gallery/fixtures.ts` (2) and `src/gallery/Gallery.svelte` (1)
- Modify: `src/lib/game/engine-core.test.ts` (3), `src/lib/game/specimen-view.test.ts` (1), `src/lib/game/chip-view.test.ts` (1)

**Interfaces:**
- Produces: `warmthForTarget(store: TreeStore, targetId: string, anchor?: number)` — takes the store rather than `TreeData`, because it now needs the lens. `createTwoPhaseWarmth` keeps taking plain numbers plus a `branchDepthOf` lookup (Step 1).
- Breaking: **all 7 call sites** pass `treeStore.data` or a raw tree today and must pass a store. The two view tests (`specimen-view.test.ts:75`, `chip-view.test.ts:12`) pass a bare assembled tree, so they need a `createTreeStore(tree)` wrapper — easy to miss, and `tsc` is what catches it.

- [ ] **Step 1: Re-point `warmthForTarget`**

```ts
export function warmthForTarget(store: TreeStore, targetId: string, anchor?: number): WarmthProvider {
  const terminalId = store.terminalClade(targetId);
  return createTwoPhaseWarmth({
    targetId,
    terminalBranchDepth: store.poolBranchDepth(terminalId),
    anchor,
  });
}
```

`createTwoPhaseWarmth` reads `node.branchDepth` off the MRCA node it is handed. That must become pool-relative too or the ramp compares two different rulers. Change its `warmth(node)` to take an id and ask the store — or, to keep it a pure function of numbers, have the provider close over the store:

```ts
  warmth(node: TreeNode): Warmth {
    if (node.id === opts.targetId) return { fraction: 1 };
    const bd = opts.branchDepthOf(node.id);
    if (bd >= opts.terminalBranchDepth) return { fraction: anchor };
    return { fraction: anchor * (bd / denom) };
  },
```

with `branchDepthOf` supplied by `warmthForTarget` as `store.poolBranchDepth`. Keep the `Math.max(1, …)` denominator guard — one Medium target has a degenerate lens terminal clade and relies on it.

- [ ] **Step 2: Update both stores**

`dailyStore.svelte.ts` (two call sites: `loadOrCreate`'s `refreshWarmth` and the `$derived` provider) and `practiceStore.svelte.ts` — pass `treeStore`, not `treeStore.data`.

- [ ] **Step 3: Update `warmth.test.ts`**

Tests construct providers directly with a `terminalBranchDepth`; those stay. Add a test that `warmthForTarget` over a pool that excludes intermediate genera yields a *shorter* runway than the same target over the full pool — the 40% effect, asserted once.

---

### Task 5: Confirm the reference surfaces did not move

Cheap, and it is the constraint most likely to be violated silently by a later change.

**Files:**
- Create: `src/lib/game/reference-counts.test.ts`

- [ ] **Step 1: Pin `nodeView` to true counts**

Assert that `nodeView(node).note` for a clade reports `node.descendantGenusCount` — the true clade size — even when the store's pool excludes most of that clade's genera. This is the executable form of *beside, never on top*: if someone later makes the lens write through to the node, this test fails.

- [ ] **Step 2: Grep-check the invariant**

Confirm no assignment to either field outside `assemble.ts`:

```
grep -rn "descendantGenusCount\s*=\|\.branchDepth\s*=" src --include=*.ts --include=*.svelte
```

Only `src/lib/tree/assemble.ts` may appear.

---

### Task 6: Characterize the Medium change

The 40% denominator shift is intended, but it should be a recorded number rather than a surprise in playtest.

**Files:**
- Create: `scripts/lens-impact.ts` (a reporting script, not a build step)

- [ ] **Step 1: Write the report**

Over the committed `tree.json` and the current playable pool, print: how many targets change terminal clade, how many change warmth denominator and by how much, and how many have a degenerate lens terminal clade. Expected on today's data: **18**, **297** (all −1 to −3), and **1**.

- [ ] **Step 2: Eyeball it in the app**

`npm run dev`, play a Practice round, confirm the warm trail still climbs monotonically and the clue still unlocks at the anchor. Then open `/gallery.html` and check the warmth states render unchanged — the ramp's *shape* is the same, only its length moved.

---

## Verification

- [ ] `npx vitest run` — all green
- [ ] `npx tsc --noEmit` — clean (watch for `import type` on `TreeStore`/`TreeLens`)
- [ ] `npx svelte-check` — clean
- [ ] `npm run build` — succeeds
- [ ] `scripts/lens-impact.ts` prints 18 / 297 / 1
- [ ] Practice round played end-to-end: warmth climbs, clue unlocks, win state reached

## What this slice deliberately does NOT do

- No tiers, no tier setting, no UI. The only pool is today's playable set.
- No change to `tree.json` or the build — the tier ordinal lands in slice 2.
- No change to `prunePlayable`'s degenerate gate, which still uses true-tree `branchDepth`. It is circular by nature (the pool is what it is computing) and stays as-is until slice 2 decides the per-tier story.
- No change to any display string.

## The remaining slices

Each gets its own spec-derived plan when this one lands.

2. **Tier data + pools** — `EASY_SET` (the curated 100, spec appendix) resolved by name at build with fail-closed warnings and registered as pins so Easy ⊆ Medium holds; Hard defined as `Medium ∪ {every genus with good data}` so Medium ⊆ Hard cannot break; a tier ordinal baked per genus; build report and the Easy curation gate (terminal clade > 10 **and** clue not unique within it).
3. **Tier setting + UI** — the control in the header, collapsing to the board status row on phone; per-tier persistence keys so switching mid-game is non-destructive in both lanes; `gradeByPlayable` follows the current game's tier.
4. **Daily per tier** — three answers a day derived in tier order so no genus is the answer twice in one date; stats v2 with per-tier streaks and v1 migrating into Medium; tier badge in the share headline; per-tier `daily-calendar.json`.
5. **The anchor note** — "513 candidate specimens" on the answer card at the anchor, ticking down as pool members are guessed; the count as an `exploreAround` handoff with hover copy.
