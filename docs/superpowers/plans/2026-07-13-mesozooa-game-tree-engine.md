# Game Tree Engine (Spine Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the game's cladogram with a horizontal focus+context "spine" tree — the sought lineage laid straight down the middle, wrong-clade guesses splayed above/below, the viewport following the frontier as you narrow — while Explore keeps its faithful cladogram.

**Architecture:** A new pure layout function `layoutSpine` computes node positions (spine at y=0, off-spine subtrees packed above/below). A pure `centerOffsetFor` computes the horizontal scroll needed to center a node. A new `SpineTree.svelte` renders the layout inside a horizontally-scrolling container, highlights the spine (structurally), auto-follows the frontier on advance, and exposes `panTo(id)` for the trail scrubber (wired in the next plan). The game's `GameBoard` swaps its `TreeView` for `SpineTree`; Explore is untouched.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for the pure layout logic; existing `TreeStore` (`pathToRoot`, `children`).

**This is Plan 1 of 2** for the look-and-feel IA redesign. Spec: `docs/superpowers/specs/2026-07-13-mesozooa-game-ui-ia-design.md` (§3 tree region, §9 mapping). Plan 2 (screen recomposition: specimen, regions, nav, trail-scrubber wiring, end-state, Explore tweaks) builds on this.

## Global Constraints

- **Structural CSS only — NO aesthetics.** This pass builds correct structure/layout (flex/grid, the scroll container, spine geometry, responsive behavior). Palette, type/font, hairlines, spacing scale, motion/animation are the SEPARATE later visual phase. Colors are placeholder/browser-default; it will look rough on purpose. Do not add styling beyond what the layout needs to function.
- **One tree, one source of truth.** The spine is derived from existing node objects via `store.pathToRoot(warmestId)`; do not build a parallel clade/rank structure.
- **Do NOT touch Explore's tree.** `src/lib/game/layout.ts` (`layoutCladogram`) and `src/lib/game/components/TreeView.svelte` stay exactly as they are — Explore depends on them and its faithful cladogram is intentional (spec §3). The game tree is a NEW, separate visualization.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Run `npx tsc --noEmit` (clean) AND `npx svelte-check --tsconfig ./tsconfig.json` (0 errors) before every commit touching types or `.svelte` files.
- **Pure logic is TDD-tested; Svelte components validated by tsc + svelte-check + `npm run build` + a manual run.**
- **Frequent commits:** one commit per task.

---

## File Structure

- `src/lib/game/spine-layout.ts` — **Create.** Pure: `layoutSpine`, `centerOffsetFor`, and the `SpineLayout`/`SpineNode` types.
- `src/lib/game/spine-layout.test.ts` — **Create.** Tests for both pure functions against the fixture.
- `src/lib/game/components/SpineTree.svelte` — **Create.** Renders a `SpineLayout` in a horizontal-scroll container; spine class hooks; auto-follow frontier; `panTo(id)`.
- `src/lib/game/components/GameBoard.svelte` — **Modify.** Swap the game's `<TreeView>` for `<SpineTree>` (Explore's `TreeView` usage is elsewhere and unchanged).

**Fixture facts** (`src/lib/tree/fixture.ts`, after Neornithes pruning) used by the tests:
`Q430`(Dinosauria) → `T`(Theropoda) → `TF`(Tyrannosauridae) → `TR`(Tyrannosaurus), `TB`(Tarbosaurus); and `Q430` → `O`(Ornithischia) → `CF`(Ceratopsidae) → `TC`(Triceratops). `store.children(TF)` sorted by name = `[TB (Tarbosaurus), TR (Tyrannosaurus)]`. `store.pathToRoot(id)` is node-first (id … root); reversed is root-first.

---

### Task 1: `layoutSpine` — the spine-and-splay layout

