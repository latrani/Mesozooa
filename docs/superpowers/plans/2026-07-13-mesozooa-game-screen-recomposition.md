# Game Screen Recomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the game screen into the four-region IA from the spec — a header of three modes, a trail-scrubber + budget, a tree + right-rail "specimen", and a bottom guess-history + input — with the specimen replacing today's scattered target placeholder / clue / result UI, and a basic responsive collapse to a bottom bar on narrow screens.

**Architecture:** A new pure selector `specimenState` (a discriminated union over the game state) drives a new `Specimen.svelte` right-rail component through three states (broad → terminal+clue → solved), folding in `CluePanel`. `GameBoard` is recomposed into the four regions and wires the trail as the tree's scrubber (the trail's crumb clicks call `SpineTree`'s exported `panTo` via a `bind:this` component ref). A tiny `nav` module-singleton store lifts tab state out of `App` so the solved specimen's "explore around [answer]" can switch tabs and focus Explore. Daily and Practice slim down to feed one shared board; their old inline-result / `RevealCard` UIs are replaced by the specimen's solved state.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for the pure selectors; existing stores (`daily`, `game`, `explorer`), `SpineTree` (`panTo`), `treeStore`.

**This is Plan 2 of 2** for the look-and-feel IA redesign. Plan 1 (the spine tree engine) is merged. Spec: `docs/superpowers/specs/2026-07-13-mesozooa-game-ui-ia-design.md` (§2 nav, §3 regions, §4 warmth, §5 specimen, §6 hints, §7 responsive, §9 mapping). This plan is the IA/layout half; visual treatment (palette/type/motion) remains a separate later phase.

## Global Constraints

- **Structural CSS only — NO aesthetics.** Build correct structure/layout (flex/grid, the right-rail, the bottom-pegged input, scroll containers, the responsive collapse). Palette, type/font, hairlines, spacing scale, motion/animation are the SEPARATE later visual phase. Colors are placeholder/browser-default; it will look rough on purpose. Do not add styling beyond what the layout needs to function.
- **One tree, one source of truth.** Every feedback reading is a pointer to a node in the dinosaur tree. The specimen reads existing selectors (`warmestSharedNodeId`, `terminalClueActive`, `terminalClade`) and node objects; do NOT build a parallel clade/rank structure.
- **Explore must NOT surface the playable/answerable subset** (spec §2). Explore's search stays over the full reference pool (`searchSource(treeStore)`, already all nodes), and it renders no `playable` markers. Do not add any.
- **Warmth is de-duplicated (spec §4):** the specimen is the primary reading; the tree is spatial; guess history is the per-guess record; the trail is NOT a warmth channel (its counts are structural clade sizes). Do not reintroduce warmth in the trail.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Vitest does NOT catch violations — run `npx tsc --noEmit` (clean) AND `npx svelte-check --tsconfig ./tsconfig.json` (0 errors) before every commit touching types or `.svelte` files.
- **Pure logic is TDD-tested; Svelte components validated by tsc + svelte-check + `npm run build` + a manual run.**
- **Do NOT touch the Explore *tree*** (`src/lib/game/layout.ts`, `TreeView.svelte`) — Explore keeps its faithful cladogram. Task 7 only adds a back-to-game affordance to `Explorer.svelte`'s chrome.
- **Share stays code-present but UI-absent (spec §8):** `src/lib/game/share.ts` is retained; remove the Share *button* from the UI. Do not delete `share.ts`.
- **Frequent commits:** one commit per task.

---

## File Structure

- `src/lib/game/engine-core.ts` — **Modify.** Add pure `playableDescendantCount` and the `SpecimenState` type + `specimenState` selector.
- `src/lib/game/engine-core.test.ts` — **Modify.** Add tests for both new functions.
- `src/lib/game/components/Specimen.svelte` — **Create.** The right-rail specimen; folds in `CluePanel`'s clue rendering; three states + solved actions.
- `src/lib/nav.svelte.ts` — **Create.** Module-singleton `nav` store: `tab` + `exploreAround(id)`.
- `src/App.svelte` — **Modify.** Header wordmark + three modes reading `nav.tab` (was local `$state`).
- `src/lib/game/components/WarmestTrail.svelte` — **Modify.** Crumbs become pan buttons (`onpan`); optional budget slot.
- `src/lib/game/components/GameBoard.svelte` — **Modify.** Recompose into four regions; wire `SpineTree` `panTo` to the trail; mount `Specimen`; move input to the bottom; expand the `store` contract with optional hint/budget members and add `onexplore?`/`onnew?` props.
- `src/lib/game/components/Daily.svelte` — **Modify.** Remove the inline `<section class="result">` and Share button; pass hint/budget through the store (already present) and `onexplore` to the board.
- `src/lib/game/components/Practice.svelte` — **Modify.** Remove `RevealCard`; pass `onnew` and `onexplore` to the board.
- `src/lib/explorer/components/Explorer.svelte` — **Modify.** Add a "← Back to game" button (calls `nav.set("daily")`). No tree changes; no playable markers.
- `src/lib/game/components/RevealCard.svelte` — **Delete** (replaced by the specimen solved state; confirm no other importers).

