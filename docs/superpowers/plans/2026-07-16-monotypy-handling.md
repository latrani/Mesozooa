# Monotypy Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the tree from presenting non-choices as choices — straighten monotypic runs in the Explore layout, and make hints skip through monotypic nodes to the next real narrowing.

**Architecture:** Two independent behavior fixes plus a preceding rename. Piece 0 renames two drifted function names. Piece 1 extends the spine layout through structurally-monotypic frontier nodes. Piece 2 redefines the hint target from "one step down" to "the run down to the next node that actually narrows the genus count," recording the branch point as the hint row (the run reveals for free via `pathToRoot`).

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. Pure logic is TDD-tested with Vitest; Svelte components validated by `svelte-check` + build.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch violations. Run `npx tsc --noEmit` and `npx svelte-check` before committing any task.
- **Test command:** `npm test` (Vitest, run-once). A single file: `npx vitest run src/lib/game/engine-core.test.ts`.
- **"Monotypic / no-op"** means *reveals no narrowing*: a lineage node whose `descendantGenusCount` equals its parent's. For all 108 such nodes in the real data this is exactly the structural single-child case (verified: 108 same-count, 0 differ). Piece 1 uses the **structural single-child** test (`store.children(id).length === 1`); Piece 2 uses the **count** test (strict `<`). Both are correct for these nodes; each fits its surface.
- **Never reveal the target genus via a hint.** Piece 2's run always terminates at a clade — see Task 4's proof.
- Do not touch `clueFor()`, `store.clue`, player-facing strings, or `persistence.ts` (its legacy `"clue"` normalizer stays).

---

### Task 1: Rename drifted mechanic names (no behavior change)

Pure rename so later tasks read cleanly. `applyHintOrClue → applyHint` (it just applies a hint that forks on kind), `terminalClueActive → leafHintActive` (it means "a leaf-hint is now the available move"). `clueFor`/`store.clue` are correct and stay.

**Files:**
- Modify: `src/lib/game/engine-core.ts` (def of both + internal call sites at lines ~127, ~159, ~181)
- Modify: `src/lib/game/gameStore.svelte.ts` (imports + call sites ~13, ~47, ~54)
- Modify: `src/lib/game/dailyStore.svelte.ts` (imports + call sites ~14, ~85, ~93)
- Modify: `src/gallery/fixtures.ts` (import + call site ~11, ~98)
- Test: `src/lib/game/engine-core.test.ts` (imports + `describe` labels + call sites)

**Interfaces:**
- Produces: `export function applyHint(state: GameState, store: TreeStore, warmth: WarmthProvider): GameState` and `export function leafHintActive(state: GameState, store: TreeStore): boolean` (same signatures as the old names).

- [ ] **Step 1: Global rename across source and tests**

Run these exact replacements (each is a whole-identifier swap):

```bash
cd /Users/mtthoma/Projects/Mesozooa
grep -rl 'applyHintOrClue' src | xargs sed -i '' 's/applyHintOrClue/applyHint/g'
grep -rl 'terminalClueActive' src | xargs sed -i '' 's/terminalClueActive/leafHintActive/g'
```

- [ ] **Step 2: Fix the now-stale comment on `leafHintActive`**

In `src/lib/game/engine-core.ts`, the comment above the (renamed) `leafHintActive` still says "the moment the paleo clue should surface." Replace that comment block with:

```ts
// True once warmth has bottomed out at (or, via hints, below) the target's terminal clade —
// the state in which the available hint is a leaf-hint (which surfaces the paleo clue) rather
// than a branch walk. Count-based, so a monotypic node below the terminal clade still counts.
```

- [ ] **Step 3: Verify no old names remain**

Run: `grep -rn 'applyHintOrClue\|terminalClueActive' src`
Expected: no matches. (The legacy `"clue"` string literals in `persistence.ts` are a different thing and MUST remain.)

- [ ] **Step 4: Typecheck, svelte-check, test**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npm test`
Expected: tsc clean, svelte-check `0 errors`, all Vitest tests pass (pure rename → zero behavior change).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "refactor(game): rename applyHintOrClue->applyHint, terminalClueActive->leafHintActive"
```

---

### Task 2: Straighten the monotypic frontier in the spine layout

