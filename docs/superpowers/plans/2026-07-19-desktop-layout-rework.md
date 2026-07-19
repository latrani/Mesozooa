# Desktop Layout Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the desktop game screen so the input+guesses form one top cluster, the specimen plaque floats top-right over it, and the tree owns the whole body — eliminating the dead-space bottom band and collapsing the play-loop zigzag.

**Architecture:** A new pure selector `chip-view.ts` maps each `GuessResult` (+ the win/loss answer) to a typed chip descriptor, mirroring the existing `specimen-view.ts` pattern. `GuessList.svelte` becomes a thin chip renderer over it. `GameBoard.svelte` restructures its three regions (input cluster / floating plaque / tree body) and drops the bottom band. `SpineTree.svelte` gets a segmented `.btn-secondary` zoom control. `SpecimenPlacard.svelte` gets a light trim of the empty-clue rows during play.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for the pure selector. Existing tokens in `src/lib/styles/tokens.css`, button styles in `src/lib/styles/base.css`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Run `npx tsc --noEmit` AND `npx svelte-check --threshold error` before every commit; Vitest does not catch these.
- Desktop only. Do NOT change the `@media (max-width: 640px)` narrow blocks in GameBoard or SpecimenPlacard except where a task explicitly says so. Responsive is a separate pass (#12).
- Pure logic is TDD-tested; Svelte components are validated by build + running in Playwright.
- Read the semantic token layer — components read `--role` tokens, not primitives. Reuse existing tokens (`--turq`, `--cream`, `--gem-glow`, `--sand-400`, `--radius-pill`, `--space-*`, warmth via `warmthRampColor`).
- Frequent commits — one per task.
- Spec: `docs/superpowers/specs/2026-07-19-desktop-layout-rework-design.md`.

---

## File Structure

- **Create** `src/lib/game/chip-view.ts` — pure selector: `GuessResult[]` (+ win/loss answer) → `Chip[]`. One responsibility: chip descriptors.
- **Create** `src/lib/game/chip-view.test.ts` — Vitest for the selector.
- **Modify** `src/lib/game/components/GuessList.svelte` — render chips from `chip-view`; retire bars/rows/sentences.
- **Modify** `src/lib/game/components/GameBoard.svelte` — region restructure; drop bottom band; input cluster at top.
- **Modify** `src/lib/game/components/SpineTree.svelte` — segmented secondary-button zoom control.
- **Modify** `src/lib/game/components/SpecimenPlacard.svelte` — trim empty-clue rows during play.

Task order: selector first (pure, tested) → GuessList (consumes it) → GameBoard (positions it) → SpineTree zoom → SpecimenPlacard trim. Each is independently reviewable.

---

## Task 1: `chip-view` pure selector

**Files:**
- Create: `src/lib/game/chip-view.ts`
- Test: `src/lib/game/chip-view.test.ts`

**Interfaces:**
- Consumes: `GuessResult` / `GuessKind` from `./types` (`guessId`, `sharedNodeId`, `warmth: {fraction}`, `kind`, `cost`); `TreeStore` from `./treeStore` (`getNode(id) → TreeNode | undefined`); `warmthRampColor` from `./warmth-ramp`; `displayName` from `./displayName`.
- Produces: `Chip` union + `chipsFor(guesses, store, opts)` used by GuessList.

Data facts (verified in `engine-core.ts`) the selector must honor:
- `guess`: `guessId` = genus, `sharedNodeId` = MRCA clade. Both are real tree nodes.
- `branchHint`: `guessId === sharedNodeId` = the revealed clade; there is NO typed genus name. Chip reads `Hint: {clade}`.
- `leafHint`: `guessId === sharedNodeId === target`, but the target is NOT revealed on the tree — chip is text-only, NOT a node link.
- answer (win/loss) is NOT a `GuessKind`; it's driven by explicit `targetId`/`revealId` inputs.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/chip-view.test.ts
import { describe, it, expect } from "vitest";
import { chipsFor } from "./chip-view";
import { createTreeStore } from "./treeStore";
import { assembleTree } from "../tree/assemble";
import { FIXTURE_RAWS } from "../tree/fixture";
import { createCountWarmth } from "./warmth";
import type { GuessResult } from "./types";

const tree = assembleTree(FIXTURE_RAWS, "Q430", "test");
const store = createTreeStore(tree);
const warmth = createCountWarmth(store.rootCount);

// helper to build a GuessResult row
function row(kind: GuessResult["kind"], guessId: string, sharedNodeId: string): GuessResult {
  return { guessId, sharedNodeId, warmth: warmth.warmth(store.getNode(sharedNodeId)!), kind, cost: 1 };
}

describe("chipsFor", () => {
  it("maps a guess to a genus chip: dot color + name link + shared-clade link", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, {});
    expect(chips).toHaveLength(1);
    const c = chips[0];
    expect(c.kind).toBe("guess");
    if (c.kind !== "guess") throw new Error("kind");
    expect(c.name).toBe(store.getNode("TR")!.name);
    expect(c.nodeId).toBe("TR");
    expect(c.sharedName).toBe(store.getNode("TF")!.name);
    expect(c.sharedNodeId).toBe("TF");
    expect(c.dotColor).toMatch(/^#|rgb|hsl|color/); // a resolved color string
  });

  it("maps a branchHint to a hint chip: 'Hint:' label + clade link, no genus name", () => {
    const chips = chipsFor([row("branchHint", "TF", "TF")], store, {});
    const c = chips[0];
    expect(c.kind).toBe("branchHint");
    if (c.kind !== "branchHint") throw new Error("kind");
    expect(c.sharedName).toBe(store.getNode("TF")!.name);
    expect(c.sharedNodeId).toBe("TF");
    expect((c as Record<string, unknown>).name).toBeUndefined();
  });

  it("maps a leafHint to a text-only chip with no node link", () => {
    const chips = chipsFor([row("leafHint", "Q430", "Q430")], store, {});
    const c = chips[0];
    expect(c.kind).toBe("leafHint");
    if (c.kind !== "leafHint") throw new Error("kind");
    expect(c.label).toBe("Field clue");
    expect((c as Record<string, unknown>).nodeId).toBeUndefined();
  });

  it("orders newest-first", () => {
    const chips = chipsFor([row("guess", "TR", "TF"), row("guess", "TB", "TF")], store, {});
    expect(chips[0].kind === "guess" && chips[0].nodeId).toBe("TB");
  });

  it("prepends an answer chip on win (outcome color = gem end)", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, { answerId: "TR", won: true });
    expect(chips[0].kind).toBe("answer");
    if (chips[0].kind !== "answer") throw new Error("kind");
    expect(chips[0].name).toBe(store.getNode("TR")!.name);
    expect(chips[0].nodeId).toBe("TR");
    expect(chips[0].won).toBe(true);
  });

  it("prepends an answer chip on loss (outcome color = most-recent guess warmth)", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, { answerId: "TB", won: false });
    expect(chips[0].kind).toBe("answer");
    if (chips[0].kind !== "answer") throw new Error("kind");
    expect(chips[0].won).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/chip-view.test.ts`
Expected: FAIL — `chipsFor` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/chip-view.ts
import type { GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import { warmthRampColor } from "./warmth-ramp";
import { displayName } from "./displayName";

export type Chip =
  | { kind: "guess"; guessId: string; nodeId: string; name: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "branchHint"; nodeId: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "leafHint"; label: string }
  | { kind: "answer"; nodeId: string; name: string; won: boolean; bgColor: string };

export interface ChipOpts {
  /** the answer node — present only at end state */
  answerId?: string | null;
  won?: boolean;
  /** warmth fraction of the most-recent real guess (drives the loss answer color) */
  lastGuessFraction?: number;
}

// Map the guess log (+ optional end-state answer) to newest-first chip descriptors. Pure: all
// color/label resolution happens here so GuessList is a thin renderer. Guess/branchHint carry a
// warmth-colored dot; leafHint is text-only (it reveals no tree node); the answer is a filled chip.
export function chipsFor(guesses: GuessResult[], store: TreeStore, opts: ChipOpts): Chip[] {
  const chips: Chip[] = [];

  // newest-first
  for (const g of guesses.slice().reverse()) {
    if (g.kind === "leafHint") {
      chips.push({ kind: "leafHint", label: "Field clue" });
    } else if (g.kind === "branchHint") {
      const shared = store.getNode(g.sharedNodeId);
      chips.push({
        kind: "branchHint",
        nodeId: g.sharedNodeId,
        dotColor: warmthRampColor(g.warmth.fraction),
        sharedNodeId: g.sharedNodeId,
        sharedName: displayName(shared?.name),
      });
    } else {
      const guess = store.getNode(g.guessId);
      const shared = store.getNode(g.sharedNodeId);
      chips.push({
        kind: "guess",
        guessId: g.guessId,
        nodeId: g.guessId,
        name: displayName(guess?.name),
        dotColor: warmthRampColor(g.warmth.fraction),
        sharedNodeId: g.sharedNodeId,
        sharedName: displayName(shared?.name),
      });
    }
  }

  // answer chip pinned on top at end state
  if (opts.answerId) {
    const node = store.getNode(opts.answerId);
    const bgColor = opts.won ? warmthRampColor(1) : warmthRampColor(opts.lastGuessFraction ?? 0);
    chips.unshift({
      kind: "answer",
      nodeId: opts.answerId,
      name: displayName(node?.name),
      won: !!opts.won,
      bgColor,
    });
  }

  return chips;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/chip-view.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/chip-view.ts src/lib/game/chip-view.test.ts
git commit -m "feat(game): chip-view selector — guess/hint/answer chip descriptors"
```