**Fixture facts** (`assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test")` then `markPlayable`), used by Task 1 tests:
- Playable genera = `["TR", "TB", "TC"]`. `TR`/`TB` are under `TF` (Tyrannosauridae); `TC` under `O` (Ornithischia).
- `descendantGenusCount`: `Q430`=4, `T`=3, `TF`=2, `TR`/`TB`/`TC`/`O`/`CF`=1.
- `terminalClade(store.data, "TR")` = `"TF"`; `terminalClade(store.data, "TC")` = `"Q430"`.
- Playable genera under `TF` = {`TR`,`TB`} = 2; under `Q430` = all 3.
- `mrca(TC, TR)` = `Q430`; `mrca(TB, TR)` = `TF`.

---

### Task 1: `specimenState` + `playableDescendantCount` — the specimen's data model

**Files:**
- Modify: `src/lib/game/engine-core.ts`
- Modify: `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Consumes: `TreeStore` (`playableGenera`, `pathToRoot`, `getNode`, `data`); existing `warmestSharedNodeId`, `terminalClueActive` (in this file); `terminalClade` (from `../tree/terminal`); `GameState` (from `./types`).
- Produces:
  ```ts
  export function playableDescendantCount(store: TreeStore, id: string): number;

  export type SpecimenState =
    | { kind: "empty" }
    | { kind: "broad"; count: number }
    | { kind: "terminal"; siblingCount: number }
    | { kind: "solved"; outcome: "won" | "lost"; targetId: string; guessCount: number };

  export function specimenState(state: GameState, store: TreeStore): SpecimenState;
  ```
  Semantics:
  - `playableDescendantCount(store, id)` = number of playable genera at or below `id` (i.e. whose `pathToRoot` includes `id`).
  - `specimenState`:
    - `solved` when `state.status !== "playing"` → `outcome` = the status, `targetId` = `state.target`, `guessCount` = count of `kind === "guess"` entries (hints don't count as guesses).
    - else `empty` when there are no guesses (`warmestSharedNodeId` is `null`).
    - else `terminal` when `terminalClueActive(state, store)` → `siblingCount = playableDescendantCount(store, terminalClade(store.data, state.target))`.
    - else `broad` → `count = descendantGenusCount` of `warmestSharedNodeId`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/game/engine-core.test.ts`. Extend the existing import from `./engine-core` to also import `playableDescendantCount` and `specimenState`, and add `import { applyHint }` if not already imported (it is). The file already sets up `store`, `warmth`, and a `practice(target)` helper; reuse them. Add a `daily1(target)` helper for the loss case.

```ts
describe("playableDescendantCount", () => {
  it("counts playable genera at or below a node", () => {
    expect(playableDescendantCount(store, "TF")).toBe(2); // TR, TB
    expect(playableDescendantCount(store, "Q430")).toBe(3); // TR, TB, TC
    expect(playableDescendantCount(store, "O")).toBe(1); // TC
  });
  it("counts a playable leaf as itself", () => {
    expect(playableDescendantCount(store, "TR")).toBe(1);
  });
});

describe("specimenState", () => {
  const daily1 = (target: string): GameState => ({
    target,
    guesses: [],
    status: "playing",
    mode: "daily",
    maxGuesses: 1,
    hintsUsed: 0,
  });

  it("is empty with no guesses", () => {
    expect(specimenState(practice("TR"), store)).toEqual({ kind: "empty" });
  });

  it("is broad when the warmest clade is still large", () => {
    const s = applyGuess(practice("TR"), "TC", store, warmth); // mrca=Q430 (count 4)
    expect(specimenState(s, store)).toEqual({ kind: "broad", count: 4 });
  });

  it("is terminal (with sibling count) when warmth bottoms out at the terminal clade", () => {
    const s = applyGuess(practice("TR"), "TB", store, warmth); // mrca=TF (count 2 = terminal)
    expect(specimenState(s, store)).toEqual({ kind: "terminal", siblingCount: 2 });
  });

  it("is solved/won on a correct guess (hints excluded from guessCount)", () => {
    const s = applyGuess(practice("TR"), "TR", store, warmth);
    expect(specimenState(s, store)).toEqual({
      kind: "solved",
      outcome: "won",
      targetId: "TR",
      guessCount: 1,
    });
  });

  it("is solved/lost when the daily budget is exhausted, revealing the target", () => {
    const s = applyGuess(daily1("TR"), "TC", store, warmth); // wrong, budget=1 -> lost
    expect(specimenState(s, store)).toEqual({
      kind: "solved",
      outcome: "lost",
      targetId: "TR",
      guessCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t "specimenState|playableDescendantCount"`
