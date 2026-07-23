# Explore Step-Back Scroll Anchoring ("Coyote Time") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Explore, stepping back to an ancestor holds the camera still and lets the branch collapse in place (leaving a right-side "coyote time" gap) instead of sliding the tree forward.

**Architecture:** Two pure helpers in `spine-layout.ts` (`isStepBack`, `coyotePadDelta`) are TDD-tested, then wired into `SpineTree.svelte`: the tip-change effect classifies each move, freezes both scroll axes on a step-back, and maintains a transient `coyotePad` that extends the runway so the scroll clamp can't yank the frozen view. Any non-step-back tip resolution (and the ⌂ reset) zeroes the pad.

**Tech Stack:** Svelte 5 (runes) + TypeScript, Vitest for pure logic, Vite.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does NOT catch violations; run `npx tsc --noEmit` and `npx svelte-check` before any commit that touches `.svelte`.
- Pure logic is TDD-tested (Vitest); Svelte components are validated by build + running.
- One tree, one source of truth — feedback is always a tree node. This plan adds no second representation; it only changes scroll targeting.
- Behavior is **default-zoom-only**, matching the existing `atDefaultZoom` gate on the FLIP scroll driver (`SpineTree.svelte:214`).
- `X_GAP = 200` (px per depth column, `SpineTree.svelte:120`). `pathToRoot(id)` includes `id` itself (`src/lib/tree/mrca.ts:3`).

---

### Task 1: Pure helper — `isStepBack`

**Files:**
- Modify: `src/lib/game/spine-layout.ts` (append after `centerOffsetFor`, ~line 233)
- Test: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Consumes: `TreeStore` (already imported in `spine-layout.ts` as a type), `store.pathToRoot(id): string[]`.
- Produces: `isStepBack(store: TreeStore, oldTip: string | null, newTip: string): boolean` — true iff `newTip` is a **proper** ancestor of `oldTip`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/spine-layout.test.ts` (the `store` fixture at the top already exposes the chain `Q430 → T → TF → TR` and sibling subtree `O`):

```ts
import { layoutSpine, centerOffsetFor, edgePathBetween, isStepBack } from "./spine-layout";

