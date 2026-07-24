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

> **CORRECTION — Tasks 6-8 added 2026-07-23 after Task 6's live testing invalidated the "hold both
> axes" design.** Live Playwright testing found (a) the frozen `scrollTop` strands the new tip
> off-screen after a deep step-back, and (b) a third scroll mover — the click's focus
> (`scrollFocusIntoView`) — nudges the camera forward horizontally. See the revised spec §1a/§1b/§1c.
> Tasks 1-5 remain valid as committed; Task 7 amends Task 4's step-back branch. The original "Task 6"
> (verification + close) is now **Task 9**.

### Task 6: Pure helper — `keepVisible1D`

**Files:**
- Modify: `src/lib/game/spine-layout.ts` (append after `coyotePadDelta`)
- Test: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Produces: `keepVisible1D(coord: number, scroll: number, viewportLen: number, margin: number, maxScroll: number): number` — the new scroll offset that keeps `coord` at least `margin` inside both viewport edges; returns `scroll` unchanged when it already is; result clamped to `[0, maxScroll]`.

This extracts the per-axis edge math currently inlined in `scrollFocusIntoView` (`SpineTree.svelte:513-522`) so it can be reused by the step-back vertical nudge (Task 7). Behavior-preserving.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/spine-layout.test.ts`:

```ts
import { /* …existing… */ keepVisible1D } from "./spine-layout";

