# Relayout FLIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On an Explore re-center, animate the tree reflow — persisting nodes slide old→new, entering nodes fade in, leaving nodes vanish — on one shared clock with the focus ring, so the user keeps spatial orientation across the jump.

**Architecture:** A pure `layoutDiff` classifies each relayout into persist/enter/leave (carrying parent positions as scope-C groundwork). A single master-progress `Tween<number>` (0→1 over `GLIDE_MS`, started when the layout commits) drives an animated `displayed` layer the node render loop reads from — `layout` becomes the *target* the animation chases. Per-class completion fractions (`FLIP_FRACTION`, `ENTER_FRACTION`, `LEAVE_FRACTION`) stagger completion on the one clock. Pure math (diff + per-class interpolation) is TDD'd; the wiring is Playwright-verified.

**Tech Stack:** Svelte 5 (runes) 5.56.4 — `Tween` from `svelte/motion`, `untrack` from `svelte`; TypeScript (`verbatimModuleSyntax` ON); Vitest; Vite. No new deps.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` AND `npx svelte-check --threshold error` before every commit (Vitest doesn't catch type-only-import violations).
- **Pure logic is TDD-tested** (`foo.test.ts` beside `foo.ts`); Svelte components validated by build + running + Playwright.
- **`prefers-reduced-motion: reduce` MUST fully disable the animation** — nodes/fades/ring all snap to final. Reuse the existing `reduceMotion` const in `SpineTree.svelte`.
- **Hand-rolled FLIP only** — Svelte's `animate:flip`/`in:`/`out:` are HTML-only; they produce `NaN` keyframes on SVG `<g>` and snap (spike-verified). Drive the SVG `transform`/`opacity` attributes directly.
- **One shared clock**: nodes and the slice-1 ring puck co-time over one `GLIDE_MS` envelope, shared start. Completion order `LEAVE(0) < FLIP(~0.6) < ENTER(~0.8) < puck(1.0)`. Fraction *values* provisional (look-and-feel); the *structure* is fixed.
- **Edges + stubs snap** to final positions (no path morphing) — read `layout` directly, unchanged.
- This is slice 2 of 2. Commit messages reference `#52`; the merge commit (not these) will `Closes #52` and `Closes #54`. Leave everything unpushed (Morgan pushes).

**Spec:** `docs/superpowers/specs/2026-07-21-relayout-flip-design.md`

---

## File Structure

- **Create:** `src/lib/game/relayout-flip.ts` — pure helpers: `layoutDiff`, `flipProgress`, `lerp`, `Pos` type.
- **Create:** `src/lib/game/relayout-flip.test.ts` — Vitest unit tests.
- **Modify:** `src/lib/game/components/SpineTree.svelte` — the `displayed` animation layer + master-progress tween + relayout effect; node loop renders from `displayed`.

---

### Task 1: Pure helper — `layoutDiff`

