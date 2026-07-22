# FLIP Edge-Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** During an Explore relayout, make branch edges, spine gradients, the root stem, and collapsed-clade stubs track the ANIMATED node positions (`displayed`) instead of snapping to final layout geometry — so tree-lines glide with their nodes rather than detaching/reattaching.

**Architecture:** Derive `displayedPos` (id → animated `{x,y,opacity}` pixel map) from the existing `displayed` list. Refactor `edgePath` to take two pixel `Point`s (pure + testable). Route the edge `{#each}`, the per-segment gradient endpoints, the root stem, and the stubs through `displayedPos`. Edges carry the child node's opacity so a branch fades in with the entering node it reaches. Reduced-motion needs no special-casing (at progress=1, `displayed` == final layout).

**Tech Stack:** Svelte 5 runes, TS (`verbatimModuleSyntax`), Vitest.

## Global Constraints
- `verbatimModuleSyntax` ON — `import type`. Run `tsc --noEmit` + `svelte-check --threshold error` before every commit.
- `displayed` positions are ALREADY pixels (`layoutPos` bakes `px`/`py` at snapshot). Edge/stem/stub/gradient code reading `displayedPos` MUST NOT re-apply `px`/`py`. (Highest-risk mistake.)
- Reduced motion: no branch needed — verify it stays instant/correct.
- Scope = **edge-tracking only** (straight-line follow). Entering-child edges rubber-band (parent glides, child static) — accepted. Topology choreography (grow/shrink/retract) is scope-C epic #58, OUT.
- Edge opacity = the child endpoint's opacity (branch fades in with the node it reaches).
- Pure logic TDD'd; motion is Playwright + human verified.
- Commits ref `#52` (or the new follow-up issue once filed); no "Closes" in task commits. Unpushed (Morgan pushes).

**Spec:** `docs/superpowers/specs/2026-07-21-flip-edge-tracking-design.md`

---

## File Structure
- **Modify:** `src/lib/game/spine-layout.ts` OR a small pure module for `edgePath` — decide in Task 1 (see note). Actually `edgePath` currently lives INSIDE `SpineTree.svelte` and closes over `px`/`py`/`CORNER_RADIUS`. Task 1 extracts a pure `edgePathBetween(p: Point, c: Point, cornerRadius: number)` to a testable location.
- **Create:** test for the extracted path helper.
- **Modify:** `src/lib/game/components/SpineTree.svelte` — `displayedPos` derived; reroute edges/gradients/stem/stubs; edge opacity.

---

### Task 1: Extract `edgePathBetween` as a pure, tested helper

**Files:**
- Modify: `src/lib/game/spine-layout.ts` (add the pure fn next to `centerOffsetFor`, which is already a pure layout helper there) + its test `src/lib/game/spine-layout.test.ts`.

**Interfaces:**
- Produces: `export function edgePathBetween(p: { x: number; y: number }, c: { x: number; y: number }, cornerRadius: number): string` — the square-cladogram elbow path from parent pixel-point `p` to child pixel-point `c`. Same math as today's `edgePath` but taking resolved pixel points instead of ids+`px`/`py`.

Logic (ported verbatim from `SpineTree.svelte:413-429`, with `px(p.x)→p.x` etc.):
```
x0 = p.x, y0 = p.y; cx = p.x, cy = c.y; x1 = c.x; dy = cy - y0;
if (dy === 0) return `M ${x0} ${y0} H ${x1}`;
dirY = sign(dy); r = min(cornerRadius, abs(dy)/2, (x1 - cx)/2);
return `M ${x0} ${y0} V ${cy - r*dirY} Q ${cx} ${cy} ${cx + r} ${cy} H ${x1}`;
```

- [ ] **Step 1: Failing tests**

```ts
// src/lib/game/spine-layout.test.ts — add
import { edgePathBetween } from "./spine-layout";
describe("edgePathBetween", () => {
  it("same-row child → straight horizontal arm (no elbow)", () => {
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 100 }, 16)).toBe("M 40 100 H 240");
  });
  it("child below → rounded elbow at parent x, child y", () => {
    // dy=52>0, dirY=1, r=min(16,26,100)=16
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 152 }, 16))
      .toBe("M 40 100 V 136 Q 40 152 56 152 H 240");
  });
  it("child above → elbow up (dirY=-1)", () => {
    // dy=-52, dirY=-1, r=min(16,26,100)=16; V goes to cy - r*-1 = 152+16=168? check: cy=48,y0=100 → dy=-52
    const s = edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 48 }, 16);
    expect(s).toBe("M 40 100 V 64 Q 40 48 56 48 H 240");
  });
  it("clamps radius on a short riser", () => {
    // dy=10 → r=min(16,5,...) = 5
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 110 }, 16))
      .toBe("M 40 100 V 105 Q 40 110 45 110 H 240");
  });
});
```
(Verify the exact expected strings by computing by hand during RED; adjust if the hand-calc differs — the POINT is the ported math is identical to the current inline version.)

