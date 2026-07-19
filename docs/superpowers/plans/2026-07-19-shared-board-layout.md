# Shared Board Layout + Autocomplete Direction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the desktop board layout into one shared `BoardLayout.svelte` shell that both GameBoard and Explorer render (so Explore gains #1's top-cluster layout), and flip the autocomplete menu to open downward.

**Architecture:** `BoardLayout.svelte` owns the region skeleton (top cluster / floating placard / tree body), the desktop CSS, the `rightInset` placard-measurement (currently duplicated in both consumers), and a minimal narrow collapse. It exposes three snippets: `cluster` (mode content), `placard` (measured by the shell), and `tree(rightInset)` (a parameterized snippet — the shell hands the measured inset in, the consumer supplies mode-specific SpineTree props). GameBoard and Explorer become thin: their own state/handlers + the three snippets. SearchBox opens its menu downward now that the input is top in both modes.

**Tech Stack:** Svelte 5 runes (parameterized snippets, `$props`, `$state`, `$derived`, `$effect`). Existing tokens in `src/lib/styles/tokens.css`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Run `npx tsc --noEmit` AND `npx svelte-check --threshold error` before every commit; Vitest does not catch these.
- Desktop only. The shell ships a MINIMAL single-column narrow collapse against its OWN class names — it must NOT reference `.middle`/`.bottom` (those classes are gone after #1). Do NOT redesign narrow; #12 owns the real responsive pass. Drop the dead `.middle`/`.bottom` narrow rules from both consumers, don't relocate them.
- Reuse existing tokens only (`--bg-surface`, `--hairline`, `--space-*`, `--radius-card`, `--shadow-lift`, etc.). No invented tokens.
- Components validated by build + running (controller owns Playwright); pure logic (none new here) would be TDD-tested.
- Frequent commits — one per task.
- Spec: `docs/superpowers/specs/2026-07-19-shared-board-layout-design.md`.

---

## File Structure

- **Create** `src/lib/game/components/BoardLayout.svelte` — the shared shell: region skeleton, desktop CSS, `rightInset` measurement, minimal narrow collapse, three snippet slots.
- **Modify** `src/lib/game/components/SearchBox.svelte` — menu opens downward.
- **Modify** `src/lib/game/components/GameBoard.svelte` — render `BoardLayout`; delete skeleton CSS + measurement logic now in the shell.
- **Modify** `src/lib/explorer/components/Explorer.svelte` — render `BoardLayout`; delete its own measurement + old bottom-search skeleton.

Task order: SearchBox flip (independent, trivial) → create shell → port GameBoard onto it → port Explorer onto it → controller verification. SearchBox first so its downward menu is already correct when the shell tasks are live-verified.

---

## Task 1: SearchBox menu opens downward

**Files:**
- Modify: `src/lib/game/components/SearchBox.svelte` (`.menu` CSS + its comment only)

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — same props (`entries`, `onpick`, `placeholder`).

The `.menu` currently opens upward (`bottom: 100%; margin-bottom`) with a comment explaining it was for a bottom-pegged input. After #1 the input is at the top; flip it downward.

- [ ] **Step 1: Replace the `.menu` positioning + comment**

Find this block in `SearchBox.svelte`:
```css
  /* chrome lives on the wrapper so the inner scroll-fade mask never eats bg/border/shadow.
     Opens UPWARD — the search box lives in a bottom-pegged placard in both the game and
     Explore, so a downward menu would open into the hidden region below the viewport. */
  .searchbox .menu {
    position: absolute; z-index: 5; left: 0; right: 0; bottom: 100%; margin-bottom: var(--space-1);
    background: var(--bg-page); border: 1px solid var(--hairline);
    border-radius: var(--radius-card); box-shadow: var(--shadow-lift); overflow: hidden;
  }
```
Replace with:
```css
  /* chrome lives on the wrapper so the inner scroll-fade mask never eats bg/border/shadow.
     Opens DOWNWARD — after the layout rework the search box sits in the TOP cluster in both the
     game and Explore, so the menu drops below the input. */
  .searchbox .menu {
    position: absolute; z-index: 5; left: 0; right: 0; top: 100%; margin-top: var(--space-1);
    background: var(--bg-page); border: 1px solid var(--hairline);
    border-radius: var(--radius-card); box-shadow: var(--shadow-lift); overflow: hidden;
  }
```

- [ ] **Step 2: Gates**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npx vitest run`
Expected: 0 errors; existing tests pass (274).

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SearchBox.svelte
git commit -m "fix(search): autocomplete menu opens downward (input is top now)"
```

---

## Task 2: Create the BoardLayout shell

**Files:**
- Create: `src/lib/game/components/BoardLayout.svelte`

**Interfaces:**
- Consumes: nothing (pure layout shell). Uses `matchMedia` for `isDesktop`.
- Produces: a component taking three snippet props:
  - `cluster: Snippet` — the top-cluster content (mode-specific).
  - `placard: Snippet` — the floating placard content; the shell wraps it in the measured `.specimen-float`.
  - `tree: Snippet<[number]>` — a parameterized snippet receiving `rightInset: number`; the consumer renders `<SpineTree {rightInset} …/>` inside it.

The shell reproduces GameBoard's current region skeleton + desktop CSS + measurement, verbatim in behavior. It measures the placard's width (`clientWidth`), gates on `isDesktop`, computes `rightInset = isDesktop && w ? w + 24 + 24 : 0`, and passes it into the `tree` snippet.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  let { cluster, placard, tree }: {
    cluster: Snippet;
    placard: Snippet;
    tree: Snippet<[number]>;
  } = $props();

  // Measure the floating placard so the tree centers into the area LEFT of it; on narrow it stacks
  // in flow, so no inset. (This logic previously lived — identically — in both GameBoard and Explorer.)
  let placardW = $state(0);
  let isDesktop = $state(
    typeof matchMedia !== "undefined" ? matchMedia("(min-width: 641px)").matches : true,
  );
  $effect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(min-width: 641px)");
    const on = () => (isDesktop = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });
  // inset = placard width + its right offset (--space-5 = 24px) + a breathing gap before the tree
  let rightInset = $derived(isDesktop && placardW ? placardW + 24 + 24 : 0);
