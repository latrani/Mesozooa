# Selectable Node Info Panel in Game Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During play, let the player click a revealed tree node (genus or clade) or a guess chip to open that node's info panel, stacked 16px below the specimen placard and scrolling with it; a new guess clears the selection.

**Architecture:** Add one optional `extraPanel` snippet to `BoardLayout` (rendered after the specimen in both the desktop float and the phone drawer body). `GameBoard` owns a single `selectedId` selection that drives the tree ring, a pan, and the second panel; tree clicks and guess-chip clicks both set it, re-clicking clears it, and any new guess clears it. The panel reuses Explore's `nodeView()` → `SpecimenPlacard` unchanged. Crucially, a play-mode tree click only rings/pans/opens — it never re-tips the warmth-anchored spine.

**Tech Stack:** Svelte 5 (runes) + TypeScript. No new dependencies.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch violations; run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **One tree, one source of truth** — game feedback is always a pointer to a tree node; do not introduce a parallel representation.
- **Spacing between the two placards = `--space-4` (16px)** — exact token, both platforms.
- **Revealed-only is already enforced** by `layoutSpine` (`spine-layout.ts` filters children through `revealed.has`). No clue-suppression logic anywhere — the panel is Explore's `nodeView()` verbatim.
- **Play-mode tree clicks MUST NOT change `tipId`** — the spine tip is warmth-anchored (`treeTipId` derives from `store.warmestId`).
- Pure logic is TDD-tested; Svelte components are validated by build + `svelte-check` + running the gallery. There is no meaningful pure unit to extract here (the change is a toggle + a clear inside a component), so this plan verifies via typecheck/build/gallery rather than Vitest.

---

### Task 1: Add the `extraPanel` snippet slot to `BoardLayout`

Adds an optional second-panel slot rendered after the specimen in both layouts, with a 16px gap. No consumer passes it yet, so behavior is unchanged after this task — it's pure scaffolding the next task fills.

**Files:**
- Modify: `src/lib/game/components/BoardLayout.svelte`

**Interfaces:**
- Produces: `BoardLayout` gains prop `extraPanel?: import("svelte").Snippet`. When passed, it renders immediately after the specimen placard inside `.specimen-float` (desktop) and inside the `BottomSheet` body (phone), each separated from the specimen by `--space-4`. When absent, nothing extra renders.

- [ ] **Step 1: Add the prop**

In `src/lib/game/components/BoardLayout.svelte`, the current props block (lines 6-13) is:

```svelte
  let { cluster, placard, tree, sheetExpanded = $bindable(false) }: {
    cluster: Snippet;
    /** rendered twice on phone (peek row + expanded card) and once on desktop; the flag says which */
    placard: Snippet<[boolean]>;
    tree: Snippet<[number]>;
    /** phone only: lets a consumer force the sheet open, e.g. GameBoard on end state */
    sheetExpanded?: boolean;
  } = $props();
```

Change it to add `extraPanel`:

```svelte
  let { cluster, placard, tree, extraPanel, sheetExpanded = $bindable(false) }: {
    cluster: Snippet;
    /** rendered twice on phone (peek row + expanded card) and once on desktop; the flag says which */
    placard: Snippet<[boolean]>;
    tree: Snippet<[number]>;
    /** optional card stacked --space-4 below the specimen, scrolling with it. Rendered in the
        desktop float and the phone drawer body. GameBoard passes it for the selected-node info
        panel (#69); Explorer never does. */
    extraPanel?: Snippet;
    /** phone only: lets a consumer force the sheet open, e.g. GameBoard on end state */
    sheetExpanded?: boolean;
  } = $props();
```

- [ ] **Step 2: Render it in the desktop float**

The desktop float block (lines 81-85) is:

```svelte
    {#if !viewport.isPhone}
      <div class="specimen-float" bind:this={placardEl} bind:clientWidth={placardW}>
        {@render placard(false)}
      </div>
    {/if}
```

Change it to render `extraPanel` after the specimen, wrapped so the gap only exists when present:

```svelte
    {#if !viewport.isPhone}
      <div class="specimen-float" bind:this={placardEl} bind:clientWidth={placardW}>
        {@render placard(false)}
        {#if extraPanel}
          <div class="extra-panel">{@render extraPanel()}</div>
        {/if}
      </div>
    {/if}
```

- [ ] **Step 3: Render it in the phone drawer body**

The phone sheet block (lines 92-97) is:

```svelte
  {#if viewport.isPhone}
    <BottomSheet bind:expanded={sheetExpanded}>
      {#snippet peek()}{@render placard(true)}{/snippet}
      {@render placard(false)}
    </BottomSheet>
  {/if}
```