**Files:**
- Create: `src/lib/game/relayout-flip.ts`
- Test: `src/lib/game/relayout-flip.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `export interface Pos { x: number; y: number }`
  - `export interface LayoutDiff { persisting: Array<{ id: string; from: Pos; to: Pos }>; entering: Array<{ id: string; to: Pos; parentFrom: Pos | null; parentTo: Pos | null }>; leaving: Array<{ id: string; lastPos: Pos; parentFrom: Pos | null; parentTo: Pos | null }>; }`
  - `export function layoutDiff(prev: Map<string, Pos>, next: Map<string, Pos>, parentOf: (id: string) => string | null): LayoutDiff`

Semantics: a node id in both maps → `persisting` (from=prev, to=next). Only in `next` → `entering` (to=next; parentFrom = prev.get(parent) ?? null; parentTo = next.get(parent) ?? null). Only in `prev` → `leaving` (lastPos=prev; parent positions same rule). Parent positions are scope-C groundwork; slice-2-A ignores them.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/game/relayout-flip.test.ts
import { describe, it, expect } from "vitest";
import { layoutDiff } from "./relayout-flip";
import type { Pos } from "./relayout-flip";

const P = (x: number, y: number): Pos => ({ x, y });

describe("layoutDiff", () => {
  const parentOf = (id: string) => ({ b: "a", c: "a", d: "a", e: "a" } as Record<string, string>)[id] ?? null;

  it("classifies persisting / entering / leaving by id", () => {
    const prev = new Map([["a", P(0, 0)], ["b", P(1, 1)], ["c", P(1, 2)]]);
    const next = new Map([["a", P(0, 0)], ["c", P(1, 1)], ["d", P(1, 2)]]);
    const d = layoutDiff(prev, next, parentOf);
    expect(d.persisting.map((p) => p.id).sort()).toEqual(["a", "c"]);
    expect(d.entering.map((e) => e.id)).toEqual(["d"]);
    expect(d.leaving.map((l) => l.id)).toEqual(["b"]);
  });

  it("persisting carries from (prev) and to (next)", () => {
    const prev = new Map([["c", P(1, 2)]]);
    const next = new Map([["c", P(3, 4)]]);
    expect(layoutDiff(prev, next, parentOf).persisting[0]).toEqual({ id: "c", from: P(1, 2), to: P(3, 4) });
  });

  it("entering carries to + parent from/to (scope-C groundwork)", () => {
    const prev = new Map([["a", P(0, 0)]]);
    const next = new Map([["a", P(0, 1)], ["b", P(1, 2)]]);
    expect(layoutDiff(prev, next, parentOf).entering[0]).toEqual({
      id: "b", to: P(1, 2), parentFrom: P(0, 0), parentTo: P(0, 1),
    });
  });

  it("leaving carries lastPos + parent from/to", () => {
    const prev = new Map([["a", P(0, 0)], ["b", P(1, 2)]]);
    const next = new Map([["a", P(0, 1)]]);
    expect(layoutDiff(prev, next, parentOf).leaving[0]).toEqual({
      id: "b", lastPos: P(1, 2), parentFrom: P(0, 0), parentTo: P(0, 1),
    });
  });

  it("null parent (root or absent) yields null parent positions", () => {
    const prev = new Map<string, Pos>();
    const next = new Map([["a", P(0, 0)]]); // a has no parent
    expect(layoutDiff(prev, next, parentOf).entering[0]).toEqual({
      id: "a", to: P(0, 0), parentFrom: null, parentTo: null,
    });
  });

  it("empty prev (first layout) → everything enters, nothing persists/leaves", () => {
    const next = new Map([["a", P(0, 0)], ["b", P(1, 1)]]);
    const d = layoutDiff(new Map(), next, parentOf);
    expect(d.persisting).toEqual([]);
    expect(d.leaving).toEqual([]);
    expect(d.entering.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run tests → verify they fail**

Run: `npx vitest run src/lib/game/relayout-flip.test.ts`
Expected: FAIL — `Failed to resolve import "./relayout-flip"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/relayout-flip.ts
// Pure math for the Explore relayout FLIP (see docs/superpowers/specs/2026-07-21-relayout-flip-design.md).
// No DOM / no Svelte — the component owns the tween + rendering; this owns the classification + numbers.

export interface Pos { x: number; y: number }

export interface LayoutDiff {
  persisting: Array<{ id: string; from: Pos; to: Pos }>;
  entering: Array<{ id: string; to: Pos; parentFrom: Pos | null; parentTo: Pos | null }>;
  leaving: Array<{ id: string; lastPos: Pos; parentFrom: Pos | null; parentTo: Pos | null }>;
}

