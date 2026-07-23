# Desktop Placard Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop specimen placard a fixed, top-floating physical block that scrolls as a unit over the header and footer when it is taller than the viewport, so its lower content is never unreachable — and shift the zoom controls left when the placard is tall.

**Architecture:** Mirror the mobile `BottomSheet` model on desktop: `.specimen-float` becomes a `position: fixed` layer (`z-index: 8`, above the header's 4) with `overflow-y: auto`, driven by native scroll instead of drag. A resting-position pad (`--placard-rest-top`) keeps the common case pixel-identical to today. One measuring `$effect` in `BoardLayout` publishes two `documentElement` custom properties — `--placard-rest-top` (the pad) and `--placard-clearance` (how far the zoom controls shift left) — the same channel pattern the mobile drawer uses with `--drawer-peek-h`. The working `BottomSheet` is left untouched (mirror, not shared code).

**Tech Stack:** Svelte 5 runes, TypeScript, CSS. No unit-testable logic — this is layout, so verification is in-browser via the Playwright MCP (measure-fail → implement → measure-pass), plus `tsc`/`svelte-check`.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — any type-only import MUST use `import type`. Run `npx tsc --noEmit` AND `npx svelte-check --threshold warning` before every commit; both must report 0 errors / 0 warnings.
- **Desktop only.** Every change is gated `@media (min-width: 641px)` (CSS) or a `viewport.isPhone` early-return (the effect). The phone `BottomSheet` path must stay byte-identical in behavior.
- **No engine/data/logic changes.** Pure layout — do not touch `src/lib/game/engine-core.ts`, stores, or data.
- **Follow the existing px-for-token convention** in `BoardLayout` (line 18 already hardcodes `placardW + 24 + 24` for `--space-5`/gap); comment which token each literal maps to.
- **Merge workflow:** work on a branch, commit with `Closes #65`, merge `--no-ff` to `main`, delete the branch. Do NOT push — the user pushes.
- **Working screenshots** (if any) go in a gitignored folder, never the repo root; clear them before committing.

---

### Task 1: Desktop placard becomes a fixed, scroll-as-a-unit layer

Fixes the #65 bug: on a short viewport the placard clips off-screen with no way to reach its bottom. After this task it is a fixed top-floating block that scrolls over the header and footer.

**Files:**
- Modify: `src/lib/game/components/BoardLayout.svelte` (script: add `placardEl` ref + the measuring effect; markup: bind the ref; style: the desktop `.specimen-float` rules at line 69)

**Interfaces:**
- Consumes: nothing new.
- Produces: two `documentElement` CSS custom properties, set only on desktop while a placard is mounted —
  - `--placard-rest-top`: px string, `headerHeight + 16` (the `--space-4` cluster pad). The placard's scroll-box top padding, so at `scrollTop: 0` the card rests below the header exactly as today.
  - `--placard-clearance`: px string, `0px` when the placard does not reach the zoom controls' band, else `placardWidth + 24`. Consumed by Task 2.

- [ ] **Step 1: Reproduce the bug (measure-fail).**

Ensure the dev server is up (the user runs many; do not start/kill one — reuse `http://localhost:5173`). In the Playwright MCP browser:

Resize to `1280×380`, navigate to `http://localhost:5173/?fresh=t1a#/daily`, then drive the daily game to end-state by exhausting guesses (type a letter, click the first `.searchbox [role="option"]`, repeat ~20×). Then evaluate:

```js
() => {
  const p = document.querySelector('.specimen-float')?.getBoundingClientRect();
  const wiki = document.querySelector('.specimen-float .wiki')?.getBoundingClientRect();
  return {
    overflowBy: p ? Math.round(p.bottom - window.innerHeight) : null,
    wikiVisible: wiki ? wiki.bottom <= window.innerHeight : null,
    docScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
  };
}
```

Expected (bug present): `overflowBy` > 0 (~112), `wikiVisible: false`, `docScrollable: false` — the bottom is clipped and unreachable.

- [ ] **Step 2: Add the placard ref and the measuring effect.**

In `src/lib/game/components/BoardLayout.svelte`, replace the script block's existing `placardW`/`rightInset`/breakpoint-effect region (lines 15-25) with the same plus a ref and the measuring effect:

```svelte
  // Desktop measures the floating placard so the tree centers into the area LEFT of it. On phone
  // the placard is a bottom sheet in flow, so there is no inset.
  let placardW = $state(0);
  let rightInset = $derived(!viewport.isPhone && placardW ? placardW + 24 + 24 : 0);

  // Crossing the breakpoint re-lays-out the board, so the sheet must return to its collapsed
  // default rather than reappearing expanded. Rotating a phone crosses 640px twice.
  $effect(() => {
    void viewport.isPhone;
    sheetExpanded = false;
  });

  // The desktop placard is a fixed top-floating layer (see <style>). It publishes two vars, the
  // same documentElement channel the mobile drawer uses for --drawer-peek-h, because the readers
  // (the placard's own rest pad; the zoom controls in a different stacking context) can't see this
  // element directly:
  //   --placard-rest-top : scroll-box top pad, so at rest the card sits below the header as today.
  //   --placard-clearance: how far the zoom controls slide LEFT, non-zero only when the card is
  //                        tall enough to reach their bottom-right corner (#65 open question).
  let placardEl = $state<HTMLElement>();
  $effect(() => {
    if (viewport.isPhone) return; // phone uses the BottomSheet; no fixed layer, no vars
    const el = placardEl;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const headerH = document.querySelector<HTMLElement>(".app-header")?.offsetHeight ?? 0;
      root.style.setProperty("--placard-rest-top", `${headerH + 16}px`); // 16 == --space-4 cluster pad
      // The card's on-screen bottom at scrollTop 0 == its scrollHeight (rest pad is inside the box).
      // Compare to the zoom controls' DEFAULT (unshifted) band top, so shifting them never changes
      // this test (no oscillation). Measure the controls' height; fall back if not mounted yet.
      const zh = document.querySelector<HTMLElement>(".zoom-controls")?.offsetHeight ?? 36;
      const controlsBandTop = window.innerHeight - 16 - zh; // 16 == --space-4 bottom inset
      const overlaps = el.scrollHeight > controlsBandTop;
      root.style.setProperty("--placard-clearance", overlaps ? `${el.offsetWidth + 24}px` : "0px"); // 24 == --space-5 gap
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--placard-rest-top");
      root.style.removeProperty("--placard-clearance");
    };
  });
```

- [ ] **Step 3: Bind the ref in the markup.**

In the same file, add `bind:this={placardEl}` to the `.specimen-float` div (currently line 34, which already has `bind:clientWidth={placardW}`):

```svelte
      <div class="specimen-float" bind:this={placardEl} bind:clientWidth={placardW}>
        {@render placard(false)}
      </div>
```

- [ ] **Step 4: Rewrite the desktop `.specimen-float` rule.**

In the `@media (min-width: 641px)` block, replace the single `.specimen-float` line (line 69):

```css
    .specimen-float { position: absolute; top: var(--space-4); right: var(--space-5); z-index: 5; width: max-content; }
```

with the fixed scroll-layer (and its interactive-child rule):

```css
    /* The placard is the top-floating element: a fixed layer above the header (z 8 > header 4),
       clipped only by the viewport edges. It scrolls as ONE rigid block — the rest pad seats the
       card below the header at scrollTop 0 (pixel-identical to the old absolute rest), and scrolling
       slides the whole card up over the header and down over the footer. The layer is inert so the
       tree stays interactive behind it; the card re-enables pointers. (Mirrors the mobile drawer.) */
    .specimen-float {
      position: fixed; top: 0; right: var(--space-5); z-index: 8;
      width: max-content; max-height: 100dvh;
      overflow-y: auto; overscroll-behavior: contain;
      padding-top: var(--placard-rest-top, var(--space-4));
      pointer-events: none;
    }
    .specimen-float > :global(*) { pointer-events: auto; }
```

- [ ] **Step 5: Type/build check.**

Run: `npx tsc --noEmit && npx svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Verify the bug is fixed (measure-pass) at 1280×380.**

In the browser, navigate `http://localhost:5173/?fresh=t1b#/daily`, resize `1280×380`, drive to end-state as in Step 1, then evaluate:

```js
() => {
  const float = document.querySelector('.specimen-float');
  float.scrollTop = float.scrollHeight; // scroll the block fully up
  const wiki = document.querySelector('.specimen-float .wiki')?.getBoundingClientRect();
  const header = document.querySelector('.app-header').getBoundingClientRect();
  const card = document.querySelector('.specimen-float .specimen-placard').getBoundingClientRect();
  // z-order probe: where the card overlaps the header band, is the card on top?
  const x = Math.round((card.left + card.right) / 2);
  const hitAtHeader = document.elementFromPoint(x, Math.round((header.top + header.bottom) / 2));
  return {
    wikiReachable: wiki ? wiki.bottom <= window.innerHeight + 1 : null,
    cardCanOverlapHeader: card.top < header.bottom,
    cardWinsOverHeader: document.querySelector('.specimen-float').contains(hitAtHeader),
  };
}
```

Expected: `wikiReachable: true` (bottom content now reachable by scroll), `cardWinsOverHeader: true` (rides over the header, not clipped).

- [ ] **Step 7: Verify no regression in the common case at 1280×900.**

Navigate `http://localhost:5173/?fresh=t1c#/daily`, resize `1280×900`, make ONE guess (populate the placard without ending), then evaluate:

```js
() => {
  const float = document.querySelector('.specimen-float');
  const card = document.querySelector('.specimen-float .specimen-placard').getBoundingClientRect();
  return {
    restTop: Math.round(card.top),          // expect ~78 (header 62 + space-4 16)
    hasScrollbar: float.scrollHeight > float.clientHeight, // expect false (short content, tall window)
  };
}
```

Expected: `restTop` ≈ 78 (unchanged from today), `hasScrollbar: false`.

- [ ] **Step 8: Verify the tree stays interactive behind the layer.**

At `1280×900`, evaluate that a point in the top-right region ABOVE the resting card (where the inert layer overlaps the header) hits the header, not the layer:

```js
() => {
  const float = document.querySelector('.specimen-float').getBoundingClientRect();
  // a point inside the layer's horizontal span but in the header band (above the resting card)
  const x = Math.round((float.left + float.right) / 2);
  const hit = document.elementFromPoint(x, 20);
  return { hitTag: hit?.tagName, hitClass: hit?.className?.toString?.().slice(0, 40), passesThroughToHeader: !document.querySelector('.specimen-float').contains(hit) };
}
```

Expected: `passesThroughToHeader: true` — the `pointer-events: none` layer lets clicks reach the header/its buttons in the region above the card.

- [ ] **Step 9: Commit.**

```bash
# The spec + this plan are already committed on branch fix/desktop-placard-scroll — stay on it.
git add src/lib/game/components/BoardLayout.svelte
git commit -m "fix(placard): desktop placard is a fixed scroll-as-a-unit layer (#65)

The desktop specimen placard floated absolutely in the cluster and clipped
off-screen on a short viewport with no way to reach its bottom (the shell is
overflow:hidden, so the document doesn't scroll). Mirror the mobile drawer:
make it a fixed top-floating layer (z-index 8, above the header) with
overflow-y:auto, driven by native scroll. A --placard-rest-top pad keeps the
resting position pixel-identical to today; scrolling slides the whole block
up over the header and down over the footer. The layer is pointer-events:none
so the tree stays interactive; the card re-enables pointers.

Refs #65"
```

---

### Task 2: Zoom controls shift left when the placard is tall

Answers the issue's open question. Task 1 already publishes `--placard-clearance`; this task consumes it.

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` (the `.zoom-controls` rule, currently line 1009-1015)

**Interfaces:**
- Consumes: `--placard-clearance` (px string on `documentElement`; `0px` when the placard is short, `placardWidth + 24` when tall) from Task 1.
- Produces: nothing.

- [ ] **Step 1: Confirm the controls overlap the placard when tall (measure-fail).**

At `1280×380`, end-state (as Task 1 Step 1), evaluate — with clearance published but not yet consumed, the controls still sit bottom-right under the placard column:

```js
() => {
  const zc = document.querySelector('.zoom-controls').getBoundingClientRect();
  const card = document.querySelector('.specimen-float .specimen-placard').getBoundingClientRect();
  const clearance = getComputedStyle(document.documentElement).getPropertyValue('--placard-clearance').trim();
  const overlapX = zc.right > card.left && zc.left < card.right;
  return { clearancePublished: clearance, controlsRight: Math.round(zc.right), cardLeft: Math.round(card.left), overlapX };
}
```

Expected: `clearancePublished` is a non-zero px (e.g. `344px`), but `overlapX: true` — the controls still overlap the placard's column because the CSS doesn't read the var yet.

- [ ] **Step 2: Make the zoom controls read the clearance var.**

In `src/lib/game/components/SpineTree.svelte`, the `.zoom-controls` rule currently begins (line 1009-1010):

```css
  .zoom-controls {
    position: absolute; z-index: 5; right: var(--space-4); bottom: var(--space-4);
```

Change the `right` to add the clearance, and add a smooth transition for the shift:

```css
  .zoom-controls {
    position: absolute; z-index: 5;
    right: calc(var(--space-4) + var(--placard-clearance, 0px)); bottom: var(--space-4);
    transition: right var(--dur) var(--ease);
```

(The `--placard-clearance` default `0px` means phone and short-placard desktop are unchanged. `prefers-reduced-motion` already zeroes the transition globally in base.css.)

- [ ] **Step 3: Type/build check.**

Run: `npx tsc --noEmit && npx svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Verify the controls clear the placard when tall (measure-pass).**

At `1280×380`, end-state, evaluate:

```js
() => {
  const zc = document.querySelector('.zoom-controls').getBoundingClientRect();
  const card = document.querySelector('.specimen-float .specimen-placard').getBoundingClientRect();
  return { controlsRight: Math.round(zc.right), cardLeft: Math.round(card.left), clearsCard: zc.right <= card.left + 1 };
}
```

Expected: `clearsCard: true` — the controls' right edge is at/left of the card's left edge.

- [ ] **Step 5: Verify the controls stay put when the placard is short.**

At `1280×900`, one guess (as Task 1 Step 7), evaluate:

```js
() => {
  const zc = document.querySelector('.zoom-controls').getBoundingClientRect();
  const clearance = getComputedStyle(document.documentElement).getPropertyValue('--placard-clearance').trim();
  return { clearance, controlsRightOffset: Math.round(window.innerWidth - zc.right) };
}
```

Expected: `clearance: "0px"`, `controlsRightOffset` ≈ 16 (`--space-4`) — bottom-right, exactly as today.

- [ ] **Step 6: Verify the phone path is unaffected.**

Resize `390×740`, navigate `http://localhost:5173/?fresh=t2#/daily`, evaluate:

```js
() => {
  const zc = document.querySelector('.zoom-controls').getBoundingClientRect();
  const clearance = getComputedStyle(document.documentElement).getPropertyValue('--placard-clearance').trim();
  return { clearance, controlsRightOffset: Math.round(window.innerWidth - zc.right) };
}
```

Expected: `clearance: ""` or `"0px"` (the effect early-returns on phone and cleans up), controls at their normal phone offset — the phone `bottom: --drawer-peek-h` rule is untouched.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "fix(zoom): shift zoom controls left of a tall placard (#65)

Consume --placard-clearance (published by BoardLayout): when the desktop
placard is tall enough to reach the zoom controls' bottom-right corner, the
controls slide left of its column; short placard / phone leave them put
(clearance 0px). The horizontal analog of the mobile drawer's --drawer-peek-h.

Closes #65"
```

---

### Task 3: Full-app verification + gallery walk + merge

**Files:** none (verification + merge only).

- [ ] **Step 1: Practice mode end-state at a short viewport.**

Navigate `http://localhost:5173/?fresh=t3#/practice`, resize `1280×380`, make one guess then Forfeit. Confirm the placard scrolls to its bottom and the controls clear it (reuse Task 1 Step 6 + Task 2 Step 4 evaluates). Expected: same passes.

- [ ] **Step 2: Gallery walk.**

Navigate `http://localhost:5173/gallery.html?fresh=t3`, resize `1280×700`. Scroll to the "Full board — desktop" section; confirm the boards render without console errors and the placard/zoom layout looks right. Evaluate `() => ({ errors: [] })` is not needed — just confirm no red console errors via the MCP console log.

- [ ] **Step 3: Final type/build check.**

Run: `npx tsc --noEmit && npx svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Clean up any stray screenshots, then merge to main.**

```bash
git status --short   # confirm no stray PNGs / untracked artifacts; remove any before merging
git checkout main
git merge --no-ff fix/desktop-placard-scroll -m "Merge: fix(placard): desktop placard scrolls when too tall (#65)"
git branch -d fix/desktop-placard-scroll
git log --oneline -3
```

Do NOT push — the user pushes. Confirm the branch merged and `Closes #65` is in the history.

---

## Notes for the implementer

- **The spec** is `docs/superpowers/specs/2026-07-23-desktop-placard-scroll-design.md` — read §3 for the mechanism rationale and the two "settle in-browser" details (already de-risked: the `pointer-events: none` layer DOES scroll from a wheel over its `auto` child; header height is 62px so rest-top ≈ 78px).
- **Scrollbar vs. shadow (spec §3.1 detail 2):** if, at Task 1 Step 6, the scrollbar clips the card's rounded corner/shadow, add right padding to `.specimen-float` so the scrollbar rides in a gutter outside the card, or accept a thin inner scrollbar. Re-run the step; whichever renders clean wins. Note what you chose in the commit body.
- **Do not** start or kill dev servers — reuse the running one at `:5173`. Use a `?fresh=<tag>` cache-buster per navigation (same-URL nav doesn't reset injected state).