**Files:**
- Create: `src/lib/game/spine-layout.ts`
- Create: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Consumes: `TreeStore` (`data.rootId`, `pathToRoot`, `children`).
- Produces:
  ```ts
  export interface SpineNode { id: string; x: number; y: number; depth: number; onSpine: boolean; }
  export interface SpineEdge { parentId: string; childId: string; onSpine: boolean; }
  export interface SpineLayout { nodes: SpineNode[]; edges: SpineEdge[]; width: number; minY: number; maxY: number; }
  export function layoutSpine(store: TreeStore, revealed: Set<string>, warmestId: string | null): SpineLayout;
  ```
  Semantics: the spine = `pathToRoot(warmestId)` reversed (root→warmest), laid at `y=0`, `x=depth` (index along the spine). Each spine node's revealed children that are NOT the next spine node are off-spine subtree roots; each such subtree is leaf-packed and placed as a block entirely above (`y<0`) or below (`y>0`) the spine, alternating above/below in processing order (spine root→warmest, then children by name) and stacking so blocks never overlap the spine or each other. Empty layout (`{nodes:[],edges:[],width:0,minY:0,maxY:0}`) when `warmestId` is null, or the root or `warmestId` is not in `revealed`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/spine-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { layoutSpine } from "./spine-layout";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const byId = (l: ReturnType<typeof layoutSpine>) => new Map(l.nodes.map((n) => [n.id, n]));