Expected: FAIL — `playableDescendantCount is not a function` / `specimenState is not a function`.

- [ ] **Step 3: Implement the selectors**

Append to `src/lib/game/engine-core.ts` (after `terminalClueActive`). `terminalClade` is already imported at the top of the file.

```ts
// Number of playable genera at or below `id` — the size of the still-hidden candidate set.
export function playableDescendantCount(store: TreeStore, id: string): number {
  return store.playableGenera().filter((g) => store.pathToRoot(g.id).includes(id)).length;
}

export type SpecimenState =
  | { kind: "empty" }
  | { kind: "broad"; count: number }
  | { kind: "terminal"; siblingCount: number }
  | { kind: "solved"; outcome: "won" | "lost"; targetId: string; guessCount: number };

// The specimen's progression (spec §5): broad -> terminal (+clue) -> solved.
export function specimenState(state: GameState, store: TreeStore): SpecimenState {
  if (state.status !== "playing") {
    const guessCount = state.guesses.filter((g) => g.kind === "guess").length;
    return {
      kind: "solved",
      outcome: state.status,
      targetId: state.target,
      guessCount,
    };
  }
  const warmestId = warmestSharedNodeId(state, store);
  if (warmestId === null) return { kind: "empty" };
  if (terminalClueActive(state, store)) {
    const terminalId = terminalClade(store.data, state.target);
    return { kind: "terminal", siblingCount: playableDescendantCount(store, terminalId) };
  }
  return { kind: "broad", count: store.getNode(warmestId)!.descendantGenusCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/engine-core.test.ts && npx tsc --noEmit`
Expected: all tests pass (existing + 7 new); tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat: specimenState + playableDescendantCount selectors"
```

---

### Task 2: `Specimen.svelte` — the right-rail specimen

Renders a `SpecimenState` and the paleo clue as one evolving object (spec §5). Folds in the clue rendering that lived in `CluePanel` (age + location). Solved state offers "explore around [answer]" (when `onexplore` is given) and "New round" (when `onnew` is given). Structural markup + layout CSS only.

**Files:**
- Create: `src/lib/game/components/Specimen.svelte`

**Interfaces:**
- Consumes: `SpecimenState` (Task 1); `GenusAttribute` (from `../../attributes`); `treeStore` for the solved answer's name.
- Props:
  ```ts
  { specimen: SpecimenState; clue: GenusAttribute | null;
    onexplore?: (id: string) => void; onnew?: () => void }
  ```
- Produces: a self-contained rail; no exports.

- [ ] **Step 1: Create the component**

Create `src/lib/game/components/Specimen.svelte`:

```svelte
<script lang="ts">
  import type { SpecimenState } from "../engine-core";
  import type { GenusAttribute } from "../../attributes";
  import { treeStore } from "../treeData";

  let {
    specimen,
    clue,
    onexplore,
    onnew,
  }: {
    specimen: SpecimenState;
    clue: GenusAttribute | null;
    onexplore?: (id: string) => void;
    onnew?: () => void;
  } = $props();

  let answerName = $derived(
    specimen.kind === "solved" ? (treeStore.getNode(specimen.targetId)?.name ?? specimen.targetId) : "",
  );
</script>