Change it to append `extraPanel` after the expanded placard, inside the sheet body (the sheet's `children` is everything after the `peek` snippet):

```svelte
  {#if viewport.isPhone}
    <BottomSheet bind:expanded={sheetExpanded}>
      {#snippet peek()}{@render placard(true)}{/snippet}
      {@render placard(false)}
      {#if extraPanel}
        <div class="extra-panel">{@render extraPanel()}</div>
      {/if}
    </BottomSheet>
  {/if}
```

- [ ] **Step 4: Add the gap style**

In the `<style>` block, after the `.board` rule (line 103), add a shared rule (outside the media queries, so it applies at both widths):

```css
  /* The optional second panel (selected-node info, #69) sits --space-4 below the specimen and
     scrolls with it — inside the fixed float on desktop, inside the drawer body on phone. */
  .extra-panel { margin-top: var(--space-4); }
```

- [ ] **Step 5: Typecheck + build**

Run: `npx svelte-check --threshold error 2>&1 | tail -5 && npx tsc --noEmit`
Expected: no errors. (No consumer passes `extraPanel` yet, so nothing renders — the app is visually unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/BoardLayout.svelte
git commit -m "feat(board): optional extraPanel snippet stacked below the specimen (#69)"
```

---

### Task 2: Wire selection + the info panel in `GameBoard`

Repurposes the existing `highlightId` state into a single `selectedId` that tree clicks, guess chips, and the toggle/clear rules all drive, and renders the second `SpecimenPlacard` through `extraPanel`.

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `BoardLayout`'s `extraPanel?` prop (Task 1); `SpineTree`'s existing `onnodeselect?: (id: string) => void` and `panTo(id)` / `highlightId` props; `nodeView(node)` from `../specimen-view`; `treeStore.getNode(id)`.
- Produces: nothing downstream (GameBoard is a leaf consumer).

- [ ] **Step 1: Import `nodeView`**

`GameBoard.svelte` currently imports `specimenView` (line 11):

```svelte
  import { specimenView } from "../specimen-view";
```

Change to also import `nodeView`:

```svelte
  import { specimenView, nodeView } from "../specimen-view";
```

- [ ] **Step 2: Rename `highlightId` → `selectedId` and update the clear effect**

The current state + clear effect (lines 50-53) is:

```svelte
  let highlightId = $state<string | null>(null);
  $effect(() => {
    if (store.state.guesses.length === 0) highlightId = null;
  });
```

Replace with `selectedId`, and change the effect to clear on **every** new guess (track the guess count so the effect re-runs when it changes):

```svelte
  // The single selection: a revealed node whose info panel is shown (below the specimen). Set by
  // tree clicks and guess-chip clicks; drives the tree ring (highlightId), a pan, and the panel.
  let selectedId = $state<string | null>(null);
  // Any new guess clears the selection (#69: "when I make a new guess, unselect/hide the other
  // one"). Tracking the count means this fires on each guess, not only when the list empties.
  $effect(() => {
    void store.state.guesses.length;
    selectedId = null;
  });

  // Toggle a node's selection: clicking the already-selected node clears it, else selects it.
  // Play-mode only — does NOT touch tipId, so the warmth-anchored spine stays put; it only rings,
  // pans, and opens the panel.
  function selectNode(id: string) {
    selectedId = selectedId === id ? null : id;
    if (selectedId) spine?.panTo(id);
  }
```

Note: the `spine` component ref is declared later in the file (line 97). `$state`/`function` declarations can reference it — `spine` is in scope by the time `selectNode` is called.

- [ ] **Step 3: Point the `SpineTree` ring at `selectedId` and wire play-mode clicks**

The current `tree` snippet (lines 170-184) passes `highlightId` and only wires `onnodeselect` on end state:

```svelte
  {#snippet tree(rightInset)}
    <SpineTree
      bind:this={spine}
      revealed={treeRevealed}
      tipId={treeTipId}
      {guessWarmth}
      {highlightId}
      {rightInset}
      showCounts={false}
      speakShared
      warmthProvider={store.warmthProvider}
      onnodeselect={ended && onexplore ? (id) => onexplore(id) : undefined}
      linkLabels={ended}
    />
  {/snippet}
```

Change `{highlightId}` to `highlightId={selectedId}`, and make `onnodeselect` select-in-play / explore-on-end:

```svelte
  {#snippet tree(rightInset)}
    <SpineTree
      bind:this={spine}
      revealed={treeRevealed}
      tipId={treeTipId}
      {guessWarmth}
      highlightId={selectedId}
      {rightInset}
      showCounts={false}
      speakShared
      warmthProvider={store.warmthProvider}
      onnodeselect={ended ? (onexplore ? (id) => onexplore(id) : undefined) : selectNode}
      linkLabels={ended}
    />
  {/snippet}
```

- [ ] **Step 4: Make guess chips also set the selection**

The `GuessList` usage (lines 157-163) currently sets `highlightId` and pans:

```svelte
    <GuessList
      guesses={store.state.guesses}
      targetId={won ? store.state.target : null}
      revealId={ended && !won ? store.state.target : null}
      warmestId={store.warmestId}
      onselect={(id) => { highlightId = id; spine?.panTo(id); }}
    />
```

Change the handler to route through `selectNode` (unify: a chip opens that genus's panel, same as a tree click), but keep it non-toggling for chips — a chip click should always select+pan, not toggle off:

```svelte
    <GuessList
      guesses={store.state.guesses}
      targetId={won ? store.state.target : null}
      revealId={ended && !won ? store.state.target : null}
      warmestId={store.warmestId}
      onselect={(id) => { selectedId = id; spine?.panTo(id); }}
    />
```

- [ ] **Step 5: Pass the `extraPanel` snippet to `BoardLayout`**

The existing snippets (`cluster`, `placard`, `tree`) are declared *inside* the `<BoardLayout>…</BoardLayout>` tag and auto-mapped to the child's props by name — that's the codebase idiom. Add `extraPanel` the same way: declare it after the `tree` snippet, before `</BoardLayout>` (the `tree` snippet ends at line 184, `</BoardLayout>` is line 185). Do **not** add anything to the open tag — a named snippet inside the tag is already the prop.

```svelte
  {#snippet extraPanel()}
    {#if selectedId && treeStore.getNode(selectedId)}
      <SpecimenPlacard view={nodeView(treeStore.getNode(selectedId)!)} />
    {/if}
  {/snippet}
```

The open tag stays exactly as-is:

```svelte
<BoardLayout bind:sheetExpanded>
```

The `{#if selectedId …}` guard is inside the snippet, so when nothing is selected the snippet renders empty. Task 1's `{#if extraPanel}` wrapper checks whether the *snippet was passed*, not whether it renders content — since GameBoard always passes it, the wrapper `.extra-panel` div is always present but empty (zero-height) when nothing is selected. That empty div adds no visible gap (nothing follows it in the scroll block), so it's acceptable. The specimen-only layout is visually identical to today.

- [ ] **Step 6: Typecheck**

Run: `npx svelte-check --threshold error 2>&1 | tail -10 && npx tsc --noEmit`
Expected: no errors. Confirm there are no remaining references to the old `highlightId` name (search: `grep -n highlightId src/lib/game/components/GameBoard.svelte` — the only hit should be the `highlightId={selectedId}` prop on `SpineTree`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "feat(game): select revealed nodes to open their info panel (#69)"
```

---

### Task 3: Verify in the running app + gallery

Selection is interactive component state, so verification is manual against the running app across both widths. This task ships no code unless a defect surfaces.

**Files:**
- None (verification only). If the gallery needs a note or a demo state, modify `src/gallery/Gallery.svelte`.

- [ ] **Step 1: Build the app**

Run: `npm run build 2>&1 | tail -15`
Expected: build succeeds, no TypeScript/svelte-check errors.

- [ ] **Step 2: Run the dev server and exercise the flows (desktop width)**

Run: `npm run dev` and open the app; play a Practice round far enough to reveal several nodes, then verify:
  - Click a revealed **genus** node → its info panel appears 16px below the specimen, showing the photo + Lived/Found-in clue + Wikipedia link.
  - Click a revealed **clade** node → panel shows photo + "N genera in this clade" + Wikipedia link, no clue rows.
  - The spine does **not** re-tip or relayout on selection (the warm spine stays anchored to the warmest guess).
  - Scroll the specimen area → the two cards scroll together as one block.
  - Re-click the selected node → panel clears.
  - Click a **guess chip** → opens that genus's panel (and pans to it).
  - Make a new guess → the panel clears.

- [ ] **Step 3: Exercise the phone width**

Resize the viewport below 640px (or use device emulation). Verify:
  - Selecting a node opens the info panel stacked below the specimen **inside the bottom sheet**; pulling the drawer up scrolls both cards as one rigid block.
  - New guess clears it; re-click clears it.

- [ ] **Step 4: Confirm end state is unchanged**

Finish a round (win or forfeit/loss). Verify tree-node clicks still jump into Explore (the `onexplore` path), not the in-game panel.

- [ ] **Step 5: Commit any gallery/demo additions (if made)**

```bash
git add src/gallery/Gallery.svelte
git commit -m "chore(gallery): demo selected-node info panel state (#69)"
```

(Skip this commit if no gallery change was needed.)

---

## Notes for the implementer

- **Why no Vitest task:** the whole change is a toggle-and-clear inside a Svelte component plus a snippet slot. There's no pure function worth extracting — `nodeView`, `layoutSpine`, and the revealed-set gating are already tested. Adding a component-testing harness for a 3-line toggle would be ceremony. Verification is typecheck + build + manual, per the project's "components validated by build + running" agreement.
- **The tip-stays-put invariant is the one real risk.** `SpineTree.onNodeClick` calls `commitStepBack(id, true)` then `onnodeselect(id)` then `focusItem(id)`. `commitStepBack` is a no-op unless the click is a step-back *on the current tip's lineage*; since `selectNode` never mutates `tipId`, no relayout is triggered by selection. If during testing the spine visibly reflows on a plain node click, that's the bug to chase — not expected given the code path.
- **Deferred work:** if any polish is punted (e.g. a close button was considered and dropped — the design chose re-click-to-toggle), file a GitHub issue on `latrani/Mesozooa` per the project's tracking agreement rather than leaving a TODO.