describe("layoutSpine", () => {
  it("is empty when warmestId is null or root/warmest not revealed", () => {
    expect(layoutSpine(store, new Set(["Q430"]), null).nodes).toEqual([]);
    expect(layoutSpine(store, new Set(["TR"]), "TR").nodes).toEqual([]); // root not revealed
  });

  it("lays the spine straight at y=0 by depth, single off-spine leaf above", () => {
    // spine root..TF; TR hangs off TF (first off-spine block -> above)
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "TF");
    const m = byId(l);
    expect(m.get("Q430")).toMatchObject({ x: 0, y: 0, depth: 0, onSpine: true });
    expect(m.get("T")).toMatchObject({ x: 1, y: 0, onSpine: true });
    expect(m.get("TF")).toMatchObject({ x: 2, y: 0, onSpine: true });
    expect(m.get("TR")).toMatchObject({ x: 3, y: -1, onSpine: false });
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { parentId: "Q430", childId: "T", onSpine: true },
        { parentId: "T", childId: "TF", onSpine: true },
        { parentId: "TF", childId: "TR", onSpine: false },
      ]),
    );
    expect(l).toMatchObject({ width: 3, minY: -1, maxY: 0 });
  });

  it("splays two frontier children to opposite sides (name order: TB above, TR below)", () => {
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR", "TB"]), "TF");
    const m = byId(l);
    expect(m.get("TF")!.y).toBe(0);
    expect(m.get("TB")).toMatchObject({ x: 3, y: -1, onSpine: false }); // Tarbosaurus first -> above
    expect(m.get("TR")).toMatchObject({ x: 3, y: 1, onSpine: false }); // Tyrannosaurus -> below
    expect(l).toMatchObject({ minY: -1, maxY: 1 });
  });

  it("hangs a multi-node off-spine chain from the root, above", () => {
    // spine root..TF; O->CF->TC chain diverges at the root (Q430)
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "O", "CF", "TC"]), "TF");
    const m = byId(l);
    expect(m.get("O")).toMatchObject({ x: 1, y: -1, onSpine: false });
    expect(m.get("CF")).toMatchObject({ x: 2, y: -1, onSpine: false });
    expect(m.get("TC")).toMatchObject({ x: 3, y: -1, onSpine: false });
    expect(m.get("Q430")!.onSpine).toBe(true);
    expect(l.edges).toEqual(
      expect.arrayContaining([{ parentId: "Q430", childId: "O", onSpine: false }]),
    );
    expect(l).toMatchObject({ width: 3, minY: -1, maxY: 0 });
  });

  it("is a straight chain when warmest is the deepest revealed node", () => {
    const l = layoutSpine(store, new Set(["Q430", "O", "CF", "TC"]), "TC");
    expect(l.nodes.every((n) => n.onSpine && n.y === 0)).toBe(true);
    expect(l).toMatchObject({ width: 3, minY: 0, maxY: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/spine-layout.test.ts`
Expected: FAIL — cannot find module `./spine-layout`.

- [ ] **Step 3: Implement `layoutSpine`**

Create `src/lib/game/spine-layout.ts`:

```ts
import type { TreeStore } from "./treeStore";

export interface SpineNode {
  id: string;
  x: number;
  y: number;
  depth: number;
  onSpine: boolean;
}
export interface SpineEdge {
  parentId: string;
  childId: string;
  onSpine: boolean;
}
export interface SpineLayout {
  nodes: SpineNode[];
  edges: SpineEdge[];
  width: number;
  minY: number;
  maxY: number;
}

const EMPTY: SpineLayout = { nodes: [], edges: [], width: 0, minY: 0, maxY: 0 };

// A leaf-packed off-spine subtree: nodes carry a LOCAL y in [0, height]; caller translates.
interface PackedNode { id: string; depth: number; y: number }
interface Packed { nodes: PackedNode[]; edges: SpineEdge[]; height: number; rootY: number }

export function layoutSpine(
  store: TreeStore,
  revealed: Set<string>,
  warmestId: string | null,
): SpineLayout {
  const rootId = store.data.rootId;
  if (!warmestId || !revealed.has(rootId) || !revealed.has(warmestId)) return EMPTY;

  const spine = store.pathToRoot(warmestId).slice().reverse(); // root..warmest
  const spineSet = new Set(spine);

  const revealedChildren = (id: string) =>
    store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

  // Leaf-pack a subtree rooted at `id` (off the spine). Local y in [0, height].
  function pack(id: string, depth: number): Packed {
    const kids = revealedChildren(id);
    if (kids.length === 0) {
      return { nodes: [{ id, depth, y: 0 }], edges: [], height: 0, rootY: 0 };
    }
    const nodes: PackedNode[] = [];
    const edges: SpineEdge[] = [];
    const childRootYs: number[] = [];
    let cursor = 0;
    for (const k of kids) {
      const sub = pack(k.id, depth + 1);
      for (const n of sub.nodes) nodes.push({ ...n, y: n.y + cursor });
      for (const e of sub.edges) edges.push(e);
      edges.push({ parentId: id, childId: k.id, onSpine: false });
      childRootYs.push(sub.rootY + cursor);
      cursor += sub.height + 1;
    }
    const rootY = (childRootYs[0] + childRootYs[childRootYs.length - 1]) / 2;
    nodes.push({ id, depth, y: rootY });
    return { nodes, edges, height: cursor - 1, rootY };
  }

  const nodes: SpineNode[] = [];
  const edges: SpineEdge[] = [];
  let minY = 0;
  let maxY = 0;
  let toAbove = true; // alternate off-spine blocks above/below
  let aboveCursor = 0; // distance already consumed above the spine
  let belowCursor = 0;

  spine.forEach((id, depth) => {
    nodes.push({ id, x: depth, y: 0, depth, onSpine: true });
    if (depth > 0) edges.push({ parentId: spine[depth - 1], childId: id, onSpine: true });

    const nextSpine = spine[depth + 1];
    for (const child of revealedChildren(id)) {
      if (child.id === nextSpine) continue; // stay on the spine
      const block = pack(child.id, depth + 1);
      edges.push({ parentId: id, childId: child.id, onSpine: false });
      edges.push(...block.edges);
      if (toAbove) {
        const shift = -(aboveCursor + 1 + block.height); // block occupies [shift, shift+height], all < 0
        for (const n of block.nodes) {
          const y = n.y + shift;
          nodes.push({ id: n.id, x: n.depth, y, depth: n.depth, onSpine: false });
          minY = Math.min(minY, y);
        }
        aboveCursor += block.height + 1;
      } else {
        const shift = belowCursor + 1; // block occupies [shift, shift+height], all > 0
        for (const n of block.nodes) {
          const y = n.y + shift;
          nodes.push({ id: n.id, x: n.depth, y, depth: n.depth, onSpine: false });
          maxY = Math.max(maxY, y);
        }
        belowCursor += block.height + 1;
      }
      toAbove = !toAbove;
    }
  });

  const width = nodes.reduce((mx, n) => Math.max(mx, n.depth), 0);
  return { nodes, edges, width, minY, maxY };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/spine-layout.test.ts && npx tsc --noEmit`
Expected: all 5 tests PASS; tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat: layoutSpine — spine-and-splay game tree layout"
```

---

### Task 2: `centerOffsetFor` — horizontal scroll to center a node

**Files:**
- Modify: `src/lib/game/spine-layout.ts`
- Modify: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ViewMetrics { xGap: number; pad: number; contentWidth: number; viewportWidth: number; }
  export function centerOffsetFor(depth: number, m: ViewMetrics): number;
  ```
  Returns the container `scrollLeft` that centers the node at column `depth` in the viewport, clamped to `[0, max(0, contentWidth - viewportWidth)]`. Node x-pixel = `pad + depth * xGap`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/game/spine-layout.test.ts` (extend the import to include `centerOffsetFor`):

```ts
describe("centerOffsetFor", () => {
  const m = { xGap: 180, pad: 28, contentWidth: 2000, viewportWidth: 600 };
  it("centers a mid-content node", () => {
    // node px = 28 + 3*180 = 568; centered scrollLeft = 568 - 300 = 268
    expect(centerOffsetFor(3, m)).toBe(268);
  });
  it("clamps to 0 at the left edge", () => {
    expect(centerOffsetFor(0, m)).toBe(0); // 28 - 300 < 0
  });
  it("clamps to the right edge", () => {
    // deep node would center past the end; clamp to contentWidth - viewportWidth = 1400
    expect(centerOffsetFor(50, m)).toBe(1400);
  });
  it("never returns negative when content is narrower than the viewport", () => {
    expect(centerOffsetFor(0, { xGap: 180, pad: 28, contentWidth: 300, viewportWidth: 600 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t "centerOffsetFor"`
Expected: FAIL — `centerOffsetFor is not a function`.

- [ ] **Step 3: Implement `centerOffsetFor`**

Append to `src/lib/game/spine-layout.ts`:

```ts
export interface ViewMetrics {
  xGap: number;
  pad: number;
  contentWidth: number;
  viewportWidth: number;
}

export function centerOffsetFor(depth: number, m: ViewMetrics): number {
  const nodePx = m.pad + depth * m.xGap;
  const raw = nodePx - m.viewportWidth / 2;
  const max = Math.max(0, m.contentWidth - m.viewportWidth);
  return Math.min(Math.max(0, raw), max);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/spine-layout.test.ts && npx tsc --noEmit`
Expected: all tests PASS (9 total); tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat: centerOffsetFor — scroll offset to center a tree node"
```

---

### Task 3: `SpineTree.svelte` — render, scroll, follow the frontier

Renders a `SpineLayout` inside a horizontally-scrolling container. Spine nodes/edges get a `spine` class hook (structural highlight only — a minimal default stroke so the spine is identifiable when verifying; real styling is the visual phase). Auto-scrolls to center the frontier when it advances (deepens). Exposes `panTo(id)` for the trail scrubber (Plan 2).

**Files:**
- Create: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `layoutSpine`, `centerOffsetFor`, `SpineLayout` (Task 1/2); `treeStore` for node names.
- Props:
  ```ts
  { revealed: Set<string>; warmestId: string | null; highlightId?: string | null;
    nodeTooltips?: Map<string, string[]>; onnodeselect?: (id: string) => void;
    emptyLabel?: string }
  ```
- Produces: an exported `panTo(id: string)` component function (Svelte 5 `export function`) that scrolls to center that node; used by Plan 2. Auto-follow is internal.

- [ ] **Step 1: Create the component**

Create `src/lib/game/components/SpineTree.svelte`:

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { layoutSpine, centerOffsetFor } from "../spine-layout";

  let {
    revealed,
    warmestId,
    highlightId = null,
    nodeTooltips = new Map<string, string[]>(),
    onnodeselect,
    emptyLabel = "Make a guess to start revealing the tree.",
  }: {
    revealed: Set<string>;
    warmestId: string | null;
    highlightId?: string | null;
    nodeTooltips?: Map<string, string[]>;
    onnodeselect?: (id: string) => void;
    emptyLabel?: string;
  } = $props();

  const X_GAP = 180;
  const Y_GAP = 44;
  const PAD = 28;

  let layout = $derived(layoutSpine(treeStore, revealed, warmestId));
  let posOf = $derived(new Map(layout.nodes.map((n) => [n.id, n])));
  let contentWidth = $derived(layout.nodes.length ? layout.width * X_GAP + PAD * 2 + 140 : 0);
  let vbH = $derived((layout.maxY - layout.minY) * Y_GAP + PAD * 2);
  let hover = $state<string | null>(null);

  let scroller = $state<HTMLDivElement | null>(null);
  const px = (x: number) => PAD + x * X_GAP;
  const py = (y: number) => PAD + (y - layout.minY) * Y_GAP;

  function edgePath(parentId: string, childId: string): string {
    const p = posOf.get(parentId)!;
    const c = posOf.get(childId)!;
    const midX = (px(p.x) + px(c.x)) / 2;
    return `M ${px(p.x)} ${py(p.y)} H ${midX} V ${py(c.y)} H ${px(c.x)}`;
  }

  function scrollToDepth(depth: number) {
    if (!scroller) return;
    scroller.scrollLeft = centerOffsetFor(depth, {
      xGap: X_GAP,
      pad: PAD,
      contentWidth,
      viewportWidth: scroller.clientWidth,
    });
  }

  // Exposed for the trail scrubber (Plan 2).
  export function panTo(id: string) {
    const n = posOf.get(id);
    if (n) scrollToDepth(n.depth);
  }

  // Follow the frontier only when it ADVANCES (deepens).
  let lastFrontierDepth = -1;
  $effect(() => {
    const d = warmestId ? (posOf.get(warmestId)?.depth ?? -1) : -1;
    if (d > lastFrontierDepth && scroller) scrollToDepth(d);
    lastFrontierDepth = d;
  });
</script>

{#if layout.nodes.length}
  <div class="tree-scroll" bind:this={scroller}>
    <svg
      class="tree"
      width={contentWidth}
      height={vbH}
      viewBox={`0 0 ${contentWidth} ${vbH}`}
      role="img"
      aria-label="Cladogram"
    >
      {#each layout.edges as e (e.parentId + ">" + e.childId)}
        <path class="edge" class:spine={e.onSpine} d={edgePath(e.parentId, e.childId)} fill="none" />
      {/each}
      {#each layout.nodes as n (n.id)}
        {@const node = treeStore.getNode(n.id)}
        {@const tips = nodeTooltips.get(n.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <g
          class="node"
          class:spine={n.onSpine}
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
  </div>
{:else}
  <p class="tree-empty">{emptyLabel}</p>
{/if}

<style>
  /* Structural only — the horizontal scroll IS the layout. Visual styling deferred. */
  .tree-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    max-width: 100%;
  }
  /* Minimal spine cue so it's identifiable during verification (real styling later). */
  .edge {
    stroke: currentColor;
    stroke-width: 1;
  }
  .edge.spine {
    stroke-width: 2.5;
  }
</style>
```

- [ ] **Step 2: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; `vite build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat: SpineTree component — horizontal spine tree with frontier-follow"
```

---

### Task 4: Swap the game tree to `SpineTree`

Point `GameBoard` at `SpineTree` instead of `TreeView`. Explore's `TreeView` usage (`Explorer.svelte`) is separate and stays. This makes the spine tree visible for verification without the full region recomposition (Plan 2).

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `SpineTree` (Task 3). `GameBoard` already has `store.warmestId`, `store.revealed`, `highlightId`, and `nodeTooltips` — `SpineTree` takes `warmestId` + `revealed` directly (it computes its own layout), so the `emphasizedPath` prop is no longer needed by the game tree.

- [ ] **Step 1: Replace the TreeView usage**

In `src/lib/game/components/GameBoard.svelte`, change the import:

```ts
  import SpineTree from "./SpineTree.svelte";
```
(remove the `import TreeView from "./TreeView.svelte";` line).

Replace the `<TreeView … />` block with:

```svelte
  <SpineTree
    revealed={store.revealed}
    warmestId={store.warmestId}
    {nodeTooltips}
    {highlightId}
    emptyLabel="Make a guess to start revealing the tree."
  />
```

Remove the now-unused `emphasizedPath` `$derived` (it was only consumed by `TreeView`). Leave `nodeTooltips` and `highlightId` as they are.

- [ ] **Step 2: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build && npm run test`
Expected: tsc no output; svelte-check 0 errors; build succeeds; full Vitest suite passes (no logic regressed).

- [ ] **Step 3: Manually verify the spine tree in the running app**

Run `npm run dev`. In **Practice**, make several guesses across different major clades, then narrow into one family. Confirm:
- the sought lineage renders as a straight horizontal spine (thicker edges), root at left;
- wrong-clade guesses splay above/below the spine;
- the tree scrolls horizontally, and the viewport re-centers on the frontier as you narrow deeper;
- **Explore is unchanged** (still the faithful cladogram).
Note in your report how far you drove it (start the dev server in the background or with a timeout; stop it after — never let it block).
Expected: spine tree behaves as above; Explore visibly unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "feat: game board uses the spine tree (Explore keeps the cladogram)"
```

---

## Self-Review

**1. Spec coverage (spec §3 tree region, §9 mapping):**
- "Spine = sought lineage, straight, highlighted" → Task 1 (`onSpine` on nodes/edges, spine at y=0) + Task 3 (`spine` class + minimal structural cue).
- "Off-spine guesses splay above/below" → Task 1 alternating above/below block packing (tests cover both sides + multi-node chains).
- "Viewport follows the frontier on advance, manual override, horizontal scroll" → Task 3 (`$effect` fires only when frontier depth increases; native `overflow-x:auto` scroll is the manual override; `panTo` exposed for the trail).
- "Game tree diverges from Explore's faithful cladogram" → new `layoutSpine`/`SpineTree`; `layoutCladogram`/`TreeView` untouched (Global Constraints + Task 4 leaves Explore alone).
- "Structural CSS only" → Task 3 `<style>` is scroll + a minimal spine stroke; explicitly no palette/type/motion.
- Trail-scrubber wiring, specimen, region recomposition, end-state → correctly NOT here; they are Plan 2.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code and test step is complete. ✅

**3. Type consistency:** `layoutSpine(store, revealed, warmestId)` and `centerOffsetFor(depth, ViewMetrics)` signatures identical across Tasks 1–3. `SpineLayout`/`SpineNode`/`SpineEdge` defined in Task 1 and consumed in Task 3. `SpineTree` prop names (`revealed`, `warmestId`, `highlightId`, `nodeTooltips`, `onnodeselect`, `emptyLabel`) match Task 4's usage. `panTo(id)` exported in Task 3 for Plan 2. ✅