// Classify a relayout by node id. parentFrom/parentTo on entering/leaving are scope-C groundwork
// (grow-in scales from the parent, shrink-out collapses toward it); slice-2-A ignores them.
export function layoutDiff(
  prev: Map<string, Pos>,
  next: Map<string, Pos>,
  parentOf: (id: string) => string | null,
): LayoutDiff {
  const parentPos = (id: string, m: Map<string, Pos>): Pos | null => {
    const p = parentOf(id);
    return p ? m.get(p) ?? null : null;
  };
  const persisting: LayoutDiff["persisting"] = [];
  const entering: LayoutDiff["entering"] = [];
  const leaving: LayoutDiff["leaving"] = [];

  for (const [id, to] of next) {
    const from = prev.get(id);
    if (from) persisting.push({ id, from, to });
    else entering.push({ id, to, parentFrom: parentPos(id, prev), parentTo: parentPos(id, next) });
  }
  for (const [id, lastPos] of prev) {
    if (!next.has(id)) leaving.push({ id, lastPos, parentFrom: parentPos(id, prev), parentTo: parentPos(id, next) });
  }
  return { persisting, entering, leaving };
}
```

- [ ] **Step 4: Run tests → verify they pass**

Run: `npx vitest run src/lib/game/relayout-flip.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/relayout-flip.ts src/lib/game/relayout-flip.test.ts
git commit -m "feat: layoutDiff pure helper for the relayout FLIP (#52)"
```

---

### Task 2: Pure helper — per-class interpolation math

**Files:**
- Modify: `src/lib/game/relayout-flip.ts`
- Test: `src/lib/game/relayout-flip.test.ts`

**Interfaces:**
- Consumes: `Pos` from Task 1.
- Produces:
  - `export function lerp(a: number, b: number, t: number): number`
  - `export function lerpPos(from: Pos, to: Pos, t: number): Pos`
  - `export function flipProgress(progress: number, fraction: number): number` — a class's LOCAL completion (0→1) given the master `progress` (0→1) and the class's completion `fraction`. `fraction <= 0` returns `1` (complete instantly — this is what makes `LEAVE_FRACTION = 0` an honest "vanish now"). Otherwise `clamp(progress / fraction, 0, 1)`.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/game/relayout-flip.test.ts
import { lerp, lerpPos, flipProgress } from "./relayout-flip";

describe("lerp / lerpPos", () => {
  it("lerp interpolates linearly", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it("lerpPos interpolates both axes", () => {
    expect(lerpPos({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
});

describe("flipProgress", () => {
  it("reaches local completion (1) at the class fraction", () => {
    expect(flipProgress(0.6, 0.6)).toBe(1);   // FLIP done at 60% of the envelope
    expect(flipProgress(0.3, 0.6)).toBe(0.5); // halfway through the FLIP window
    expect(flipProgress(0, 0.6)).toBe(0);
  });
  it("clamps to 1 past the fraction", () => {
    expect(flipProgress(0.9, 0.6)).toBe(1);
    expect(flipProgress(1, 0.8)).toBe(1);
  });
  it("fraction <= 0 completes instantly (LEAVE_FRACTION = 0 => vanish now)", () => {
    expect(flipProgress(0, 0)).toBe(1);
    expect(flipProgress(0.5, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests → verify they fail**

Run: `npx vitest run src/lib/game/relayout-flip.test.ts`
Expected: FAIL — `lerp`/`lerpPos`/`flipProgress` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/game/relayout-flip.ts
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPos(from: Pos, to: Pos, t: number): Pos {
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

// A class's local completion (0→1) on the shared master clock. `fraction` is the point in the
// [0,1] envelope at which this class finishes; `fraction <= 0` means "already done" (instant),
// which is how LEAVE_FRACTION = 0 renders leaving nodes as an immediate vanish.
export function flipProgress(progress: number, fraction: number): number {
  if (fraction <= 0) return 1;
  const t = progress / fraction;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
```

- [ ] **Step 4: Run tests → verify they pass**