<aside class="specimen" aria-label="Specimen">
  {#if specimen.kind === "empty"}
    <p class="placeholder">??????</p>
    <p class="hint">Guess a dinosaur to start narrowing.</p>
  {:else if specimen.kind === "broad"}
    <p class="placeholder">??????</p>
    <p class="count">{specimen.count} {specimen.count === 1 ? "genus" : "genera"}</p>
  {:else if specimen.kind === "terminal"}
    <p class="placeholder">??????</p>
    <p class="count">{specimen.siblingCount} sibling {specimen.siblingCount === 1 ? "taxon" : "taxa"}</p>
    {#if clue}
      <div class="clue" aria-label="Paleo clue">
        {#if clue.ageLabel}
          <span class="clue-field"
            >Lived: {clue.ageLabel}{#if clue.ageStartMa != null && clue.ageEndMa != null}
              (~{clue.ageStartMa}–{clue.ageEndMa} Ma){/if}</span
          >
        {/if}
        {#if clue.discoveryLocation}
          <span class="clue-field">Found in: {clue.discoveryLocation}</span>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="answer">{answerName}</p>
    <p class="count">
      {specimen.outcome === "won" ? "Solved" : "Out of guesses"} in {specimen.guessCount}
      {specimen.guessCount === 1 ? "guess" : "guesses"}
    </p>
    <div class="actions">
      {#if onexplore}
        <button type="button" onclick={() => onexplore?.(specimen.targetId)}>Explore around {answerName} ▸</button>
      {/if}
      {#if onnew}
        <button type="button" onclick={() => onnew?.()}>New round</button>
      {/if}
    </div>
  {/if}
</aside>

<style>
  /* Structural only — the rail is a fixed-width column; visual treatment deferred. */
  .specimen {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 0 0 auto;
    width: 12rem;
  }
  .clue {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
</style>
```

- [ ] **Step 2: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; `vite build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/Specimen.svelte
git commit -m "feat: Specimen right-rail component (broad/terminal/solved + clue)"
```

---

### Task 3: `nav` store + App header (wordmark + three modes)

Lift the tab state out of `App`'s local `$state` into a module-singleton `nav` store so the specimen's "explore around [answer]" can switch to Explore and focus it. Reframe the header per spec §2 (wordmark + three modes). Budget does NOT go in the header (it moves to the trail in Task 5).

**Files:**
- Create: `src/lib/nav.svelte.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `explorer` (from `./explorer/explorerStore.svelte`) for `jumpTo`.
- Produces:
  ```ts
  export const nav: {
    readonly tab: "daily" | "practice" | "explore";
    set(t: "daily" | "practice" | "explore"): void;
    exploreAround(id: string): void; // focuses Explore on `id` and switches to the Explore tab
  };
  ```

- [ ] **Step 1: Create the nav store**

Create `src/lib/nav.svelte.ts`:

```ts
import { explorer } from "./explorer/explorerStore.svelte";

type Tab = "daily" | "practice" | "explore";

function createNav() {
  let tab = $state<Tab>("daily");
  return {
    get tab(): Tab {
      return tab;
    },
    set(t: Tab) {
      tab = t;
    },
    exploreAround(id: string) {
      explorer.jumpTo(id);
      tab = "explore";
    },
  };
}

export const nav = createNav();
```

- [ ] **Step 2: Point App at the nav store**

Replace the contents of `src/App.svelte` with:

```svelte
<script lang="ts">
  import { nav } from "./lib/nav.svelte";
  import Daily from "./lib/game/components/Daily.svelte";
  import Practice from "./lib/game/components/Practice.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";
</script>

<header class="app-header">
  <span class="wordmark">Mesozooa</span>
  <nav class="modes">
    <button type="button" class:active={nav.tab === "daily"} onclick={() => nav.set("daily")}>Daily</button>
    <button type="button" class:active={nav.tab === "practice"} onclick={() => nav.set("practice")}>Practice</button>
    <button type="button" class:active={nav.tab === "explore"} onclick={() => nav.set("explore")}>Explore</button>
  </nav>
</header>

{#if nav.tab === "daily"}
  <Daily />
{:else if nav.tab === "practice"}
  <Practice />
{:else}
  <Explorer />
{/if}

<style>
  /* Structural only. */
  .app-header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }
  .modes {
    display: flex;
    gap: 0.25rem;
  }
</style>
```

- [ ] **Step 3: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds. (Daily/Practice still render their own `<h1>` headers at this point — that's fine; Task 6 slims them.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/nav.svelte.ts src/App.svelte
git commit -m "feat: nav store + app header (wordmark + three modes)"
```

---

### Task 4: Trail as scrubber + budget slot

Turn the `WarmestTrail` crumbs into buttons that pan the tree (spec §3B), and give the trail an optional budget slot (`used/max`) so the budget can move off the Daily header. The trail stays a structural orientation line — NOT a warmth channel (its counts are clade sizes, unchanged).

**Files:**
- Modify: `src/lib/game/components/WarmestTrail.svelte`

**Interfaces:**
- Consumes: `treeStore` (`pathToRoot`, `getNode`), unchanged.
- Produces (new props):
  ```ts
  { warmestId: string | null; onpan?: (id: string) => void;
    budget?: { used: number; max: number } | null }
  ```

- [ ] **Step 1: Rewrite the component**

Replace the contents of `src/lib/game/components/WarmestTrail.svelte` with:

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";

  let {
    warmestId,
    onpan,
    budget = null,
  }: {
    warmestId: string | null;
    onpan?: (id: string) => void;
    budget?: { used: number; max: number } | null;
  } = $props();

  let trail = $derived(warmestId ? treeStore.pathToRoot(warmestId).slice().reverse() : []);
</script>

<nav class="trail" aria-label="Warmest shared lineage">
  {#if budget}
    <span class="budget">{budget.used}/{budget.max}</span>
  {/if}
  {#each trail as id, i (id)}
    {@const node = treeStore.getNode(id)}
    <button type="button" class="crumb" onclick={() => onpan?.(id)} disabled={!onpan}>
      {node?.name} <em>({node?.descendantGenusCount})</em>
    </button>
    {#if i < trail.length - 1}<span class="sep"> › </span>{/if}
  {/each}
</nav>

<style>
  /* Structural only — a single wrapping orientation line. */
  .trail {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
  }
</style>
```

Notes for the implementer: a crumb is now always a `<button>`; when `onpan` is absent it is `disabled` (Explore does not use this component, so `onpan` is always supplied in the game path — the guard just keeps the component honest). Keep the `<em>(count)</em>` — those are clade sizes (structural), not warmth.

- [ ] **Step 2: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds. (`GameBoard` still renders `<WarmestTrail warmestId={...} />` with no `onpan`/`budget` — both are optional, so it compiles; Task 5 wires them.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/WarmestTrail.svelte
git commit -m "feat: trail as tree scrubber (click-to-pan) + optional budget slot"
```

---

### Task 5: Recompose `GameBoard` into the four regions

Recompose the shared board (spec §3): trail+budget on top, tree + right-rail specimen in the middle, guess-history + input + hint pegged to the bottom. Wire the trail's crumb clicks to `SpineTree.panTo` via a `bind:this` component ref. Mount `Specimen` (from Task 2) driven by `specimenState`. Expand the `store` contract with optional hint/budget members and add optional `onexplore`/`onnew` props. Remove the standalone `CluePanel` usage (the specimen now renders the clue).

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `Specimen` (Task 2); `specimenState` (Task 1); `SpineTree` (`panTo`, typed via `ReturnType<typeof SpineTree>`); `WarmestTrail` (Task 4, `onpan`/`budget`); `SearchBox`, `GuessList`; `treeStore`.
- Produces (new prop surface):
  ```ts
  {
    store: {
      state: GameState;
      warmestId: string | null;
      revealed: Set<string>;
      clue: GenusAttribute | null;
      guess: (id: string) => void;
      // optional, daily-only:
      canHint?: boolean;
      hint?: () => void;
      hintsRemaining?: number;
      guessesUsed?: number;
    };
    disabled: boolean;
    onexplore?: (id: string) => void;
    onnew?: () => void;
  }
  ```
  Budget shows in the trail when `store.state.maxGuesses !== null`. The hint button shows when `store.hint` is defined.

- [ ] **Step 1: Rewrite the component**

Replace the contents of `src/lib/game/components/GameBoard.svelte` with:

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import type { GameState } from "../types";
  import type { GenusAttribute } from "../../attributes";
  import { specimenState } from "../engine-core";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import Specimen from "./Specimen.svelte";
  import SpineTree from "./SpineTree.svelte";

  let {
    store,
    disabled,
    onexplore,
    onnew,
  }: {
    store: {
      state: GameState;
      warmestId: string | null;
      revealed: Set<string>;
      clue: GenusAttribute | null;
      guess: (id: string) => void;
      canHint?: boolean;
      hint?: () => void;
      hintsRemaining?: number;
      guessesUsed?: number;
    };
    disabled: boolean;
    onexplore?: (id: string) => void;
    onnew?: () => void;
  } = $props();

  const playableEntries = treeStore.playableGenera().map((n) => ({ id: n.id, name: n.name }));

  let highlightId = $state<string | null>(null);
  $effect(() => {
    if (store.state.guesses.length === 0) highlightId = null;
  });

  let nodeTooltips = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const g of store.state.guesses) {
      const name = treeStore.getNode(g.guessId)?.name ?? g.guessId;
      const list = map.get(g.sharedNodeId) ?? [];
      list.push(name);
      map.set(g.sharedNodeId, list);
    }
    return map;
  });

  let specimen = $derived(specimenState(store.state, treeStore));
  let budget = $derived(
    store.state.maxGuesses !== null
      ? { used: store.guessesUsed ?? store.state.guesses.length, max: store.state.maxGuesses }
      : null,
  );

  // Component ref to the spine tree so trail crumbs can pan it (spec §3B).
  let spine = $state<ReturnType<typeof SpineTree>>();
</script>

<div class="game">
  <WarmestTrail warmestId={store.warmestId} onpan={(id) => spine?.panTo(id)} {budget} />

  <div class="middle">
    <SpineTree
      bind:this={spine}
      revealed={store.revealed}
      warmestId={store.warmestId}
      {nodeTooltips}
      {highlightId}
      emptyLabel="Make a guess to start revealing the tree."
    />
    <Specimen {specimen} clue={store.clue} {onexplore} {onnew} />
  </div>

  <div class="bottom">
    <GuessList guesses={store.state.guesses} onselect={(id) => (highlightId = id)} />
    <div class="input-row">
      {#if !disabled}
        <SearchBox entries={playableEntries} onpick={(id) => store.guess(id)} placeholder="Guess a dinosaur…" />
      {/if}
      {#if store.hint}
        <button type="button" onclick={() => store.hint?.()} disabled={!store.canHint}>
          Hint{#if store.hintsRemaining != null} ({store.hintsRemaining} left){/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Structural only — three stacked regions; the middle splits tree | specimen. */
  .game {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .middle {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    min-height: 0;
  }
  .middle :global(.tree-scroll) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .bottom {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
</style>
```

Notes for the implementer:
- `CluePanel` is intentionally no longer imported or rendered here (the specimen renders the clue). Do NOT delete `CluePanel.svelte` in this task — Task 6/cleanup handles unused files; leaving it on disk unused does not break the build.
- The `bind:this={spine}` + `ReturnType<typeof SpineTree>` pattern is verified against this repo's svelte-check; `spine?.panTo(id)` is type-safe.

- [ ] **Step 2: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds. Daily/Practice still pass only `{ store, disabled }` — `onexplore`/`onnew` are optional, so it compiles; the hint button appears in Daily (its store has `hint`) and not in Practice.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "feat: recompose GameBoard into trail / tree+specimen / bottom-input regions"
```

---

### Task 6: End-state unification — slim Daily & Practice onto the specimen

Remove Daily's inline `<section class="result">` + Share button and Practice's `RevealCard`; both mode wrappers now resolve their end state through the shared board's specimen (spec §5 "end-state unification"). Wire `onexplore` (both modes) and `onnew` (practice) through to the board, and delete the now-unused `RevealCard.svelte`.

**Files:**
- Modify: `src/lib/game/components/Daily.svelte`
- Modify: `src/lib/game/components/Practice.svelte`
- Delete: `src/lib/game/components/RevealCard.svelte`

**Interfaces:**
- Consumes: `GameBoard` (Task 5, `onexplore`/`onnew`); `nav` (Task 3, `exploreAround`); `daily`/`game` stores (unchanged). Daily's store already exposes `canHint`/`hint`/`hintsRemaining`/`guessesUsed`, which the board reads.

- [ ] **Step 1: Slim `Daily.svelte`**

Replace the contents of `src/lib/game/components/Daily.svelte` with:

```svelte
<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
</script>

<main class="daily">
  <GameBoard
    store={daily}
    disabled={daily.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
  />
</main>
```

Notes: the budget now lives in the trail (Task 5 reads `daily.state.maxGuesses` + `daily.guessesUsed`); the hint button now lives by the input (Task 5 reads `daily.hint`/`daily.canHint`/`daily.hintsRemaining`); the solved/lost result is the specimen's solved state (it reveals the target on a loss). Share is removed (spec §8); `share.ts` stays on disk. `TaxonCard`, `buildShareText`, `DAILY_MAX_GUESSES`, and the `copied`/`share` logic are no longer needed here.

- [ ] **Step 2: Slim `Practice.svelte`**

Replace the contents of `src/lib/game/components/Practice.svelte` with:

```svelte
<script lang="ts">
  import { game } from "../gameStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
</script>

<main class="practice">
  <GameBoard
    store={game}
    disabled={game.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
    onnew={() => game.newRound()}
  />
</main>
```

Notes: `disabled` now uses `!== "playing"` (was `=== "won"`); practice can only reach `"won"` (its `maxGuesses` is `null`), so this is equivalent and future-proof. The "New round" button now lives in the specimen's solved state (via `onnew`); the top-of-screen `New round` button and `RevealCard` are gone.

- [ ] **Step 3: Delete `RevealCard.svelte` and confirm no importers**

Run: `grep -rn "RevealCard" src/`
Expected: no matches (Practice no longer imports it). Then:

```bash
git rm src/lib/game/components/RevealCard.svelte
```

- [ ] **Step 4: Verify types, svelte-check, build, and full test suite**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build && npm run test`
Expected: tsc no output; svelte-check 0 errors; build succeeds; full Vitest suite passes (share.ts tests still pass — the module is retained). If svelte-check reports `CluePanel.svelte` as unused, that's not an error; leave it (a later cleanup can remove it — it is out of scope here).

- [ ] **Step 5: Manually verify the unified end state**

Run `npm run dev`. In **Practice**: solve a round → confirm the specimen shows the answer name, the guess count, an "Explore around [answer] ▸" button, and a "New round" button; click "New round" → board resets. Click "Explore around …" → the app switches to the Explore tab focused on that taxon. In **Daily**: confirm the budget shows in the trail (e.g. `0/20`), the Hint button sits by the input, and (if you exhaust guesses or win) the specimen resolves to the solved state with no separate result section and no Share button.
Note how far you drove it (background/timeout dev server; stop it after — never let it block).
Expected: one unified solved specimen for both modes; budget in trail; hint by input; no Share.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/Daily.svelte src/lib/game/components/Practice.svelte
git commit -m "feat: unify end state on the specimen; drop inline result, RevealCard, and Share button"
```

---

### Task 7: Explore — back-to-game affordance (no tree changes)

Give Explore a way back to the game (spec §2 "two entry paths" implies a return path), and confirm it still surfaces no `playable` markers and searches the full pool. The contextual "explore around [answer]" focus already works via `nav.exploreAround` → `explorer.jumpTo` (Task 3/6). Do NOT touch the Explore tree (`TreeView`/`layout.ts`).

**Files:**
- Modify: `src/lib/explorer/components/Explorer.svelte`

**Interfaces:**
- Consumes: `nav` (Task 3, `set`).

- [ ] **Step 1: Add a back-to-game button to Explore's header**

In `src/lib/explorer/components/Explorer.svelte`, add the import:

```ts
  import { nav } from "../../nav.svelte";
```

Change the header from:

```svelte
  <header><h1>Explore</h1></header>
```

to:

```svelte
  <header>
    <button type="button" onclick={() => nav.set("daily")}>← Back to game</button>
    <h1>Explore</h1>
  </header>
```

Leave everything else in the file unchanged — in particular the `<SearchBox entries={taxa} …>` (full-pool search) and the `<TreeView …>` block (faithful cladogram, no playable markers) stay exactly as they are.

- [ ] **Step 2: Confirm Explore exposes no playable subset**

Run: `grep -n "playable\|playableGenera" src/lib/explorer/components/Explorer.svelte src/lib/explorer/explorer-core.ts`
Expected: no matches (Explore's search source is `searchSource(treeStore)` = all nodes; it never references the playable pool). If any match appears, STOP and report it — surfacing playability in Explore violates spec §2.

- [ ] **Step 3: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/explorer/components/Explorer.svelte
git commit -m "feat: back-to-game button in Explore (no tree changes, no playable markers)"
```

---

### Task 8: Responsive — collapse the specimen to a bottom bar on narrow screens

On narrow screens, the tree fills the flexible middle and the specimen + input peg to the bottom (spec §7). Structural CSS only — a media query that restacks the existing regions; no new components, no palette/type. Orientation is preserved (the tree never rotates; it keeps horizontal scroll).

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`
- Modify: `src/lib/game/components/Specimen.svelte`

**Interfaces:** No API changes — CSS only.

- [ ] **Step 1: Add the responsive restack to `GameBoard.svelte`**

In `src/lib/game/components/GameBoard.svelte`, add to the existing `<style>` block (do not remove the existing rules):

```css
  /* Narrow screens: tree fills the middle; specimen drops below it, above the pegged input. */
  @media (max-width: 640px) {
    .middle {
      flex-direction: column;
    }
    .middle :global(.tree-scroll) {
      width: 100%;
    }
  }
```

- [ ] **Step 2: Add the compact-bar layout to `Specimen.svelte`**

In `src/lib/game/components/Specimen.svelte`, add to the existing `<style>` block (do not remove the existing rules):

```css
  /* Narrow screens: the rail becomes a full-width compact bar (single row where it fits). */
  @media (max-width: 640px) {
    .specimen {
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.75rem;
    }
  }
```

- [ ] **Step 3: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors; build succeeds.

- [ ] **Step 4: Manually verify the responsive collapse**

Run `npm run dev`. Make a couple of guesses in Practice, then narrow the browser (or use devtools device emulation) below 640px. Confirm: the tree still scrolls horizontally (orientation unchanged — root left, deeper right); the specimen sits below the tree as a full-width bar; the input/hint remain reachable at the bottom. Widen again → the specimen returns to the right rail.
Note how far you drove it (background/timeout dev server; stop it after).
Expected: two-column desktop ↔ stacked narrow layout, tree never rotates.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte src/lib/game/components/Specimen.svelte
git commit -m "feat: responsive collapse — specimen to bottom bar on narrow screens"
```

---

## Self-Review

**1. Spec coverage (spec §2–§9):**
- §2 nav (wordmark + three modes; budget not in header; Explore wide-open, no playable markers, back path + contextual jump) → Task 3 (header + nav store), Task 7 (back button + no-playable check), Task 6 (`exploreAround` jump).
- §3A header → Task 3. §3B trail (crumb name+count, click-to-pan, budget at trail, not a warmth channel) → Task 4 (scrubber + budget) + Task 5 (wires `onpan`→`panTo`, `budget`). §3C tree + specimen right-rail (spine unchanged from Plan 1; specimen fixed rail) → Task 2 + Task 5. §3D bottom input + subordinate guess history + hint by input, no Share → Task 5 (regions) + Task 6 (Share removed).
- §4 warmth de-dup (specimen primary; tree spatial; guess history per-guess; trail structural) → specimen is the primary reading (Task 2/5); guess history keeps its per-guess warmth (untouched `GuessList`); trail keeps counts as structural (Task 4 comment/constraint).
- §5 specimen three states + count-only terminal (playable ≤7 count per user decision) + solved (answer + count + explore) + end-state unification (won and lost, loss reveals answer) → Task 1 (`specimenState`, `playableDescendantCount`) + Task 2 (render) + Task 6 (unify).
- §6 hints grow the spine → mechanics unchanged (Daily store `hint()`); the hint button reframed by position (by the input, Task 5). Spine growth is already how a hint reveals the next lineage node (Plan 1 + `applyHint`); no code change needed.
- §7 responsive (tree fills middle; specimen+input peg bottom; orientation preserved) → Task 8. Guess-history mobile placement is explicitly a deferred §8 open item — not built here.
- §8 out of scope (share unsurfaced but retained; dark theme; Explore pan/zoom; unplayable markers stay off) → Share button removed / `share.ts` kept (Task 6); no playable markers added (Task 7); the rest untouched.
- §9 mapping → App (Task 3), WarmestTrail (Task 4), Specimen folding in CluePanel (Task 2/5), GameBoard recomposition (Task 5), GuessList share removed (Task 6), RevealCard + Daily inline result replaced (Task 6), Explorer back-to-game + no markers (Task 7), share.ts retained (Task 6). `TreeView.svelte`/`layout.ts` correctly untouched (game already uses `SpineTree` from Plan 1).

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code and test step is complete. ✅

**3. Type consistency:** `SpecimenState` (Task 1) is imported by `Specimen.svelte` (Task 2) and produced by `specimenState` used in `GameBoard` (Task 5). `Specimen` props `{specimen, clue, onexplore?, onnew?}` (Task 2) match `GameBoard`'s usage (Task 5). `WarmestTrail` props `{warmestId, onpan?, budget?}` (Task 4) match `GameBoard`'s usage (Task 5). `SpineTree.panTo(id: string)` (Plan 1) is called via `ReturnType<typeof SpineTree>` ref (Task 5, pattern verified against svelte-check). `nav` API `{tab, set, exploreAround}` (Task 3) matches App (Task 3), Daily/Practice (Task 6), Explorer (Task 7). The expanded `GameBoard` store contract (optional `canHint`/`hint`/`hintsRemaining`/`guessesUsed`) is satisfied by the `daily` store and safely absent on the `game` store. ✅
