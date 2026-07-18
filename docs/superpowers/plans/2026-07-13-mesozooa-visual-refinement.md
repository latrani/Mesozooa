# Visual Refinement Plan (Look-and-Feel, Part 2 — polish)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the visual pass to holistically-passable: apply the locked tree treatment (dots with labels offset above-and-right, tightened branches, fixed SVG scaling) to BOTH trees, rebuild the narrow/mobile layout (vertical stacked lineage primary + full-size scrolling tree + pegged specimen/input), and clear the final-review Minors.

**Architecture:** The two SVG trees (`SpineTree` for the game, `TreeView` for Explore) share a near-identical node/label render. This plan aligns their treatment (dots on the line; label anchored above-and-right; frontier emphasis) and fixes the shared **flex-shrink scaling bug** (SVG must render at intrinsic size with `min-width: max-content` so the container scrolls instead of shrinking the SVG — this is the single root cause of both the "tree text too small" and the "Explore tree giant/illegible" problems). Narrow layout becomes a distinct responsive composition (vertical lineage as primary orientation) rather than a reflow of the desktop tree. All changes are CSS + markup-within-components; no store/selector/geometry-logic changes except tuning the layout spacing constants.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; existing token layer (`src/lib/styles/tokens.css`); Playwright for the controller's visual gate.

**This refines** the merged-pending `visual-implementation` branch (10 tasks, final-review-clean). It builds ON that branch (same branch, continue committing there); it does NOT restructure IA. Locked treatments are captured in `screenshots/tree-mock.html` and `screenshots/narrow-mock.html` (the visual targets — open them for reference).

## Global Constraints

- **Polish, not re-exploration.** The layouts are locked (the two mock files). Apply them; do not redesign. If something in a mock seems wrong mid-implementation, STOP and flag it — don't improvise a different layout.
- **Tokens are the single source of truth; read the SEMANTIC layer.** Same rule as the base visual pass: components read `var(--token)`, semantic tokens for themeable roles (`--spine`, `--node-frontier`, `--node-context`, `--leader`, `--specimen-*`, `--trail-*`, `--action-primary*`, `--accent`). No hardcoded hex except the spec-sanctioned Specimen shadowbox decoratives. New shared literals that recur (e.g. a gem-glow) may get a token.
- **SVG trees must NOT flex-shrink.** Any tree SVG inside a flex/scroll container renders at intrinsic pixel size (`width`/`height` attributes honored) with `min-width: max-content`; the container scrolls horizontally. Never let the SVG scale down to fit. This is the core fix — verify it in every tree the plan touches.
- **Type never shrinks below legible.** The base is 24px; tree labels and narrow text must read at comfortable size (~0.8rem floor for meta/counts, ~1rem+ for names). Do NOT introduce sub-0.75rem text. (This bit us repeatedly; the constraint is explicit.)
- **Warmth stays contained** (specimen chip + guess bars only); **turquoise is never a CTA** (mahogany is); **specimen art stays deferred** (empty mount). Unchanged from the base pass.
- **Do not regress Explore's constraints:** no `playable` markers; the Explore *tree* now gets the shared treatment (this is the intended change — Explore starts from the same tree treatment and develops as needed), but no behavior/data change.
- **`verbatimModuleSyntax` is ON.** `import type` for types. Run `npx tsc --noEmit` (clean) AND `npx svelte-check --tsconfig ./tsconfig.json` (0 errors, 0 warnings) before every commit. `npm run test` stays green.
- **No per-task screenshots by subagents** (the Playwright handshake hangs them). Subagents do code + the fast gates only. The CONTROLLER owns all screenshots (fresh browser context per batch; viewport PNG; `min-width:max-content` etc. verified visually at the end).
- **Frequent commits:** one per task.

---

## File Structure

