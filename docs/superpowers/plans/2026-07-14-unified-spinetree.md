# Unified SpineTree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Explore render through the game's `SpineTree` instead of its own `TreeView`, so the two trees can't drift.

**Architecture:** `SpineTree` is the sole tree renderer. Both callers feed `layoutSpine(store, revealed, tipId)` — the game's tip is the warmest shared node, Explore's is the selected node. They differ only in an injected per-node color function (`nodeColor`); when absent, SpineTree keeps its built-in warmth coloring (game behavior unchanged). `TreeView` is deleted.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. Tests: Vitest. Checks: `npx tsc --noEmit`, `npx svelte-check`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does NOT catch this; run `npx svelte-check --threshold error` before every commit.
- Pure logic is TDD-tested; Svelte components are validated by `svelte-check` + `npm run build` + live run. No component unit tests.
- One tree, one source of truth — do not reintroduce a second cladogram renderer.
- Match surrounding code style; no unrelated refactors.

---

### Task 1: `revealedSpine` + `pathPositions` pure functions

**Files:**
- Modify: `src/lib/explorer/explorer-core.ts`
- Test: `src/lib/explorer/explorer-core.test.ts`

**Interfaces:**
- Consumes: `TreeStore` (`pathToRoot(id): string[]` [id..root], `children(id): TreeNode[]`).
- Produces:
  - `revealedSpine(store: TreeStore, tipId: string): Set<string>` — `pathToRoot(tipId)` plus the children of every node on that path.
  - `pathPositions(store: TreeStore, tipId: string): Map<string, number>` — each node on `pathToRoot(tipId)` mapped to 0..1 (root=0, tip=1; single-node path → 1).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/explorer/explorer-core.test.ts` (imports at top already cover the fixture store; add the two new names to the existing import line from `"./explorer-core"`):

```ts
describe("revealedSpine", () => {
  it("is the tip's root-path plus the children of every node on it", () => {
    // pathToRoot(TF)=[TF,T,Q430]; children TF={TR,TB}, T={TF,LO}, Q430={T,O}
    expect([...revealedSpine(store, "TF")].sort()).toEqual(
      ["LO", "O", "Q430", "T", "TB", "TF", "TR"],
    );
  });
  it("at the root is the root plus its children", () => {
    expect([...revealedSpine(store, "Q430")].sort()).toEqual(["O", "Q430", "T"]);
  });
  it("for a genus tip includes its lineage and each fork's siblings", () => {
    // pathToRoot(TR)=[TR,TF,T,Q430]; TR is a leaf genus
    expect([...revealedSpine(store, "TR")].sort()).toEqual(
      ["LO", "O", "Q430", "T", "TB", "TF", "TR"],
    );
  });
});