**File:**
- Modify: `src/lib/game/spine-layout.ts` (inside `layoutSpine`, right after `revealedChildren` is defined, ~line 43)
- Test: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Consumes: `store.children(id): TreeNode[]`, `store.pathToRoot(id): string[]`, the `revealed: Set<string>` param.
- Produces: no signature change to `layoutSpine`; the returned `SpineLayout` now includes structurally-monotypic revealed frontier descendants as `onSpine` nodes.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/spine-layout.test.ts` inside `describe("layoutSpine", ...)`. The fixture's `Ornithischia (O) → Ceratopsidae (CF) → Triceratops (TC)` is a structural single-child chain. Focusing O (revealing O + its child CF) should lay CF straight on the spine, not splayed:

```ts
it("extends the spine through a structurally-monotypic revealed frontier child", () => {
  // Focus O: revealed = O + Q430 + their children (T, CF). CF is O's only child (monotypic),
  // so it should lay STRAIGHT on the spine at y=0, not splay off diagonally.
  const l = layoutSpine(store, new Set(["Q430", "O", "T", "CF"]), "O");
  const m = byId(l);
  expect(m.get("O")).toMatchObject({ x: 1, y: 0, onSpine: true });
  expect(m.get("CF")).toMatchObject({ x: 2, y: 0, onSpine: true });
  expect(l.edges).toEqual(
    expect.arrayContaining([{ parentId: "O", childId: "CF", onSpine: true }]),
  );
});

it("does NOT straighten a frontier that branches structurally, even if only one child is revealed", () => {
  // TF (Tyrannosauridae) has TWO real children (TR, TB); only TR is revealed here. TF is not
  // monotypic, so TR must still splay off-spine — reveal count must not be mistaken for arity.
  const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "TF");
  const m = byId(l);
  expect(m.get("TR")).toMatchObject({ x: 3, y: -1, onSpine: false });
});
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `npx vitest run src/lib/game/spine-layout.test.ts`
Expected: the "extends the spine…" test FAILS (CF comes back `onSpine: false`, `y: -1`); the "does NOT straighten…" test PASSES already (guards against the wrong fix).

- [ ] **Step 3: Implement the frontier extension**

In `src/lib/game/spine-layout.ts`, `revealedChildren` is defined around line 39-43. Immediately AFTER its definition, insert:

```ts
  // Extend the spine through monotypic frontier continuation: while the tip is STRUCTURALLY
  // monotypic (exactly one child in the tree) and that child is revealed, absorb it onto the
  // spine so a non-branch descent lays straight instead of splaying as a phantom fork. Using the
  // tree's arity (not the revealed-child count) is deliberate: a branching node with only one
  // child currently revealed (e.g. Tyrannosauridae showing only Tyrannosaurus) must still splay.
  for (;;) {
    const tip = spine[spine.length - 1];
    const kids = store.children(tip);
    if (kids.length !== 1) break;
    const only = kids[0].id;
    if (!revealed.has(only) || spine.includes(only)) break;
    spine.push(only);
  }
```

- [ ] **Step 4: Run the full layout suite**

Run: `npx vitest run src/lib/game/spine-layout.test.ts`
Expected: all tests PASS, including the two new ones and every prior test (the structural guard means `TF`-style frontiers are untouched).

- [ ] **Step 5: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: clean.

- [ ] **Step 6: Manually verify in Explore (evidence before claiming done)**