Run: `npx vitest run src/lib/game/relayout-flip.test.ts`
Expected: PASS (12 total).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/relayout-flip.ts src/lib/game/relayout-flip.test.ts
git commit -m "feat: relayout-flip interpolation math (lerp + per-class flipProgress) (#52)"
```

---

### Task 3: Wire the FLIP animation layer into SpineTree

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes from Tasks 1–2: `layoutDiff`, `flipProgress`, `lerpPos`; types `Pos`, `LayoutDiff`.
- Consumes existing: `layout` (`$derived`), `posOf`, `px`/`py` (170–171), `reduceMotion`, `treeStore.getNode(id).parentId`, `Tween`, `untrack`, `GLIDE_MS` (already defined in the ring-glide block).
- Produces: no new public API.

**Design notes for the implementer:**
- **The seam:** today the node `<g>` loop iterates `layout.nodes` and sets `transform` from `px(n.x)/py(n.y)`. Change it to iterate an animated **`displayed`** list — `Array<{ id, x, y, opacity }>` — that the FLIP drives. `layout` becomes the *target* the animation chases. **Only the node `<g>` loop changes**; edges, stubs, the ring, and `posOf`-based lookups keep reading `layout`/`posOf` (edges/stubs snap per spec; the ring already tweens itself).
- **Master clock:** one `progress` `Tween<number>`, eased `linear` (per-class easing is applied via `flipProgress`, so the master must be linear). On a relayout: snapshot current displayed positions as `flipFrom`, compute `flipDiff = layoutDiff(flipFrom, newLayoutPositions, parentOf)`, then `progress.set(0, {duration:0})` and `progress.set(1, {duration: GLIDE_MS})`. Reading `progress.current` gives 0→1.
- **`displayed` is `$derived`** off `progress.current` + `flipFrom` + `flipDiff`:
  - persisting: `lerpPos(from, to, flipProgress(progress, FLIP_FRACTION))`, opacity 1.
  - entering: position = `to` (static), opacity = `flipProgress(progress, ENTER_FRACTION)`.
  - leaving: position = `lastPos` (static), opacity = `1 - flipProgress(progress, LEAVE_FRACTION)`; **dropped from the list once its opacity hits 0** (at LEAVE_FRACTION=0 it's never rendered).
- **Reduced motion / no prior layout:** `displayed` returns the raw `layout` positions at opacity 1 (no animation). The relayout effect sets `progress` to 1 with duration 0. First-ever layout: `flipFrom` empty → everything "enters", but with duration 0 on first mount it just appears (mirror slice-1's `firstPlace` instinct — no fly-in).
- **Interruption (rapid Explore hops):** because `flipFrom` is snapshotted from *current displayed* (mid-flight) positions, a new relayout re-diffs from wherever nodes visually are and restarts progress — nodes glide from their live position to the newest layout. No queue.
- **Effect hygiene (mirror slice-1's phase machine):** the relayout effect depends on `layout` ONLY; it reads `displayed`/`progress` under `untrack` when snapshotting, so it never self-triggers. `displayed` (the derived) is the sole reader of `progress.current`.
- **Co-timing with the puck:** the puck's own tween already retargets when `ringTarget` (a `$derived` off layout) changes, over `GLIDE_MS`. Same trigger, same duration → co-timed automatically. Do NOT touch the puck.

- [ ] **Step 1: Add imports + FLIP constants**

Add to the `../relayout-flip` import area near the top of `<script>`:

```ts
  import { layoutDiff, flipProgress, lerpPos } from "../relayout-flip";
  import type { Pos, LayoutDiff } from "../relayout-flip";
```

In the ring-glide constants block (next to `GLIDE_MS`), add the completion fractions:

```ts
  // Relayout FLIP completion fractions of the GLIDE_MS envelope (shared clock, shared start).
  // Staggered COMPLETION gives cause→effect: structure settles, branches appear, focus arrives.
  // Values provisional (look-and-feel pass); the order LEAVE < FLIP < ENTER < puck(1.0) is fixed.
  const FLIP_FRACTION = 0.6;   // persisting nodes finish sliding
  const ENTER_FRACTION = 0.8;  // entering nodes finish fading in
  const LEAVE_FRACTION = 0;    // leaving nodes finish disappearing (0 = instant; honest knob)
