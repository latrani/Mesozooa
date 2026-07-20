# Two-Phase Warmth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace count-based warmth (which lies on a bushy tree) with a two-phase, spine-depth model: ramp to a 0.9 anchor as you reach the target's terminal clade, then flat until solved.

**Architecture:** Add a precomputed `branchDepth` (monotypic-collapsed depth) to every tree node. Warmth becomes `f(branchDepth(MRCA), branchDepth(terminalClade))` via a new target-aware `WarmthProvider`. Prune the 16 degenerate targets whose terminal clade has `branchDepth <= 1`. Delete pre-clue-mechanic cruft. Full design: `docs/superpowers/specs/2026-07-19-warmth-spine-depth-design.md`.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for pure logic; committed JSON data built by `scripts/build-tree.ts`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does not catch this; run `npx tsc --noEmit` before committing.
- Pure logic is TDD-tested (Vitest). Svelte components are validated by `npm run build` + `npx svelte-check`.
- No em-dashes in user-facing UI copy (commas/parens instead). Fine in code comments.
- `build:data` regenerates ALL committed data from gitignored machine-local raws. NEVER run it without confirming the raws are current, and verify the diff is surgical (Task 3).
- One tree, one source of truth: warmth is always a pointer to a tree node; do not add a parallel representation.
- Warmth ordering is unchanged (count and depth are co-monotonic on the target's spine); only the color mapping changes.

---

### Task 1: Add `branchDepth` to the tree

**Files:**
- Modify: `src/lib/tree/types.ts` (TreeNode interface)
- Modify: `src/lib/tree/assemble.ts` (compute branchDepth in `assembleTree`)
- Test: `src/lib/tree/assemble.test.ts` (add cases; create if absent)

**Interfaces:**
- Produces: `TreeNode.branchDepth: number` — count of real narrowing edges from root (monotypic runs, where `descendantGenusCount` is unchanged from parent, add 0).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tree/assemble.test.ts` (uses `MONO_FIXTURE_RAWS`, whose counts are MR=4, B1=MA=MB=3, SA=2 — a monotypic run B1→MA→MB above terminal clade SA):

```ts
import { describe, it, expect } from "vitest";
import { assembleTree } from "./assemble";
import { MONO_FIXTURE_RAWS } from "./fixture";

describe("assembleTree branchDepth", () => {
  it("collapses monotypic runs (unchanged genus count adds 0 depth)", () => {
    const tree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
    const bd = (id: string) => tree.nodes[id].branchDepth;
    expect(bd("MR")).toBe(0);          // root
    expect(bd("B1")).toBe(1);          // 3 < 4: a real narrowing
    expect(bd("MA")).toBe(1);          // 3 == 3: monotypic, no step
    expect(bd("MB")).toBe(1);          // 3 == 3: monotypic, no step
    expect(bd("SA")).toBe(2);          // 2 < 3: a real narrowing
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tree/assemble.test.ts -t branchDepth`
Expected: FAIL — `branchDepth` is `undefined` (property missing).

- [ ] **Step 3: Add the field to TreeNode**

In `src/lib/tree/types.ts`, add to the `TreeNode` interface, right after `depth: number;`:

```ts
  depth: number;
  branchDepth: number; // narrowing edges from root (monotypic runs collapsed); warmth ruler
```

- [ ] **Step 4: Initialize and compute it in `assembleTree`**

In `src/lib/tree/assemble.ts`: in the node-literal that builds each node (where `depth: 0,` is set), add `branchDepth: 0,` immediately after. Then, after the `descendantGenusCount` post-order block (right before `return { dataVersion, rootId, nodes };`), add:

```ts
  // branchDepth: BFS from root, incremented only on a real narrowing (count drops from parent).
  // Monotypic runs (count unchanged) add 0, matching revealedNodeIds' narrowing test.
  const bfs: string[] = [rootId];
  nodes[rootId].branchDepth = 0;
  while (bfs.length) {
    const id = bfs.shift()!;
    for (const c of nodes[id].childrenIds) {
      const narrows = nodes[c].descendantGenusCount < nodes[id].descendantGenusCount;
      nodes[c].branchDepth = nodes[id].branchDepth + (narrows ? 1 : 0);
      bfs.push(c);
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/tree/assemble.test.ts -t branchDepth`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/tree/types.ts src/lib/tree/assemble.ts src/lib/tree/assemble.test.ts
git commit -m "feat(tree): add branchDepth (monotypic-collapsed depth) to nodes"
```

---

### Task 2: Prune degenerate targets (`branchDepth(terminalClade) <= 1`)

**Files:**
- Modify: `src/lib/tree/playable.ts` (`prunePlayable`)
- Test: `src/lib/tree/playable.test.ts` (add case)

**Interfaces:**
- Consumes: `TreeNode.branchDepth` (Task 1), `terminalClade(tree, id)` (existing, `src/lib/tree/terminal.ts`).
- Produces: genera with `branchDepth(terminalClade) <= 1` have `playable = false` after `prunePlayable`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tree/playable.test.ts`. Use `FIXTURE_RAWS`, where Loosey (`LO`) is a genus attached directly under Theropoda (`T`), and Theropoda is a direct child of Dinosauria root. Its terminal clade is Theropoda; confirm the general threshold behavior on a synthetic shallow case instead by asserting the rule directly:

```ts
import { describe, it, expect } from "vitest";
import { assembleTree } from "./assemble";
import { terminalClade } from "./terminal";
import { markPlayable, prunePlayable } from "./playable";
import { FIXTURE_RAWS } from "./fixture";
import type { GenusAttributes } from "../attributes";

describe("prunePlayable shallow-terminal exclusion", () => {
  it("drops genera whose terminal clade has branchDepth <= 1", () => {
    const tree = assembleTree(FIXTURE_RAWS, "Q430", "test");
    // Give every genus a clue so only the branchDepth rule can exclude them.
    const attrs: GenusAttributes = {};
    for (const n of Object.values(tree.nodes)) {
      if (n.isGenus) attrs[n.id] = { discoveryLocation: "US", ageStartMa: 80, ageEndMa: 70 };
    }
    markPlayable(tree);
    prunePlayable(tree, attrs, () => 99); // cap high so only the rule prunes
    for (const n of Object.values(tree.nodes)) {
      if (!n.isGenus) continue;
      const bd = tree.nodes[terminalClade(tree, n.id)].branchDepth;
      if (bd <= 1) expect(n.playable).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tree/playable.test.ts -t "shallow-terminal"`
Expected: FAIL — a shallow-terminal genus is still `playable`.

- [ ] **Step 3: Add the exclusion in `prunePlayable`**

In `src/lib/tree/playable.ts`, inside `prunePlayable`'s first loop, extend the clue guard. Change:

```ts
    if (!hasClue(attrs[n.id])) {
      n.playable = false;
      continue;
    }
    const a = terminalClade(tree, n.id);
```

to:

```ts
    if (!hasClue(attrs[n.id])) {
      n.playable = false;
      continue;
    }
    const a = terminalClade(tree, n.id);
    // Degenerate targets: a terminal clade with <=1 narrowing step of runway makes two-phase
    // warmth unitary/binary (spec 3.3). Exclude them; keeps the phase-1 denominator >= 2.
    if (tree.nodes[a].branchDepth <= 1) {
      n.playable = false;
      continue;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tree/playable.test.ts -t "shallow-terminal"`
Expected: PASS.

- [ ] **Step 5: Run the full tree suite + typecheck**

Run: `npx vitest run src/lib/tree/ && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat(playable): exclude degenerate targets (terminal branchDepth <= 1)"
```

---

### Task 3: Regenerate committed `tree.json` (branchDepth + prune)

**Files:**
- Modify (generated): `src/data/tree.json`

**Interfaces:**
- Consumes: Tasks 1–2 (assemble + prune changes).
- Produces: committed `tree.json` with `branchDepth` on every node and the 16 degenerate genera flipped to `playable: false`. This is what the runtime reads in Tasks 4–6.

**IMPORTANT:** `build:data` rebuilds ALL committed data from gitignored raws (`data/raw-taxa.json`, `data/raw-pbdb.json`). A stale raw silently degrades clue data (`genus-attributes.json`). Verify the diff is surgical before committing.

- [ ] **Step 1: Record the pre-build playable count**

Run:
```bash
python3 -c "import json;d=json.load(open('src/data/tree.json'));print('playable:',sum(1 for n in d['nodes'].values() if n.get('playable')));print('has branchDepth:', 'branchDepth' in next(iter(d['nodes'].values())))"
```
Expected: `playable: 785`, `has branchDepth: False`.

- [ ] **Step 2: Run the data build**

Run: `npm run build:data`
Expected: completes without the stale-raw or regression abort. If it aborts complaining about a stale raw or a >10% regression, STOP: run `npm run fetch:pbdb` (or `npm run fetch`) first to refresh the raws, then re-run `npm run build:data`. Do NOT set `ALLOW_DATA_REGRESSION=1` (the drop here is ~2%, so the guard should pass on its own).

- [ ] **Step 3: Verify the diff is surgical**

Run:
```bash
python3 -c "import json;d=json.load(open('src/data/tree.json'));print('playable:',sum(1 for n in d['nodes'].values() if n.get('playable')));print('has branchDepth:', 'branchDepth' in next(iter(d['nodes'].values())))"
git diff --stat src/data/
```
Expected: `playable: 769` (785 − 16), `has branchDepth: True`. `git diff --stat` should show `src/data/tree.json` changed. If `src/data/genus-attributes.json` also changed materially, the raws were stale — revert (`git checkout src/data/genus-attributes.json`), run `npm run fetch:pbdb`, and redo Step 2.

- [ ] **Step 4: Confirm the specific degenerate genera are gone**

Run:
```bash
python3 -c "import json;d=json.load(open('src/data/tree.json'));ns=d['nodes'];print({n['name']:n['playable'] for i,n in ns.items() if n['name'] in ('Sulaimanisaurus','Saurophaganax','Migmanychion')})"
```
Expected: `{'Sulaimanisaurus': False, 'Saurophaganax': False, 'Migmanychion': True}` (Migmanychion has a deep terminal clade and stays playable).

- [ ] **Step 5: Commit**

```bash
git add src/data/tree.json
git commit -m "data: regenerate tree.json with branchDepth + degenerate-target prune"
```

---

### Task 4: The two-phase WarmthProvider

**Files:**
- Modify: `src/lib/game/types.ts` (slim `Warmth`)
- Rewrite: `src/lib/game/warmth.ts` (replace `createCountWarmth` with `createTwoPhaseWarmth` + `warmthForTarget`)
- Test: `src/lib/game/warmth.test.ts` (replace anchors)

**Interfaces:**
- Consumes: `TreeNode.branchDepth` (Task 1), `terminalClade` (`src/lib/tree/terminal.ts`), `TreeData` (`store.data`).
- Produces:
  - `interface Warmth { fraction: number }`
  - `createTwoPhaseWarmth(opts: { targetId: string; terminalBranchDepth: number; anchor?: number }): WarmthProvider`
  - `warmthForTarget(data: TreeData, targetId: string, anchor?: number): WarmthProvider`
  - `WarmthProvider.warmth(node: TreeNode): Warmth` (node is the MRCA)

- [ ] **Step 1: Write the failing test**

Replace the body of `src/lib/game/warmth.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { assembleTree } from "../tree/assemble";
import { MONO_FIXTURE_RAWS } from "../tree/fixture";
import { createTwoPhaseWarmth } from "./warmth";

// MONO tree branchDepths (from Task 1): MR=0, B1=1, MA=1, MB=1, SA=2.
// Use target with terminalBranchDepth = 2 (a target under SA).
const tree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
const w = createTwoPhaseWarmth({ targetId: "GA1", terminalBranchDepth: 2 });
const f = (id: string) => w.warmth(tree.nodes[id]).fraction;

describe("two-phase warmth", () => {
  it("is 1.0 when the MRCA is the target (solved)", () => {
    expect(f("GA1")).toBe(1);
  });
  it("is the anchor at or below the terminal clade", () => {
    expect(f("SA")).toBeCloseTo(0.9); // branchDepth 2 >= 2
  });
  it("ramps linearly to the anchor through phase 1", () => {
    expect(f("MR")).toBeCloseTo(0.0);   // bd 0 / 2
    expect(f("B1")).toBeCloseTo(0.45);  // 0.9 * 1 / 2
  });
  it("gives the same anchor to targets of different depth", () => {
    const shallow = createTwoPhaseWarmth({ targetId: "x", terminalBranchDepth: 5 });
    const deep = createTwoPhaseWarmth({ targetId: "y", terminalBranchDepth: 12 });
    const atTerminal = { branchDepth: 5 } as any;
    const atTerminalDeep = { branchDepth: 12 } as any;
    expect(shallow.warmth(atTerminal).fraction).toBeCloseTo(0.9);
    expect(deep.warmth(atTerminalDeep).fraction).toBeCloseTo(0.9);
  });
});
```

Note: `GA1` is a genus under `SA` in `MONO_FIXTURE_RAWS`; confirm its id when writing (grep the fixture). If its branchDepth is not 2, adjust `terminalBranchDepth` in the test to match `tree.nodes[terminalClade(tree,"GA1")].branchDepth`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/warmth.test.ts`
Expected: FAIL — `createTwoPhaseWarmth` is not exported.

- [ ] **Step 3: Slim the `Warmth` type**

In `src/lib/game/types.ts`, replace:

```ts
export interface Warmth {
  value: number;
  display: string;
  fraction: number;
}
```

with:

```ts
export interface Warmth {
  fraction: number; // 0..1 color driver (two-phase spine warmth); the only field consumed
}
```

- [ ] **Step 4: Rewrite `warmth.ts`**

Replace the entire top section of `src/lib/game/warmth.ts` (the `clamp01`, `WARMTH_CURVE`, and `createCountWarmth` definitions) with:

```ts
import type { TreeData, TreeNode } from "../tree/types";
import { terminalClade } from "../tree/terminal";
import type { Warmth } from "./types";

export interface WarmthProvider {
  warmth(node: TreeNode): Warmth; // node is the MRCA of (guess, target)
}

const DEFAULT_ANCHOR = 0.9; // warmth at the terminal clade (spec 3.2)

// Two-phase warmth: ramp linearly to ANCHOR as the MRCA reaches the target's terminal clade,
// then flat ANCHOR until solved. Depends only on branchDepth (monotypic runs collapsed), so
// clade size / bushiness never enters. Target-scoped: construct once the target is known.
export function createTwoPhaseWarmth(opts: {
  targetId: string;
  terminalBranchDepth: number;
  anchor?: number;
}): WarmthProvider {
  const anchor = opts.anchor ?? DEFAULT_ANCHOR;
  const denom = Math.max(1, opts.terminalBranchDepth); // prune guarantees >= 2; guard anyway
  return {
    warmth(node: TreeNode): Warmth {
      if (node.id === opts.targetId) return { fraction: 1 };
      if (node.branchDepth >= opts.terminalBranchDepth) return { fraction: anchor };
      return { fraction: anchor * (node.branchDepth / denom) };
    },
  };
}

// Build the provider for a given target: resolves its terminal clade and that clade's runway.
export function warmthForTarget(data: TreeData, targetId: string, anchor?: number): WarmthProvider {
  const terminalId = terminalClade(data, targetId);
  const terminalBranchDepth = data.nodes[terminalId].branchDepth;
  return createTwoPhaseWarmth({ targetId, terminalBranchDepth, anchor });
}
```

Keep the existing `warmth-ramp.ts` exports untouched. If `warmth.ts` also re-exported ramp helpers, preserve those lines.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/game/warmth.test.ts`
Expected: PASS. If the `GA1` branchDepth assumption was wrong, adjust `terminalBranchDepth` per the Step 1 note.

- [ ] **Step 6: Commit (typecheck will still fail at call sites — that's Task 5)**

```bash
git add src/lib/game/types.ts src/lib/game/warmth.ts src/lib/game/warmth.test.ts
git commit -m "feat(warmth): two-phase spine-depth WarmthProvider; slim Warmth to fraction"
```

---

### Task 5: Wire the target-aware provider into the stores

**Files:**
- Modify: `src/lib/game/gameStore.svelte.ts`
- Modify: `src/lib/game/dailyStore.svelte.ts`

**Interfaces:**
- Consumes: `warmthForTarget(data, targetId)` (Task 4), `treeStore.data` (existing `TreeData` on the store).
- Produces: `game.warmthProvider` getter (the current provider) for SpineTree (Task 6).

- [ ] **Step 1: Update `gameStore.svelte.ts`**

Replace `import { createCountWarmth } from "./warmth";` with:

```ts
import { warmthForTarget, type WarmthProvider } from "./warmth";
```

Delete the module-level `const warmth = createCountWarmth(treeStore.rootCount);`. Inside `createGame()`, after `let state = $state<GameState>(newRoundState(treeStore));`, add a derived provider that rebuilds when the target changes:

```ts
  let state = $state<GameState>(newRoundState(treeStore));
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore.data, state.target));
```

Expose it on the returned object (add alongside the other getters):

```ts
    get warmthProvider(): WarmthProvider {
      return warmth;
    },
```

The `guess()` / `hint()` methods already reference `warmth`; they now use the derived one.

- [ ] **Step 2: Update `dailyStore.svelte.ts`**

Replace `import { createCountWarmth } from "./warmth";` with:

```ts
import { warmthForTarget, type WarmthProvider } from "./warmth";
```

Delete the module-level `const warmth = createCountWarmth(treeStore.rootCount);`. In `loadOrCreate`, the restored branch needs a provider for `refreshWarmth` — build it from the restored target:

```ts
    if (restored) return refreshWarmth(restored, treeStore, warmthForTarget(treeStore.data, restored.target));
```

Inside `createDaily()`, after `let state = $state<GameState>(loadOrCreate(date));`, add:

```ts
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore.data, state.target));
```

The `guess()` / `hint()` methods use this `warmth`. **GameBoard is shared by Daily and Practice and always passes `store.warmthProvider` to SpineTree (Task 6), so the daily store MUST expose the same getter** as gameStore, on its returned object:

```ts
    get warmthProvider(): WarmthProvider {
      return warmth;
    },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (all `createCountWarmth` references gone; `Warmth` now `{ fraction }` and nothing reads `.value`/`.display`). If tsc flags a `.value`/`.display` read, that consumer was missed — update it to use `.fraction` or remove it.

- [ ] **Step 4: Run the game engine tests**

Run: `npx vitest run src/lib/game/`
Expected: PASS (engine-core tests may need the Task 7 shape updates; if failures are only about `broad.count`/`siblingCount`, proceed — Task 7 fixes them. Warmth-related tests should pass.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/gameStore.svelte.ts src/lib/game/dailyStore.svelte.ts
git commit -m "feat(warmth): build target-aware provider per game in the stores"
```

---

### Task 6: SpineTree takes the provider as a prop

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`
- Modify: `src/lib/game/components/GameBoard.svelte`
- Modify: `src/gallery/Gallery.svelte`

**Interfaces:**
- Consumes: `game.warmthProvider` (Task 5), `WarmthProvider` type (Task 4).
- Produces: SpineTree colors on-spine nodes via the injected provider; Explore (which injects `nodeColor`) is unaffected.

- [ ] **Step 1: Accept the provider prop in SpineTree**

In `src/lib/game/components/SpineTree.svelte`, add `warmthProvider` to the `$props()` destructuring and its type (optional — Explore does not pass it). Replace the self-construction line:

```ts
  const warmthProvider = createCountWarmth(treeStore.rootCount);
```

with nothing (remove it), and remove the `import { createCountWarmth } ...`, keeping the `warmthRampColor` import. Add `warmthProvider` to props (illustrative — match the existing `$props()` block style):

```ts
  let { /* ...existing props..., */ warmthProvider }:
    { /* ...existing prop types..., */ warmthProvider?: import("../warmth").WarmthProvider } = $props();
```

Update `ownWarmthColor` to guard on a missing provider:

```ts
  function ownWarmthColor(id: string): string {
    const node = treeStore.getNode(id);
    return node && warmthProvider
      ? warmthRampColor(warmthProvider.warmth(node).fraction)
      : "var(--node-context)";
  }
```

- [ ] **Step 2: Pass the provider from GameBoard**

In `src/lib/game/components/GameBoard.svelte`, the `<SpineTree ... />` invocation (~line 141) already passes `{guessWarmth}`. GameBoard's store variable is `store` (it already calls `store.state`, `store.warmestId`). Add the provider:

```svelte
    <SpineTree
      ...existing props...
      {guessWarmth}
      warmthProvider={store.warmthProvider}
    />
```

- [ ] **Step 3: Update the gallery game-state SpineTrees**

In `src/gallery/Gallery.svelte`, the `<SpineTree>` uses that render game states (the ones with `revealed`/`tipId` from a fixture store, ~lines 132 and 140) need a provider so the spine colors. At the top of the script, import and build one per fixture state, or pass a single provider for the fixture target:

```ts
  import { warmthForTarget } from "../lib/game/warmth";
  import { treeStore } from "../lib/game/treeData";
  const galleryWarmth = (state) => warmthForTarget(treeStore.data, state.target);
```

Pass `warmthProvider={galleryWarmth(s.state)}` on those SpineTree usages. (Explore's SpineTree in `Explorer.svelte` injects `nodeColor` and must NOT be given a provider — leave it unchanged.)

- [ ] **Step 4: Typecheck, svelte-check, build**

Run: `npx tsc --noEmit && npx svelte-check && npm run build`
Expected: all pass.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run `npm run dev`, open the gallery (`/gallery.html`) and a Practice game; confirm the spine and guess bars still color (warm near the answer's clade, cold far), and Explore still grades by playability. Use `#/practice/seed?taxon=velociraptor` to check a deep target reads a mid-warm on a fellow theropod.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte src/lib/game/components/GameBoard.svelte src/gallery/Gallery.svelte
git commit -m "feat(warmth): inject WarmthProvider into SpineTree (game) not self-construct"
```

---

### Task 7: Delete pre-clue-mechanic cruft

**Files:**
- Modify: `src/lib/game/engine-core.ts` (`SpecimenState`, `specimenState`, remove `playableDescendantCount`)
- Modify: `src/lib/game/components/WarmestTrail.svelte` (remove rung count)
- Test: `src/lib/game/engine-core.test.ts` (update specimen shape assertions)

**Interfaces:**
- Produces: `SpecimenState` with `{ kind: "broad" }` and `{ kind: "terminal" }` (no payloads); `solved`/`empty` unchanged.

- [ ] **Step 1: Update the failing test first**

In `src/lib/game/engine-core.test.ts`, find assertions referencing `broad`'s `count` or `terminal`'s `siblingCount` and rewrite them to the bare shapes, e.g.:

```ts
expect(specimenState(state, store)).toEqual({ kind: "broad" });
// ...and for the terminal case:
expect(specimenState(state, store)).toEqual({ kind: "terminal" });
```

Remove any test that only exercised `playableDescendantCount`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: FAIL — current code returns `{ kind: "broad", count }` / `{ kind: "terminal", siblingCount }`.

- [ ] **Step 3: Slim `SpecimenState` and `specimenState`**

In `src/lib/game/engine-core.ts`, change the type:

```ts
export type SpecimenState =
  | { kind: "empty" }
  | { kind: "broad" }
  | { kind: "terminal" }
  | { kind: "solved"; outcome: "won" | "lost"; targetId: string; guessCount: number };
```

In `specimenState`, change the terminal and broad returns:

```ts
  if (leafHintActive(state, store)) {
    return { kind: "terminal" };
  }
  return { kind: "broad" };
```

Delete the now-unused `playableDescendantCount` function entirely. (Confirm no non-test caller remains: `grep -rn playableDescendantCount src | grep -v test` should be empty.)

- [ ] **Step 4: Remove the WarmestTrail rung count**

In `src/lib/game/components/WarmestTrail.svelte` (~line 20), change:

```svelte
      <span class="rung-dot" aria-hidden="true"></span>{displayName(node?.name)} <em>({node?.descendantGenusCount})</em>
```

to:

```svelte
      <span class="rung-dot" aria-hidden="true"></span>{displayName(node?.name)}
```

If the `.crumb em` style rule (~line 63) now targets nothing, leave it (harmless) or remove it.

- [ ] **Step 5: Run tests + typecheck + svelte-check**

Run: `npx vitest run src/lib/game/engine-core.test.ts && npx tsc --noEmit && npx svelte-check`
Expected: PASS. If `specimen-view.ts` or the gallery read `.count`/`.siblingCount`, update those readers (they should only branch on `s.kind`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/engine-core.ts src/lib/game/components/WarmestTrail.svelte src/lib/game/engine-core.test.ts
git commit -m "refactor(game): delete pre-clue cruft (broad.count, siblingCount, rung count)"
```

---

### Task 8: Docs + full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, update the two stale facts:

- The **Warmth** line under "Key parameters": replace the `descendantGenusCount` / `CountWarmth` / `PercentWarmth` description with the two-phase model. New text:

```
- **Warmth** = two-phase spine depth: a linear ramp to a 0.9 anchor as the guess MRCA reaches the
  target's terminal clade (phase 1, `branchDepth`-normalized), then flat until solved (phase 2,
  where the field clue disambiguates). `createTwoPhaseWarmth` / `warmthForTarget` in `warmth.ts`;
  the provider is target-scoped (rebuilt per game). Genus count no longer feeds closeness.
```

- The **Playable pool** line: change `≈ 785` to `≈ 769` and add to the pruning description: `plus exclude degenerate targets whose terminal clade has branchDepth ≤ 1 (the 16 genera hanging directly off Dinosauria/Saurischia/Ornithischia).`

- [ ] **Step 2: Full verification suite**

Run: `npx vitest run && npx tsc --noEmit && npx svelte-check && npm run build`
Expected: all green. Capture the vitest summary line (total passed) in the commit if desired.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: two-phase warmth + updated playable pool count in CLAUDE.md"
```

- [ ] **Step 4: Post-completion follow-ups (file as GitHub issues, do not push)**

Per the working agreements, file these on `latrani/Mesozooa` after the branch lands:
- `tech-debt`: playtest whether `branchDepth(terminalClade) = 2..3` targets (Theropoda / Sauropodomorpha / Herrerasauridae, ~20 genera) feel too thin; consider extending the prune.
- `tech-debt`: Explore "N genera in this clade" de-emphasis (minor visual pass).
- Tuning: `ANCHOR` value + phase-1 ramp shape (linear vs concave) in a look-and-feel pass.

---

## Notes for the executor

- Warmth ordering is unchanged by design; if any test asserts a *specific old count-based fraction*, replace it with the two-phase expectation, do not try to preserve the old number.
- The `#/practice/seed?taxon=<slug-or-qid>` route seeds a Practice game with a chosen target — use it to eyeball specific targets (e.g. `velociraptor`, `stegosaurus`) while smoke-testing.
- If `build:data` (Task 3) cannot produce a surgical diff because the local raws are stale and re-fetching is not possible in this environment, STOP and surface it — do not commit a degraded `genus-attributes.json`.
