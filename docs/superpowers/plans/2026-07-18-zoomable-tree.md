# Zoomable Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pinch / trackpad / button zoom to the shared `SpineTree`, so both the game (Daily/Practice) and Explore can zoom out to read the whole tree and zoom in for detail.

**Architecture:** Zoom is transient state inside `SpineTree.svelte`. The SVG's rendered size is multiplied by a `zoom` factor (viewBox stays in unscaled coordinates), so the existing `overflow:auto` scroller keeps handling all panning natively. `@use-gesture`'s `PinchGesture` supplies the touch + trackpad zoom gesture; an on-screen `[− ⌂ +]` cluster and reset-on-navigation cover the rest. Every navigation already resets the view, so zoom-reset hooks those existing recenter points.

**Tech Stack:** Svelte 5 (runes) + TypeScript, Vite, Vitest. New runtime dep: `@use-gesture/vanilla`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does not catch violations; run `npx tsc --noEmit` and `npx svelte-check` before committing.
- Pure logic is TDD-tested (Vitest). Svelte components are validated by `svelte-check` + running the app (screenshot), not unit tests.
- Zoom bounds are module constants (tunable): `ZOOM_MIN = 0.1`, `ZOOM_MAX = 3`, `ZOOM_DEFAULT = 1`.
- Reset to default fires on: the ⌂ button AND any navigation (a `tipId` change, or a `panTo()` call).
- Default (zoom = 1) rendering must be byte-for-byte visually identical to today — verify with screenshots in both modes and both breakpoints.
- No em-dashes in UI copy / aria labels (use commas). En-dash ranges are fine.
- Delivery: commit each task to `main`, do NOT push (the maintainer pushes). Final commit closes the issue with `Closes #5`.

---

### Task 1: Pure zoom helpers

**Files:**
- Create: `src/lib/game/zoom.ts`
- Test: `src/lib/game/zoom.test.ts`

**Interfaces:**
- Produces:
  - `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_DEFAULT`, `ZOOM_STEP` (numbers)
  - `clampZoom(z: number): number`
  - `zoomStep(z: number, dir: 1 | -1): number`
  - `scrollForZoom(p: ScrollForZoomInput): { left: number; top: number }` where
    `ScrollForZoomInput = { origin: {x:number;y:number}; oldZoom:number; newZoom:number; scroll:{left:number;top:number}; viewport:{w:number;h:number}; content:{w:number;h:number} }`
    (`content` = UNSCALED svg content dims; `origin` = px relative to the scroller's top-left)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/zoom.test.ts
import { describe, it, expect } from "vitest";
import { ZOOM_MIN, ZOOM_MAX, clampZoom, zoomStep, scrollForZoom } from "./zoom";

describe("clampZoom", () => {
  it("clamps below, above, and passes through within", () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps up and down multiplicatively and clamps at the bounds", () => {
    expect(zoomStep(1, 1)).toBeGreaterThan(1);
    expect(zoomStep(1, -1)).toBeLessThan(1);
    expect(zoomStep(2.9, 1)).toBe(ZOOM_MAX); // 2.9*step > 3 -> clamped
    expect(zoomStep(0.11, -1)).toBe(ZOOM_MIN); // 0.11/step < 0.1 -> clamped
  });
});