```

- [ ] **Step 2: Add the FLIP state + master-progress tween + displayed derived**

Place after `posOf` is defined (it reads `posOf`/`layout`). Uses `Tween` (already imported for the puck):

```ts
  // --- Relayout FLIP (issue #52 slice 2) ------------------------------------------------------
  // `layout` is the TARGET; `displayed` is what actually renders, animating toward it on a shared
  // clock with the ring puck. Master progress 0→1 over GLIDE_MS; per-class flipProgress staggers
  // completion. Node <g> loop renders from `displayed`; edges/stubs/ring keep reading layout/posOf.
  const flipProgressTween = new Tween(1, { duration: 0 }); // starts settled (no first-mount fly-in)
  let flipFrom = $state<Map<string, Pos>>(new Map());       // positions snapshotted at last relayout
  let flipDiff = $state<LayoutDiff>({ persisting: [], entering: [], leaving: [] });

  const parentOf = (id: string) => treeStore.getNode(id)?.parentId ?? null;
  // The layout's node id -> position map (the animation target).
  let layoutPos = $derived(new Map<string, Pos>(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }])));

  // What the node loop renders: {id, x, y, opacity}. Derived off the master progress so it
  // recomputes each animation frame. Under reduced motion (or a settled progress of 1) it's just
  // the layout at full opacity.
  let displayed = $derived.by(() => {
    const p = flipProgressTween.current;
    const out: Array<{ id: string; x: number; y: number; opacity: number }> = [];
    for (const n of flipDiff.persisting) {
      const q = lerpPos(n.from, n.to, flipProgress(p, FLIP_FRACTION));
      out.push({ id: n.id, x: q.x, y: q.y, opacity: 1 });
    }
    for (const n of flipDiff.entering) {
      out.push({ id: n.id, x: n.to.x, y: n.to.y, opacity: flipProgress(p, ENTER_FRACTION) });
    }
    for (const n of flipDiff.leaving) {
      const o = 1 - flipProgress(p, LEAVE_FRACTION);
      if (o > 0) out.push({ id: n.id, x: n.lastPos.x, y: n.lastPos.y, opacity: o });
    }
    return out;
  });

  // On a relayout: snapshot current displayed positions as the FLIP's `from` (so an interrupted
  // glide restarts from where nodes visually are), diff against the new layout, restart progress.
  // Depends on `layout` ONLY; reads displayed/progress under untrack so it never self-triggers.
  $effect(() => {
    void layout; // the one tracked dependency
    const nextPos = untrack(() => layoutPos);
    const fromPos = untrack(() => new Map(displayed.map((d) => [d.id, { x: d.x, y: d.y }])));
    flipFrom = fromPos;
    flipDiff = layoutDiff(fromPos, nextPos, parentOf);
    if (reduceMotion || fromPos.size === 0) {
      flipProgressTween.set(1, { duration: 0 }); // instant: reduced motion or first-ever layout
    } else {
      flipProgressTween.set(0, { duration: 0 });
      flipProgressTween.set(1, { duration: GLIDE_MS });
    }
  });
```

- [ ] **Step 3: Render the node loop from `displayed` (not `layout.nodes`)**

Change the node `{#each layout.nodes as n (n.id)}` loop to iterate `displayed`. The node data (`node`, glyph, label) still comes from `treeStore.getNode(d.id)`; position from `d.x/d.y`; add `opacity`. Replace the loop opening and `<g>` transform:

```svelte
      {#each displayed as d (d.id)}
        {@const n = posOf.get(d.id)}
        {@const node = treeStore.getNode(d.id)}
        {@const isHi = d.id === ringId}
        {@const isGenusNode = node?.isGenus ?? false}
        {@const glyphSize = isGenusNode ? GLYPH_GENUS : GLYPH_CLADE}
        {@const glyphDY = isGenusNode ? GLYPH_OFFSET_Y_GENUS : GLYPH_OFFSET_Y_CLADE}
        {@const glyphFill = colorOf(d.id, n?.onSpine ?? false, isGenusNode)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="node"
          class:spine={n?.onSpine}
          class:highlight={isHi}
          class:genus={node?.isGenus}
          class:playable={gradeByPlayable && node?.isGenus && node.playable}
          class:nonplayable={gradeByPlayable && node?.isGenus && !node.playable}
          class:clickable={!!onnodeselect}
          class:link={linkLabels && !!onnodeselect}
          transform={`translate(${px(d.x)} ${py(d.y)})`}
          opacity={d.opacity}
          onclick={() => onNodeClick(d.id)}
        >
```

Then inside the loop replace remaining `n.id` → `d.id` and `n.onSpine` → `n?.onSpine` (the `measureLabel` key line and any other `n.` references that were position/id based; `n` is now the possibly-undefined `posOf` entry, used only for `onSpine`). Leave the glyph/label markup otherwise unchanged. Close the loop `{/each}` as before.

Note: a leaving node isn't in `posOf` (it's gone from `layout`), so `n` is `undefined` for it — that's why `onSpine` reads `n?.onSpine ?? false`. Leaving nodes only render when `LEAVE_FRACTION > 0`; at the default 0 they never appear, but the code stays correct if the knob is bumped.

