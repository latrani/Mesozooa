# Visual Implementation Plan (Look-and-Feel, Part 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the locked, mock-validated visual system (New Mexico high-desert: turquoise-hero spine, dark terracotta placards on a light adobe ground, gem-from-ore warmth ramp, mahogany CTAs, +50% type, skeuomorphic shadow-box) over the existing structural-CSS-only components from the IA pass (Plans 1 + 2).

**Architecture:** A new **global token layer** (`src/lib/styles/`) defines all design tokens as CSS custom properties on `:root`, plus a minimal reset and the self-hosted font; every component then reads tokens and fills in its (currently empty or structural-only) `<style>` block. A single **pure warmth-ramp helper** (`warmthRampColor`, TDD-tested) maps a warmth fraction to an ore→turquoise stop and is consumed by both the specimen chip and the guess-history bars — so warmth color lives in one tested place, honoring "one tree, one source of truth" for the warmth channel.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; `@fontsource/hanken-grotesk` (self-hosted, offline); Vitest for the pure ramp helper; Playwright for the per-task visual gate.

**This is the execution of** `docs/superpowers/specs/2026-07-13-mesozooa-visual-design.md` (spec §2 = token source of truth; §3–§9 = per-region treatment). It is the deferred visual half of the look-and-feel work; the IA (Plans 1 + 2) is merged and its structure is fixed — this pass only skins it.

## Global Constraints

- **Do NOT change IA structure or behavior.** Region composition, the four regions, `specimenState`/store contracts, `layoutSpine` geometry, `panTo` wiring, routing — all fixed. This pass changes CSS, adds the token layer, adds one pure ramp helper, and makes small label-prettify tweaks (§9 of the spec). If a change would alter markup structure beyond adding class hooks / wrapping elements for styling, STOP and flag it.
- **Tokens are the single source of truth, and components read the SEMANTIC layer.** Components MUST read `var(--token)`, never hardcode hex. For the **themeable roles**, read the semantic token, not the raw primitive: `--trail-surface`/`--trail-dp`/`--trail-edge`/`--trail-text` (trail), `--specimen-surface`/`-dp`/`-edge`/`-text`/`-text-dim` (specimen + NodeDetail), `--action-primary`/`-hi`/`-text` (primary buttons), `--spine`/`--node-frontier`/`--node-context`/`--leader` (tree), `--accent` (active tab, focus rings). Raw primitives (`--turq`, `--placard`, `--mahogany`, `--warm-N`, `--ink*`, `--cream*`, `--sand*`) are read directly ONLY where no semantic role exists (e.g. warmth chip/bar fills use `--warm-N` via the ramp helper; body ink uses `--ink`). Rationale: recoloring a region later is then a one-line edit to its `*-surface` token at `:root` (validated in a render probe). Do not invent new colors.
- **WCAG AA by default** (4.5 body / 3.0 large & UI). The token pairings in Task 1 are pre-validated; do not use `--ink-mute`/`--cream-dim` for body-size text (large/meta only).
- **Turquoise `--turq` is identity/decorative only** — never body text, never a white-on-blue button. Primary actions are `--mahogany`. (This was the core v1 fix; violating it reintroduces the bug.)
- **Warmth shows ONLY in the specimen chip + guess-history bars.** Never the spine (solid `--turq`), never the trail (structural counts). The ramp moves ore→turquoise ("warmer = closer to the answer color").
- **Specimen ART is deferred** (spec §5.1): build the shadow-box FRAME + `??????` mount + all states; do NOT hand-draw or commission per-genus specimen art. A bad illustration is worse than an empty mount.
- **Structural CSS from Plans 1–2 stays functional.** When replacing a component's `<style>`, preserve the layout rules that make it work (flex/grid/scroll/`:global(.tree-scroll)`/responsive `@media`) — this pass adds visual properties on top, it does not break layout.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Run `npx tsc --noEmit` (clean) AND `npx svelte-check --tsconfig ./tsconfig.json` (0 errors) before every commit touching `.ts`/`.svelte`.
- **Every visual task is gated by a screenshot in the running app**, compared against the reference mock `screenshots/visual-mock.html` (open it for side-by-side). Build/tsc/svelte-check passing is necessary but NOT sufficient — the implementer screenshots the affected region (Playwright, background/timeout dev server, stop it after) and self-assesses against the task's visual criteria; the controller does the final visual gate. Screenshots go in gitignored `screenshots/`.
- **Frequent commits:** one commit per task.

---

## File Structure

- `src/lib/styles/tokens.css` — **Create.** Two-layer token system on `:root`: **primitives** (raw sampled hex, spec §2) + a **semantic layer** (roles → primitives, with placard `-dp`/`-edge` derived via `color-mix`). Components read the semantic layer so a region recolor is a one-line edit here (see Global Constraints).
- `src/lib/styles/base.css` — **Create.** Minimal reset + `body`/font defaults + `prefers-reduced-motion`.
- `src/main.ts` — **Modify.** Import the two CSS files + the font.
- `index.html` — **Modify.** Add the viewport meta (currently missing).
- `package.json` — **Modify.** Add `@fontsource-variable/hanken-grotesk` dependency (via install).
- `src/lib/game/warmth-ramp.ts` — **Create.** Pure `warmthRampColor(fraction)` + `WARMTH_RAMP`.
- `src/lib/game/warmth-ramp.test.ts` — **Create.** Tests for the ramp helper.
- `src/App.svelte` — **Modify.** Header/nav visual (`<style>`).
- `src/lib/game/components/WarmestTrail.svelte` — **Modify.** Terracotta placard pill.
- `src/lib/game/components/Specimen.svelte` — **Modify.** Terracotta placard, shadow-box, states, warmth chip, mahogany CTA.
- `src/lib/game/components/GuessList.svelte` — **Modify.** Row + ramp-colored bars (consumes helper).
- `src/lib/game/components/SpineTree.svelte` — **Modify.** Turquoise spine, node/leader styling.
- `src/lib/game/components/SearchBox.svelte` — **Modify.** Input + results styling.
- `src/lib/game/components/GameBoard.svelte` — **Modify.** Region spacing polish + hint/input-row buttons.
- `src/lib/game/components/Daily.svelte` / `Practice.svelte` — **Modify (tiny).** `<main>` page padding only.
- `src/lib/explorer/components/Explorer.svelte` — **Modify.** Header + back button + board skin (NO tree change).
- `src/lib/game/components/TaxonCard.svelte` — **Modify.** Card skin (used by Explore + reveal).
- `src/lib/explorer/components/NodeDetail.svelte` — **Modify.** Detail skin; non-playable note styling.
- `src/lib/explorer/components/Breadcrumb.svelte` — **Modify.** Match trail crumb styling.