---

## Task 2: `GuessList` renders chips

**Files:**
- Modify: `src/lib/game/components/GuessList.svelte` (full rewrite of template + style; keep the props contract)

**Interfaces:**
- Consumes: `chipsFor`, `Chip` from `../chip-view` (Task 1). Existing props: `guesses: GuessResult[]`, `onselect: (nodeId: string) => void`, `targetId?: string | null`, `revealId?: string | null`.
- Produces: unchanged prop contract — GameBoard calls it the same way (Task 3 tweaks only positioning).

Rendering rules (from spec §"The guess chip"):
- `guess`: `● {name} → {sharedName}` — dot filled `dotColor`; `name` is a link to `nodeId`; `sharedName` is a link to `sharedNodeId`.
- `branchHint`: `● Hint: {sharedName}` — dot filled `dotColor`; `sharedName` links to `sharedNodeId`; wears the hint styling family.
- `leafHint`: `Field clue` — no dot, text only; same hint styling family (shared color/text with branchHint).
- `answer`: `Answer: {name}` — filled chip, background `bgColor`, **cream ink** over it; `name` links to `nodeId`. Win adds `--gem-glow`.
- Newest-first is already handled by `chipsFor`. Chips wrap (flex-wrap) — this is the cluster that grows down.

- [ ] **Step 1: Rewrite the component**

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { chipsFor } from "../chip-view";
  import type { GuessResult } from "../types";
  import { fly } from "svelte/transition";

  let {
    guesses,
    onselect,
    targetId = null,
    revealId = null,
  }: {
    guesses: GuessResult[];
    onselect: (nodeId: string) => void;
    /** the winning guess — becomes the answer chip (won) */
    targetId?: string | null;
    /** the revealed answer on a LOSS — becomes the answer chip (lost) */
    revealId?: string | null;
  } = $props();

  // most-recent real guess warmth colors the loss answer chip
  let lastGuessFraction = $derived(
    [...guesses].reverse().find((g) => g.kind === "guess")?.warmth.fraction ?? 0,
  );
  let chips = $derived(
    chipsFor(guesses, treeStore, {
      answerId: targetId ?? revealId ?? null,
      won: targetId != null,
      lastGuessFraction,
    }),
  );

  // stable key per chip for the flex list / transitions
  function keyOf(c: ReturnType<typeof chipsFor>[number], i: number): string {
    if (c.kind === "answer") return "answer";
    if (c.kind === "leafHint") return `leaf-${i}`;
    return `${c.kind}-${c.nodeId}`;
  }