- [ ] **Step 4: Run unit tests + typecheck + svelte-check**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx svelte-check --threshold error
```
Expected: all green (existing 316 + the new relayout-flip tests; 0 type/svelte errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat: hand-rolled relayout FLIP animation layer in SpineTree (#52)"
```

---

### Task 4: Live verification (visual gate)

**Files:** none modified (verification only; fix-forward into `SpineTree.svelte` if issues found).

No unit test — the motion is DOM/visual. Verify in the running app via Playwright.

- [ ] **Step 1: Start the dev server** — `npm run dev` (note the URL).

- [ ] **Step 2: Persisting nodes slide, not snap.** In Explore, click a node that re-centers the tree. Sample a persisting node's `<g transform>` (or a Playwright per-rAF loop) across the transition: its `translate` x/y should interpolate over multiple frames, not jump in one. Confirm no `NaN`/console warnings.

- [ ] **Step 3: FLIP completes before the puck.** Sample both the node transforms and the ring `rect` position over one relayout: the nodes should reach their final positions at ~`FLIP_FRACTION × GLIDE_MS` while the ring is still gliding, arriving at ~`GLIDE_MS`. (Structure settles, then focus arrives.)

- [ ] **Step 4: Entering nodes fade in.** After a relayout that reveals new children, confirm newly-entering `<g>`s animate `opacity` 0→1 (finishing ~`ENTER_FRACTION`), rather than popping. Leaving nodes vanish immediately (`LEAVE_FRACTION = 0`).

- [ ] **Step 5: Reduced motion snaps everything.** Enable `prefers-reduced-motion` (DevTools → Rendering → Emulate CSS prefers-reduced-motion, then reload). Confirm nodes, fades, and ring all place instantly — no slide, no fade, identical to today's snap.

- [ ] **Step 6: #54 dissolved + rapid-nav sanity.** Confirm the ring no longer "follows over the leftover glide" as a separate motion — it's part of the one coordinated glide. Hold/rapid Enter-nav through several Explore nodes: nodes re-glide from their live positions to the newest layout without stutter or stranded nodes.

- [ ] **Step 7: Commit any fix-forward adjustments**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "fix: relayout-flip visual adjustments from live pass (#52)"
```
(Skip if Steps 2–6 needed no changes.)

---

## Self-Review

**Spec coverage:**
- Persisting FLIP / entering fade / leaving vanish / edges snap → Task 3 `displayed` derived + node loop; edges untouched. ✓
- `layoutDiff` seam with parent from/to (scope-C groundwork) → Task 1. ✓
- Hand-rolled (not `animate:flip`) → Task 3 drives SVG transform/opacity directly. ✓
- One clock, staggered completion (`LEAVE<FLIP<ENTER<puck`) → Task 2 `flipProgress` + Task 3 fractions + shared `GLIDE_MS` progress tween. ✓
- Co-timing with puck (no puck change) → Task 3 note (same trigger/duration). ✓
- Resolves #54 → Task 4 Step 6 (ring is part of the one glide). ✓
- Reduced motion instant → Task 3 effect branch + Task 4 Step 5. ✓
- `LEAVE_FRACTION=0` honest knob (driver reads the fraction) → Task 2 `flipProgress(_,0)=1` + Task 3 leaving branch. ✓
- Interruption/rapid-nav → Task 3 snapshot-from-displayed + Task 4 Step 6. ✓
- Pure helpers TDD'd; tsc + svelte-check before commit → Tasks 1–2, Task 3 Step 4. ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. Fraction *values* are intentional-and-labeled provisional per spec, not placeholders. ✓

**Type consistency:** `Pos`/`LayoutDiff` defined in Task 1, consumed in Tasks 2–3 with matching names. `layoutDiff`/`flipProgress`/`lerpPos` signatures match definition↔use. `displayed` item shape `{id,x,y,opacity}` consistent between Task 3 Steps 2 and 3. ✓

**Not closing #52/#54 in these commits** — the merge commit will. ✓