describe("keepVisible1D", () => {
  // viewportLen 1000, margin 100, maxScroll 5000
  it("leaves scroll unchanged when the coord is comfortably inside the margins", () => {
    // coord 600, scroll 200 → visible pos 400, within [100, 900] → unchanged
    expect(keepVisible1D(600, 200, 1000, 100, 5000)).toBe(200);
  });
  it("pans so a coord past the near margin sits at the margin", () => {
    // coord 150, scroll 200 → visible pos -50 (< 100) → new scroll = 150 - 100 = 50
    expect(keepVisible1D(150, 200, 1000, 100, 5000)).toBe(50);
  });
  it("pans so a coord past the far margin sits at viewportLen - margin", () => {
    // coord 1150, scroll 200 → visible pos 950 (> 900) → new scroll = 1150 - 1000 + 100 = 250
    expect(keepVisible1D(1150, 200, 1000, 100, 5000)).toBe(250);
  });
  it("clamps the result to [0, maxScroll]", () => {
    expect(keepVisible1D(20, 200, 1000, 100, 5000)).toBe(0);      // would be -80 → 0
    expect(keepVisible1D(9999, 200, 1000, 100, 5000)).toBe(5000); // far past → clamp to maxScroll
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t keepVisible1D`
Expected: FAIL — `keepVisible1D is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/game/spine-layout.ts`:

```ts
/**
 * Keep-visible pan for ONE axis: given a node coordinate (in scaled content px), the current scroll
 * offset, the viewport length, an edge margin, and the max scroll, return the new scroll offset that
 * keeps the coord at least `margin` inside both edges — unchanged when it already is. Result clamped
 * to [0, maxScroll]. Extracted from scrollFocusIntoView so the step-back vertical nudge can reuse it.
 */
export function keepVisible1D(
  coord: number,
  scroll: number,
  viewportLen: number,
  margin: number,
  maxScroll: number,
): number {
  let next = scroll;
  if (coord < scroll + margin) next = coord - margin;
  else if (coord > scroll + viewportLen - margin) next = coord - viewportLen + margin;
  return Math.min(Math.max(0, next), maxScroll);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/spine-layout.test.ts -t keepVisible1D`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat(spine-layout): keepVisible1D per-axis edge math (#66)"
```

---

### Task 7: Rewire `scrollFocusIntoView` onto `keepVisible1D`, add vertical-only step-back nudge

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` — the import (`:3`), `scrollFocusIntoView` (`:503-526`), and the step-back branch of the tip-change effect (`:654-660`, from Task 4)

**Interfaces:**
- Consumes: `keepVisible1D` (Task 6), `KEEP_VISIBLE_MARGIN_Y`, `px`/`py`, `zoom`, `posOf`, `vbH`, `contentWidth`, `runway`.

**Context — `scrollFocusIntoView` today (`:503`):** it computes `maxLeft`/`maxTop`, then inlines the per-axis edge test for `left` (`:513-515`) and `top` (`:517-519`), clamps, and scrolls. Task 6 extracted that math; here we call it, then add a vertical step-back nudge that reuses the same helper.

- [ ] **Step 1: Add `keepVisible1D` to the import**

Modify `SpineTree.svelte:3`:

```ts
  import { layoutSpine, centerOffsetFor, edgePathBetween, isStepBack, coyotePadDelta, keepVisible1D } from "../spine-layout";
```

- [ ] **Step 2: Rewire `scrollFocusIntoView` to use the helper (behavior-preserving)**

Replace the `let left = …` / `let top = …` edge blocks (`:513-519`) with:

```ts
    const left = keepVisible1D(nodeX, scroller.scrollLeft, viewW, KEEP_VISIBLE_MARGIN_X, maxLeft);
    const top = keepVisible1D(nodeY, scroller.scrollTop, scroller.clientHeight, KEEP_VISIBLE_MARGIN_Y, maxTop);
```

Then delete the now-redundant `left = Math.min(...)` / `top = Math.min(...)` clamp lines (`:521-522`) — `keepVisible1D` already clamps. The final `if (left !== scroller.scrollLeft || top !== scroller.scrollTop) scroller.scrollTo(...)` stays. (Change `let` to `const` since they're no longer reassigned.)

- [ ] **Step 3: Add the vertical-only nudge to the step-back branch**

In the tip-change effect, replace the Task 4 step-back branch body:

```ts
        if (isStepBack(treeStore, lastTipId, tipId)) {
          // Step-back: freeze scrollLeft (no forward slide) but keep the new tip VISIBLE vertically —
          // the collapse re-splays the fan around a new minY, so a frozen scrollTop can strand the tip
          // off-screen (spec §1a). Null the FLIP scroll target so the shared-clock driver doesn't
          // animate; extend the coyote pad so the clamp can't yank the frozen scrollLeft.
          scrollTargetPx = null;
          coyotePad += coyotePadDelta(lastWidth, layout.width, X_GAP);
          const n = posOf.get(tipId);
          if (n) {
            const maxTop = Math.max(0, vbH * zoom - scroller.clientHeight);
            const top = keepVisible1D(py(n.y) * zoom, scroller.scrollTop, scroller.clientHeight, KEEP_VISIBLE_MARGIN_Y, maxTop);
            if (top !== scroller.scrollTop) scroller.scrollTo({ left: scroller.scrollLeft, top, behavior: reduceMotion ? "auto" : "smooth" });
          }
        } else {
```

(The `else { coyotePad = 0; … }` branch and the snapshot writes are unchanged from Task 4.)

- [ ] **Step 4: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(spine-tree): keep-visible vertical on step-back, share keepVisible1D (#66)"
```

---

### Task 8: Suppress the click-focus scroll on a step-back click

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` — `scrollFocusIntoView` (`:503`) and `onNodeClick` (`:556`)

**Interfaces:**
- Consumes: `isStepBack`, `treeStore`, `tipId`.

**Context:** `onNodeClick` (`:556`) does `onnodeselect(id); focusItem(id);`. The `focusItem` → `onItemFocus` → `scrollFocusIntoView` chain fires a keep-visible pan that, on a step-back click from a right-edge scroll, nudges the camera forward horizontally (spec §1b, measured +82px). We suppress ONLY that scroll side-effect on a step-back click, so the tip-change effect (Task 7) is the sole scroller. Detection uses the CURRENT `tipId` — at click time `onnodeselect` hasn't yet mutated the store, so `tipId` is still the old tip.

- [ ] **Step 1: Add the flag and set it in `onNodeClick`**

Just above `function onNodeClick` (`:556`), add:

```ts
  // Set for one step-back click: suppresses the focus-driven keep-visible scroll so the tip-change
  // effect is the ONLY thing that moves the viewport (spec §1b — otherwise the click's focus pans the
  // camera forward horizontally before the effect freezes it). Cleared on read in scrollFocusIntoView.
  let suppressFocusScroll = false;
```

Replace `onNodeClick`:

```ts
  function onNodeClick(id: string) {
    if (!onnodeselect) return;
    // Detect step-back BEFORE onnodeselect mutates the store: tipId is still the old tip here.
    if (tipId && isStepBack(treeStore, tipId, id)) suppressFocusScroll = true;
    onnodeselect(id);
    focusItem(id);
  }
```

- [ ] **Step 2: Honor the flag in `scrollFocusIntoView`**

At the very top of `scrollFocusIntoView` (`:503`, after the `if (!scroller) return;` guard), add:

```ts
    if (suppressFocusScroll) { suppressFocusScroll = false; return; }
```

- [ ] **Step 3: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(spine-tree): suppress focus-scroll on step-back click (#66)"
```

---

> **CORRECTION 2 — Task 10 added 2026-07-23 after a second live-test round.** Task 4 put the
> scroll-stopping `scrollTargetPx = null` in the tip-change effect, but instrumentation showed the
> FLIP scroll driver (which runs BEFORE the tip-change effect in creation order) already wrote the
> recenter target — so the horizontal slide persisted (~82px). The real fix is to not *arm* the
> scroll in the FLIP effect on a step-back. See revised spec §1d. Task 10 does this; then Task 9's
> verification re-runs.

### Task 10: Guard the scroll-arming in the FLIP effect on step-back

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte:215` (the FLIP effect's scroll-arming condition)

**Interfaces:**
- Consumes: `isStepBack`, `treeStore`, `lastTipId` (declared later in the script but in scope at effect-run time), `tip` (the untracked `tipId` snapshot already computed at `:213`).

**Context — the arming block today (`:213-221`):**

```ts
    const tip = untrack(() => tipId);
    const atDefaultZoom = untrack(() => zoom === defaultZoomFor(viewport.isPhone));
    if (!reduceMotion && fromPos.size > 0 && atDefaultZoom && scroller && tip) {
      scrollFrom = { left: scroller.scrollLeft, top: scroller.scrollTop };
      scrollTargetPx = untrack(() => scrollTargetFor(tip));
    } else {
      scrollFrom = null;
      scrollTargetPx = null; // let the tip-change effect scroll natively (or instant)
    }
```

At FLIP-effect time `lastTipId` still holds the OLD tip (the tip-change effect updates it later in the same flush), so `isStepBack(treeStore, lastTipId, tip)` correctly classifies the pending move. Read `lastTipId` untracked to match the surrounding discipline (it's a plain `let`, not reactive, so untrack is belt-and-suspenders but keeps intent clear).

- [ ] **Step 1: Add the step-back term to the arming condition**

Replace the arming block with:

```ts
    const tip = untrack(() => tipId);
    const atDefaultZoom = untrack(() => zoom === defaultZoomFor(viewport.isPhone));
    // On a step-back, do NOT arm the scroll animation: the driver (next effect) would otherwise glide
    // scrollLeft to the recenter target before the tip-change effect can stop it (effect-ordering bug,
    // spec §1d). lastTipId is still the old tip here (the tip-change effect updates it later this
    // flush), so isStepBack classifies the pending move correctly.
    const steppingBack = !!tip && isStepBack(treeStore, untrack(() => lastTipId), tip);
    if (!reduceMotion && fromPos.size > 0 && atDefaultZoom && scroller && tip && !steppingBack) {
      scrollFrom = { left: scroller.scrollLeft, top: scroller.scrollTop };
      scrollTargetPx = untrack(() => scrollTargetFor(tip));
    } else {
      scrollFrom = null;
      scrollTargetPx = null; // step-back OR non-animated path: let the tip-change effect handle scroll
    }
```

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no new errors. (If `lastTipId` is flagged "used before declaration", it is a `let` hoisted in module/instance scope and only *read* at effect-run time, which is after init — but if the linter objects, move the `let lastTipId` / `let lastWidth` / `let lastInset` declarations ABOVE the `$effect` at `:200`. Prefer the minimal change; only relocate if the build actually errors.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "fix(spine-tree): don't arm FLIP scroll on step-back (effect-ordering, #66)"
```

- [ ] **Step 4: Note for Task 4's comment**

Task 4's step-back branch still carries `scrollTargetPx = null` with a comment claiming it stops the driver. That line is now redundant (the FLIP effect already nulled it) but harmless. Leave it; the controller's final review can decide whether to prune the stale comment. Do NOT remove it in this task — a later effect re-run on the same layout could theoretically re-arm, and the belt-and-suspenders null is cheap insurance.

---

> **CORRECTION 3 — Task 11 (root cause) + Task 12 (auto-release), done as direct controller edits
> after live Playwright debugging.** The residual ~82px slide that survived Tasks 8 & 10 was traced
> (systematic-debugging, instrumented `scrollLeft` setter → empty writer log → native clamp) to a
> **transient `scrollWidth` dip**: the effect-set `coyotePad` grew a render pass AFTER `contentWidth`
> shrank. Fix: derive `coyotePad` off a synchronously-captured `heldWidth` (spec §1e). Then, on live
> review, added auto-release of the gap after the collapse settles (spec §1f). Both landed in commit
> `1966968` (with the spec update); recorded here for the plan trail. Tasks 8 & 10 are retained as
> defense-in-depth (they address real secondary movers, just not the primary one).

### Task 11: Root-cause fix — `coyotePad` as `$derived` off `heldWidth` (DONE, commit 1966968)

**What changed in `SpineTree.svelte`:**
- Replaced `let coyotePad = $state(0)` (effect-incremented in Task 4) with:
  `let heldWidth = $state<number | null>(null)` and
  `let coyotePad = $derived(heldWidth != null ? coyotePadDelta(heldWidth, layout.width, X_GAP) : 0)`.
- Added `commitStepBack(next)` — called from `onNodeClick` and the `onTreeKey` Enter path BEFORE
  `onnodeselect` — which, when `isStepBack(treeStore, tipId, next)`, sets
  `heldWidth = heldWidth == null ? layout.width : Math.max(heldWidth, layout.width)` and arms
  `suppressFocusScroll`. Synchronous capture is the crux: `coyotePad` then recomputes in the same
  reactive pass `contentWidth` shrinks, so `scrollWidth` never dips.
- Removed the effect-based `coyotePad += …` and the `lastWidth` snapshot from Task 4's step-back
  branch; the branch keeps `scrollTargetPx = null` + the vertical `keepVisible1D` nudge.
- `resetZoom` and the forward/lateral branch clear `heldWidth = null` (was `coyotePad = 0`).

**Verification:** `npx tsc --noEmit` + `npx svelte-check` clean; live trace shows `scrollLeft` held at
1018 through the collapse (no dip), then recenter.

### Task 12: Auto-release the coyote-time gap after settle (DONE, commit 1966968)

**What changed in `SpineTree.svelte`:**
- `scheduleCoyoteRelease()` — called from the step-back branch — sets a `setTimeout(GLIDE_MS + 40)`
  that clears `heldWidth` and calls `scrollToNode(tipId)` (native smooth recenter). Rescheduled on
  each consecutive step-back (fires once stepping-back stops). Reduced-motion path releases
  immediately with no animated pan.
- `cancelCoyoteRelease()` — called from `resetZoom` and the forward/lateral branch — clears the timer
  so it can't double-fire or fire stale.

**Verification:** live trace — collapse holds to ~200ms, then release drops `scrollWidth` 2036→1836 and
smooth-scrolls the tip to center (x=264) by ~500ms. A tuning harness (`window.__coyote`, custom pan
speed / settle-to-fill) was built to explore alternatives, reviewed, and removed in favor of the
native-smooth-scroll recenter.

---

### Task 9: Full verification sweep + issue close

**Files:** none (verification only).

- [ ] **Step 1: Run the full pure-logic suite**

Run: `npx vitest run`
Expected: all pass (new `isStepBack` / `coyotePadDelta` / `keepVisible1D` tests included).

- [ ] **Step 2: Type + component checks**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: no errors.

- [ ] **Step 3: Manual acceptance against spec §Testing (measure scroll offsets, narrow ~900px viewport)**

Confirm all six spec checks, verifying by measured scroll offsets + node screen positions, not just eyeballing:
1. `taxon=ankylosauria` → step back to Thyreophora: `scrollLeft` frozen (no forward slide), `scrollWidth` held, gap opens, new tip on-screen.
2. Step back again: `scrollLeft` hold extends, `scrollWidth` held, **new tip still visible** (§1a regression check — must NOT be scrolled off-screen).
3. ⌂: `coyotePad` zeroes (`scrollWidth` shrinks), recenters, gap closes.
4. From the held state, search-jump to an unrelated taxon: recenters cleanly, no stale gap.
5. Short-tree (non-scrolled) case unchanged.
6. Game unaffected — tip only deepens, no step-back behavior triggers.

- [ ] **Step 4: Commit the closing marker**

Ensure a commit in this branch carries the closer (Indi pushes):

```bash
git commit --allow-empty -m "chore: close Explore step-back scroll anchoring

Closes #66"
```