</script>

<ul class="chips">
  {#each chips as c, i (keyOf(c, i))}
    <li class="chip chip-{c.kind}" in:fly={{ y: -10, duration: 200 }}>
      {#if c.kind === "answer"}
        <span class="answer-fill" class:win={c.won} style="background: {c.bgColor}">
          Answer: <button type="button" class="link on-fill" onclick={() => onselect(c.nodeId)}>{c.name}</button>
        </span>
      {:else if c.kind === "leafHint"}
        <span class="hint-text">{c.label}</span>
      {:else if c.kind === "branchHint"}
        <span class="dot" style="background: {c.dotColor}"></span>
        <span class="hint-text">Hint: <button type="button" class="link" onclick={() => onselect(c.sharedNodeId)}>{c.sharedName}</button></span>
      {:else}
        <span class="dot" style="background: {c.dotColor}"></span>
        <button type="button" class="link name" onclick={() => onselect(c.nodeId)}>{c.name}</button>
        <span class="arrow" aria-hidden="true">→</span>
        <button type="button" class="link" onclick={() => onselect(c.sharedNodeId)}>{c.sharedName}</button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3);
    align-items: center; min-width: 0;
  }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--type-label); color: var(--ink);
  }
  .dot {
    flex: none; width: .7rem; height: .7rem; border-radius: var(--radius-pill);
    box-shadow: var(--inset-well);
  }
  .link {
    background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit;
    text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px;
    text-decoration-color: var(--sand-400);
  }
  .link:hover { text-decoration-color: var(--turq); color: var(--turq-dp); }
  .name { font-weight: var(--fw-semibold); }
  .arrow { color: var(--ink-soft); }
  /* hint styling family — branchHint + leafHint share this quieter treatment, set apart from guesses */
  .hint-text { color: var(--ink-soft); font-style: italic; }
  .hint-text .link { color: var(--ink-soft); }
  .hint-text .link:hover { color: var(--turq-dp); }
  /* answer chip — outcome color as the fill, cream ink over it */
  .answer-fill {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .15rem .6rem; border-radius: var(--radius-pill);
    font-weight: var(--fw-bold); color: var(--cream);
  }
  .answer-fill.win { box-shadow: var(--gem-glow); }
  .answer-fill .link.on-fill { color: var(--cream); text-decoration-color: color-mix(in srgb, var(--cream) 60%, transparent); }
  .answer-fill .link.on-fill:hover { color: var(--cream); text-decoration-color: var(--cream); }
