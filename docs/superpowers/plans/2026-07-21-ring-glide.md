# Ring-glide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the teleporting per-node focus ring in the cladogram with one persistent "puck" that collapses to a dot, skates glyph-to-glyph, and blooms into the label-ring at its destination — a spatial-continuity aid for keyboard navigation.

**Architecture:** A single top-level SVG ring element positioned by a Svelte 5 `Tween` (`svelte/motion`) whose `.set()` retargets from the in-flight value, giving free rapid-nav retargeting. A small pure helper module (`ring-glide.ts`) owns the glide's non-DOM math (endpoints, phase/size, duration selection) and is TDD'd. `SpineTree.svelte` wires the tween to `ringId` and swaps the per-node `<rect>` for the persistent element.

**Tech Stack:** Svelte 5 (runes) 5.56.4 — `Tween` from `svelte/motion`; TypeScript (`verbatimModuleSyntax` ON); Vitest; Vite. No new dependencies.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch violations; run `npx tsc --noEmit` and `npx svelte-check` before every commit.
- **Pure logic is TDD-tested** (`foo.test.ts` beside `foo.ts`); Svelte components validated by build + running + `/gallery.html`.
- **`prefers-reduced-motion: reduce` MUST fully disable the animation** — ring places instantly, as today. Reuse the existing `reduceMotion` const in `SpineTree.svelte`.
- **No scroll-policy changes.** `scrollFocusIntoView` / `scrollToNode` are untouched (that coordination belongs to #52 slice 2).
- **Durations are named constants, tunable later.** Two distinct trigger-selected values must exist; exact values are provisional (look-and-feel pass).
- Commit fixes with `Closes #52`? **No** — this is slice 1 of 2; reference `#52` in messages but do NOT close it. Leave commits unpushed (Morgan pushes).

**Spec:** `docs/superpowers/specs/2026-07-21-ring-glide-design.md`

---

## File Structure

- **Create:** `src/lib/game/ring-glide.ts` — pure helpers: duration selection, glyph-endpoint geometry, phase→size resolution. No DOM, no Svelte.
- **Create:** `src/lib/game/ring-glide.test.ts` — Vitest unit tests for the above.
- **Modify:** `src/lib/game/components/SpineTree.svelte` — remove per-node ring rect; add persistent tweened puck + trigger tracking.

---

### Task 1: Pure helpers — duration selection + glyph endpoints

**Files:**
- Create: `src/lib/game/ring-glide.ts`
- Test: `src/lib/game/ring-glide.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `export const GLIDE_MS_KEYBOARD = 180` and `export const GLIDE_MS_COMMIT = 90` (provisional, tunable).
  - `export type GlideTrigger = "keyboard" | "commit"`
  - `export function glideDuration(trigger: GlideTrigger): number`
  - `export interface Point { x: number; y: number }`
  - `export function glyphCenter(node: { x: number; y: number }, px: (x: number) => number, py: (y: number) => number): Point` — the SVG-space center of a node's glyph disc (the skate anchor). `px`/`py` are the caller's existing coordinate mappers.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/game/ring-glide.test.ts
import { describe, it, expect } from "vitest";
import {
  glideDuration, glyphCenter, GLIDE_MS_KEYBOARD, GLIDE_MS_COMMIT,
} from "./ring-glide";

describe("glideDuration", () => {
  it("keyboard hops use the full skate duration", () => {
    expect(glideDuration("keyboard")).toBe(GLIDE_MS_KEYBOARD);
  });
  it("commits (click / guess-row) use the compressed duration", () => {
    expect(glideDuration("commit")).toBe(GLIDE_MS_COMMIT);
  });
  it("commit is faster than keyboard", () => {
    expect(GLIDE_MS_COMMIT).toBeLessThan(GLIDE_MS_KEYBOARD);
  });
});

describe("glyphCenter", () => {
  const px = (x: number) => 40 + x * 200; // mirrors SpineTree px()
  const py = (y: number) => 44 + y * 52;  // mirrors SpineTree py()
  it("maps a node's layout coords through px/py to the glyph origin", () => {
    expect(glyphCenter({ x: 2, y: 1 }, px, py)).toEqual({ x: 440, y: 96 });
  });
  it("is a pure projection — no dependence on other nodes", () => {
    expect(glyphCenter({ x: 0, y: 0 }, px, py)).toEqual({ x: 40, y: 44 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/ring-glide.test.ts`
Expected: FAIL — `Failed to resolve import "./ring-glide"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/ring-glide.ts
// Pure math for the focus-ring glide (see docs/superpowers/specs/2026-07-21-ring-glide-design.md).
// No DOM / no Svelte — the component owns the tween and rendering; this owns the numbers.

// Provisional durations (ms). Two distinct, trigger-selected speeds; exact values are a
// look-and-feel knob (#52). Keyboard hops get the full skate; commits (click / guess-row) a
// compressed glide so a deliberate "put it there" doesn't dawdle.
export const GLIDE_MS_KEYBOARD = 180;
export const GLIDE_MS_COMMIT = 90;

export type GlideTrigger = "keyboard" | "commit";

export function glideDuration(trigger: GlideTrigger): number {
  return trigger === "commit" ? GLIDE_MS_COMMIT : GLIDE_MS_KEYBOARD;
}

export interface Point { x: number; y: number }

// The glyph disc's center in SVG space — the puck's skate anchor at both ends. The node's
// local origin (0,0 in its <g>) is the glyph center, so this is just the group transform.
export function glyphCenter(
  node: { x: number; y: number },
  px: (x: number) => number,
  py: (y: number) => number,
): Point {
  return { x: px(node.x), y: py(node.y) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/ring-glide.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/ring-glide.ts src/lib/game/ring-glide.test.ts
git commit -m "feat: ring-glide pure helpers (duration + glyph endpoints) (#52)"
```

---

### Task 2: Phase→size resolution helper

**Files:**
- Modify: `src/lib/game/ring-glide.ts`
- Test: `src/lib/game/ring-glide.test.ts`

**Interfaces:**
- Consumes: `Point` from Task 1.
- Produces:
  - `export type GlidePhase = "dot" | "bloom"`
  - `export interface RingGeom { cx: number; cy: number; width: number; height: number; radius: number }`
  - `export const DOT_R = 5` (the collapsed dot's radius, provisional).
  - `export function ringGeom(phase: GlidePhase, center: Point, labelBox: { x: number; y: number; width: number; height: number } | null, ringH: number, ringPadX: number): RingGeom` — when `phase==="dot"` (or `labelBox` is null) returns a `DOT_R`-radius circle centered on `center`; when `"bloom"` returns the full label-ring rect geometry (mirrors today's rect math: `x = center.x + labelBox.x - ringPadX`, `y = center.y - ringH`, `width = labelBox.width + 2*ringPadX`, `height = ringH`). This lets the component render ONE `<rect>` whose rx makes it read as a dot when collapsed (rx = height/2 at dot size) and a rounded box when bloomed.

Rationale for one rect (not rect+circle): a single element the tween drives from dot-geometry to box-geometry avoids cross-fading two nodes and keeps the "morph" literal.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/game/ring-glide.test.ts
import { ringGeom, DOT_R } from "./ring-glide";

describe("ringGeom", () => {
  const center = { x: 100, y: 200 };
  const labelBox = { x: 14, y: -20, width: 80, height: 16 };
  const RING_H = 28, RING_PAD_X = 14;

  it("dot phase is a DOT_R circle centered on the glyph", () => {
    const g = ringGeom("dot", center, labelBox, RING_H, RING_PAD_X);
    expect(g).toEqual({ cx: 100, cy: 200, width: DOT_R * 2, height: DOT_R * 2, radius: DOT_R });
  });

  it("dot phase ignores a null labelBox (still a valid dot)", () => {
    const g = ringGeom("dot", center, null, RING_H, RING_PAD_X);
    expect(g.width).toBe(DOT_R * 2);
    expect(g.cx).toBe(100);
  });

  it("bloom phase expands to the label-ring box in SVG space", () => {
    const g = ringGeom("bloom", center, labelBox, RING_H, RING_PAD_X);
    // x = center.x + labelBox.x - padX; y = center.y - RING_H
    expect(g).toEqual({
      cx: 100 + 14 - 14,     // 100
      cy: 200 - 28,          // 172
      width: 80 + 2 * 14,    // 108
      height: 28,
      radius: 6,
    });
  });

  it("bloom with a null labelBox falls back to a dot (nothing to hug yet)", () => {
    const g = ringGeom("bloom", center, null, RING_H, RING_PAD_X);
    expect(g.width).toBe(DOT_R * 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/ring-glide.test.ts`
Expected: FAIL — `ringGeom`/`DOT_R` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/game/ring-glide.ts
export type GlidePhase = "dot" | "bloom";

// Collapsed-dot radius (provisional; look-and-feel knob). Sized to rhyme with the node glyph
// discs without covering them.
export const DOT_R = 5;

export interface RingGeom { cx: number; cy: number; width: number; height: number; radius: number }

// The rendered ring's geometry for a phase. One element morphs between these: a DOT_R circle
// on the glyph center (dot / in-transit) and the full label-hugging box (bloom / settled).
// A null labelBox (not yet measured) always yields a dot — there's nothing to hug.
export function ringGeom(
  phase: GlidePhase,
  center: Point,
  labelBox: { x: number; y: number; width: number; height: number } | null,
  ringH: number,
  ringPadX: number,
): RingGeom {
  if (phase === "dot" || !labelBox) {
    return { cx: center.x, cy: center.y, width: DOT_R * 2, height: DOT_R * 2, radius: DOT_R };
  }
  return {
    cx: center.x + labelBox.x - ringPadX,
    cy: center.y - ringH,
    width: labelBox.width + 2 * ringPadX,
    height: ringH,
    radius: 6,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/ring-glide.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/ring-glide.ts src/lib/game/ring-glide.test.ts
git commit -m "feat: ring-glide phase-to-geometry helper (#52)"
```

---

### Task 3: Wire the persistent tweened puck into SpineTree

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`
  - Remove: the per-node ring block, lines 524–535 (`{#if isHi && labelBox} … <rect class="label-ring"> … {/if}`).
  - Add: imports, tween state, trigger tracking, the single top-level `<rect class="label-ring">`.

**Interfaces:**
- Consumes from Tasks 1–2: `glideDuration`, `glyphCenter`, `ringGeom`, `DOT_R`, `GlideTrigger`, `GlidePhase`, `Point`, `RingGeom`.
- Consumes existing component state: `ringId` (line 149), `posOf` (129), `px`/`py` (170–171), `labelBox`/`measureLabel` (178–185), `reduceMotion` (206), `colorOf` (94), `RING_H`/`RING_PAD_X` (112–113), the keyboard path (`focusItem`, `onTreeKey`, 276–296), and the commit path (`highlightId` prop).
- Produces: no new public API. `panTo`/`export` surface unchanged.

**Design notes for the implementer:**
- `Tween` from `svelte/motion` animates a numeric-record value; `.set(next, { duration })` retargets from the current in-flight value (this is what gives free rapid-nav retargeting — no manual interruption code).
- The tween value is the *geometry* `{ cx, cy, width, height, radius }`. We drive it from `ringGeom(phase, center, labelBox, …)`.
- **Phase logic:** while `ringId` is changing rapidly, hold `phase="dot"`. On settle (a `setTimeout` that fires if no new `ringId` arrives within one glide duration), set `phase="bloom"`. Any new `ringId` clears the pending settle timer and re-arms it.
- **Trigger:** a keyboard hop sets a module-local `lastTrigger="keyboard"` (set inside `focusItem`, the keyboard mover); everything else (highlightId commit / click) defaults to `"commit"`. Read + reset it when the `ringId` effect runs.
- **Reduced motion:** if `reduceMotion`, skip the tween entirely — set geometry instantly to the bloom box (no dot phase, no settle timer). Simplest correct behavior = today's teleport.
- **Z-order / fill:** the puck now draws OVER nodes (top-level, after the `{#each}`). Keep the translucent fill (`color-mix(... 18%, transparent)`) so the label shows through. Verify in gallery (Task 4).

- [ ] **Step 1: Add imports (top of `<script>`, near the other `../` imports ~line 7)**

```ts
import {
  glideDuration, glyphCenter, ringGeom, DOT_R,
} from "../ring-glide";
import type { GlideTrigger, GlidePhase, RingGeom } from "../ring-glide";
import { Tween } from "svelte/motion";
```

- [ ] **Step 2: Add tween + phase/trigger state (after `ringId` derivation, ~line 149)**

```ts
  // --- Ring glide (issue #52 slice 1) ---------------------------------------------------------
  // One persistent ring element, driven by a geometry tween. `.set()` retargets from the
  // in-flight value, so rapid arrow-nav just redirects a skating dot (no per-hop bloom).
  let glidePhase = $state<GlidePhase>("bloom");
  // The move that caused the next ring change. Keyboard hops set this in focusItem; anything
  // else (a highlightId commit / click) is a "commit". Read + reset when the ringId effect runs.
  let nextTrigger: GlideTrigger = "commit";
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  // Geometry the ring renders at. Initialized to an offscreen dot; the effect below drives it.
  const ringTween = new Tween<RingGeom>(
    { cx: 0, cy: 0, width: DOT_R * 2, height: DOT_R * 2, radius: DOT_R },
    { duration: 0 },
  );

  function ringCenter(id: string): Point | null {
    const n = posOf.get(id);
    return n ? glyphCenter(n, px, py) : null;
  }

  // Drive the tween whenever the ringed node changes. Collapse-to-dot + skate happen by
  // retargeting the tween to the new glyph's dot geometry; bloom fires on settle.
  $effect(() => {
    const id = ringId;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (!id) return;
    const center = ringCenter(id);
    if (!center) return;

    if (reduceMotion) {
      // Instant place at the bloom box — today's teleport, motion-sensitive safe.
      glidePhase = "bloom";
      ringTween.set(ringGeom("bloom", center, labelBox, RING_H, RING_PAD_X), { duration: 0 });
      nextTrigger = "commit";
      return;
    }

    const ms = glideDuration(nextTrigger);
    nextTrigger = "commit"; // consume; keyboard hops re-arm it in focusItem
    // Skate as a dot toward the new glyph (retargets any in-flight glide).
    glidePhase = "dot";
    ringTween.set(ringGeom("dot", center, labelBox, RING_H, RING_PAD_X), { duration: ms });
    // Bloom on settle: if no new ringId arrives within one glide, expand to hug the label.
    settleTimer = setTimeout(() => {
      const c = ringCenter(id);
      if (!c) return;
      glidePhase = "bloom";
      ringTween.set(ringGeom("bloom", c, labelBox, RING_H, RING_PAD_X), { duration: ms });
    }, ms);
  });

  // Re-hug the label if its measured box arrives/changes while already bloomed (labelBox is
  // measured on a rAF, so it can land just after the settle).
  $effect(() => {
    void labelBox;
    if (reduceMotion) return;
    if (glidePhase !== "bloom" || !ringId) return;
    const c = ringCenter(ringId);
    if (c) ringTween.set(ringGeom("bloom", c, labelBox, RING_H, RING_PAD_X), { duration: 0 });
  });
```

- [ ] **Step 3: Mark keyboard moves as `"keyboard"` trigger (in `focusItem`, ~line 276)**

```ts
  function focusItem(id: string) {
    nextTrigger = "keyboard"; // this move is an arrow hop; the ringId effect reads it
    focusId = id;
    // preventScroll: WE drive the visible scroll (scrollFocusIntoView); the browser's native
    // focus-scroll would fight it by targeting the clipped sr-only element.
    liEls[id]?.focus({ preventScroll: true });
  }
```

- [ ] **Step 4: Remove the per-node ring rect (lines 524–535)**

Delete this block entirely (the persistent puck replaces it):

```svelte
          {#if isHi && labelBox}
            {@const hiColor = colorOf(n.id, n.onSpine, node?.isGenus ?? false) ?? "var(--turq)"}
            <!-- selection box: bottom edge on the row line (y=0), hugging the centered label.
                 Drawn UNDER the backing disc + glyph so its tucked corner hides behind them. -->
            <rect
              class="label-ring"
              x={labelBox.x - RING_PAD_X} y={-RING_H}
              width={labelBox.width + 2 * RING_PAD_X} height={RING_H}
              rx="6"
              style="fill: color-mix(in srgb, {hiColor} 18%, transparent); stroke: {hiColor}"
            />
          {/if}
```

Note: `measureLabel` on the `<text>` (line 548, `use:measureLabel={isHi}`) STAYS — the persistent ring still consumes `labelBox` for its bloom size.

- [ ] **Step 5: Add the persistent puck at SVG top level (after the `{#each layout.nodes}` block closes, before `</svg>`, ~line 552)**

```svelte
      {#if ringId}
        {@const rg = ringTween.current}
        {@const hiColor = colorOf(ringId, posOf.get(ringId)?.onSpine ?? false, treeStore.getNode(ringId)?.isGenus ?? false) ?? "var(--turq)"}
        <rect
          class="label-ring"
          x={rg.cx - (glidePhase === "dot" ? rg.width / 2 : 0)}
          y={rg.cy}
          width={rg.width}
          height={rg.height}
          rx={rg.radius}
          style="fill: color-mix(in srgb, {hiColor} 18%, transparent); stroke: {hiColor}"
        />
      {/if}
```

Note on x-origin: in bloom, `ringGeom.cx` is already the rect's left edge (matches the old `labelBox.x - RING_PAD_X` math, in SVG space). In dot phase, `cx` is the glyph center, so we shift left by half-width to center the dot. `y`/`cy` is the rect top in both phases.

- [ ] **Step 6: Run existing unit tests + typecheck + svelte-check**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx svelte-check --threshold error
```
Expected: all green. (No test asserts the old per-node rect; `ring-glide.test.ts` covers the new math.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat: persistent tweened focus-ring puck in SpineTree (#52)"
```

---

### Task 4: Gallery verification pass (visual gate)

**Files:** none modified (verification only; fix-forward into `SpineTree.svelte` if issues found).

This task has no unit test — it's the visual/interaction gate the spec calls for. Run the app and confirm behavior in `/gallery.html` and in live keyboard nav.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (note the localhost URL).

- [ ] **Step 2: Verify bloomed ring reads correctly (the z-order wrinkle)**

Open `/gallery.html`. On a panel with `highlightId` set, confirm the bloomed ring:
- Hugs the label (name + count) fully — not clipped to the name only.
- Reads on top of the node without hiding the label text (translucent fill working).
- Stroke color matches the node's warmth/structural color as before.

If the ring covers the glyph awkwardly now that it's drawn over (not under) nodes, adjust: either lower the puck's opacity or reintroduce the backing-disc ordering. Document any change inline.

- [ ] **Step 3: Verify the glide + collapse-to-dot (motion ON)**

In the main app (Daily or Practice), Tab into the tree, then arrow-navigate:
- Single ↑/↓/←/→ hop: ring collapses to a dot, skates glyph-to-glyph, blooms at the destination.
- Hold an arrow (rapid nav): a dot skates along the tree WITHOUT blooming at each stop; it blooms only when you stop. No stutter of half-blooms.
- Click a node / select a guess row: the ring glides but faster (commit speed).

- [ ] **Step 4: Verify reduced-motion (motion OFF)**

Enable `prefers-reduced-motion` (macOS: System Settings → Accessibility → Display → Reduce motion, or DevTools → Rendering → Emulate CSS prefers-reduced-motion). Reload. Confirm:
- The ring places INSTANTLY at each node (no dot, no skate, no bloom) — identical to pre-change behavior.

- [ ] **Step 5: Commit any fix-forward adjustments**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "fix: ring-glide visual adjustments from gallery pass (#52)"
```
(Skip if Step 2–4 needed no changes.)

---

## Self-Review

**Spec coverage:**
- Motion model (collapse→skate→bloom) → Tasks 2 (geometry) + 3 (tween wiring). ✓
- Persistent single element at top level → Task 3 Steps 4–5. ✓
- Glyph anchors → Task 1 `glyphCenter`. ✓
- Retargeting + settle-only bloom → Task 3 Step 2 (`ringTween.set` retargets; `settleTimer`). ✓
- Trigger-based two speeds → Task 1 `glideDuration` + Task 3 Steps 2–3. ✓
- Reduced motion instant → Task 3 Step 2 (`reduceMotion` branch) + Task 4 Step 4. ✓
- Reused labelBox/measureLabel; scroll untouched → Task 3 note + Step 4 note. ✓
- Named tunable durations → Task 1 `GLIDE_MS_*`. ✓
- Z-order visual verify → Task 4 Step 2. ✓
- Pure helpers TDD'd; tsc + svelte-check before commit → Tasks 1–2, Task 3 Step 6. ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. Provisional duration *values* are intentional-and-labeled per spec, not placeholders. ✓

**Type consistency:** `RingGeom`/`GlidePhase`/`GlideTrigger`/`Point` defined in Tasks 1–2, consumed with matching names in Task 3. `glideDuration`/`glyphCenter`/`ringGeom`/`DOT_R` signatures match between definition and use. ✓

**Not closing #52** — slice 1 of 2; messages reference `#52` but don't close it. ✓

---

## Task 5: Rework — split phase from position (fixes the relayout race)

**Added 2026-07-21 after Task 4 verification.** Live testing found the ring collapses to a dot
and never blooms after any interaction that relayouts the tree (every Explore click; confirmed
via Playwright: ring stuck at `DOT_R` >1s while its label measured 105px). Root cause: the
drive `$effect` depends on both `ringId` AND `posOf` (a `$derived` of `layoutSpine`), so a
relayout — which fires 2–3× per Explore click as `highlightId`/`tipId`/`revealed` all change —
re-runs the effect, resets `glidePhase="dot"`, and clears the settle timer before it fires. See
the revised spec's *Motion architecture* section.

This task rewrites ONLY the effect/derived wiring added in Task 3. The three pure helpers
(Tasks 1–2) and the persistent `<rect>` render block are unchanged except as noted.

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:** unchanged — still consumes `glideDuration`, `glyphCenter`, `ringGeom`, `DOT_R`,
`GlideTrigger`, `GlidePhase`, `RingGeom`, `Point`. Adds `untrack` from `svelte`.

**Architecture:**
- **Phase machine** — one effect keyed to `ringId` ONLY. Reads the node center under `untrack`
  so layout churn can't re-trigger it. Owns `glidePhase` + `settleTimer` + `firstPlace`.
- **Geometry `$derived`** — `ringTarget = ringGeom(glidePhase, center(ringId), labelBox, …)`,
  recomputed on `glidePhase` / ringed-node coords / `labelBox`.
- **Tween driver** — a tiny effect that pushes `ringTarget` into the tween. Duration comes from
  a `$state` `glideMs` the phase machine sets (0 for instant placements, else the trigger's
  duration). This effect is the ONLY caller of `ringTween.set`, so there's a single writer.

Splitting the writer this way is what lets the ring follow a relayout at its current phase: when
`posOf` changes, `ringTarget` recomputes and the driver retargets the tween WITHOUT the phase
machine running, so a bloomed ring stays bloomed and repositions.

- [ ] **Step 1: Add the `untrack` import**

In the `import ... from "svelte"` area near the top of `<script>` (there isn't one yet for
`svelte` core — add it beside the `svelte/motion` import from Task 3):

```ts
  import { untrack } from "svelte";
```

- [ ] **Step 2: Replace the tween-state block (the `let glidePhase … ringCenter` region, currently ~lines 159–177)**

Replace from `let glidePhase = $state<GlidePhase>("bloom");` through the end of the `ringCenter`
function with:

```ts
  let glidePhase = $state<GlidePhase>("bloom");
  // Duration (ms) the tween driver uses for the NEXT retarget. The phase machine sets it: 0 for
  // instant placements (reduced-motion, first mount, and relayout-follow), else the trigger's
  // glide duration. A $state so the driver effect re-runs when it changes.
  let glideMs = $state(0);
  // The move that caused the next FOCUS change. Keyboard hops set this in focusItem; anything
  // else (a highlightId commit / click) is a "commit". Read + reset by the phase machine.
  let nextTrigger: GlideTrigger = "commit";
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  // First ring placement is instant: the tween starts at (0,0), so the first skate would fly the
  // dot in from the SVG's top-left corner. Cleared after the first real placement.
  let firstPlace = true;

  const ringTween = new Tween<RingGeom>(
    { cx: 0, cy: 0, width: DOT_R * 2, height: DOT_R * 2, radius: DOT_R },
    { duration: 0 },
  );

  function ringCenter(id: string): Point | null {
    const n = posOf.get(id);
    return n ? glyphCenter(n, px, py) : null;
  }

  // Geometry the ring should be at, DERIVED from phase + the ringed node's live coords + labelBox.
  // Because it reads posOf (via ringCenter), it recomputes when a relayout moves the node — so the
  // tween driver below repositions the ring at its CURRENT phase, without the phase machine (which
  // ignores layout) re-running. This is the split that fixes the relayout race and is slice 2's hook.
  let ringTarget = $derived.by<RingGeom | null>(() => {
    if (!ringId) return null;
    const c = ringCenter(ringId);
    return c ? ringGeom(glidePhase, c, labelBox, RING_H, RING_PAD_X) : null;
  });
```

- [ ] **Step 3: Replace BOTH `$effect` blocks (the drive effect + the re-hug effect, currently ~lines 179–225) with the phase machine + tween driver**

```ts
  // PHASE MACHINE — reacts to a genuine FOCUS change only (keyed to ringId). Reads coords under
  // untrack so a relayout (posOf change) never re-triggers it. Sole owner of glidePhase, glideMs,
  // settleTimer, firstPlace.
  $effect(() => {
    const id = ringId; // the ONLY tracked dependency
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (!id) return () => { if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; } };

    // Read the center without subscribing to layout — layout changes are the position derived's job.
    const hasCenter = untrack(() => ringCenter(id) !== null);
    if (!hasCenter) return () => { if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; } };

    const trigger = nextTrigger;
    nextTrigger = "commit"; // consume; keyboard hops re-arm it in focusItem

    // Instant placement: reduced-motion or the very first mount → bloom at rest, no skate/settle.
    if (reduceMotion || firstPlace) {
      firstPlace = false;
      glideMs = 0;
      glidePhase = "bloom";
      return () => { if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; } };
    }

    // Normal move: collapse to a dot and skate (the driver tweens the position derived), then
    // bloom on settle if no new focus change arrives within one glide.
    const ms = glideDuration(trigger);
    glideMs = ms;
    glidePhase = "dot";
    settleTimer = setTimeout(() => {
      glideMs = ms;
      glidePhase = "bloom";
    }, ms);
    return () => { if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; } };
  });

  // TWEEN DRIVER — the ONLY caller of ringTween.set. Retargets whenever the position derived or the
  // duration changes. A relayout moves ringTarget → the ring follows at its current phase. glideMs is
  // set to 0 by the phase machine's instant paths and for relayout-follow (a phase-less target change
  // keeps the last glideMs, which is fine — a settled ring's glideMs is the bloom duration, a short
  // reposition; if that ever feels wrong it's a look-and-feel knob, not a correctness issue).
  $effect(() => {
    const target = ringTarget;
    if (!target) return;
    ringTween.set(target, { duration: glideMs });
  });
```

Note the deleted re-hug effect: `ringTarget` already depends on `labelBox`, so a late label
measurement recomputes the target and the driver retargets — the separate re-hug effect is
subsumed.

- [ ] **Step 4: Confirm the render binding still reads the tween (no change expected)**

The persistent `<rect>` from Task 3 Step 5 reads `ringTween.current` and `glidePhase` — both
still exist. Verify it's unchanged and still present after the `{#each layout.nodes}` block.

- [ ] **Step 5: Run the full gate**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx svelte-check --threshold error
```
Expected: all green (318 tests; 0 type/svelte errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "fix(ring-glide): split phase from position so the ring follows relayout (#52)"
```

- [ ] **Step 7: Re-verify live (the original failing repro)**

With `npm run dev` running, in Explore: click a node that re-centers the tree (e.g. Ornithischia
from the Dinosauria root). Confirm the ring ends **bloomed** (hugging the label), not stuck as a
dot. Then arrow-navigate and confirm collapse→skate→bloom still works, and holding an arrow
still skates-without-blooming until you stop. Reduced-motion still instant.

### Task 5 Self-Review

- Root cause (dual dependency on ringId + posOf) → fixed by keying the phase machine to `ringId`
  only + `untrack` on the center read (Step 3). ✓
- Ring follows relayout at current phase → geometry `$derived` + single tween driver (Steps 2–3). ✓
- Single writer to the tween (no multi-writer race) → only the driver effect calls `.set` (Step 3). ✓
- Settle-only bloom, trigger speeds, reduced-motion, first-mount instant → all preserved in the
  phase machine (Step 3). ✓
- Timer teardown cleanup retained on every exit path → Step 3. ✓
- No placeholder; full code shown. ✓
- `untrack` imported from `svelte` (Step 1); types unchanged. ✓