**`Warmth` type (verified `src/lib/game/types.ts`):** `{ value: number; display: string; fraction: number }`. So `g.warmth.fraction` (0..1) and `g.warmth.value` (clade genus count) both exist — Tasks 6 and 8 use them directly; the "verify then STOP" gates in those tasks will pass without change.

**Current-state facts** (verified — the plan's overrides rely on these):
- No global CSS, no font, no reset, no viewport meta today. `main.ts` only mounts App.
- `<style>` blocks exist only in: `App`, `GameBoard`, `Specimen`, `WarmestTrail`, `SpineTree` (all "structural only"). All other components have NO `<style>` — pure unstyled class hooks.
- The ONLY inline style in the app: `GuessList` `.fill` `style="width: {Math.round(g.warmth.fraction*100)}%"`.
- `SpineTree`: edges `stroke: currentColor`; node `<circle>`/`<text>` have no fill rule (SVG default black). Constants `X_GAP=180, Y_GAP=44, PAD=28`. Class hooks present: `.tree`, `.edge`(+`.spine`), `.node`(+`.spine`,`.highlight`,`.genus`,`.clickable`), `.count`, `.tip`, `.tree-empty`.
- `GuessList` row markup: `.guess-name`, `.clade` ("shared: X"), `.warmth` (`g.warmth.display`), `.bar`>`.fill`.
- `Explorer` uses `TreeView.svelte` (NOT SpineTree) — its cladogram is NOT re-composed here (spec §10); only Explore chrome gets the skin.

---

### Task 1: Global token layer + font + reset

**Files:**
- Create: `src/lib/styles/tokens.css`
- Create: `src/lib/styles/base.css`
- Modify: `src/main.ts`, `index.html`, `package.json` (via install)

**Interfaces:**
- Produces: CSS custom properties on `:root` (consumed by every later task) and global `body` type defaults. No JS API.

- [ ] **Step 1: Install the font**

Run: `npm install @fontsource-variable/hanken-grotesk`
Expected: adds the dep to `package.json`; offline, self-hosted (no CDN at runtime).

- [ ] **Step 2: Create `src/lib/styles/tokens.css`**

Values are verbatim from spec §2 (contrast-validated). Do not alter hex.

```css
:root {
  /* GROUND — adobe near-white */
  --bg-page: #f8f4ea;
  --bg-surface: #f2ebdb;
  --bg-sunk: #eaddc7;
  --hairline: #d8ccb6;

  /* INK — warm dark brown (never pure black) */
  --ink: #33261a;        /* body/heading — 13.3:1 on bg-page */
  --ink-soft: #5f5040;   /* secondary — 7.1:1 */
  --ink-mute: #8a7963;   /* meta/large only — NOT body */

  /* TERRACOTTA placards (dark chrome, cream text) */
  --placard: #9a4a33;
  --placard-dp: #7c3b28;
  --placard-edge: #5f2c1e;
  --cream: #f7efe0;      /* text on placards — 4.9:1 on --placard */
  --cream-dim: #f0d8b8;  /* meta on placards — large only */

  /* TURQUOISE — hero identity (spine, brand, gem end of ramp) */
  --turq: #0d9aa8;
  --turq-dp: #0a7a86;

  /* MAHOGANY — primary action (NOT blue) */
  --mahogany: #7a3a26;   /* cream text 7.5:1 */
  --mahogany-hi: #8f4630;

  /* SAND accents */
  --sand-200: #e6be93;
  --sand-400: #c8a578;

  /* WARMTH RAMP — ore (cold/far) -> turquoise gem (hot/near) */
  --warm-0: #7a6a4c;
  --warm-1: #8f7f4a;
  --warm-2: #7f9257;
  --warm-3: #4f9f8a;
  --warm-4: #1aa39f;
  --warm-5: #0d9aa8;

  /* ============================================================
     SEMANTIC LAYER — roles map to primitives above; components
     read THESE, not the raw colors. Recolor a region by editing
     its one *-surface line here (at :root). The -dp/-edge tokens
     DERIVE via color-mix, so the whole placard re-tones from one
     edit. (Derivation reproduces the sampled terracotta within
     rounding: mix 20% -> #7b3b29 ≈ sampled #7c3b28; 40% -> #5c2c1f
     ≈ #5f2c1e. Verified in a render probe.)
     RULE: derived tokens MUST live here at :root beside their
     surface token — color-mix does NOT re-cascade if a *-surface
     is overridden in a nested scope, only at :root. Recolor here.
     ============================================================ */

  /* Trail placard */
  --trail-surface: var(--placard);
  --trail-dp:   color-mix(in srgb, var(--trail-surface), #000 20%);
  --trail-edge: color-mix(in srgb, var(--trail-surface), #000 40%);
  --trail-text: var(--cream);
  --trail-text-dim: var(--cream-dim);

  /* Specimen placard (+ Explore's NodeDetail, same role) */
  --specimen-surface: var(--placard);
  --specimen-dp:   color-mix(in srgb, var(--specimen-surface), #000 20%);
  --specimen-edge: color-mix(in srgb, var(--specimen-surface), #000 40%);
  --specimen-text: var(--cream);
  --specimen-text-dim: var(--cream-dim);

  /* Primary / secondary action */
  --action-primary: var(--mahogany);
  --action-primary-hi: var(--mahogany-hi);
  --action-primary-text: var(--cream);

  /* Spine (hero) + tree marks */
  --spine: var(--turq);
  --node-frontier: var(--turq-dp);
  --node-context: var(--ink-mute);
  --leader: var(--hairline);

  /* Active-tab / focus accent */
  --accent: var(--turq);

  /* TYPE — base 24px, +50% scale (spec §2.2) */
  --type-display: 2rem;
  --type-h: 1.25rem;
  --type-body: 1.05rem;
  --type-label: 0.92rem;
  --type-meta: 0.78rem;
  --type-eyebrow: 0.72rem;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700; --fw-black: 800;

  /* SPACE / EDGES / MATERIAL */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem;
  --space-4: 1rem; --space-5: 1.5rem; --space-6: 2.5rem; --space-7: 4rem;
  --radius-card: 8px; --radius-pill: 999px;
  --placard-border: 1px solid var(--placard-edge);
  --shadow-lift: 0 2px 4px rgba(51,38,26,.12), 0 8px 22px rgba(51,38,26,.10);
  --shadow-placard: 0 2px 3px rgba(51,38,26,.18), 0 10px 26px rgba(95,44,30,.20);
  --inset-well: inset 0 2px 4px rgba(51,38,26,.10);
  --inset-hi: inset 0 1px 0 rgba(255,255,255,.12);

  /* MOTION */
  --ease: cubic-bezier(.2,.6,.2,1);
  --dur-fast: 120ms; --dur: 220ms; --dur-slow: 420ms;
}
```

- [ ] **Step 3: Create `src/lib/styles/base.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background:
    radial-gradient(140% 100% at 12% 8%, #fbf8f0 0%, var(--bg-page) 55%) fixed;
  color: var(--ink);
  font-family: "Hanken Grotesk Variable", system-ui, sans-serif;
  font-size: 24px;            /* +50% base — spec §2.2 (locked) */
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button { font: inherit; }
h1, h2, p, ul { margin: 0; }
ul { list-style: none; padding: 0; }
a { color: var(--mahogany); }
.eyebrow {
  font-size: var(--type-eyebrow); font-weight: var(--fw-bold);
  letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .001ms !important; animation-duration: .001ms !important; }
}
```

- [ ] **Step 4: Wire imports in `src/main.ts`**

```ts
import { mount } from "svelte";
import "@fontsource-variable/hanken-grotesk";
import "./lib/styles/tokens.css";
import "./lib/styles/base.css";
import App from "./App.svelte";

export default mount(App, { target: document.getElementById("app")! });
```

- [ ] **Step 5: Add the viewport meta to `index.html`**

In `index.html`'s `<head>`, add after the charset meta:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1" />
```

- [ ] **Step 6: Verify build + visual smoke**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds (font assets bundled).
Then run the dev server (background/timeout) and screenshot the app: confirm the **font is Hanken Grotesk** (not Times/system default), the **ground is warm adobe** (`#f8f4ea`, not white), and **base text is large** (24px) — even though components are still mostly unstyled, the page ground + font + size must visibly change. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/lib/styles/ src/main.ts index.html package.json package-lock.json
git commit -m "feat(visual): global token layer, Hanken Grotesk font, adobe ground + reset"
```

---

### Task 2: `warmthRampColor` — the ore→gem ramp helper (pure, TDD)

**Files:**
- Create: `src/lib/game/warmth-ramp.ts`
- Create: `src/lib/game/warmth-ramp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const WARMTH_RAMP: readonly string[]; // 6 CSS var refs, cold->hot
  export function warmthStop(fraction: number): number;      // 0..5
  export function warmthRampColor(fraction: number): string; // a var(--warm-N) string
  ```
  Semantics: `fraction` is the guess's `warmth.fraction` (0 = coldest/largest clade, 1 = hottest/genus). `warmthStop` maps it to an integer stop `0..5` via `clamp(round(fraction*5), 0, 5)`. `warmthRampColor` returns `var(--warm-N)` for that stop. Kept as CSS-var references (not hex) so a token change flows through without touching JS.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/warmth-ramp.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { WARMTH_RAMP, warmthStop, warmthRampColor } from "./warmth-ramp";

describe("warmthStop", () => {
  it("maps the cold end to 0 and the hot end to 5", () => {
    expect(warmthStop(0)).toBe(0);
    expect(warmthStop(1)).toBe(5);
  });
  it("rounds to the nearest of 6 stops", () => {
    expect(warmthStop(0.1)).toBe(1);   // 0.5 -> round 1
    expect(warmthStop(0.5)).toBe(3);   // 2.5 -> round 3 (banker-independent: Math.round → 3)
    expect(warmthStop(0.9)).toBe(5);   // 4.5 -> round 5
  });
  it("clamps out-of-range input", () => {
    expect(warmthStop(-1)).toBe(0);
    expect(warmthStop(2)).toBe(5);
  });
});

describe("warmthRampColor", () => {
  it("returns the matching --warm-N css var", () => {
    expect(warmthRampColor(0)).toBe("var(--warm-0)");
    expect(warmthRampColor(1)).toBe("var(--warm-5)");
  });
  it("WARMTH_RAMP has 6 stops, cold->hot, all css vars", () => {
    expect(WARMTH_RAMP).toHaveLength(6);
    expect(WARMTH_RAMP[0]).toBe("var(--warm-0)");
    expect(WARMTH_RAMP[5]).toBe("var(--warm-5)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/warmth-ramp.test.ts`
Expected: FAIL — cannot find module `./warmth-ramp`.

- [ ] **Step 3: Implement `src/lib/game/warmth-ramp.ts`**

```ts
// Ore (cold/far) -> turquoise gem (hot/near). CSS-var refs so token edits flow through.
export const WARMTH_RAMP = [
  "var(--warm-0)", "var(--warm-1)", "var(--warm-2)",
  "var(--warm-3)", "var(--warm-4)", "var(--warm-5)",
] as const;

export function warmthStop(fraction: number): number {
  const i = Math.round(fraction * (WARMTH_RAMP.length - 1));
  return Math.min(WARMTH_RAMP.length - 1, Math.max(0, i));
}

export function warmthRampColor(fraction: number): string {
  return WARMTH_RAMP[warmthStop(fraction)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/warmth-ramp.test.ts && npx tsc --noEmit`
Expected: all tests pass; tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/warmth-ramp.ts src/lib/game/warmth-ramp.test.ts
git commit -m "feat(visual): warmthRampColor — pure ore->gem ramp helper"
```

---

### Task 3: App header

**Files:**
- Modify: `src/App.svelte`

**Interfaces:** CSS-only + adds no new markup (existing `.app-header`, `.wordmark`, `.modes`, `class:active` hooks).

- [ ] **Step 1: Replace App's `<style>` block**

Keep the existing markup and the `.app-header` flex; add the visual layer:
```css
  .app-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6) var(--space-4);
  }
  .wordmark {
    font-size: var(--type-display);
    font-weight: var(--fw-black);
    letter-spacing: -.01em;
    color: var(--ink);
  }
  .modes {
    display: flex;
    gap: var(--space-5);
    margin-left: auto;
    font-size: var(--type-body);
  }
  .modes button {
    background: none; border: 0; cursor: pointer;
    font-weight: var(--fw-semibold);
    color: var(--ink-soft);
    padding: .15rem 0; position: relative;
  }
  .modes button:hover { color: var(--ink); }
  .modes button.active { color: var(--ink); }
  .modes button.active::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -4px;
    height: 3px; background: var(--accent); border-radius: 2px;
  }