</style>
```

- [ ] **Step 2: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 3: Verify the full test suite still passes**

Run: `npx vitest run`
Expected: all pass (chip-view tests + existing).

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/GuessList.svelte
git commit -m "feat(game): GuessList renders lean chips (guess/hint/answer) over chip-view"
```

---

## Task 3: `GameBoard` region restructure

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte` (template regions + desktop `@media (min-width: 641px)` CSS)

**Interfaces:**
- Consumes: unchanged — `GuessList` (Task 2), `SpineTree`, `SpecimenPlacard`, `SearchBox`. Same store contract.
- Produces: the new desktop layout. No prop changes to children.

Target structure (spec §"Region architecture"): input cluster (input row + Hint/Forfeit buttons + budget, then the wrapping `GuessList` chips) at the TOP; `.specimen-float` floats top-right over it; the tree fills the body below. The old three-region stack (`.trail-slot` / `.middle` / `.bottom`) collapses: the input cluster + plaque sit in a top band, tree below. Remove the fixed `.bottom` band and its `guesses-frame` height reserve.

Keep: the end-state `.result` banner (still shown in place of the input row), the `New round` action snippet, `rightInset` measurement (plaque still floats, tree still centers left of it), `linkLabels={ended}`. The Hint/Forfeit buttons stay adjacent to the input (status-quo default per spec review).

- [ ] **Step 1: Restructure the template**

Replace the `<div class="game"> … </div>` body (currently `.trail-slot` + `.middle` + `.bottom`) with a top cluster + tree body. The plaque moves OUT of `.middle` into the top cluster's float:

```svelte
<div class="game">
  <div class="cluster">
    <div class="cluster-main">
      {#if ended}
        <div class="result" class:won class:lost={!won} aria-live="polite">
          <span class="result-line">{#if won}Congratulations! {answerName} guessed in {turnCount} {turnCount === 1 ? "turn" : "turns"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}!{:else}It was {answerName} — out of guesses after {turnCount} {turnCount === 1 ? "turn" : "turns"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}{/if}</span>
        </div>
      {:else}
        <div class="input-row">
          <SearchBox entries={availableEntries} onpick={(id) => store.guess(id)} placeholder="Guess a dinosaur…" />
          {#if store.hint && store.canHint}
            <button type="button" class="btn-secondary" onclick={() => store.hint?.()} disabled={!store.canHint}>
              Hint {#if store.nextHintCost != null} ({store.nextHintCost} move{store.nextHintCost === 1 ? "" : "s"}){/if}
            </button>
          {/if}
          {#if store.forfeit && turnCount > 0}
            <button type="button" class="btn-secondary btn-forfeit" onclick={() => store.forfeit?.()}>Forfeit</button>
          {/if}
          {#if budget.max == null}
            <span class="budget">Moves used: {budget.used}</span>
          {:else}
            <span class="budget">Moves remaining: {budget.max - budget.used}</span>
          {/if}
        </div>
      {/if}
      <GuessList
        guesses={store.state.guesses}
        targetId={won ? store.state.target : null}
        revealId={ended && !won ? store.state.target : null}
        onselect={(id) => { highlightId = id; spine?.panTo(id); }}
      />
    </div>
    <div class="specimen-float" bind:clientWidth={specimenW}>
      <SpecimenPlacard view={specimenView(store.state, treeStore)}>
        {#snippet action()}
          {#if ended && onnew}
            <div class="actions">
              <button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>
            </div>
          {/if}
        {/snippet}
      </SpecimenPlacard>
    </div>
  </div>

  <div class="tree-body">
    <SpineTree
      bind:this={spine}
      revealed={treeRevealed}
      tipId={treeTipId}
      {guessWarmth}
      {highlightId}
      {rightInset}
      showCounts={false}
      onnodeselect={ended && onexplore ? (id) => onexplore(id) : undefined}
      linkLabels={ended}
    />
  </div>
</div>
```

Note: `WarmestTrail` import + `.trail-slot` are removed from the desktop path. Leave the `WarmestTrail` import only if the narrow `@media (max-width:640px)` block still uses it — check; if nothing references it after this change, remove the import to keep `tsc`/`svelte-check` clean.

- [ ] **Step 2: Rewrite the desktop CSS**

Replace the `@media (min-width: 641px)` block's region rules. The cluster is a positioned band; the plaque floats top-right within it; the tree body fills the rest:

```css
  .game { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  @media (min-width: 641px) {
    .game { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    /* top cluster: input + wrapping chips at left, plaque floats over the right */
    .cluster {
      position: relative; flex: 0 0 auto;
      padding: var(--space-4) var(--space-5);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    /* leave room on the right so wrapping chips never slide under the floating plaque */
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-3); padding-right: 22rem; }
    .specimen-float { position: absolute; top: var(--space-4); right: var(--space-5); z-index: 5; width: max-content; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; }
  }
  .input-row { display: flex; gap: var(--space-3); align-items: center; }
```

(The `.specimen-float` was previously vertically centered over the tree; now it pins to the top of the cluster. `rightInset` still measures its width so the tree centers left of it. `padding-right: 22rem` on `.cluster-main` reserves the 20rem plaque + gap.)

- [ ] **Step 3: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors. (If `WarmestTrail`/`specimenW` unused warnings appear, remove the dead import/state.)

- [ ] **Step 4: Verify in the running app (Playwright)**

Start dev server if not running: `npm run dev` (note the port). Then drive Practice, make several guesses, and screenshot:
- Confirm: input+chips cluster at top-left; plaque floats top-right; tree fills the body; NO bottom band; chips wrap without sliding under the plaque.
- Confirm end state: forfeit → `Answer: {name}` chip appears with colored fill; tree reveals; `New round` in plaque.

Save shots to gitignored `screenshots/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "feat(game): desktop layout — input+chips cluster on top, tree owns the body"
```

---

## Task 4: Segmented zoom control

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` (the `.zoom-controls` markup + style only)

**Interfaces:**
- Consumes: existing `.btn-secondary` style semantics from `src/lib/styles/base.css` (transparent fill, 2px `--btn-secondary-ink` border, 12%-tint hover, `opacity:.5` disabled).
- Produces: no API change — same three buttons (`zoomButton(-1)`, `resetZoom`, `zoomButton(1)`), same `disabled` conditions.

Goal (spec §"Zoom control"): replace the three bare buttons with one connected segmented control `[− │ ⌂ │ +]` styled like `.btn-secondary`, hairline dividers between segments.

- [ ] **Step 1: Update the markup**

Current (`SpineTree.svelte` ~lines 389-395) `.zoom-controls` div stays, but give the group the segmented treatment. Keep the three `<button>`s and their handlers/`disabled`/`aria-label`s exactly; only class/structure for styling changes:

```svelte
  <div class="zoom-controls btn-secondary" role="group" aria-label="Zoom">
    <button type="button" aria-label="Zoom out" onclick={() => zoomButton(-1)} disabled={zoom <= ZOOM_MIN}>&minus;</button>
    <button type="button" aria-label="Reset zoom" onclick={resetZoom} disabled={zoom === ZOOM_DEFAULT}>⌂</button>
    <button type="button" aria-label="Zoom in" onclick={() => zoomButton(1)} disabled={zoom >= ZOOM_MAX}>+</button>
  </div>
```

- [ ] **Step 2: Replace the `.zoom-controls` CSS**

```css
  .zoom-controls {
    position: absolute; z-index: 5; right: var(--space-4); bottom: var(--space-4);
    display: flex; align-items: stretch; padding: 0;
    background: var(--bg-surface);
    border: 2px solid var(--btn-secondary-ink); border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .zoom-controls button {
    display: flex; align-items: center; justify-content: center;
    width: 2.2rem; height: 2rem; font-size: 1rem; cursor: pointer;
    background: transparent; border: 0; color: var(--btn-secondary-ink);
    font-weight: var(--fw-bold);
  }
  /* hairline dividers between segments */
  .zoom-controls button + button { border-left: 1px solid var(--btn-secondary-ink); }
  .zoom-controls button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--btn-secondary-ink) 12%, transparent);
  }
  .zoom-controls button:disabled { cursor: default; opacity: 0.5; }
```

(Remove the old `.zoom-controls`/`.zoom-controls button`/`:disabled` rules being replaced — do not leave both. `.btn-secondary` on the group supplies the ink color token; the explicit border/bg here make the segmented pill.)

- [ ] **Step 3: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 4: Verify in the app (Playwright)**

Screenshot the tree with the zoom control; confirm it reads as one segmented pill with mahogany border/ink, hairline dividers, hover tint, and the reset (⌂) segment greys when at default zoom.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "feat(zoom): segmented secondary-button zoom control"
```

---

## Task 5: Plaque light trim

**Files:**
- Modify: `src/lib/game/components/SpecimenPlacard.svelte` (style + a class hook for the placeholder state)

**Interfaces:**
- Consumes: `SpecimenView` — `view.fields[].value` is `null` for the placeholder `Lived: ? ? ?` / `Found in: ? ? ?` rows during play (from `specimen-view.ts` `placeholderFields()`); non-null once identified.
- Produces: no API change.

Goal (spec §"Plaque: reposition + light trim"): during play, the empty `? ? ?` clue rows read quieter/smaller so the placeholder plaque is calmer — WITHOUT touching the "Coming soon" slip or the identified/solved rich state. The reposition itself is done in Task 3 (GameBoard owns `.specimen-float` placement); this task is only the trim.

- [ ] **Step 1: Mark placeholder field values and quiet them**

In the `.fields` render, add a class when the value is absent (placeholder). Change the `<dd>`:

```svelte
        <div class="field">
          <dt>{f.label}</dt>
          <dd class:placeholder={f.value == null}>{f.value ?? "? ? ?"}{#if f.detail}<span class="detail">{f.detail}</span>{/if}</dd>
        </div>
```

Add to the style block:

```css
  /* placeholder clue rows during play — quieter + smaller so the un-identified plaque reads calm
     (the museum "coming soon" conceit), without shrinking the identified/solved rows. */
  .field dd.placeholder { opacity: .5; font-size: var(--type-label); font-weight: var(--fw-medium); }
```

- [ ] **Step 2: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 3: Verify in the app (Playwright)**

Screenshot Practice pre-guess (placeholder plaque) and a solved specimen (real clue). Confirm: placeholder `? ? ?` rows are visibly quieter/smaller; the solved rows are unchanged full-weight; "Coming soon" slip untouched.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpecimenPlacard.svelte
git commit -m "feat(specimen): quiet the placeholder clue rows during play"
```

---

## Task 6: Full-app verification + issue closeout

**Files:** none (verification task).

- [ ] **Step 1: Full check gauntlet**

Run: `npx vitest run && npx tsc --noEmit && npx svelte-check --threshold error && npm run build`
Expected: all green.

- [ ] **Step 2: Playwright end-to-end sweep (desktop 1440×900)**

Drive Daily + Practice through: empty → several guesses → hint (branchHint chip) → terminal/field-clue (leafHint chip + plaque clue) → solved (answer chip + reveal). Confirm at each: cluster grows down without shoving the tree into a clip; chips read correctly per variant; plaque floats correctly; zoom pill styled. Save shots to `screenshots/`.

- [ ] **Step 3: Clear working screenshots**

```bash
rm -f screenshots/*.png
```

- [ ] **Step 4: Final commit closing #1**

If any doc updates (CLAUDE.md architecture map) are warranted, make them, then:

```bash
git commit --allow-empty -m "docs: desktop layout rework complete

Closes #1"
```

(Per repo workflow: commit with the `Closes #1` trailer — repeat the keyword per number if closing more than one — but leave the push to the user. Merge to main follows the repo's straight-to-main workflow.)

---

## Self-Review

**Spec coverage:**
- Region architecture (cluster top / plaque float / tree body / no bottom band) → Task 3. ✓
- Guess chip taxonomy (guess/branchHint/leafHint/answer, dot=warmth, → shared, hint family, cost dropped to budget) → Task 1 (selector) + Task 2 (render). ✓
- Answer chip `Answer: {name}` outcome-color background + cream ink → Task 1 (`bgColor`, `won`) + Task 2 (`.answer-fill`). ✓
- Cluster grows down, tree shrinks, no cap → Task 3 (`.cluster` is `flex:0 0 auto`, `.tree-body` is `flex:1 1 auto`). ✓
- Plaque reposition + light trim → Task 3 (position) + Task 5 (trim). ✓
- Segmented secondary-button zoom → Task 4. ✓
- #22 fold: hint distinction solved (Task 1/2); stale items are issue-closeout, not code. Narrow jitter explicitly parked (Global Constraints). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `Chip` union + `chipsFor(guesses, store, opts)` defined in Task 1 and consumed verbatim in Task 2. `ChipOpts` fields (`answerId`, `won`, `lastGuessFraction`) match Task 2's call site. Chip fields (`nodeId`, `sharedNodeId`, `name`, `sharedName`, `dotColor`, `bgColor`, `label`, `won`) match between selector and renderer. ✓