- `src/lib/game/components/SpineTree.svelte` — **Modify.** Label placement (above-and-right), tightened branch spacing, fixed non-shrinking SVG, frontier emphasis. Restyle only + geometry constants.
- `src/lib/game/components/TreeView.svelte` — **Modify.** Same label/dot/scaling treatment as SpineTree (Explore's tree; the deferred full-restyle stays deferred, but it adopts the shared node treatment + the non-shrink fix, which fixes the giant-text bug).
- `src/lib/game/spine-layout.ts` — **Modify (constants only, if needed).** The label-above treatment needs vertical room above each node; if the current `minY`/`maxY` don't reserve it, the component handles it via viewBox padding (preferred — no pure-logic change). Only touch this file if the component approach can't reserve label space; if so, add a top-padding band, keep tests green.
- `src/lib/game/components/GameBoard.svelte` — **Modify.** Narrow layout: the responsive `@media` block composes the vertical lineage + scrolling tree + pegged specimen/input. May need a small new "vertical lineage" sub-view (see Task 3).
- `src/lib/game/components/WarmestTrail.svelte` — **Modify.** Provide/ää the vertical-stacked rendering for narrow (the lineage is the trail's data — root→frontier — rendered vertically under a media query, OR a dedicated narrow component; Task 3 decides).
- `src/lib/game/components/Specimen.svelte` — **Modify.** Narrow: the horizontal compact card (shadow-box + chip + clue) that pegs above the input; fix the earlier sliver.
- `src/lib/game/components/SearchBox.svelte` — **Modify (narrow sizing only).**
- `src/lib/styles/tokens.css` — **Modify.** Remove/rename the dead `--blue-tint`; optionally add `--gem-glow` for the recurring turquoise glow literal.
- `src/lib/game/components/GuessList.svelte` — **Modify.** Remove the dead `.tabnum` class hook.

**Verified current-state facts** (from reading the components):
- Both trees render each node as `<g transform="translate(px(x) py(y))">` with `<circle r=…>` at origin and `<text x="9" dy="0.32em">` (label inline-right, vertically centered ON the line — the collision source). Constants in both: `X_GAP=180, Y_GAP=44, PAD=28`.
- `SpineTree` edges use semantic `--spine`/`--leader`; nodes `--spine`/`--node-frontier`/`--node-context`. `TreeView` still uses OLD class hooks (`.edge.emphasized`) and has NO `<style>` of its own — it inherits nothing, so its text is raw `--ink` at whatever the SVG scales to (→ giant when the SVG is width-fit via `preserveAspectRatio` in Explore's flex board).
- `SpineTree` SVG: `width={contentWidth} height={vbH}` (intrinsic) in a `.tree-scroll{overflow-x:auto}` — but the GameBoard flex may still compress it; verify the `min-width:max-content` fix. `TreeView` SVG uses `viewBox` + `preserveAspectRatio="xMinYMid meet"` (NO width/height attrs) → it scales to the container, which is why Explore's tree is giant. This must change to intrinsic-size + scroll.
- `--blue-tint` is used only in `SearchBox.svelte` (`var(--blue-tint, var(--bg-sunk))`) and is undefined in tokens.css (renders via fallback).
- `.tabnum` class in `GuessList.svelte` has no rule (tabular figures come from the global `body` rule).

**Locked treatment values** (from the mocks):
- Label: `text-anchor: start`, positioned at approximately dot `x + 6`, `y − 10` (tight offset, more horizontal pull-in than vertical). Above-and-right so the vertical branch line never bisects text.
- Branch vertical separation: pull in ~⅓ from current (the off-spine splay sits closer to the spine).
- Node spacing: ~200px horizontal (current 180 is close; bump toward 200).
- Frontier/genus dot: larger (r≈8) with a white ring; its label bold/larger.
- Narrow: vertical lineage rungs at ~1.2rem names / 1.35rem frontier / ~0.95rem counts; tree labels ~0.9rem; specimen headline ~1.25rem; input ~1.1rem. Nothing sub-0.8rem.

---

### Task 1: Fix the tree label treatment + non-shrinking SVG in `SpineTree`

The in-play tree: dots on the line, labels above-and-right, tightened branches, frontier emphasis, and the SVG renders at intrinsic size (never flex-shrinks).

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:** No prop/API change. Geometry constants + label `<text>` placement + `<style>`.

- [ ] **Step 1: Tighten geometry + reserve label space**

In `SpineTree.svelte`, adjust constants and the label:
- `X_GAP`: 180 → 200.
- `Y_GAP`: 44 → 30 (pulls branch vertical separation in ~⅓).
- Add top room for labels: bump `PAD` usage so the topmost label isn't clipped — set the vertical origin so `py()` leaves ≥18px above the highest node. Simplest: add a `LABEL_PAD = 18` and use `vbH = (layout.maxY - layout.minY) * Y_GAP + PAD * 2 + LABEL_PAD` and `py = (y) => PAD + LABEL_PAD + (y - layout.minY) * Y_GAP`.

- [ ] **Step 2: Move the label above-and-right; emphasize frontier**

Replace the node `<text>` with an above-and-right label (anchor start, offset up):
```svelte
        <circle r={node?.isGenus ? 8 : 4.5} />
        <text class="lbl" x="6" y="-10">
          {displayName(node?.name)}{#if !node?.isGenus} <tspan class="count">{node?.descendantGenusCount}</tspan>{/if}
        </text>
        {#if hover === n.id && tips}
          <text class="tip" x="6" y="-24">guesses: {tips.join(", ")}</text>
        {/if}
```
(`x="6"` = pulled-in horizontal; `y="-10"` = just above the dot. Genus dot r=8; others 4.5. Count loses the parentheses per the mock — bare number in `.count` styling.)

- [ ] **Step 3: Non-shrinking SVG**

In the `<style>`, ensure the SVG can't be compressed by the flex parent:
```css
  .tree-scroll { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
  .tree { color: var(--ink); display: block; min-width: max-content; }
```
And confirm the `<svg>` keeps its `width={contentWidth} height={vbH}` attributes (intrinsic size). Update `.lbl`/`.count`/frontier styling:
```css
  .lbl { fill: var(--ink); font-size: 0.9rem; font-weight: var(--fw-semibold); text-anchor: start; }
  .node:not(.spine) .lbl { fill: var(--node-context); font-size: 0.82rem; font-weight: var(--fw-medium); }
  .node.genus .lbl, .node.spine:last-of-type .lbl { font-weight: var(--fw-black); font-size: 1rem; }
  .count { fill: var(--ink-soft); font-weight: var(--fw-bold); font-size: 0.78rem; }
  .edge.spine { stroke: var(--spine); stroke-width: 5; }
  .edge { stroke: var(--leader); stroke-width: 2; fill: none; }
  .node circle { fill: var(--node-context); }
  .node.spine circle { fill: var(--spine); }
  .node.genus circle { fill: var(--node-frontier); stroke: #fff; stroke-width: 2; }
  .tip { fill: var(--ink-soft); font-size: 0.78rem; }
```
(Note: the frontier is the deepest spine node; `class:genus` covers a genus target. If the warmest is a clade not a genus, it still gets the spine treatment — a distinct frontier ring isn't required beyond the genus case, but keep the larger last-spine emphasis via the `.spine:last-of-type` rule if it renders correctly; if that selector is unreliable in SVG, drop it and rely on `.genus`.)

- [ ] **Step 4: Verify (gates only — controller screenshots later)**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc clean; svelte-check 0 errors, 0 warnings; build succeeds. Do NOT start a dev server.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "refine(visual): spine tree — labels above-and-right, tighter branches, non-shrinking SVG"
```

---

### Task 2: Apply the shared tree treatment to Explore's `TreeView`

Explore's tree adopts the same node/label/scaling treatment (dots, above-and-right labels, intrinsic-size scroll) — this fixes the giant/illegible Explore tree. Its deeper restyle (collage) stays deferred; this is the baseline treatment it "starts from."

**Files:**
- Modify: `src/lib/game/components/TreeView.svelte`

**Interfaces:** No prop change (keeps `revealed`, `emphasizedPath`, `nodeTooltips`, `highlightId`, `onnodeselect`, `emptyLabel`).

- [ ] **Step 1: Intrinsic-size SVG (kill the giant-text scaling)**

In `TreeView.svelte`, the SVG currently uses `viewBox` + `preserveAspectRatio="xMinYMid meet"` and NO width/height → it scales to the container. Change to intrinsic size like SpineTree:
- Compute `let vbW = $derived(layout.width * X_GAP + PAD * 2 + 140);` and `vbH` (already present).
- Render `<svg class="tree" width={vbW} height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label="Cladogram">` (drop `preserveAspectRatio`).
- The Explorer board already wraps this; ensure the tree scrolls. Add a `<style>` block (TreeView has none today):
```css
<style>
  .tree { display: block; min-width: max-content; color: var(--ink); }
  .edge { stroke: var(--leader); stroke-width: 2; fill: none; }
  .edge.emphasized { stroke: var(--spine); stroke-width: 4; }
  .node circle { fill: var(--node-context); }
  .node.emphasized circle { fill: var(--spine); }
  .node.genus circle { fill: var(--node-frontier); stroke: #fff; stroke-width: 2; }
  .node.highlight circle { fill: var(--node-frontier); }
  .lbl { fill: var(--ink); font-size: 0.9rem; font-weight: var(--fw-semibold); text-anchor: start; }
  .count { fill: var(--ink-soft); font-weight: var(--fw-bold); font-size: 0.78rem; }
  .node.clickable { cursor: pointer; }
  .tip { fill: var(--ink-soft); font-size: 0.78rem; }
  .tree-empty { color: var(--ink-soft); font-size: var(--type-body); padding: var(--space-6); }
</style>
```
Note: Explorer wraps `TreeView` in `.explorer .board :global(svg){flex:1 1 auto;min-width:0}` (from the base pass) — that `min-width:0` will fight the non-shrink. Change that Explorer rule to `min-width: max-content` OR remove the flex on the svg so the tree scrolls. Verify in Task's gate + controller screenshot.

- [ ] **Step 2: Above-and-right labels + dots**

Match SpineTree's node markup: `<circle r={node?.isGenus ? 8 : 4.5} />`, label `<text class="lbl" x="6" y="-10">{node?.name}{#if !node?.isGenus} <tspan class="count">{node?.descendantGenusCount}</tspan>{/if}</text>`, tooltip `<text class="tip" x="6" y="-24">{tips.join(", ")}</text>`. Apply `displayName` to the root label here too (import it) for the "dinosaur"→"Dinosauria" fix in Explore. Reserve label space via the same `LABEL_PAD` approach in `py`/`vbH` as Task 1.

- [ ] **Step 3: Fix the Explorer svg flex rule**

In `src/lib/explorer/components/Explorer.svelte` `<style>`, change `.explorer .board :global(svg) { flex: 1 1 auto; min-width: 0; }` to allow the tree its intrinsic width inside a scroll container — e.g. wrap the tree in a scroll div or set the board to `overflow-x:auto` and the svg to `min-width: max-content`. Keep the NodeDetail rail layout intact.

- [ ] **Step 4: Verify (gates only)**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Also `grep -rn "playable" src/lib/explorer/components/*.svelte` — no NEW matches beyond the pre-existing NodeDetail "unresolved placement" note.
Expected: tsc clean; svelte-check 0/0; build succeeds; no new playable refs.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/TreeView.svelte src/lib/explorer/components/Explorer.svelte
git commit -m "refine(visual): Explore tree adopts shared treatment (fixes giant text; intrinsic-size scroll)"
```

---

### Task 3: Narrow layout — vertical lineage primary + scrolling tree + pegged specimen/input

Rebuild the `@media (max-width: 640px)` composition to the locked narrow mock: a vertical stacked lineage placard as the primary orientation, the full-size scrolling tree below it, specimen + input pegged to the bottom. All text phone-sized (no shrink).

**Files:**
- Modify: `src/lib/game/components/WarmestTrail.svelte` (add the vertical-stacked rendering for narrow)
- Modify: `src/lib/game/components/GameBoard.svelte` (narrow region composition)
- Modify: `src/lib/game/components/Specimen.svelte` (narrow compact card — fix the sliver)
- Modify: `src/lib/game/components/SearchBox.svelte` (narrow sizing)

**Interfaces:** No prop changes. `WarmestTrail` already receives `warmestId`/`budget`; the vertical lineage is the same `pathToRoot(warmestId)` data rendered vertically under the media query. Off-spine wrong-guesses: the trail only has the warmest lineage, so the vertical lineage shows the spine path; the indented muted off-spine rungs in the mock are a nice-to-have — if the trail lacks off-spine data, render just the spine lineage (do NOT plumb new data this task; note it deferred).

- [ ] **Step 1: WarmestTrail — vertical rung layout at narrow**

Give `WarmestTrail` a media query that switches the crumb row into a vertical stacked list (rungs): each crumb becomes a full-width row with a dot, the name (large), and the count (right). Reuse the existing crumb markup; the layout switch is CSS:
```css
  @media (max-width: 640px) {
    .trail { flex-direction: column; align-items: stretch; border-radius: var(--radius-card); gap: 0; padding: 0.6rem 0.2rem; }
    .crumb { display: flex; align-items: center; gap: 0.7rem; width: 100%; padding: 0.5rem 1rem; font-size: 1.2rem; border-radius: 0; }
    .crumb.active { font-weight: var(--fw-black); font-size: 1.35rem; }
    .crumb :global(em), .crumb em { margin-left: auto; font-size: 0.95rem; }
    .sep { display: none; }        /* no chevrons in vertical mode */
    .budget { align-self: flex-start; margin: 0 0 0.4rem 0.8rem; font-size: 1rem; }
  }
```
Add a dot marker per crumb: prepend a `<span class="rung-dot">` in the crumb (visible only at narrow via CSS, `display:none` at desktop) OR use a `::before`. Keep the desktop horizontal layout unchanged above 640px. (The connector line between rungs is a nice-to-have via `::after`; include it if it renders cleanly — the mock used a turquoise `::after` between rungs.)

- [ ] **Step 2: GameBoard — narrow region order + full-size scrolling tree**

In `GameBoard.svelte`'s `@media (max-width: 640px)`:
- `.middle { flex-direction: column; }` (already present) — the tree area comes after the trail.
- Ensure the tree keeps `min-width: max-content` (from Task 1) so it scrolls, doesn't shrink: `.middle :global(.tree-scroll) { width: 100%; }` stays; the SVG's own `min-width:max-content` does the work.
- Peg the specimen + input to the bottom: the `.bottom` region (`GuessList` + input-row) already sits last. Confirm the specimen renders after the tree and before the input in narrow order (the specimen is inside `.middle` today, right rail). At narrow, the specimen should move below the tree — since `.middle` becomes a column, the specimen naturally stacks under the tree. Pin the input-row to the viewport bottom is optional; the mock pegs it — use `position: sticky; bottom: 0` on `.input-row` with a `--bg-page` background if it reads well, else natural flow.

- [ ] **Step 3: Specimen — narrow compact horizontal card (fix the sliver)**

In `Specimen.svelte`'s `@media (max-width: 640px)`, replace the row-flex-that-slivered with a proper compact card: a 2-column grid (shadow-box left at a real size ~84×64, text right), NOT a shrunk column. From the mock:
```css
  @media (max-width: 640px) {
    .specimen { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: var(--space-3); align-items: center; padding: 0.6rem 0.7rem; }
    .shadowbox { width: 84px; height: 64px; }   /* fixed real size, not a sliver */
    .clue { border-top: none; padding-top: 0; }  /* inline compact */
    .actions { grid-column: 1 / -1; }             /* solved buttons span full width */
  }
```
Ensure the broad/terminal states show shadow-box + chip + count + clue in the compact card; the solved state shows the answer + mahogany CTA full-width.

- [ ] **Step 4: SearchBox — narrow sizing**

Ensure the input reads at ~1.1rem with comfortable touch padding at narrow (it inherits fine from the base rule; add a media bump only if it's too small):
```css
  @media (max-width: 640px) {
    .searchbox input { font-size: 1.1rem; padding: 0.75rem 1.2rem; }
  }
```

- [ ] **Step 5: Verify (gates only)**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc clean; svelte-check 0 errors, 0 warnings; build succeeds. Do NOT start a dev server.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/WarmestTrail.svelte src/lib/game/components/GameBoard.svelte src/lib/game/components/Specimen.svelte src/lib/game/components/SearchBox.svelte
git commit -m "refine(visual): narrow layout — vertical lineage primary, full-size scrolling tree, pegged specimen/input"
```

---

### Task 4: Clear the final-review Minors

Small correctness/hygiene fixes from the whole-branch review.

**Files:**
- Modify: `src/lib/styles/tokens.css`, `src/lib/game/components/SearchBox.svelte`, `src/lib/game/components/GuessList.svelte`, `src/lib/game/components/SpineTree.svelte`

- [ ] **Step 1: Remove the dead/mis-named `--blue-tint`**

In `SearchBox.svelte`, the result-hover uses `background: var(--blue-tint, var(--bg-sunk))`. `--blue-tint` is undefined and its name violates the no-blue rule. Replace with `background: var(--bg-sunk);` (or add a real `--hover-tint: var(--bg-sunk);` semantic token in tokens.css and use it). Pick the direct `--bg-sunk` (simpler).

- [ ] **Step 2: Remove the dead `.tabnum` hook**

In `GuessList.svelte`, the count span has `class="count tabnum"` but no `.tabnum` rule (tabular figures come from the global `body` rule). Drop `tabnum` from the class list (keep `count`).

- [ ] **Step 3: Tokenize the recurring gem-glow (optional but tidy)**

The turquoise glow `box-shadow: 0 0 8px rgba(13,154,168,.55)` appears in both `GuessList` (`.fill.gem`) and `Specimen` (`.warm-chip.gem`). Add `--gem-glow: 0 0 8px rgba(13,154,168,.55);` to tokens.css and reference it in both. (SpineTree's spine drop-shadow `rgba(10,122,134,.35)` is single-use — leave it, or tokenize as `--spine-glow` if trivial; not required.)

- [ ] **Step 4: Verify (gates only)**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build && npm run test`
Expected: tsc clean; svelte-check 0/0; build succeeds; full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/styles/tokens.css src/lib/game/components/SearchBox.svelte src/lib/game/components/GuessList.svelte src/lib/game/components/Specimen.svelte
git commit -m "refine(visual): clear review minors — drop --blue-tint, dead .tabnum, tokenize gem-glow"
```

---

## Self-Review

**1. Coverage of the locked refinements + review findings:**
- Tree labels above-and-right, tightened branches, frontier emphasis → Task 1 (SpineTree) + Task 2 (TreeView, shared treatment).
- The "tree text too small" / "Explore tree giant" root cause (SVG flex-shrink / preserveAspectRatio scaling) → Task 1 Step 3 + Task 2 Step 1/3 (intrinsic size + `min-width:max-content` + fix Explorer's `min-width:0` rule). This is the through-line fix.
- Narrow: vertical lineage primary + full-size scrolling tree + pegged specimen/input, all text sized up → Task 3.
- Review Minors (`--blue-tint`, `.tabnum`, gem-glow literal) → Task 4.
- Explore giant tree explicitly fixed (Task 2); Explore deeper restyle correctly still deferred.

**2. Placeholder scan:** No TBD/TODO. Two explicit "STOP and flag / note deferred" gates: (a) Task 1 Step 3 the `.spine:last-of-type` selector may be unreliable in SVG — instruction says drop it and rely on `.genus` if so; (b) Task 3 off-spine muted rungs need data the trail may not have — instruction says render spine-only and note deferred, do NOT plumb new data. These are real fallbacks with a defined path, not placeholders.

**3. Consistency:** Both trees use the same label markup (`x="6" y="-10"`, `text-anchor:start`), same dot radii (genus 8 / other 4.5), same semantic tokens (`--spine`/`--node-frontier`/`--node-context`/`--leader`), same `min-width:max-content` scaling rule, same `displayName` root fix. The `LABEL_PAD` viewBox-padding approach is used identically in both (component-level, no pure-logic change to `spine-layout.ts`/`layout.ts` unless unavoidable — noted). Narrow sizing floors (~0.8rem meta, ~1rem+ names) are consistent across trail/tree/specimen/input. Token changes (drop `--blue-tint`, add `--gem-glow`) are defined in Task 4 and referenced only where used.

**4. Scope discipline:** Every task is CSS + markup-within-component + geometry constants. No store/selector/routing/IA change. No new components (the vertical lineage is WarmestTrail's existing data re-laid-out via media query, not a new component). Controller owns screenshots (subagent Playwright hangs). Branch continues `visual-implementation`.