</script>

<div class="board">
  <div class="cluster">
    <div class="cluster-main">
      {@render cluster()}
    </div>
    <div class="specimen-float" bind:clientWidth={placardW}>
      {@render placard()}
    </div>
  </div>

  <div class="tree-body">
    {@render tree(rightInset)}
  </div>
</div>

<style>
  /* Shared board skeleton — top cluster (mode content + floating placard), tree owns the body.
     Structural only; visual treatment of the cluster contents lives with each mode. */
  .board { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  @media (min-width: 641px) {
    .board { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    /* the cluster is a pegged top band; the placard floats over its top-right, sized to its own
       content; the tree fills the whole body below and centers into the area LEFT of it. */
    .cluster {
      position: relative; flex: 0 0 auto;
      padding: var(--space-4) var(--space-5);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    /* reserve room on the right so wrapping cluster content never slides under the floating placard */
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-3); padding-right: 22rem; }
    .specimen-float { position: absolute; top: var(--space-4); right: var(--space-5); z-index: 5; width: max-content; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; }
    /* SpineTree relies on its consumer to make .tree-scroll the flex row that seats the fixed
       runway spacer beside the SVG (issue #32) and enables vertical scroll + centering. */
    .tree-body :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
  }

  /* Minimal narrow collapse: single column, cluster above the tree. NOT the real responsive pass
     (#12) — just a correct fallback that doesn't reference the now-deleted .middle/.bottom classes. */
  @media (max-width: 640px) {
    .board { flex-direction: column; }
    .cluster { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-3); }
    .specimen-float { width: 100%; }
    .tree-body :global(.tree-viewport) { width: 100%; }
    .tree-body :global(.tree-scroll) { width: 100%; }
  }
</style>
```

- [ ] **Step 2: Gates**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors. (The component is unused until Tasks 3/4, so this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/BoardLayout.svelte
git commit -m "feat(layout): BoardLayout shell — shared region skeleton + rightInset measurement"
```

---

## Task 3: Port GameBoard onto BoardLayout

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `BoardLayout` (Task 2) with `cluster`/`placard`/`tree` snippets.
- Produces: unchanged external contract — App renders `<GameBoard>` the same way.

Replace the hand-rolled `.game`/`.cluster`/`.tree-body` markup + its region CSS + the `specimenW`/`isDesktop`/`rightInset` logic with a `<BoardLayout>` render. Move the existing cluster contents, placard, and SpineTree into the three snippets. Keep ALL game state/derivations/handlers.

- [ ] **Step 1: Import BoardLayout**