describe("scrollForZoom", () => {
  const base = {
    origin: { x: 100, y: 0 },
    scroll: { left: 0, top: 0 },
    viewport: { w: 200, h: 100 },
    content: { w: 1000, h: 100 },
  };
  it("keeps the point under the origin fixed while zooming in", () => {
    // content point under screen-x 100 is content-x 100; at 2x it must stay under screen-x 100,
    // i.e. scrollLeft = 100*2 - 100 = 100.
    const { left } = scrollForZoom({ ...base, oldZoom: 1, newZoom: 2 });
    expect(left).toBe(100);
  });
  it("clamps scroll into [0, max] and yields 0 when content fits the viewport", () => {
    const fits = scrollForZoom({
      ...base, origin: { x: 50, y: 0 }, oldZoom: 1, newZoom: 0.1, content: { w: 1000, h: 100 },
    });
    expect(fits.left).toBe(0); // 1000*0.1=100 < viewport 200 -> maxLeft 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/zoom.test.ts`
Expected: FAIL, "Failed to resolve import './zoom'" / functions not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/game/zoom.ts
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const ZOOM_DEFAULT = 1;
export const ZOOM_STEP = 1.3; // multiplicative step per +/- button press

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function zoomStep(z: number, dir: 1 | -1): number {
  return clampZoom(dir > 0 ? z * ZOOM_STEP : z / ZOOM_STEP);
}

export interface ScrollForZoomInput {
  origin: { x: number; y: number }; // px, relative to the scroller's top-left
  oldZoom: number;
  newZoom: number;
  scroll: { left: number; top: number };
  viewport: { w: number; h: number };
  content: { w: number; h: number }; // UNSCALED svg content dims
}

// New scroll offset that keeps `origin` over the same content point across a zoom change,
// clamped to the scrollable range. When the scaled content is smaller than the viewport the
// max is 0, so this returns 0 and CSS centering takes over.
export function scrollForZoom(p: ScrollForZoomInput): { left: number; top: number } {
  const cx = (p.scroll.left + p.origin.x) / p.oldZoom;
  const cy = (p.scroll.top + p.origin.y) / p.oldZoom;
  const rawLeft = cx * p.newZoom - p.origin.x;
  const rawTop = cy * p.newZoom - p.origin.y;
  const maxLeft = Math.max(0, p.content.w * p.newZoom - p.viewport.w);
  const maxTop = Math.max(0, p.content.h * p.newZoom - p.viewport.h);
  return {
    left: Math.min(Math.max(0, rawLeft), maxLeft),
    top: Math.min(Math.max(0, rawTop), maxTop),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/zoom.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/zoom.ts src/lib/game/zoom.test.ts
git commit -m "feat(zoom): pure zoom helpers (clamp, step, scroll-for-zoom)"
```

---

### Task 2: `.tree-viewport` wrapper (layout refactor, no behavior change)

Reason: the zoom control cluster must float over the tree without scrolling with it, so it needs a positioned wrapper that is a sibling of the scroller. This task introduces that wrapper and re-points the consumers' positioning rules at it, changing nothing visible.

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` (template root + `<style>`)
- Modify: `src/lib/game/components/GameBoard.svelte` (`<style>` only)
- Modify: `src/lib/explorer/components/Explorer.svelte` (`<style>` only)

**Interfaces:**
- Produces: SpineTree's root element is now `<div class="tree-viewport">` wrapping the existing `.tree-scroll` (or the empty `<p>`). Consumers position `.tree-viewport` where they used to position `.tree-scroll`.

- [ ] **Step 1: Wrap SpineTree's content in `.tree-viewport`**

In `SpineTree.svelte`, replace the template's top-level conditional:

```svelte
{#if layout.nodes.length}
  <div class="tree-scroll" bind:this={scroller} use:scrollFade={{ dep: scrollWidth, alwaysLeft: true }}>
    ...svg...
  </div>
{:else}
  <p class="tree-empty">{emptyLabel}</p>
{/if}
```

with a wrapping `<div class="tree-viewport">`:

```svelte
<div class="tree-viewport">
  {#if layout.nodes.length}
    <div class="tree-scroll" bind:this={scroller} use:scrollFade={{ dep: scrollWidth, alwaysLeft: true }}>
      ...svg (unchanged)...
    </div>
  {:else}
    <p class="tree-empty">{emptyLabel}</p>
  {/if}
</div>
```

- [ ] **Step 2: Add wrapper styles in SpineTree**

In `SpineTree.svelte` `<style>`, add above `.tree-scroll`:

```css
/* Positioned viewport so the zoom controls (added later) can float over the canvas without
   scrolling with it. In the base flex layout it takes the role .tree-scroll had. */
.tree-viewport { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
.tree-viewport .tree-scroll { flex: 1 1 auto; min-width: 0; }
```

- [ ] **Step 3: Re-point GameBoard's positioning rules to `.tree-viewport`**

In `GameBoard.svelte` `<style>`, make these edits (leave the `overflow`/`flex:none` on the inner elements):

Base rule:
```css
/* was: .middle :global(.tree-scroll) { flex: 1 1 auto; min-width: 0; } */
.middle :global(.tree-viewport) { flex: 1 1 auto; min-width: 0; }
```

Desktop block (`@media (min-width: 641px)`):
```css
/* was: .middle :global(.tree-scroll) { position: absolute; inset: 0; display: flex; align-items: safe center; overflow: auto; } */
.middle :global(.tree-viewport) { position: absolute; inset: 0; }
.middle :global(.tree-scroll) {
  position: absolute; inset: 0; display: flex;
  align-items: safe center; justify-content: safe center; overflow: auto;
}
```

Narrow block (`@media (max-width: 640px)`):
```css
/* was: .middle :global(.tree-scroll) { width: 100%; } */
.middle :global(.tree-viewport) { width: 100%; }
.middle :global(.tree-scroll) { width: 100%; }
```

- [ ] **Step 4: Re-point Explorer's positioning rules to `.tree-viewport`**

In `Explorer.svelte` `<style>`, apply the exact same three edits as Step 3 (the Explorer CSS mirrors GameBoard's: a base `.middle :global(.tree-scroll){ flex:1 1 auto; min-width:0 }`, a desktop `position:absolute; inset:0; display:flex; align-items:safe center; overflow:auto`, and a narrow `width:100%`). Add `justify-content: safe center` to the desktop `.tree-scroll` as in Step 3.

- [ ] **Step 5: Validate + screenshot regression check (both modes, both breakpoints)**

```bash
npx svelte-check --threshold error
npm run dev
```
Drive with Playwright at 1280x800 AND 480x800: load Daily, make one guess (tree renders), screenshot; open Explore, focus a clade, screenshot. Compare against the current build, the layout must look identical (tree fills the canvas, specimen floats top-right, nothing shifted). If anything moved, fix the wrapper/consumer CSS before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte src/lib/game/components/GameBoard.svelte src/lib/explorer/components/Explorer.svelte
git commit -m "refactor(tree): wrap SpineTree in a positioned .tree-viewport (no visual change)"
```

---

### Task 3: Zoom state, scaled rendering, and the `[− ⌂ +]` controls

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `zoom.ts` (Task 1); `.tree-viewport` (Task 2).
- Produces (used by Tasks 4 and 5):
  - `let zoom = $state(ZOOM_DEFAULT)` — the current zoom factor.
  - `function applyZoom(nextZoom: number, origin: { x: number; y: number }): void` — clamps, sets `zoom`, and adjusts scroll via `scrollForZoom` on the next frame. `origin` is relative to the scroller's top-left.
  - `function resetZoom(): void` — sets `zoom = ZOOM_DEFAULT` and re-centers on `tipId`.

- [ ] **Step 1: Import the helpers**

In `SpineTree.svelte` `<script>`, add:
```ts
import {
  ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, clampZoom, zoomStep, scrollForZoom,
} from "../zoom";
```

- [ ] **Step 2: Add zoom state**

Near the other `$state` (e.g. just after `let scroller = $state<HTMLDivElement | null>(null);`):
```ts
let zoom = $state(ZOOM_DEFAULT);
```

- [ ] **Step 3: Add `applyZoom` and `resetZoom`**

Add near `scrollToNode` / `panTo`:
```ts
// Sole mutator of zoom. Clamps, then keeps `origin` fixed under the pointer. The scroll is set
// on the next frame so the SVG has resized to the new zoom before we clamp scrollLeft/Top.
function applyZoom(nextZoom: number, origin: { x: number; y: number }) {
  if (!scroller) return;
  const oldZoom = zoom;
  const z = clampZoom(nextZoom);
  if (z === oldZoom) return;
  const target = scrollForZoom({
    origin,
    oldZoom,
    newZoom: z,
    scroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
    viewport: { w: scroller.clientWidth, h: scroller.clientHeight },
    content: { w: scrollWidth, h: vbH },
  });
  zoom = z;
  requestAnimationFrame(() => scroller?.scrollTo({ left: target.left, top: target.top }));
}

// Return to the default view: 1:1, re-centered on the current tip.
function resetZoom() {
  zoom = ZOOM_DEFAULT;
  requestAnimationFrame(() => { if (tipId) scrollToNode(tipId); });
}

// Button helpers zoom around the viewport center.
function zoomButton(dir: 1 | -1) {
  if (!scroller) return;
  applyZoom(zoomStep(zoom, dir), { x: scroller.clientWidth / 2, y: scroller.clientHeight / 2 });
}
```

- [ ] **Step 4: Scale the SVG by `zoom`**

In the `<svg class="tree" ...>`, change the size attributes to multiply by `zoom` and add the `zoomed` class; leave the `viewBox` in unscaled coordinates:
```svelte
<svg
  class="tree"
  class:zoomed={zoom !== ZOOM_DEFAULT}
  width={scrollWidth * zoom}
  height={vbH * zoom}
  viewBox={`0 0 ${scrollWidth} ${vbH}`}
  role="img"
  aria-label="Cladogram"
>
```

- [ ] **Step 5: Let the SVG shrink below content width when zoomed**

In `SpineTree.svelte` `<style>`, the existing `.tree { ... min-width: max-content; }` blocks zoom-out. Keep it for the default, but drop it while zoomed:
```css
/* min-width:max-content keeps the tree full-size at rest; it must not pin the width during
   zoom-out, so release it whenever zoom != 1. */
.tree.zoomed { min-width: 0; }
```

- [ ] **Step 6: Add the control cluster markup**

Inside `.tree-viewport`, after the `{#if}...{/if}` block (so it is a sibling of `.tree-scroll`, not inside the scroller):
```svelte
  <div class="zoom-controls" role="group" aria-label="Zoom">
    <button type="button" aria-label="Zoom out" onclick={() => zoomButton(-1)} disabled={zoom <= ZOOM_MIN}>&minus;</button>
    <button type="button" aria-label="Reset zoom" onclick={resetZoom} disabled={zoom === ZOOM_DEFAULT}>⌂</button>
    <button type="button" aria-label="Zoom in" onclick={() => zoomButton(1)} disabled={zoom >= ZOOM_MAX}>+</button>
  </div>
```

- [ ] **Step 7: Add structural styles for the cluster**

In `SpineTree.svelte` `<style>` (structural only; palette polish is deferred):
```css
.zoom-controls {
  position: absolute; z-index: 5; right: var(--space-4); bottom: var(--space-4);
  display: flex; gap: 1px;
}
.zoom-controls button {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; font-size: 1rem; cursor: pointer;
}
.zoom-controls button:disabled { cursor: default; opacity: 0.5; }
```

- [ ] **Step 8: Validate + verify in the app**

```bash
npx tsc --noEmit && npx svelte-check --threshold error
npm run dev
```
Drive with Playwright: in Daily (after a guess) and in Explore, click `+` several times (tree grows, cannot exceed 3x), `−` several times (tree shrinks past 1:1 down toward 0.1x and stays centered when small), and `⌂` (returns to 1:1, re-centered). Screenshot each. Confirm the `−`/`+`/`⌂` disable at their limits.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(zoom): scaled rendering + [- home +] zoom controls on the tree"
```

---

### Task 4: Reset zoom on navigation

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `resetZoom` (Task 3), the existing auto-center `$effect` and `panTo`.

- [ ] **Step 1: Reset on a `tipId` change (new guess / Explore focus)**

In the auto-center `$effect`, reset zoom when the tip actually changes (not on a mere `rightInset` settle). Change the effect body so that when `tipId !== lastTipId`, it calls `resetZoom()` instead of scrolling directly:

```ts
$effect(() => {
  const d = tipId ? (posOf.get(tipId)?.depth ?? -1) : -1;
  void scrollWidth;
  if (scroller && tipId && d >= 0) {
    if (tipId !== lastTipId) {
      resetZoom(); // navigation -> back to default view, which re-centers on the new tip
    } else if (rightInset !== lastInset) {
      scrollToNode(tipId);
    }
  }
  lastTipId = tipId;
  lastInset = rightInset;
});
```

- [ ] **Step 2: Reset on a `panTo` (breadcrumbs / warmest-trail crumbs)**

At the top of `panTo`, reset zoom so a breadcrumb jump lands in the default view:
```ts
export function panTo(id: string) {
  if (zoom !== ZOOM_DEFAULT) {
    resetZoom();
    // resetZoom already re-centers on tipId; if the pan target differs, honor it next frame.
    requestAnimationFrame(() => scrollToNode(id));
    return;
  }
  scrollToNode(id);
}
```

- [ ] **Step 3: Validate + verify in the app**

```bash
npx tsc --noEmit && npx svelte-check --threshold error
npm run dev
```
Drive with Playwright:
- Game: zoom in with `+`, then make a new guess. Assert `zoom` returned to default (tree re-centers on the new frontier).
- Game: zoom in, then click an earlier guess row in the guess list (a breadcrumb). Assert zoom reset and the tree panned to that node.
- Explore: zoom in, then focus a different node. Assert zoom reset.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(zoom): reset zoom to default on any navigation"
```

---

### Task 5: Touch + trackpad pinch via `@use-gesture`

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `applyZoom` (Task 3), the `scroller` element.

- [ ] **Step 1: Install the dependency**

```bash
npm install @use-gesture/vanilla
```
Expected: `@use-gesture/vanilla` added to `dependencies` in `package.json`.

- [ ] **Step 2: Bind `PinchGesture` to the scroller**

In `SpineTree.svelte` `<script>`, import and wire it in an `$effect` (so it attaches once the scroller exists and is destroyed on unmount):
```ts
import { PinchGesture } from "@use-gesture/vanilla";
```
```ts
// Touch two-finger pinch + trackpad ctrl+wheel, unified. Feeds the single applyZoom entry point.
// `from` starts each gesture at the current zoom; scaleBounds keeps the library's accumulated
// scale inside our range; passive:false lets it preventDefault the ctrl+wheel so the PAGE never
// zooms. Native one-finger scrolling is untouched.
$effect(() => {
  if (!scroller) return;
  const gesture = new PinchGesture(
    scroller,
    (state) => {
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      applyZoom(state.offset[0], { x: state.origin[0] - rect.left, y: state.origin[1] - rect.top });
    },
    {
      scaleBounds: { min: ZOOM_MIN, max: ZOOM_MAX },
      from: () => [zoom, 0],
      rubberband: false,
      eventOptions: { passive: false },
    },
  );
  return () => gesture.destroy();
});
```

- [ ] **Step 3: Keep one-finger pan native, block Safari page-pinch over the tree**

In `SpineTree.svelte` `<style>`, on `.tree-scroll` add:
```css
/* one-finger drag stays native scroll; two-finger goes to the pinch handler above */
.tree-scroll { touch-action: pan-x pan-y; }
```
And in the pinch `$effect` (Step 2), also suppress iOS Safari's accessibility gesture over the scroller so it doesn't fight the pinch. Add before `return`:
```ts
const stopGesture = (e: Event) => e.preventDefault();
scroller.addEventListener("gesturestart", stopGesture);
return () => { gesture.destroy(); scroller?.removeEventListener("gesturestart", stopGesture); };
```
(Replace the plain `return () => gesture.destroy();` from Step 2 with this combined cleanup.)

- [ ] **Step 4: Validate + verify in the app**

```bash
npx tsc --noEmit && npx svelte-check --threshold error
npm run dev
```
Drive with Playwright:
- Trackpad pinch (directly simulable): dispatch `wheel` events with `ctrlKey: true` and negative `deltaY` over the tree, assert `zoom` increases and is capped at 3; positive `deltaY`, assert it decreases toward 0.1.
- One-finger pan intact: with the tree zoomed in, dispatch a single-pointer drag (pointerdown/move/up) and assert the scroller's `scrollLeft` changed (native scroll still works).
- Touch pinch: dispatch two `pointerdown` (pointerType "touch") and move them apart; assert `zoom` increased. Screenshot the zoomed state.
- Regression: navigation still resets zoom (repeat a Task 4 check).

- [ ] **Step 5: Full suite + commit (closes the issue)**

```bash
npx vitest run && npx tsc --noEmit && npx svelte-check --threshold error
git add package.json package-lock.json src/lib/game/components/SpineTree.svelte
git commit -m "feat(zoom): touch + trackpad pinch via @use-gesture

Closes #5"
```

---

## Notes for the executor

- **The `min-width` wrinkle (Task 3, Step 5)** is the one thing most likely to misbehave. If zoom-out still won't shrink the tree, confirm nothing else pins the SVG width (the `width` attribute plus `.tree.zoomed { min-width: 0 }` should be sufficient; the flex parents use `flex: none` on `.tree`). Do not "fix" it by scaling with a CSS `transform` — that breaks the native-scroll panning this whole design relies on.
- **`requestAnimationFrame` ordering** matters: `zoom` is `$state`, so the SVG resizes reactively; scrolling must happen after that resize or the browser clamps `scrollLeft` against the old size. That is why `applyZoom` and `resetZoom` defer the scroll by one frame.
- **`@use-gesture` state shape:** `state.offset` is `[scale, angle]` (we use `offset[0]`), `state.origin` is `[clientX, clientY]` of the gesture centroid. With `from: () => [zoom, 0]` each new gesture resumes from the current zoom.