- [ ] **Step 2: Run → RED.** `npx vitest run src/lib/game/spine-layout.test.ts`
- [ ] **Step 3: Implement `edgePathBetween` in `spine-layout.ts`** (ported math above).
- [ ] **Step 4: Run → GREEN.**
- [ ] **Step 5: `tsc --noEmit`; commit** `feat: extract pure edgePathBetween helper (#52)`

---

### Task 2: `displayedPos` map + reroute edges/stem/stubs/gradients through it

**Files:** Modify `src/lib/game/components/SpineTree.svelte`.

**Consumes:** `edgePathBetween` (Task 1), the existing `displayed` derived.

**Design notes:**
- Add `let displayedPos = $derived(new Map(displayed.map((d) => [d.id, d])));` (id → `{x,y,opacity}`, pixels). Place after `displayed`.
- Replace the component's inline `edgePath(parentId, childId)` usage. Simplest: keep a thin local wrapper `edgePathAnim(parentId, childId)` that looks up both endpoints in `displayedPos` and calls `edgePathBetween(p, c, CORNER_RADIUS)`; if either endpoint is missing, return `""` (defensive — shouldn't happen per the investigation, but skip rather than throw). Delete the old `edgePath` (or repoint it).
- **Edges `{#each}` (lines ~757-761):** `d={edgePathAnim(e.parentId, e.childId)}`, and add `opacity` = child endpoint's opacity: `{@const co = displayedPos.get(e.childId)?.opacity ?? 1}` then `opacity={co}`. Keep the `class:spine`, gradient stroke for spine.
- **Gradient endpoints (lines ~741-753):** `x1={displayedPos.get(e.parentId)?.x} x2={displayedPos.get(e.childId)?.x}` (animated x, NOT `px(p.x)`). Guard: only render the gradient when both are present. (Gradient must share the animated source or the color detaches from the moving stroke.)
- **Root stem (line ~756):** `d={`M 0 ${stemY} H ${px(0)}`}` where `stemY` = the animated y of the root node = `displayedPos.get(treeStore.data.rootId)?.y ?? py(0)`. (`px(0)` is a constant, fine; only the y term moved via minY.)
- **Stubs (lines ~765-769):** `{@const dp = displayedPos.get(n.id)}` guard, then `transform={`translate(${dp.x} ${dp.y})`}` (animated, no `px`/`py`). Iterate `layout.nodes` still (for `isExpandable`), but position from `displayedPos`. Skip if `dp` missing.

**CAUTION:** everywhere you now read `displayedPos`, the values are pixels — do NOT wrap in `px()`/`py()`.

- [ ] **Step 1: Add `displayedPos` derived + `edgePathAnim` wrapper.**
- [ ] **Step 2: Reroute the edges `{#each}` (path + child opacity).**
- [ ] **Step 3: Reroute the gradient endpoints to animated x (guard both-present).**
- [ ] **Step 4: Reroute the root stem y and the stubs' translate to `displayedPos`.**
- [ ] **Step 5: Gate.** `npx vitest run` (full, no regression) && `npx tsc --noEmit` && `npx svelte-check --threshold error`. All green.
- [ ] **Step 6: Commit** `feat: FLIP edges/stem/stubs track animated node positions (#52)`

---

### Task 3: Live verification (visual gate)

No unit test — DOM/visual. `npm run dev`.

- [ ] **Step 1: Edges track, don't snap.** In Explore, relayout (click a node above the tip). Sample a branch `<path>`'s `d` attr over frames: its endpoints should interpolate with the gliding nodes, NOT jump to final geometry on frame 0. (Was: snapped.)
- [ ] **Step 2: Symptom 1 gone.** Click the node just above the tip — the spine should NOT appear connected to the new tip before the nodes arrive; it should bend/follow. Confirm the "connect-then-recenter" jump is gone.
- [ ] **Step 3: Symptom 2 gone.** Collapse a clade — nodes below should stay attached to their branches as they redistribute (no detach/reattach).
- [ ] **Step 4: Entering edges fade + rubber-band.** A relayout revealing new children: edges to entering nodes fade in with them (not solid-to-ghost), stretching from the gliding parent. Confirm no color detach on spine gradients.
- [ ] **Step 5: Reduced motion instant.** Emulate `prefers-reduced-motion` → everything (nodes + edges + stem + stubs) snaps to final, no glide. (Or code-inspect if harness can't toggle — note it.)
- [ ] **Step 6: Commit any fix-forward** `fix: edge-tracking visual adjustments (#52)` (skip if none).

## Self-Review
- Both symptoms = edges snap while nodes glide → rerouted through `displayed`. ✓
- Pixel-space caution called out (no double px/py). ✓
- Edge opacity = child opacity (fade with entering node). ✓
- Gradient endpoints share the animated source (no color detach). ✓
- Reduced-motion correct-for-free (displayed==final at progress 1). ✓
- `edgePathBetween` pure + TDD'd. ✓
- Entering-child rubber-band accepted; topology choreography OUT (epic #58). ✓
- Defensive skip on missing endpoint. ✓