Add to the script imports:
```ts
import BoardLayout from "./BoardLayout.svelte";
```

- [ ] **Step 2: Delete the now-shell-owned measurement logic**

Remove from the script (it lives in BoardLayout now):
```ts
  // The specimen floats over the tree canvas (desktop). Measure its box so the tree centers
  // into the area LEFT of it; on narrow it stacks in flow, so no inset.
  let specimenW = $state(0);
  let isDesktop = $state(
    typeof matchMedia !== "undefined" ? matchMedia("(min-width: 641px)").matches : true,
  );
  $effect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(min-width: 641px)");
    const on = () => (isDesktop = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });
  // inset = specimen width + its right offset (--space-5 = 24px) + a breathing gap before the tree
  let rightInset = $derived(isDesktop && specimenW ? specimenW + 24 + 24 : 0);
```

- [ ] **Step 3: Replace the template body**

Replace the whole `<div class="game">…</div>` block with:
```svelte
<BoardLayout>
  {#snippet cluster()}
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
  {/snippet}

  {#snippet placard()}
    <SpecimenPlacard view={specimenView(store.state, treeStore)}>
      {#snippet action()}
        {#if ended && onnew}
          <div class="actions">
            <button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>
          </div>
        {/if}
      {/snippet}
    </SpecimenPlacard>
  {/snippet}

  {#snippet tree(rightInset)}
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
  {/snippet}
</BoardLayout>
```

- [ ] **Step 4: Delete the region CSS from GameBoard's `<style>`**

Remove the `.game` rule, the entire `@media (min-width: 641px)` region block (`.game`/`.cluster`/`.cluster-main`/`.specimen-float`/`.tree-body`/`.tree-body :global(...)`), and the `@media (max-width: 640px)` block (it references the now-gone `.middle`/`.input-row` sticky — dead; the shell provides narrow). KEEP the rules for content that lives in the snippets and is still GameBoard-scoped: `.input-row` (flex row for input+buttons), `.budget`, `.result`/`.result-line`, `.btn-forfeit`, `:global(.actions)` if GameBoard-defined. Verify against the file which class rules back snippet content vs. which backed the deleted skeleton.

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npx vitest run`
Expected: 0 errors, 274 tests pass. (Expect the 3 stale-narrow svelte-check WARNINGS from #1 to be GONE now, since the dead `.middle` block is deleted — svelte-check should report 0 warnings for GameBoard.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "refactor(game): GameBoard renders the shared BoardLayout shell"
```

---

## Task 4: Port Explorer onto BoardLayout

**Files:**
- Modify: `src/lib/explorer/components/Explorer.svelte`

**Interfaces:**
- Consumes: `BoardLayout` (Task 2).
- Produces: unchanged external contract.

Explorer currently has the OLD layout (bottom search + recent trail, mid-floating detail). Move it onto `BoardLayout`: search + recent trail become the `cluster`; the detail card becomes the `placard`; the SpineTree becomes the `tree` snippet. Delete Explorer's own `detailW`/`isDesktop`/`rightInset` logic and its old `.middle`/`.bottom` skeleton CSS.

- [ ] **Step 1: Import BoardLayout**

Add to the script imports:
```ts
import BoardLayout from "../../game/components/BoardLayout.svelte";
```

- [ ] **Step 2: Delete Explorer's measurement logic**

Remove from the script (now in the shell):
```ts
  // Match the game board: measure the floating detail card so the tree centers into the area
  // left of it, with no inset on narrow (card stacks in flow).
  let detailW = $state(0);
  let isDesktop = $state(
    typeof matchMedia !== "undefined" ? matchMedia("(min-width: 641px)").matches : true,
  );
  $effect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(min-width: 641px)");
    const on = () => (isDesktop = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });
  // inset only on desktop, where the detail card floats over the tree
  let rightInset = $derived(isDesktop && detailW ? detailW + 24 + 24 : 0);
```

- [ ] **Step 3: Replace the template body**