```

- [ ] **Step 2: Verify + visual gate**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Then dev-server + screenshot the header. Criteria (vs mock): wordmark large/black; three modes right-aligned; active mode marked with a **turquoise** underline; no blue text buttons. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat(visual): app header — wordmark + turquoise active-tab underline"
```

---

### Task 4: Trail — terracotta placard scrubber

**Files:**
- Modify: `src/lib/game/components/WarmestTrail.svelte`

**Interfaces:** CSS-only; existing markup (`.trail`, `.budget`, `.crumb`, `.crumb.active`, `.sep`, `<em>` counts). Preserve the flex-wrap layout.

- [ ] **Step 1: Replace WarmestTrail's `<style>` block**

```css
  .trail {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2);
    margin: 0 var(--space-6);
    padding: .55rem .9rem;
    background: linear-gradient(var(--trail-surface), var(--trail-dp));
    border: 1px solid var(--trail-edge);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    color: var(--trail-text);
  }
  .budget {
    font-size: var(--type-meta); font-weight: var(--fw-black);
    color: var(--trail-dp); background: var(--trail-text);
    border-radius: var(--radius-pill); padding: .15rem .7rem; margin-right: var(--space-1);
  }
  .crumb {
    font-size: var(--type-label); font-weight: var(--fw-semibold);
    color: var(--trail-text); background: none; border: 0; cursor: pointer;
    padding: .15rem .5rem; border-radius: var(--radius-pill);
    transition: background var(--dur-fast) var(--ease);
  }
  .crumb :global(em), .crumb em { font-style: normal; color: var(--trail-text-dim); font-size: var(--type-meta); font-weight: var(--fw-bold); }
  .crumb:hover:not(:disabled), .crumb.active {
    background: rgba(247,239,224,.18);
    box-shadow: inset 0 0 0 1px rgba(247,239,224,.35);
  }
  .crumb:disabled { cursor: default; }
  .sep { color: var(--trail-text-dim); opacity: .6; }
```
(Note: the `rgba(247,239,224,…)` wash literals are the cream-tint hover — acceptable as-is since they're translucent overlays, not the recolorable surface; a future recolor of the trail keeps a cream wash, which reads fine on any placard color.)
Note: the count is rendered as `<em>(N)</em>`; the rule de-italicizes it and dims it (structural, not warmth).

- [ ] **Step 2: Verify + visual gate**

Build/tsc/svelte-check, then screenshot the trail. Criteria (vs mock): the trail is a single **dark terracotta pill** with cream crumbs; the budget is a cream chip at the head; the active crumb has a translucent cream wash; counts are dim cream — NOT a warmth channel. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/WarmestTrail.svelte
git commit -m "feat(visual): trail — terracotta placard scrubber with cream crumbs"
```

---

### Task 5: Specimen — terracotta placard, shadow-box, states, warmth chip, mahogany CTA

**Files:**
- Modify: `src/lib/game/components/Specimen.svelte`

**Interfaces:**
- Consumes: `warmthRampColor` (Task 2) for the warmth chip; existing `specimenState` props (unchanged). The component currently gets `specimen`, `clue`, `onexplore?`, `onnew?`. To color the warmth chip it needs the warmth fraction of the current clade — but `SpecimenState` (broad/terminal) carries a count, not a fraction. **Add a `warmthFraction: number` prop** (0..1) that GameBoard computes and passes (Task 8 wires it); default `0`. This is an additive prop, not a structural change.
- Adds markup hooks: wrap the placeholder/answer in a `.shadowbox` mount div; add an eyebrow; add a `.warm-chip` span. Keep all four state branches and their logic.

- [ ] **Step 1: Add the `warmthFraction` prop + shadow-box markup + eyebrow/chip**

In `Specimen.svelte`'s `<script>`, add to props (keep the rest):
```ts
  import { warmthRampColor } from "../warmth-ramp";
  // ...existing props plus:
  //   warmthFraction = 0
```
So the destructure becomes (illustrative — merge with existing):
```ts
  let {
    specimen, clue, onexplore, onnew, warmthFraction = 0,
  }: {
    specimen: SpecimenState;
    clue: GenusAttribute | null;
    onexplore?: (id: string) => void;
    onnew?: () => void;
    warmthFraction?: number;
  } = $props();
```

Restructure the markup so each state renders inside the placard with an eyebrow, a shadow-box mount, and (broad/terminal) a warmth chip. Exact template:
```svelte
<aside class="specimen" aria-label="Specimen">
  {#if specimen.kind === "empty"}
    <span class="eyebrow">Specimen · unidentified</span>
    <div class="shadowbox"><span class="qmarks">? ? ?</span></div>
    <p class="hint">Guess a dinosaur to start narrowing.</p>
  {:else if specimen.kind === "broad"}
    <span class="eyebrow">Specimen · unidentified</span>
    <div class="shadowbox"><span class="qmarks">? ? ?</span></div>
    <div class="warmrow">
      <span class="warm-chip" style="background: {warmthRampColor(warmthFraction)}"></span>
      <span class="count">{specimen.count} {specimen.count === 1 ? "genus" : "genera"}</span>
    </div>
  {:else if specimen.kind === "terminal"}
    <span class="eyebrow">Specimen · unidentified</span>
    <div class="shadowbox"><span class="qmarks">? ? ?</span></div>
    <div class="warmrow">
      <span class="warm-chip gem" style="background: {warmthRampColor(warmthFraction)}"></span>
      <span class="count">{specimen.siblingCount} sibling {specimen.siblingCount === 1 ? "taxon" : "taxa"}</span>
    </div>
    {#if clue}
      <div class="clue" aria-label="Paleo clue">
        <span class="eyebrow">Field clue</span>
        {#if clue.ageLabel}
          <span class="clue-field"><b>Lived:</b> {clue.ageLabel}{#if clue.ageStartMa != null && clue.ageEndMa != null} (~{clue.ageStartMa}–{clue.ageEndMa} Ma){/if}</span>
        {/if}
        {#if clue.discoveryLocation}
          <span class="clue-field"><b>Found in:</b> {clue.discoveryLocation}</span>
        {/if}
      </div>
    {/if}
  {:else}
    <span class="eyebrow">Specimen · identified</span>
    <div class="shadowbox solved"><!-- art deferred (spec §5.1): frame only, empty mount --></div>
    <p class="answer">{answerName}</p>
    <p class="count">{specimen.outcome === "won" ? "Solved" : "Out of guesses"} in {specimen.guessCount} {specimen.guessCount === 1 ? "guess" : "guesses"}</p>
    <div class="actions">
      {#if onexplore}<button type="button" class="primary" onclick={() => onexplore?.(specimen.targetId)}>Explore around {answerName} ▸</button>{/if}
      {#if onnew}<button type="button" class="secondary" onclick={() => onnew?.()}>New round</button>{/if}
    </div>
  {/if}
</aside>
```
(`answerName` derived stays as-is.)

- [ ] **Step 2: Replace the `<style>` block**

Preserve the responsive `@media` (Task 10 refines it); add the placard skin:
```css
  .specimen {
    display: flex; flex-direction: column; gap: var(--space-3);
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-5); color: var(--specimen-text);
  }
  .specimen .eyebrow { color: var(--specimen-text-dim); }
  .shadowbox {
    border-radius: 5px; height: 8.5rem; position: relative; overflow: hidden;
    background: radial-gradient(120% 120% at 50% 30%, #f3e6cf 0%, #e3cba6 100%);
    box-shadow: inset 0 3px 8px rgba(95,44,30,.45), inset 0 -2px 4px rgba(255,255,255,.4);
    border: 3px solid var(--specimen-edge);
  }
  .qmarks {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 1.6rem; letter-spacing: .35em; color: #b89a72; font-weight: var(--fw-black);
    text-shadow: 0 1px 0 rgba(255,255,255,.5);
  }
  .hint { color: var(--specimen-text-dim); font-size: var(--type-label); }
  .warmrow { display: flex; align-items: center; gap: var(--space-2); font-weight: var(--fw-black); font-size: var(--type-h); }
  .warm-chip { width: 2.8rem; height: .95rem; border-radius: var(--radius-pill); box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
  .warm-chip.gem { box-shadow: inset 0 1px 2px rgba(0,0,0,.2), 0 0 8px rgba(13,154,168,.55); }
  .clue { border-top: 1px solid rgba(247,239,224,.25); padding-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
  .clue-field { color: var(--specimen-text); font-size: var(--type-body); }
  .clue-field b { font-weight: var(--fw-bold); }
  .answer { font-size: var(--type-display); font-weight: var(--fw-black); line-height: 1.1; }
  .count { color: var(--specimen-text-dim); font-size: var(--type-body); }
  .actions { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1); }
  .primary {
    font-weight: var(--fw-black); font-size: var(--type-body); color: var(--action-primary-text);
    background: linear-gradient(var(--action-primary-hi), var(--action-primary));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-pill);
    padding: .7rem 1.1rem; cursor: pointer; box-shadow: var(--shadow-lift), var(--inset-hi);
  }
  .secondary {
    font-weight: var(--fw-semibold); font-size: var(--type-body); color: var(--specimen-text);
    background: rgba(247,239,224,.12); border: 1px solid rgba(247,239,224,.35);
    border-radius: var(--radius-pill); padding: .65rem 1.1rem; cursor: pointer;
  }
  @media (max-width: 640px) {
    .specimen { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
  }
```

- [ ] **Step 3: Verify + visual gate**

Build/tsc/svelte-check. Then dev-server; in Practice, make guesses to reach broad → terminal → solved and screenshot each. Criteria (vs mock): terracotta placard with cream text; **mounted shadow-box** (inset glass over sand mat) holding `? ? ?`; warmth chip shows the ramp (cool ore when broad, near-turquoise glow at terminal); clue under a `FIELD CLUE` eyebrow; solved shows the answer + **mahogany** "Explore around" button (NOT blue) + secondary "New round"; the solved shadow-box is an empty framed mount (art deferred). Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/Specimen.svelte
git commit -m "feat(visual): specimen — terracotta placard, shadow-box, warmth chip, mahogany CTA"
```

---

### Task 6: Guess history — rows + ore→gem warmth bars

**Files:**
- Modify: `src/lib/game/components/GuessList.svelte`

**Interfaces:**
- Consumes: `warmthRampColor` (Task 2). Sets the bar fill **color** from the guess's `warmth.fraction` (the width is already inline). Adds a `HINT` tag for `kind === "hint"` rows (clears a bucket-A item). No structural/behavior change beyond adding the tag span + a `<style>` block (the component had none).

- [ ] **Step 1: Add the ramp import + hint tag + gem class in the template**

In `<script>`: `import { warmthRampColor } from "../warmth-ramp";`
Update the row markup (keep `onselect`, keep the width inline; add color + hint tag + gem glow on hot bars):
```svelte
<ul class="guesses">
  {#each guesses as g (g.guessId)}
    {@const guess = treeStore.getNode(g.guessId)}
    {@const shared = treeStore.getNode(g.sharedNodeId)}
    <li>
      <button type="button" onclick={() => onselect(g.sharedNodeId)}>
        <span class="guess-name">{guess?.name}{#if g.kind === "hint"} <span class="hint-tag">hint</span>{/if}</span>
        <span class="clade">shared: {shared?.name}</span>
        <span class="count tabnum">{g.warmth.value}</span>
        <span class="bar">
          <span class="fill" class:gem={g.warmth.fraction >= 0.7}
            style="width: {Math.round(g.warmth.fraction * 100)}%; background: {warmthRampColor(g.warmth.fraction)}"></span>
        </span>
      </button>
    </li>
  {/each}
</ul>
```
Note: the old `.warmth` display string (`g.warmth.display`, e.g. "881 genera") is replaced by the bare tabular `g.warmth.value` count to the left of the bar (the ramp bar now carries the temperature; the string was redundant per spec §4). If `warmth.value` is not on the type, use `shared?.descendantGenusCount` instead — verify against `src/lib/game/types.ts` `Warmth` before implementing; if unclear, STOP and ask.

- [ ] **Step 2: Add the `<style>` block**

```css
<style>
  .guesses { display: flex; flex-direction: column; gap: var(--space-2); }
  .guesses button {
    display: grid; grid-template-columns: 12rem 1fr auto 12rem; align-items: center; gap: var(--space-4);
    width: 100%; background: none; border: 0; cursor: pointer; text-align: left;
    padding: .2rem 0; color: var(--ink); font-size: var(--type-body);
  }
  .guess-name { font-weight: var(--fw-medium); }
  .hint-tag {
    font-size: var(--type-eyebrow); font-weight: var(--fw-black); letter-spacing: .1em; text-transform: uppercase;
    color: var(--placard-dp); background: var(--sand-200); border-radius: var(--radius-pill);
    padding: .05rem .45rem; vertical-align: .1em;
  }
  .clade { color: var(--ink-soft); font-size: var(--type-label); }
  .count { color: var(--ink-soft); font-size: var(--type-meta); font-weight: var(--fw-bold); text-align: right; }
  .bar { height: .75rem; background: var(--bg-sunk); border-radius: var(--radius-pill); overflow: hidden; box-shadow: var(--inset-well); }
  .fill { display: block; height: 100%; border-radius: var(--radius-pill); }
  .fill.gem { box-shadow: 0 0 8px rgba(13,154,168,.55); }
  @media (max-width: 640px) {
    .guesses button { grid-template-columns: 1fr auto; }
    .clade, .count { display: none; }
  }
</style>
```

- [ ] **Step 3: Verify + visual gate**

Build/tsc/svelte-check. Then dev-server; make several guesses at different clade sizes + a hint, screenshot. Criteria (vs mock): rows are legible on the light ground; bars run **ore (dull umber) for cold/large clades → turquoise gem-glow for hot/near ones**; a hot guess literally glows the spine's turquoise; hint rows carry a sand `HINT` tag. Confirm the ramp direction matches the spine (turquoise = warm/close). Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/GuessList.svelte
git commit -m "feat(visual): guess history — ore->gem warmth bars + hint tag"
```

---

### Task 7: Spine tree — turquoise hero spine, node & leader styling

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:** CSS + SVG-attribute styling only; existing class hooks (`.edge`/`.spine`, `.node`/`.spine`/`.genus`/`.highlight`, `.count`, `.tip`, `.tree-empty`). Preserve `.tree-scroll` layout + all geometry (`layoutSpine`, constants, `panTo`).

- [ ] **Step 1: Replace/extend the `<style>` block**

Keep `.tree-scroll` (layout). Add color/weight; the spine is solid `--turq`, off-spine edges `--hairline`, node dots/labels colored, counts `--ink-soft`:
```css
  .tree-scroll { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
  .tree { color: var(--ink); }                 /* text default */
  .edge { stroke: var(--leader); stroke-width: 2; fill: none; }
  .edge.spine {
    stroke: var(--spine); stroke-width: 5;
    filter: drop-shadow(0 1px 1px rgba(10,122,134,.35));
  }
  .node text { fill: var(--ink); font-size: var(--type-label); font-weight: var(--fw-semibold); }
  .node circle { fill: var(--node-context); }               /* off-spine context */
  .node.spine circle { fill: var(--spine); }
  .node.genus circle { fill: var(--node-frontier); stroke: #fff; stroke-width: 2; }
  .node:not(.spine) text { fill: var(--node-context); font-size: var(--type-meta); font-weight: var(--fw-medium); }
  .count { fill: var(--ink-soft); font-size: var(--type-meta); font-weight: var(--fw-bold); }
  .node.clickable { cursor: pointer; }
  .tip { fill: var(--ink-soft); font-size: var(--type-meta); }
  .tree-empty { color: var(--ink-soft); font-size: var(--type-body); padding: var(--space-6); }
```
(If the genus dot radius needs to read larger, that's set in the template `r=` attribute — leave geometry as-is unless the visual gate shows the frontier is not prominent; if so, note it, don't silently change constants.)

- [ ] **Step 2: Verify + visual gate**

Build/tsc/svelte-check. Then dev-server; make guesses across clades and narrow into one family, screenshot. Criteria (vs mock): the spine is a **solid turquoise stroke** (the heaviest line, with a subtle glow); off-spine branches are thin hairline leaders; spine node dots are turquoise, the frontier/genus dot is deeper turquoise ringed white, off-spine dots are muted; labels legible; counts are structural `--ink-soft` (no warmth color on the tree). Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(visual): spine tree — turquoise hero spine, node & leader styling"
```

---

### Task 8: SearchBox, input row, GameBoard region polish + specimen warmth wiring, page padding

**Files:**
- Modify: `src/lib/game/components/SearchBox.svelte`, `GameBoard.svelte`, `Daily.svelte`, `Practice.svelte`

**Interfaces:**
- GameBoard computes `warmthFraction` for the Specimen (Task 5's new prop). The warmest clade's fraction is available via the warmth provider, but GameBoard currently passes `store.clue` etc. **Compute the fraction from the warmest guess:** the store exposes `state.guesses`; the warmest guess's `warmth.fraction` is the current specimen temperature. Add a `$derived` that takes the max `warmth.fraction` across `store.state.guesses` (0 if none) and pass it as `warmthFraction` to `<Specimen>`. This is additive; verify the field name against `Warmth` in `types.ts` before writing (same check as Task 6).

- [ ] **Step 1: Style SearchBox (add a `<style>` block)**

```svelte
<style>
  .searchbox { position: relative; flex: 1; }
  .searchbox input {
    width: 100%; font-size: var(--type-body); color: var(--ink);
    background: var(--bg-surface); border: 2px solid var(--hairline);
    border-radius: var(--radius-pill); padding: .8rem 1.3rem; box-shadow: var(--inset-well);
  }
  .searchbox input::placeholder { color: var(--ink-mute); }
  .searchbox input:focus { outline: none; border-color: var(--accent); }
  .searchbox ul {
    position: absolute; z-index: 5; left: 0; right: 0; margin-top: .3rem;
    background: var(--bg-surface); border: 1px solid var(--hairline);
    border-radius: var(--radius-card); box-shadow: var(--shadow-lift); overflow: hidden; max-height: 18rem; overflow-y: auto;
  }
  .searchbox li button {
    width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
    padding: .5rem 1rem; font-size: var(--type-body); color: var(--ink);
  }
  .searchbox li button:hover { background: var(--blue-tint, var(--bg-sunk)); }
</style>
```
(Wrap the input+ul in the existing `.searchbox` div — already present.)

- [ ] **Step 2: Style the GameBoard region + hint button + wire `warmthFraction`**

In `<script>`, add the derived (verify `warmth.fraction` field first):
```ts
  let warmthFraction = $derived(
    store.state.guesses.reduce((m, g) => Math.max(m, g.warmth.fraction), 0),
  );
```
Pass it: `<Specimen {specimen} clue={store.clue} {onexplore} {onnew} {warmthFraction} />`.
Extend the `<style>` (keep the existing region flex + `:global(.tree-scroll)` + `@media`):
```css
  .game { display: flex; flex-direction: column; gap: var(--space-5); padding: 0 var(--space-6) var(--space-6); }
  .middle { display: flex; gap: var(--space-6); align-items: stretch; min-height: 0; }
  .middle :global(.tree-scroll) { flex: 1 1 auto; min-width: 0; }
  .bottom { display: flex; flex-direction: column; gap: var(--space-4); }
  .input-row { display: flex; gap: var(--space-3); align-items: center; }
  .input-row button {   /* the Hint button — action-primary outline, NOT blue */
    font-size: var(--type-body); font-weight: var(--fw-bold); color: var(--action-primary);
    background: var(--bg-surface); border: 2px solid var(--action-primary);
    border-radius: var(--radius-pill); padding: .7rem 1.3rem; cursor: pointer;
  }
  .input-row button:disabled { opacity: .5; cursor: default; }
  @media (max-width: 640px) {
    .middle { flex-direction: column; }
    .middle :global(.tree-scroll) { width: 100%; }
  }
```

- [ ] **Step 3: Page padding on Daily/Practice wrappers**

Add a `<style>` to each:
```css
<style>
  .daily, .practice { padding-top: var(--space-2); }
</style>
```
(`.daily` for Daily, `.practice` for Practice — match each file's existing `<main>` class.)

- [ ] **Step 4: Verify + visual gate**

Build/tsc/svelte-check. Dev-server; screenshot the full board (Daily and Practice). Criteria (vs mock): search input is a generous inset pill, focus ring turquoise; the Hint button is a **mahogany** outline (not blue); regions have generous breathing room using the width; the specimen warmth chip now reflects the actual warmest guess (cool early, hot near the answer). Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SearchBox.svelte src/lib/game/components/GameBoard.svelte src/lib/game/components/Daily.svelte src/lib/game/components/Practice.svelte
git commit -m "feat(visual): search/input/hint styling, region spacing, specimen warmth wiring"
```

---

### Task 9: Explore chrome skin (no tree recomposition)

**Files:**
- Modify: `src/lib/explorer/components/Explorer.svelte`, `TaxonCard.svelte` (game/components), `NodeDetail.svelte`, `Breadcrumb.svelte`

**Interfaces:** CSS-only skin over the existing Explore chrome. **Do NOT touch `TreeView.svelte` or `layout.ts`** (spec §10 — Explore's cladogram is not re-composed this pass). No `playable` markers (must stay off per IA spec §2).

- [ ] **Step 1: Explorer.svelte `<style>`**

```svelte
<style>
  .explorer { padding: var(--space-4) var(--space-6) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
  .explorer header { display: flex; align-items: baseline; gap: var(--space-4); }
  .explorer header h1 { font-size: var(--type-display); font-weight: var(--fw-black); }
  .explorer header button {   /* back to game — mahogany text button */
    font-size: var(--type-label); font-weight: var(--fw-bold); color: var(--mahogany);
    background: none; border: 0; cursor: pointer; padding: .2rem .4rem;
  }
  .explorer .board { display: flex; gap: var(--space-6); align-items: flex-start; }
  .explorer .board :global(.tree-scroll), .explorer .board :global(svg) { flex: 1 1 auto; min-width: 0; }
</style>
```

- [ ] **Step 2: TaxonCard.svelte `<style>`**

```svelte
<style>
  .taxon-card { display: flex; flex-direction: column; gap: var(--space-2); }
  .taxon-card h2 { font-size: var(--type-h); font-weight: var(--fw-bold); color: var(--ink); }
  .taxon-card img { max-width: 100%; border-radius: var(--radius-card); border: 1px solid var(--hairline); }
  .taxon-card a { color: var(--mahogany); font-weight: var(--fw-semibold); font-size: var(--type-label); }
  .taxon-card .lineage { color: var(--ink-soft); font-size: var(--type-label); }
</style>
```

- [ ] **Step 3: NodeDetail.svelte `<style>` (terracotta placard, like the specimen)**

```svelte
<style>
  .node-detail {   /* same 'specimen' role — reads the specimen semantic tokens */
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-5); color: var(--specimen-text);
  }
  .node-detail :global(.taxon-card h2), .node-detail :global(.taxon-card .lineage) { color: var(--specimen-text); }
  .node-detail :global(.taxon-card a) { color: var(--sand-200); }
  .group-size { color: var(--specimen-text-dim); font-size: var(--type-label); margin-top: var(--space-2); }
  .unresolved { color: var(--sand-200); font-size: var(--type-label); font-style: italic; }
</style>
```

- [ ] **Step 4: Breadcrumb.svelte — match trail crumb styling**

Read the file first (14 lines) for its exact classes, then give it a `<style>` consistent with the trail crumbs (light-ground variant: `--mahogany`/`--ink-soft` text buttons, NOT a placard — the explorer breadcrumb sits on the light page). Keep it a flow line of clickable crumbs. Exact CSS depends on its class names — mirror the pattern: crumb buttons `color: var(--ink-soft)`, hover `var(--ink)`, separators `var(--ink-mute)`.

- [ ] **Step 5: Verify + visual gate**

Build/tsc/svelte-check. Dev-server; open Explore, screenshot. Criteria: warm adobe ground + Hanken type; "← Back to game" is a mahogany text button; the node-detail rail is a terracotta placard (sibling to the game specimen); **no `playable`/guessable markers anywhere**; the cladogram (TreeView) is unchanged in structure but inherits the ground/type. Confirm `grep -n "playable" src/lib/explorer/components/*.svelte` is still clean. Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/explorer/components/Explorer.svelte src/lib/game/components/TaxonCard.svelte src/lib/explorer/components/NodeDetail.svelte src/lib/explorer/components/Breadcrumb.svelte
git commit -m "feat(visual): explore chrome skin (no tree recomposition, no playable markers)"
```

---

### Task 10: Responsive polish + bucket-A cleanups

**Files:**
- Modify: `src/lib/game/components/Specimen.svelte`, `GameBoard.svelte`, `SpineTree.svelte` (tooltip prefix), plus a label-prettify helper where the root renders.

**Interfaces:** Clears the remaining `deferred-findings.md` bucket-A items the earlier tasks didn't: (a) specimen bottom-bar `align-items: baseline` jitter → use `center`; (b) empty-state tree flex-fill; (c) root label lowercase "dinosaur" → title-case; (d) game hover tooltip lost its `"guesses:"` prefix.

- [ ] **Step 1: Fix the specimen narrow-bar alignment**

In `Specimen.svelte`'s `@media (max-width: 640px)`, confirm `align-items: center` (Task 5 already set `center`, not `baseline`) — verify and, if it reads as a compact strip `?????? · N taxa · clue`, good. If items still jitter, set explicit `align-items: center` and a small `row-gap`.

- [ ] **Step 2: Empty-state tree flex-fill**

In `SpineTree.svelte`, the empty branch renders `<p class="tree-empty">` (not `.tree-scroll`), so GameBoard's `:global(.tree-scroll){flex:1}` doesn't apply pre-first-guess. Wrap the empty `<p>` so it fills: give `.tree-empty` `flex: 1 1 auto; width: 100%;` OR wrap it in a `.tree-scroll`-classed div. Simplest: add to `.tree-empty` `min-height: 200px; display: flex; align-items: center;` and ensure the GameBoard middle still lays out (the specimen shouldn't jump to the far left). Verify in the empty state (fresh Practice round).

- [ ] **Step 3: Root label prettify**

The root renders as lowercase "dinosaur" (Wikidata Q430 label) in tree/trail/specimen. Add a tiny pure display helper and use it wherever a node name is shown at the label layer. Create `src/lib/game/displayName.ts`:
```ts
// Title-cases the known lowercase root label; leaves proper taxon names untouched.
export function displayName(name: string | undefined): string {
  if (!name) return "";
  return name === "dinosaur" ? "Dinosauria" : name;
}
```
Apply it in `WarmestTrail` (crumb name), `SpineTree` (node label text), and `TaxonCard` (h2 + lineage) where `node.name` is rendered. (Keep it minimal — one special-case; do not attempt general title-casing which would mangle proper names.) Add `src/lib/game/displayName.test.ts` with two cases (maps "dinosaur"→"Dinosauria"; leaves "Tyrannosaurus" unchanged) — TDD.

- [ ] **Step 4: Restore the tree tooltip `"guesses:"` prefix**

In `SpineTree.svelte`, the hover `.tip` currently renders `tips.join(", ")`. Restore the label: render `guesses: {tips.join(", ")}` (only when tips exist). This clears the bucket-A regression noted in `deferred-findings.md`.

- [ ] **Step 5: Verify + visual gate (desktop + narrow)**

Build/tsc/svelte-check + `npm run test` (the new displayName + warmth-ramp tests + full suite must pass). Dev-server; screenshot at 1440px AND at ~500px. Criteria: at narrow width the tree keeps horizontal scroll (root left, deeper right — never rotates) and the specimen is a full-width compact bar above the input, aligned cleanly (no baseline jitter); the empty state fills the tree area (specimen not jammed left); the root reads "Dinosauria" not "dinosaur" in tree/trail/specimen; hovering a tree node shows "guesses: …". Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/Specimen.svelte src/lib/game/components/GameBoard.svelte src/lib/game/components/SpineTree.svelte src/lib/game/components/WarmestTrail.svelte src/lib/game/components/TaxonCard.svelte src/lib/game/displayName.ts src/lib/game/displayName.test.ts
git commit -m "feat(visual): responsive polish + bucket-A cleanups (root label, tooltip, empty-state, narrow bar)"
```

---

## Self-Review

**1. Spec coverage (visual spec §2–§10):**
- §2 tokens (color, type +50%, space, material, motion) → Task 1 (verbatim primitive layer + font + reset), plus a **semantic layer** (roles → primitives, derived placard tones) so regions recolor in one line — the derived tokens reproduce the sampled terracotta within rounding (render-probe verified).
- §2.0 decisions (light ground/dark placards; gem-from-ore) → Task 1 tokens + Task 2 ramp + applied in Tasks 4/5/6.
- §3 collage/flow split → honored structurally (tree canvas + specimen composed; header/trail/input flow) across Tasks 3–8; no grid imposed on the tree.
- §4 tree as editorial plate (turquoise spine, node/leader styling, counts structural) → Task 7.
- §5 specimen plate + §5.1 art-deferred → Task 5 (frame + `??????` mount only; explicitly no art).
- §6 trail/history/input/header → Task 3 (header), 4 (trail placard), 6 (history bars + hint tag), 8 (input/hint mahogany).
- §7 motion → tokens in Task 1 (`--ease`/durations) + `prefers-reduced-motion` in base.css; per-element transitions are light-touch (crumb hover, focus) — heavier meaning-motion (frontier pan) already exists from Plan 1 and is not regressed.
- §8 responsive degradation → Task 10 (+ the `@media` blocks carried in Tasks 5/6/8).
- §9 bucket-A coverage (warmth scale, tab/budget/hint styling, hint rows distinct, tooltip prefix, root label, non-playable/active-tab) → distributed: warmth Tasks 2/5/6; tab Task 3; budget/hint Tasks 4/8; hint-rows Task 6; tooltip + root label Task 10; non-playable styling Task 9.
- §10 out of scope (dark theme, per-genus art, share visual, Explore tree recomposition/pan-zoom) → correctly NOT built; Task 9 explicitly leaves TreeView/layout.ts untouched.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Two deliberate "verify field name then implement, STOP if unclear" gates (Task 6/8 `warmth.fraction`/`warmth.value` against `types.ts`) are explicit verification steps, not placeholders — they exist because the exact `Warmth` field must be confirmed at implementation, and the fallback is named. Task 9 Step 4 (Breadcrumb) says "read the 14-line file first" — a real instruction, with the exact styling pattern to mirror given.

**3. Type/consistency:** `warmthRampColor(fraction)` (Task 2) is consumed by Specimen (Task 5, via new `warmthFraction` prop) and GuessList (Task 6) with identical signature. The `warmthFraction` prop added to Specimen (Task 5) is supplied by GameBoard (Task 8) — both additive, defaulted `0`, no structural change. `displayName` (Task 10) is a single helper applied in three render sites. **Token layering is consistent:** every themeable role in the component CSS reads a semantic token (`--trail-*`, `--specimen-*`, `--action-primary*`, `--spine`, `--node-frontier`, `--node-context`, `--leader`, `--accent`), and every semantic token is defined in Task 1's semantic layer, which maps to primitives also defined in Task 1. Primitives are read directly only where no role exists (`--warm-N` via the ramp, `--ink`/`--bg-*`/`--hairline` structural neutrals, `--sand-200` for the hint tag, generic `--mahogany` links in base.css). No component references a raw color that isn't a defined primitive; no semantic token is used that isn't defined. The `Warmth` field access (`.fraction`, `.value`) is verified present in `types.ts` (noted above); the Tasks 6/8 gates will pass.

**4. Non-negotiables re-checked:** turquoise never used as text/CTA (CTAs are `--mahogany` in Tasks 5/8/9; turquoise is spine/identity/ramp-hot only); warmth only in specimen + history (Tasks 5/6), never spine/trail; specimen art deferred (Task 5.1); Explore tree untouched + no playable markers (Task 9); IA structure/behavior unchanged (CSS + additive props + label helper only). Every visual task has a screenshot-in-app gate, not just build.