The dev server runs on `http://localhost:5173`. Navigate to `http://localhost:5173/#/explore?taxon=thyreophoroidea` and confirm the lineage `Thyreophoroidea → Eurypoda → Stegosauria` now lays straight on the spine (no diagonal sprig to the lone child); descending still takes one click per level, and Stegosauria fans out its 15 children at the branch. Note the observation in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "fix(tree): straighten structurally-monotypic frontier on the spine"
```

---

### Task 3: Add the monotypy test fixture and `nextHintRun`

Replaces the single-step `nextHintNode` with `nextHintRun`, which returns the run of lineage nodes down to the next strict genus-count narrowing. The existing game fixture cannot express the hint-burn shape (a monotypic run *above* a non-root terminal clade), so add a dedicated fixture.

**Files:**
- Modify: `src/lib/tree/fixture.ts` (add `MONO_FIXTURE_RAWS`)
- Modify: `src/lib/game/engine-core.ts` (replace `nextHintNode` with `nextHintRun`)
- Test: `src/lib/game/engine-core.test.ts` (rename the `nextHintNode` describe block; add a monotypy suite)

**Interfaces:**
- Consumes: `store.pathToRoot`, `store.getNode(id)!.descendantGenusCount`, `revealedNodeIds(state, store)`.
- Produces: `export function nextHintRun(state: GameState, store: TreeStore): string[]` — ordered root→target, from just below the deepest revealed lineage node down to and including the first node that strictly lowers the genus count. `[]` when none remains. The final element is always a clade (never the target genus) whenever the caller has checked `!leafHintActive` first.
- Produces: `MONO_FIXTURE_RAWS: RawTaxon[]` with this shape (counts in comments):

```
MR (clade)                     count 4
├─ B1  (clade)                 count 3   ← narrows from MR
│   └─ MA (clade)              count 3   ← monotypic (MA is B1's only child)
│       └─ MB (clade)          count 3   ← monotypic (MB is MA's only child)
│           ├─ SA (family)     count 2   ← branch point; terminalClade of GA1/GA2
│           │   ├─ GA1 (genus)
│           │   └─ GA2 (genus)
│           └─ SB (family)     count 1
│               └─ GB1 (genus)
└─ OT (genus)                  count 1
```

- [ ] **Step 1: Add the fixture**

In `src/lib/tree/fixture.ts`, after `FIXTURE_RAWS`, add (the file already imports `RANK_GENUS, RANK_FAMILY` and defines `CLADE`):

```ts
// A tree with a monotypic run (B1 → MA → MB) sitting ABOVE a non-root terminal clade (SA),
// which the primary fixture cannot express. Used to test skip-through hints. Counts:
// GA1=GA2=GB1=OT=1; SA=2, SB=1; MB=3, MA=3, B1=3; MR=4. terminalClade(GA1)=SA.
export const MONO_FIXTURE_RAWS: RawTaxon[] = [
  { id: "MR", name: "Rootosauria", rankId: CLADE, parentId: null },
  { id: "B1", name: "Branchia", rankId: CLADE, parentId: "MR" },
  { id: "MA", name: "Monoa", rankId: CLADE, parentId: "B1" },
  { id: "MB", name: "Monob", rankId: CLADE, parentId: "MA" },
  { id: "SA", name: "Subfamilia", rankId: RANK_FAMILY, parentId: "MB" },
  { id: "SB", name: "Subfamilib", rankId: RANK_FAMILY, parentId: "MB" },
  { id: "GA1", name: "Genusaa", rankId: RANK_GENUS, parentId: "SA",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusaa" },
  { id: "GA2", name: "Genusab", rankId: RANK_GENUS, parentId: "SA",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusab" },
  { id: "GB1", name: "Genusba", rankId: RANK_GENUS, parentId: "SB",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusba" },
  { id: "OT", name: "Otheria", rankId: RANK_GENUS, parentId: "MR",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Otheria" },
];
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/game/engine-core.test.ts`: change the import `nextHintNode` → `nextHintRun`, add `MONO_FIXTURE_RAWS` to the `../tree/fixture` import, and build a second store near the top (after the existing `store`/`warmth` setup, ~line 31):

```ts
const monoTree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
markPlayable(monoTree);
const monoStore = createTreeStore(monoTree);
const monoWarmth = createCountWarmth(monoStore.rootCount);
```

Replace the entire `describe("nextHintNode", ...)` block with:

```ts
describe("nextHintRun", () => {
  it("returns a single-node run to the next narrowing when it's not monotypic", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth); // mrca(TR,TC)=Q430
    expect(nextHintRun(s, store)).toEqual(["O"]); // Q430 -> O (count 1 < 4): one strict step
  });
  it("is empty with no guesses", () => {
    expect(nextHintRun(newDailyState("TC"), store)).toEqual([]);
  });
  it("skips through a monotypic run to the branch point in one run", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth); // mrca(GA1,OT)=MR
    s = applyHint(s, monoStore, monoWarmth);         // hint 1: MR -> B1 (3 < 4), one step
    expect(s.guesses.at(-1)!.sharedNodeId).toBe("B1");
    // Next run walks MA(3), MB(3) — both monotypic — down to SA(2), the strict narrowing.
    expect(nextHintRun(s, monoStore)).toEqual(["MA", "MB", "SA"]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: FAIL — `nextHintRun` is not exported (and `applyHint`'s branch walk still uses the old single-step function, so the skip-through assertion fails).

- [ ] **Step 4: Implement `nextHintRun`**

In `src/lib/game/engine-core.ts`, replace the whole `nextHintNode` function with:

```ts
// The run of lineage nodes from just below the deepest revealed node down to (and INCLUDING)
// the next node whose descendantGenusCount is strictly less than the deepest revealed node's —
// the next genuine narrowing. Usually one node; through a monotypic run it's [..intermediates,
// branchPoint]. Empty when nothing narrows below the deepest revealed node. When the caller has
// verified !leafHintActive, the final node is always a clade (the terminal clade or above),
// never the target genus.
export function nextHintRun(state: GameState, store: TreeStore): string[] {
  const rootToTarget = store.pathToRoot(state.target).slice().reverse();
  const revealed = revealedNodeIds(state, store);
  let deepest = -1;
  for (let i = 0; i < rootToTarget.length; i++) {
    if (revealed.has(rootToTarget[i])) deepest = i;
  }
  if (deepest === -1 || deepest + 1 >= rootToTarget.length) return [];
  const deepestCount = store.getNode(rootToTarget[deepest])!.descendantGenusCount;
  const run: string[] = [];
  for (let i = deepest + 1; i < rootToTarget.length; i++) {
    const id = rootToTarget[i];
    run.push(id);
    if (store.getNode(id)!.descendantGenusCount < deepestCount) break; // strict narrowing → done
  }
  return run;
}
```

- [ ] **Step 5: Point `applyHint` and `hintCost` at the run's branch point**

Still in `engine-core.ts`, in the (renamed) `applyHint`, the branch-walk tail currently reads `const nodeId = nextHintNode(state, store); if (nodeId === null) return state;`. Replace those two lines with:

```ts
  const run = nextHintRun(state, store);
  if (run.length === 0) return state;
  const nodeId = run[run.length - 1]; // branch point; pathToRoot(nodeId) reveals the whole run
```

In `hintCost`, replace `const nodeId = nextHintNode(state, store); if (nodeId === null) return HINT_COST_MIN;` with:

```ts
  const run = nextHintRun(state, store);
  if (run.length === 0) return HINT_COST_MIN;
  const nodeId = run[run.length - 1];
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: PASS — including the new `nextHintRun` suite. Note: `revealedNodeIds` already reveals the intermediates because it walks `pathToRoot(nodeId)`; recording only the branch point reveals `MA`/`MB` for free.

- [ ] **Step 7: Typecheck + svelte-check + commit**

```bash
npx tsc --noEmit && npx svelte-check --threshold error
git add src/lib/tree/fixture.ts src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat(game): nextHintRun skips through monotypic nodes to the next narrowing"
```

---

### Task 4: Wire skip-through into the stores and lock the behavior

`applyHint`/`hintCost` already consume the run (Task 3). This task updates the store `canHint` getters (which still call the removed `nextHintNode`) and adds the behavioral guarantees: whole-run reveal, target-never-revealed, cost-at-branch-point, and the run→terminal→leaf-hint handoff.

**Files:**
- Modify: `src/lib/game/gameStore.svelte.ts` (`canHint`, import)
- Modify: `src/lib/game/dailyStore.svelte.ts` (`canHint`, import)
- Test: `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Consumes: `nextHintRun`, `applyHint`, `hintCost`, `leafHintActive` (Tasks 1, 3).

- [ ] **Step 1: Update both stores' `canHint` and imports**

In BOTH `src/lib/game/gameStore.svelte.ts` and `src/lib/game/dailyStore.svelte.ts`:
- Change the import `nextHintNode` → `nextHintRun`.
- In `canHint`, change the final line `return nextHintNode(state, treeStore) !== null;` to:

```ts
      return nextHintRun(state, treeStore).length > 0;
```

- [ ] **Step 2: Verify no `nextHintNode` references remain**

Run: `grep -rn 'nextHintNode' src`
Expected: no matches.

- [ ] **Step 3: Write the behavioral tests**

Add to `src/lib/game/engine-core.test.ts` a new suite (uses the `monoStore`/`monoWarmth` from Task 3):

```ts
describe("skip-through hint behavior", () => {
  it("reveals the whole monotypic run in one press, one row, warmth at the branch point", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth); // mrca MR
    s = applyHint(s, monoStore, monoWarmth);         // hint 1 -> B1
    const rowsBefore = s.guesses.length;
    s = applyHint(s, monoStore, monoWarmth);         // hint 2 -> skip MA, MB -> SA
    expect(s.guesses.length).toBe(rowsBefore + 1);   // exactly one new row
    const row = s.guesses.at(-1)!;
    expect(row.kind).toBe("branchHint");
    expect(row.sharedNodeId).toBe("SA");             // row names the branch point
    // the skipped intermediates are revealed on the tree (via pathToRoot(SA))
    const revealed = revealedNodeIds(s, monoStore);
    expect(revealed.has("MA")).toBe(true);
    expect(revealed.has("MB")).toBe(true);
    // warmth reads the branch point's real narrowing (count 2)
    expect(row.warmth.value).toBe(monoStore.getNode("SA")!.descendantGenusCount);
    // the target genus is NEVER revealed by a hint
    expect(revealed.has("GA1")).toBe(false);
    expect(s.hintsUsed).toBe(2);
  });
  it("charges the run's cost at the branch point (deeper => cheaper than a shallow step)", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth);
    const shallow = hintCost(s, monoStore);          // step to B1 (shallow)
    s = applyHint(s, monoStore, monoWarmth);          // reveal B1
    const deepRun = hintCost(s, monoStore);           // run to SA (deeper branch point)
    expect(deepRun).toBeLessThan(shallow);
    expect(deepRun).toBeGreaterThanOrEqual(HINT_COST_MIN);
  });
  it("hands off to the leaf hint once the run reaches the terminal clade", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth);
    s = applyHint(s, monoStore, monoWarmth); // -> B1
    s = applyHint(s, monoStore, monoWarmth); // -> SA (== terminalClade(GA1))
    expect(leafHintActive(s, monoStore)).toBe(true);
    s = applyHint(s, monoStore, monoWarmth); // now the leaf hint
    expect(s.guesses.at(-1)!.kind).toBe("leafHint");
  });
});
```

- [ ] **Step 4: Run the full engine suite**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: PASS — all new assertions plus every pre-existing hint/cost test (the primary fixture's targets `TR`/`TC` have no mid-lineage monotypic run above a non-root terminal, so their runs are single-node and behave exactly as before).

- [ ] **Step 5: Full suite + typecheck + svelte-check**

Run: `npm test && npx tsc --noEmit && npx svelte-check --threshold error`
Expected: all green.

- [ ] **Step 6: Manually verify a burn-through hint in Practice (evidence before claiming done)**

At `http://localhost:5173/#/practice`, play until the warmest clade is a few steps above the answer's terminal clade, then take a hint and confirm one press reveals a straight multi-node segment down to a branching clade (not a single non-narrowing node), the guess-history row names that branch clade, and the specimen count actually drops. Note the observation in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/gameStore.svelte.ts src/lib/game/dailyStore.svelte.ts src/lib/game/engine-core.test.ts
git commit -m "feat(game): skip-through hints reveal the run to the next narrowing"
```

---

## Why the hint run never reveals the target genus (proof for Task 3/4)

`applyHint` walks the run ONLY in the `else` branch, i.e. when `leafHintActive` is false — meaning `warmestCount > terminalCount`, where `terminalCount = descendantGenusCount(terminalClade(target))`. The deepest revealed lineage node's count equals `warmestCount`. Genus counts are non-increasing down a lineage, and `terminalClade(target)` (the lowest ancestor with count ≥ 2) sits on that lineage with `terminalCount < warmestCount`. So the walk hits a strictly-smaller node at or above the terminal clade and stops there — a node with count ≥ terminalCount ≥ 2, always a clade, never the count-1 target genus.

## Post-implementation

- Move the two design items this closes out of `docs/superpowers/deferred-findings.md` if present, or note completion. (Neither the Explore straighten nor the hint-burn was formally in the backlog buckets, so this may be a no-op — check bucket D "design problems" for the monotypy/leaf-disambiguation note and leave it untouched; that's a different item.)
- Update `CLAUDE.md` "Status" only if the maintainer wants it; not required by this plan.