describe("isStepBack", () => {
  it("is true when the new tip is a proper ancestor of the old tip", () => {
    expect(isStepBack(store, "TF", "T")).toBe(true);   // parent
    expect(isStepBack(store, "TR", "T")).toBe(true);    // grandparent
    expect(isStepBack(store, "TF", "Q430")).toBe(true); // the root
  });
  it("is false for forward, lateral, same-node, and first-mount moves", () => {
    expect(isStepBack(store, "T", "TF")).toBe(false);   // deeper (forward)
    expect(isStepBack(store, "TF", "O")).toBe(false);   // sibling subtree (lateral)
    expect(isStepBack(store, "TF", "TF")).toBe(false);  // same node (pathToRoot includes self)
    expect(isStepBack(store, null, "TF")).toBe(false);  // first mount
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t isStepBack`
Expected: FAIL — `isStepBack is not a function` (import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/game/spine-layout.ts`:

```ts
/**
 * A "step-back" move: the new tip is a PROPER ancestor of the old tip (navigating shallower in the
 * same lineage). `pathToRoot(id)` includes `id` itself, so the `newTip !== oldTip` guard is required
 * — without it, a same-node no-op would report as a step-back. Returns false on first mount
 * (oldTip null) and for forward/lateral moves.
 */
export function isStepBack(store: TreeStore, oldTip: string | null, newTip: string): boolean {
  if (!oldTip || oldTip === newTip) return false;
  return store.pathToRoot(oldTip).includes(newTip);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t isStepBack`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat(spine-layout): isStepBack proper-ancestor test (#66)"
```

---

### Task 2: Pure helper — `coyotePadDelta`

**Files:**
- Modify: `src/lib/game/spine-layout.ts` (append after `isStepBack`)
- Test: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Produces: `coyotePadDelta(oldWidth: number, newWidth: number, xGap: number): number` — the extra runway px a step-back collapse must reserve; clamped at 0.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/spine-layout.test.ts`:

```ts
import { /* …existing… */ coyotePadDelta } from "./spine-layout";

describe("coyotePadDelta", () => {
  it("reserves the collapsed columns' width", () => {
    expect(coyotePadDelta(10, 9, 200)).toBe(200);  // one column lost
    expect(coyotePadDelta(10, 7, 200)).toBe(600);  // three columns lost
  });
  it("clamps at 0 when width did not shrink (forward/lateral misclassification is harmless)", () => {
    expect(coyotePadDelta(9, 10, 200)).toBe(0);    // grew
    expect(coyotePadDelta(9, 9, 200)).toBe(0);     // unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t coyotePadDelta`
Expected: FAIL — `coyotePadDelta is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/game/spine-layout.ts`:

```ts
/**
 * Extra runway px a step-back must reserve so the scroll clamp can't yank the frozen view when the
 * collapsing branch shrinks `contentWidth`. Clamped at 0 so a forward/lateral move (which grows or
 * keeps the width) can never produce negative padding. See the "coyote time" note in the spec.
 */
export function coyotePadDelta(oldWidth: number, newWidth: number, xGap: number): number {
  return Math.max(0, (oldWidth - newWidth) * xGap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t coyotePadDelta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat(spine-layout): coyotePadDelta collapsed-width reserve (#66)"
```

---

### Task 3: Wire `coyotePad` into the runway width

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte:414` (the `runway` derivation) and imports (`:1-3`)

**Interfaces:**
- Consumes: `isStepBack`, `coyotePadDelta` from Task 1/2.
- Produces: reactive `coyotePad` state (px, unscaled content space) that extends `runway`; a helper `layout.width` snapshot for the effect in Task 4.

This task only makes the pad *exist and feed the width* — nothing sets it nonzero yet, so behavior is unchanged (regression-safe checkpoint). Task 4 drives it.

- [ ] **Step 1: Add the import**

Modify the existing import at `SpineTree.svelte:3`:

```ts
  import { layoutSpine, centerOffsetFor, edgePathBetween, isStepBack, coyotePadDelta } from "../spine-layout";
```

- [ ] **Step 2: Declare `coyotePad` and fold it into `runway`**

Find (`:414`):

```ts
  let runway = $derived(contentWidth ? rightInset : 0);
```

Replace with:

```ts
  // "Coyote time" (issue #66): on a step-back the camera is frozen (see the tip-change effect) and
  // the collapsing branch shrinks contentWidth — which would drop the scroll clamp ceiling and yank
  // the frozen view leftward. `coyotePad` (unscaled content px) reserves the collapsed columns'
  // width so scrollWidth doesn't shrink under the held scrollLeft. Named for platformer "coyote
  // time": the ground stays under you a beat after you'd otherwise fall (Wile E. doesn't drop till
  // he looks down). It zeroes on any deliberate recenter (forward/lateral tip, or ⌂). Default-zoom
  // only, matching the FLIP scroll driver's atDefaultZoom gate.
  let coyotePad = $state(0);
  let runway = $derived(contentWidth ? rightInset + coyotePad : 0);
```

- [ ] **Step 3: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(spine-tree): add coyotePad runway addend, unwired (#66)"
```

---

### Task 4: Classify the move in the tip-change effect — freeze + pad on step-back, zero on forward/lateral

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte:640-659` (the tip-change `$effect`)

**Interfaces:**
- Consumes: `isStepBack`, `coyotePadDelta`, `coyotePad`, `treeStore`, `layout.width`, `lastTipId`, `scrollTargetPx`, `resetZoom`, `X_GAP`.

**Context — the effect today (`:640`):**

```ts
  let lastTipId: string | null = null;
  let lastInset = -1;
  $effect(() => {
    const d = tipId ? (posOf.get(tipId)?.depth ?? -1) : -1;
    void scrollWidth; // re-run when the scrollable width changes too
    if (scroller && tipId && d >= 0) {
      if (tipId !== lastTipId) {
        if (scrollTargetPx) zoom = defaultZoomFor(viewport.isPhone);
        else resetZoom(); // zoomed / non-animated path: native re-center as before
      } else if (rightInset !== lastInset) {
        scrollToNode(tipId);
      }
    }
    lastTipId = tipId;
    lastInset = rightInset;
  });
```

The step-back branch must run BEFORE the recenter and short-circuit it. Note `scrollTargetPx` is set by the FLIP effect (`:200`) on every layout change; on a step-back we must null it so the FLIP scroll driver doesn't animate. We also snapshot `layout.width` across renders to compute the collapse delta.

- [ ] **Step 1: Add a `lastWidth` snapshot field**

Just above `let lastTipId` (`:638`), add:

```ts
  let lastWidth = 0; // layout.width at the previous tip resolution, for the coyote-pad delta
```

- [ ] **Step 2: Rewrite the tip-change branch to classify the move**

Replace the `if (tipId !== lastTipId) { … } else if …` block (`:644-655`) with:

```ts
      if (tipId !== lastTipId) {
        if (isStepBack(treeStore, lastTipId, tipId)) {
          // Step-back: HOLD both axes. Null the FLIP scroll target so the shared-clock scroll driver
          // doesn't animate, and skip the native recenter — scrollLeft/Top stay frozen while the node
          // FLIP collapses the branch in place. Extend the coyote pad by the collapsed columns' width
          // (accumulates across consecutive step-backs) so the clamp can't yank the frozen view.
          scrollTargetPx = null;
          coyotePad += coyotePadDelta(lastWidth, layout.width, X_GAP);
        } else {
          // Forward / lateral (deeper tip, sibling, search jump, history chip): recenter as before,
          // and drop any coyote pad — the tree re-extends / moves, so held dead space is stale.
          coyotePad = 0;
          if (scrollTargetPx) zoom = defaultZoomFor(viewport.isPhone);
          else resetZoom();
        }
      } else if (rightInset !== lastInset) {
        scrollToNode(tipId);
      }
```

- [ ] **Step 3: Update the snapshot writes at the effect's end**

Find (`:656-658`):

```ts
    lastTipId = tipId;
    lastInset = rightInset;
  });
```

Replace with:

```ts
    lastTipId = tipId;
    lastInset = rightInset;
    lastWidth = layout.width;
  });
```

- [ ] **Step 4: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors.

- [ ] **Step 5: Manual verification in Explore (default zoom)**

Run: `npm run dev`, open `/#/explore?taxon=ankylosauria`.
- Step back to Thyreophora → tree collapses in place, camera holds, a right-side gap opens; nothing slides forward.
- Step back again → hold extends (no yank, gap grows).
- Navigate deeper (click a child) → recenters, gap closes.
Expected: matches the above. If the vertical tip drifts noticeably, note it (accepted tradeoff per spec §1).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(spine-tree): hold camera + coyote-pad on Explore step-back (#66)"
```

---

### Task 5: Zero the coyote pad on manual recenter (⌂)

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte:624-627` (`resetZoom`)

**Interfaces:**
- Consumes: `coyotePad` state.

**Context — `resetZoom` today (`:624`):**

```ts
  function resetZoom() {
    zoom = defaultZoomFor(viewport.isPhone);
    requestAnimationFrame(() => { if (tipId) scrollToNode(tipId); });
  }
```

`resetZoom` is the ⌂ button AND the zoomed-path fallback in the tip-change effect. Zeroing the pad here covers the explicit "put me back" gesture; the forward/lateral branch (Task 4) already zeros it on its own before calling `resetZoom`, so this is idempotent, not double-work.

- [ ] **Step 1: Zero the pad in `resetZoom`**

Replace the body with:

```ts
  function resetZoom() {
    zoom = defaultZoomFor(viewport.isPhone);
    coyotePad = 0; // ⌂ is the explicit "put me back": drop any held coyote-time gap, re-clamp normally
    requestAnimationFrame(() => { if (tipId) scrollToNode(tipId); });
  }
```

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, in Explore create a coyote gap (step back at the right edge), then press ⌂.
Expected: view recenters on the tip and the right-side gap closes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(spine-tree): reset coyote pad on manual recenter (#66)"
```

---

### Task 6: Full verification sweep + issue close

**Files:** none (verification only).

- [ ] **Step 1: Run the full pure-logic suite**

Run: `npx vitest run`
Expected: all pass (new `isStepBack` / `coyotePadDelta` tests included).

- [ ] **Step 2: Type + component checks**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no errors.

- [ ] **Step 3: Manual acceptance against spec §Testing**

Run: `npm run dev`, at default zoom in Explore, confirm all six spec checks:
1. `taxon=ankylosauria` → step back to Thyreophora: collapses in place, camera holds, gap opens, no forward slide.
2. Step back again: hold extends, no yank.
3. ⌂: recenters, gap closes.
4. From the held state, search-jump to an unrelated taxon: recenters cleanly, no stale gap.
5. Short-tree (non-scrolled) case unchanged.
6. Game unaffected — play a round; tip only deepens, no step-back behavior triggers.

- [ ] **Step 4: Commit the closing marker**

If any doc/CHANGELOG touch is needed, otherwise amend the final feature commit. Ensure a commit in this branch carries the closer (Indi pushes):

```bash
git commit --allow-empty -m "chore: close Explore step-back scroll anchoring

Closes #66"
```