Replace the whole `<main class="explorer">…</main>` block with:
```svelte
<main class="explorer">
  <BoardLayout>
    {#snippet cluster()}
      <SearchBox entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
      {#if recent.length}
        <nav class="recent" aria-label="Recently viewed">
          <span class="recent-label">Recent:</span>
          {#each recent as r (r.id)}
            <button type="button" class="link" onclick={() => explorer.jumpTo(r.id)}>{displayName(r.name)}</button>
          {/each}
        </nav>
      {/if}
    {/snippet}

    {#snippet placard()}
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} />
      {/if}
    {/snippet}

    {#snippet tree(rightInset)}
      <SpineTree
        revealed={explorer.revealed}
        tipId={explorer.highlightId}
        highlightId={explorer.highlightId}
        {nodeColor}
        {onnodeselect}
        {rightInset}
        gradeByPlayable
        emptyLabel="Search for a taxon to explore the tree."
      />
    {/snippet}
  </BoardLayout>
</main>
```

- [ ] **Step 4: Update Explorer's `<style>`**

Remove the old skeleton rules: the `.explorer` flex-column/padding rule, the entire `@media (min-width: 641px)` block (`.explorer`/`.middle`/`.middle :global(...)`/`.detail-float`/`.bottom`), and the `@media (max-width: 640px)` block (references gone `.middle`/`.bottom`). KEEP the `.recent`/`.recent-label`/`.recent .link` rules (they back the recent-trail snippet content). Give `.explorer` a minimal wrapper rule so it fills its slot:
```css
  .explorer { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
```
(Verify the exact remaining rules against the file — keep only what backs snippet content.)

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npx vitest run`
Expected: 0 errors, 0 warnings (the stale Explorer `.middle` warnings should also be gone), 274 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/explorer/components/Explorer.svelte
git commit -m "refactor(explore): Explorer renders the shared BoardLayout shell (top-cluster layout)"
```

---

## Task 5: Controller verification

**Files:** none (controller-owned live verification).

- [ ] **Step 1: Full gate gauntlet**

Run: `npx vitest run && npx tsc --noEmit && npx svelte-check --threshold error && npm run build`
Expected: all green, 0 svelte-check warnings (the #1-era stale-narrow warnings are now gone with the dead blocks deleted).

- [ ] **Step 2: Playwright — game unchanged, Explore adopts the layout (controller)**

Drive at 1440×900:
- Game (Practice): confirm the layout is unchanged from #1 (input+chips cluster top, plaque top-right, tree body, zoom pill). Regression check — porting to the shell must not alter it.
- Explore: confirm it NOW matches — search + recent trail in a top cluster, detail placard floats top-right, tree owns the body, zoom pill bottom-right. Walk a few taxa; confirm the tree fills + scrolls and the rightmost node clears the placard (same runway behavior as the game).
- Autocomplete: in BOTH modes, type in the search box; confirm the menu opens DOWNWARD and isn't clipped.

Save shots to gitignored `screenshots/`.

- [ ] **Step 3: Clear screenshots**

```bash
rm -f screenshots/*.png
```

- [ ] **Step 4: Final commit (empty if clean)**

Docs update (CLAUDE.md architecture map: note both modes render `BoardLayout`) if warranted, then a closing commit. This is a #1 follow-up; reference it:
```bash
git commit -m "docs: shared board layout — Explore adopts the game's layout via BoardLayout

Refs #1"
```

---

## Self-Review

**Spec coverage:**
- Shared shell extracted (`BoardLayout` owns skeleton + CSS + rightInset + narrow collapse) → Task 2. ✓
- GameBoard renders it, measurement deleted → Task 3. ✓
- Explorer renders it, gains top-cluster layout, measurement deleted → Task 4. ✓
- Three snippets; `tree` parameterized with `rightInset` → Task 2 interface + Tasks 3/4 usage. ✓
- Autocomplete opens downward, stale comment dropped → Task 1. ✓
- Dead `.middle`/`.bottom` narrow rules dropped (not carried); shell ships minimal correct narrow → Tasks 2/3/4. ✓
- Mode-specific content stays with each mode (cluster contents, placard view source, SpineTree props) → Tasks 3/4 snippets. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code. Steps 4 in Tasks 3/4 say "verify against the file which rules back snippet content" — that's a real instruction (the implementer must read the current `<style>` and keep content-backing rules, drop skeleton rules), not a placeholder; the rules to KEEP are named explicitly.

**Type consistency:** `BoardLayout`'s props (`cluster: Snippet`, `placard: Snippet`, `tree: Snippet<[number]>`) defined in Task 2 and consumed with matching `{#snippet tree(rightInset)}` in Tasks 3 and 4. The `rightInset` snippet param is a `number` in both the shell's `{@render tree(rightInset)}` and the consumers' snippet signature.