describe("pathPositions", () => {
  it("runs 0 at the root to 1 at the tip", () => {
    const m = pathPositions(store, "TF");
    expect(m.get("Q430")).toBe(0);
    expect(m.get("T")).toBe(0.5);
    expect(m.get("TF")).toBe(1);
  });
  it("maps a single-node (root) path to 1", () => {
    expect(pathPositions(store, "Q430").get("Q430")).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/explorer/explorer-core.test.ts`
Expected: FAIL — `revealedSpine is not a function` / `pathPositions is not a function`.

- [ ] **Step 3: Implement the two functions**

Add to `src/lib/explorer/explorer-core.ts`:

```ts
export function revealedSpine(store: TreeStore, tipId: string): Set<string> {
  const ids = new Set<string>();
  for (const id of store.pathToRoot(tipId)) {
    ids.add(id);
    for (const child of store.children(id)) ids.add(child.id);
  }
  return ids;
}

export function pathPositions(store: TreeStore, tipId: string): Map<string, number> {
  const chain = store.pathToRoot(tipId).slice().reverse(); // root..tip
  const last = chain.length - 1;
  const map = new Map<string, number>();
  chain.forEach((id, i) => map.set(id, last === 0 ? 1 : i / last));
  return map;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/explorer/explorer-core.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/explorer/explorer-core.ts src/lib/explorer/explorer-core.test.ts
git commit -m "feat(explorer): revealedSpine + pathPositions for the spine layout"
```

---

### Task 2: SpineTree — rename `warmestId`→`tipId`, center-on-tip-change, expandable stub

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`
- Modify: `src/lib/game/components/GameBoard.svelte` (prop rename at the call site)

**Interfaces:**
- Consumes: `layoutSpine`, `centerOffsetFor` (unchanged).
- Produces: `SpineTree` prop `tipId: string | null` (was `warmestId`). Behavior additions: the auto-center effect fires whenever `tipId` changes (not only when it deepens); collapsed clades (non-genus with children absent from the revealed layout) render a right-fading "more here" stub.

- [ ] **Step 1: Rename the prop `warmestId` → `tipId`**

In `src/lib/game/components/SpineTree.svelte`, the `$props()` block — change both the destructure and the type:

```ts
  let {
    revealed,
    tipId,
    highlightId = null,
    nodeTooltips = new Map<string, string[]>(),
    guessWarmth = new Map<string, number>(),
    onnodeselect,
    emptyLabel = "Make a guess to start revealing the tree.",
    rightInset = 0,
  }: {
    revealed: Set<string>;
    tipId: string | null;
    highlightId?: string | null;
    nodeTooltips?: Map<string, string[]>;
    guessWarmth?: Map<string, number>;
    onnodeselect?: (id: string) => void;
    emptyLabel?: string;
    rightInset?: number;
  } = $props();
```

Then update the two internal uses of `warmestId`:
- `let layout = $derived(layoutSpine(treeStore, revealed, tipId));`
- In the auto-center effect (below), replace `warmestId` with `tipId`.

- [ ] **Step 2: Generalize the auto-center effect to fire on any tip change**

Replace the existing effect (the `lastFrontierDepth` block) with:

```ts
  // Center the tip whenever it changes, or when rightInset settles (it's 0 until the floating
  // overlay is measured post-mount). The game's tip only ever deepens, so "on change" doesn't
  // regress its forward-follow feel; Explore's tip jumps freely, giving click-to-center.
  let lastTipId: string | null = null;
  let lastInset = -1;
  $effect(() => {
    const d = tipId ? (posOf.get(tipId)?.depth ?? -1) : -1;
    void scrollWidth; // re-run when the scrollable width changes too
    if (scroller && d >= 0 && (tipId !== lastTipId || rightInset !== lastInset)) {
      scrollToDepth(d);
    }
    lastTipId = tipId;
    lastInset = rightInset;
  });
```

- [ ] **Step 3: Update the GameBoard call site**

In `src/lib/game/components/GameBoard.svelte`, the `<SpineTree ... />` — change `warmestId={store.warmestId}` to `tipId={store.warmestId}`. (The store getter name stays `warmestId`; only the prop name changes.)

- [ ] **Step 4: Add the expandable-stub logic + markup**

In `SpineTree.svelte` script, after `posOf`:

```ts
  // A revealed clade whose children are NOT in the layout is "collapsed" — mark it so we can
  // draw a short right-fading stub ("more here"). Genera never get a stub.
  let hasLaidOutChildren = $derived(new Set(layout.edges.map((e) => e.parentId)));
  function isExpandable(id: string): boolean {
    const node = treeStore.getNode(id);
    return !!node && !node.isGenus && !hasLaidOutChildren.has(id);
  }
```

In the `<defs>` block (alongside the segment gradients), add the stub fade gradient as the first child of `<defs>`:

```svelte
        <linearGradient id="sp-stub-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--node-context)" />
          <stop offset="1" stop-color="var(--node-context)" stop-opacity="0" />
        </linearGradient>
```

In the node `<g>` (immediately before the `<circle>`), add:

```svelte
          {#if isExpandable(n.id)}
            <line class="stub" x1="7" y1="0" x2="17" y2="0" stroke="url(#sp-stub-fade)" stroke-width="2" />
          {/if}
```

- [ ] **Step 5: Verify types + build**

Run: `npx svelte-check --threshold error`
Expected: `0 ERRORS`.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte src/lib/game/components/GameBoard.svelte
git commit -m "refactor(tree): SpineTree tipId prop, center-on-tip-change, expandable stub"
```

---

### Task 3: SpineTree — inject `nodeColor` seam (game default preserved)

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Produces: `SpineTree` optional prop `nodeColor?: (id: string, onSpine: boolean) => string | null`. When provided it drives every warmth color (segment stops, stem, dots, highlight ring). When absent, the built-in warmth coloring (guess warmth for guessed genus dots, own-warmth for spine nodes, `null` off-spine) is used — the game passes nothing and stays visually identical.

- [ ] **Step 1: Add the prop + a single color resolver**

In the `$props()` block add `nodeColor` (destructure + type):

```ts
    nodeColor,
```
```ts
    /** per-node color for segments/dots/ring; null => structural default. Absent => warmth. */
    nodeColor?: (id: string, onSpine: boolean) => string | null;
```

In the script, replace the `nodeOwnWarmthColor` helper with a resolver that folds it in as the default:

```ts
  // Resolve a node's color: injected nodeColor wins; otherwise the built-in warmth default
  // (guess warmth for a guessed genus dot, own-warmth for spine nodes, null off-spine).
  const warmthProvider = createCountWarmth(treeStore.rootCount);
  function ownWarmthColor(id: string): string {
    const node = treeStore.getNode(id);
    return node ? warmthRampColor(warmthProvider.warmth(node).fraction) : "var(--node-context)";
  }
  function colorOf(id: string, onSpine: boolean): string | null {
    if (nodeColor) return nodeColor(id, onSpine);
    if (guessWarmth.has(id)) return warmthRampColor(guessWarmth.get(id)!);
    if (onSpine) return ownWarmthColor(id);
    return null;
  }
```

- [ ] **Step 2: Route the segment gradients + stem through `colorOf`**

In the `<defs>` segment gradient stops, replace `nodeOwnWarmthColor(e.parentId)` / `nodeOwnWarmthColor(e.childId)` with `colorOf(e.parentId, true)` / `colorOf(e.childId, true)`.

Replace the stem path's inline stroke:

```svelte
      <path class="edge spine" d={`M 0 ${py(0)} H ${px(0)}`} fill="none" style="stroke: {colorOf(treeStore.data.rootId, true)}" />
```

- [ ] **Step 3: Route the dot fill + highlight ring through `colorOf`**

Replace the `<circle>` style expression:

```svelte
          <circle r={node?.isGenus ? 8 : 4.5} style={colorOf(n.id, n.onSpine) ? `fill: ${colorOf(n.id, n.onSpine)}` : ""} />
```

Replace the highlight-ring `hiColor` const:

```svelte
            {@const hiColor = colorOf(n.id, n.onSpine) ?? "var(--turq)"}
```

- [ ] **Step 4: Verify types + build; confirm the game is visually unchanged**

Run: `npx svelte-check --threshold error`  → `0 ERRORS`.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`  → `OK`.
Manual: `npm run dev`, open the app, play a few guesses — spine still warms cold→hot, guessed dots still match their bars, highlight ring still warmth-colored. (No `nodeColor` is passed, so the default path runs — behavior identical.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "refactor(tree): inject nodeColor seam into SpineTree (warmth stays the default)"
```

---

### Task 4: Explore renders through SpineTree; delete TreeView

**Files:**
- Modify: `src/lib/explorer/explorerStore.svelte.ts`
- Modify: `src/lib/explorer/components/Explorer.svelte`
- Modify: `src/lib/explorer/explorer-core.ts` (remove `revealedForFocus`, `emphasizedForFocus`)
- Modify: `src/lib/explorer/explorer-core.test.ts` (remove their tests)
- Delete: `src/lib/game/components/TreeView.svelte`

**Interfaces:**
- Consumes: `revealedSpine`, `pathPositions` (Task 1); `SpineTree` with `tipId` + `nodeColor` (Tasks 2–3); `warmthRampColor`.
- Produces: Explore store getter `revealed` now returns `revealedSpine(store, highlightId)`; `emphasizedPath` getter removed.

- [ ] **Step 1: Update the explorer store to the spine shape**

In `src/lib/explorer/explorerStore.svelte.ts`: update the import and the `revealed` getter, and delete the `emphasizedPath` getter.

Import line:
```ts
import { revealedSpine, resolveSearchPick } from "./explorer-core";
```
Replace the `revealed` getter body and delete `emphasizedPath`:
```ts
    get revealed(): Set<string> {
      return revealedSpine(treeStore, selectedGenusId ?? focusId);
    },
```
(Delete the whole `get emphasizedPath()` block.)

- [ ] **Step 2: Remove the retired core functions + their tests**

In `src/lib/explorer/explorer-core.ts` delete `revealedForFocus` and `emphasizedForFocus` (both function bodies).
In `src/lib/explorer/explorer-core.test.ts` delete the `describe("revealedForFocus", …)` and `describe("emphasizedForFocus", …)` blocks, and drop `revealedForFocus`/`emphasizedForFocus` from the import from `"./explorer-core"`.

- [ ] **Step 3: Run the explorer-core tests**

Run: `npx vitest run src/lib/explorer/explorer-core.test.ts`
Expected: PASS (revealedSpine, pathPositions, resolveSearchPick, searchSource green; no reference errors).

- [ ] **Step 4: Point Explorer at SpineTree**

In `src/lib/explorer/components/Explorer.svelte`:

Replace the `TreeView` import with `SpineTree` and add color imports:
```ts
  import SpineTree from "../../game/components/SpineTree.svelte";
  import { pathPositions } from "../explorer-core";
  import { warmthRampColor } from "../../game/warmth-ramp";
```

Add the path color function in the script (after `onnodeselect`):
```ts
  // Color the root->selection lineage 0..1; everything off it takes the structural default.
  let pathPos = $derived(pathPositions(treeStore, explorer.highlightId));
  const nodeColor = (id: string) => (pathPos.has(id) ? warmthRampColor(pathPos.get(id)!) : null);
```

Replace the `<TreeView … />` element with:
```svelte
    <SpineTree
      revealed={explorer.revealed}
      tipId={explorer.highlightId}
      highlightId={explorer.highlightId}
      {nodeColor}
      {onnodeselect}
      rightInset={detailW ? detailW + 24 + 24 : 0}
      emptyLabel="Search for a taxon to explore the tree."
    />
```
(`detailW` already exists from the `bind:clientWidth` on `.detail-float`. Remove the now-unused `isDesktop` state + its `$effect` if they were only used for the hand-rolled inset — leave them if still referenced elsewhere; they are not, so delete the `isDesktop` declaration and its `$effect`.)

- [ ] **Step 5: Delete TreeView**

```bash
git rm src/lib/game/components/TreeView.svelte
```

- [ ] **Step 6: Verify types + build**

Run: `npx svelte-check --threshold error`  → `0 ERRORS` (confirms nothing else imported TreeView / the removed functions).
Run: `npx vitest run`  → all files pass.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`  → `OK`.

- [ ] **Step 7: Live-run Explore**

Run: `npm run dev`, open the app, switch to Explore. Verify: search jumps to a taxon and centers it; the lineage renders as a straight gradient spine (cold→hot, hot at the selection); clicking a clade re-roots the spine and centers; sibling clades splay off with expandable stubs; the detail card floats top-right; the search sits in the bottom placard. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/explorer/ 
git commit -m "feat(explorer): render through SpineTree; delete TreeView"
```

---

## Self-Review

**Spec coverage:**
- One renderer, two callers → Tasks 2–4 (SpineTree gains the seam; Explore + game both feed `layoutSpine`). ✓
- `nodeColor` seam `(id, onSpine) => string | null` → Task 3. ✓
- Game default unchanged (warmth) → Task 3 `colorOf` fallback; verified Step 4. ✓
- Auto-center generalized to tip-change → Task 2 Step 2 (with rationale that the game tip only deepens, so no regression). ✓
- Explore `revealed` = path ∪ each-path-node's-children → Task 1 `revealedSpine`, wired Task 4 Step 1. ✓
- Explore tip = selected node (`highlightId`) → Task 4 Step 1/4. ✓
- Path-position coloring 0→1 → Task 1 `pathPositions`, wired Task 4 Step 4. ✓
- Expandable stub moved into SpineTree → Task 2 Step 4. ✓
- `emphasizedForFocus` retired; `revealedForFocus` replaced → Task 4 Step 2. ✓
- `TreeView` deleted → Task 4 Step 5. ✓
- `layoutCladogram` + test kept (unused, valid) → not touched by any task. ✓ (Note: it becomes dead app code; left intentionally per spec as a future layout option.)
- Explore view already restructured (hero/float/bottom) → done earlier this session; Task 4 only swaps the renderer + inset wiring. ✓

**Placeholder scan:** none — every code step shows the actual code.

**Type consistency:** `tipId` used consistently (Tasks 2–4); `nodeColor: (id, onSpine) => string | null` identical in Task 3 (definition) and Task 4 (Explore supplies a 1-arg fn, valid since the 2nd param is optional to the caller); `revealedSpine`/`pathPositions` signatures match between Task 1 and Task 4.

## Non-goals

- Layout pluggability (deferred — Explore uses `layoutSpine` as-is).
- Any change to game visuals or the warmth model.
- Reworking `NodeDetail` / `Specimen`.
