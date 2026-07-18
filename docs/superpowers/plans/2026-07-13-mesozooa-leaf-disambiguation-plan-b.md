# Leaf Disambiguation Plan B — Clue Mechanic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player's warmth bottoms out at the target's terminal clade, auto-reveal the target's paleo clue (when it lived + where it was found) so the ≤7-sibling endgame becomes a deduction instead of a blind check-off.

**Architecture:** A pure selector `terminalClueActive(state, store)` in `engine-core` decides *when* the clue fires (warmest shared clade has reached the terminal clade). A tiny data loader `clue.ts` supplies the clue payload from the already-committed `genus-attributes.json`. Both stores (`gameStore`, `dailyStore`) expose a `clue` getter composing the two; a new `CluePanel.svelte` renders it in `GameBoard` next to the warmest trail. A `DAILY_MAX_GUESSES` config constant replaces the scattered `20` literals.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for pure logic; existing pure tree lib (`terminalClade`) and game engine.

## Global Constraints

- **One tree, one source of truth.** The clue trigger is a comparison of existing node objects (warmest shared node vs. terminal-clade node); do NOT introduce a parallel rank/clade representation.
- **`verbatimModuleSyntax` is ON.** All type-only imports MUST use `import type`. Vitest does not catch violations — run `npx tsc --noEmit` and `npx svelte-check` before every commit that touches types or `.svelte` files.
- **Function first; defer look-and-feel.** `CluePanel` ships structurally correct and visually minimal. No aesthetic polish — that is the later dedicated pass.
- **Pure logic is TDD-tested; Svelte components are validated by `npx tsc --noEmit` + `npx svelte-check` + `npm run build` (and a manual run).**
- **Reuse the existing `GenusAttribute` type** from `src/lib/attributes.ts` — do NOT define a new clue type.
- **CAP/pool is unchanged.** The game already reads the 674-genus `playable` flag; Plan B adds only the trigger + panel + budget config. No data rebuild.
- **Frequent commits:** one commit per task.

---

## File Structure

- `src/lib/game/engine-core.ts` — **Modify.** Add `DAILY_MAX_GUESSES` constant; add pure `terminalClueActive(state, store)` selector; use the constant as `newDailyState`'s default.
- `src/lib/game/engine-core.test.ts` — **Modify.** Add tests for `terminalClueActive` and the new default.
- `src/lib/game/clue.ts` — **Create.** Loads `genus-attributes.json`; exports `clueFor(id): GenusAttribute | null`.
- `src/lib/game/clue.test.ts` — **Create.** Tests `clueFor` against real committed data.
- `src/lib/game/gameStore.svelte.ts` — **Modify.** Add `get clue()`.
- `src/lib/game/dailyStore.svelte.ts` — **Modify.** Add `get clue()`.
- `src/lib/game/components/CluePanel.svelte` — **Create.** Renders a `GenusAttribute | null`.
- `src/lib/game/components/GameBoard.svelte` — **Modify.** Extend the `store` prop type with `clue`; render `<CluePanel>` after `<WarmestTrail>`.
- `src/lib/game/share.ts` — **Modify.** Replace the `?? 20` literal with `DAILY_MAX_GUESSES`.
- `src/lib/game/components/Daily.svelte` — **Modify.** Replace the `?? 20` literal with `DAILY_MAX_GUESSES`.
- `CLAUDE.md` — **Modify.** Move Plan B from "What's next" to "Status" (final task).

**Reused unchanged:** `src/lib/tree/terminal.ts` (`terminalClade`), `src/lib/attributes.ts` (`GenusAttribute`), `src/lib/game/warmth.ts`, `src/data/genus-attributes.json`.

**Fixture facts** (from `src/lib/tree/fixture.ts`, used by the tests below) — descendant-genus counts after Neornithes pruning: `Q430` Dinosauria = 4 (TR, TB, LO, TC), `T` Theropoda = 3, `TF` Tyrannosauridae = 2 (TR, TB), `O`/`CF` = 1, genera = 1.
- Target **TR** (Tyrannosaurus): `terminalClade(TR) = TF` (count 2), terminal set `{TR, TB}` — the clean two-sibling case used for trigger tests.
- Target **TC** (Triceratops): `terminalClade(TC) = Q430` (TC is the only genus in its whole Ornithischia subtree) — a degenerate case; avoid it for trigger tests.

---

### Task 1: Guess-budget config constant

Extract the daily guess budget into one named constant so it is a single tunable dial (spec §4 "guess-budget-as-config", §7 tuning deferred).

**Files:**
- Modify: `src/lib/game/engine-core.ts` (near `MAX_HINTS`, and `newDailyState`)
- Modify: `src/lib/game/engine-core.test.ts`
- Modify: `src/lib/game/share.ts:13`
- Modify: `src/lib/game/components/Daily.svelte:23`

**Interfaces:**
- Produces: `export const DAILY_MAX_GUESSES = 20;` in `engine-core.ts`. `newDailyState(target: string, maxGuesses?: number): GameState` defaults to `DAILY_MAX_GUESSES`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/engine-core.test.ts` (extend the existing import from `./engine-core` to include `DAILY_MAX_GUESSES`):

```ts
describe("DAILY_MAX_GUESSES", () => {
  it("is the default budget for a daily state", () => {
    expect(DAILY_MAX_GUESSES).toBe(20);
    expect(newDailyState("TC").maxGuesses).toBe(DAILY_MAX_GUESSES);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t "DAILY_MAX_GUESSES"`
Expected: FAIL — `DAILY_MAX_GUESSES` is not exported (`undefined`).

- [ ] **Step 3: Add the constant and use it as the default**

In `src/lib/game/engine-core.ts`, add beside `MAX_HINTS`:

```ts
export const DAILY_MAX_GUESSES = 20;
```

Change the `newDailyState` signature default from `maxGuesses = 20` to:

```ts
export function newDailyState(target: string, maxGuesses = DAILY_MAX_GUESSES): GameState {
  return { target, guesses: [], status: "playing", mode: "daily", maxGuesses, hintsUsed: 0 };
}
```

- [ ] **Step 4: Replace the two remaining literals**

In `src/lib/game/share.ts`, add `import { DAILY_MAX_GUESSES } from "./engine-core";` (merge with any existing engine-core import) and change line 13:

```ts
const cap = state.maxGuesses ?? DAILY_MAX_GUESSES;
```

In `src/lib/game/components/Daily.svelte`, add to the `<script>` block:

```ts
import { DAILY_MAX_GUESSES } from "../engine-core";
```

and change the header span:

```svelte
<span class="budget">{daily.guessesUsed}/{daily.state.maxGuesses ?? DAILY_MAX_GUESSES}</span>
```

- [ ] **Step 5: Verify tests, types, and svelte-check pass**

Run: `npx vitest run src/lib/game/engine-core.test.ts && npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json`
Expected: all tests PASS; tsc no output; svelte-check 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts src/lib/game/share.ts src/lib/game/components/Daily.svelte
git commit -m "refactor: extract DAILY_MAX_GUESSES config constant"
```

---

### Task 2: `terminalClueActive` pure trigger selector

The clue fires when the warmest shared clade has reached (or, via hints, dipped below) the target's terminal clade. Comparing **descendant-genus counts** (rather than strict node-id equality with `terminalClade`, as spec §4 phrases it) is a deliberate strengthening: a `hint` can reveal a monotypic node *below* the terminal clade, and the player is then even warmer and still deserves the clue. Because `warmestSharedNodeId` is always an ancestor of the target, a count `<=` the terminal clade's count can only be the terminal clade itself or a monotypic node on the target's lineage — exactly the "bottomed-out" region.

**Files:**
- Modify: `src/lib/game/engine-core.ts`
- Modify: `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Consumes: `warmestSharedNodeId(state, store)` and `TreeStore` (already in this file); `terminalClade(tree, id)` from `../tree/terminal`; `store.data`, `store.getNode(id)!.descendantGenusCount`.
- Produces: `export function terminalClueActive(state: GameState, store: TreeStore): boolean` — `true` iff `state.status === "playing"`, there is at least one guess, and the warmest shared node's `descendantGenusCount <= terminalClade(state.target)`'s count.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/game/engine-core.test.ts` (extend the `./engine-core` import to include `terminalClueActive`):

```ts
describe("terminalClueActive", () => {
  it("is inactive before any guess", () => {
    expect(terminalClueActive(practice("TR"), store)).toBe(false);
  });
  it("is inactive while the warmest clade is above the terminal clade", () => {
    // guess TC: mrca(TC,TR)=Q430 (count 4) > terminalClade(TR)=TF (count 2)
    const s = applyGuess(practice("TR"), "TC", store, warmth);
    expect(terminalClueActive(s, store)).toBe(false);
  });
  it("is active when the warmest clade equals the terminal clade", () => {
    // guess TB: mrca(TB,TR)=TF == terminalClade(TR)
    const s = applyGuess(practice("TR"), "TB", store, warmth);
    expect(terminalClueActive(s, store)).toBe(true);
  });
  it("stays active once a later guess drops warmth to the terminal clade", () => {
    let s = applyGuess(practice("TR"), "TC", store, warmth); // warmest Q430 -> inactive
    s = applyGuess(s, "TB", store, warmth); // warmest now TF -> active
    expect(terminalClueActive(s, store)).toBe(true);
  });
  it("is active when a hint drives warmth below the terminal clade", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TC", store, warmth); // warmest Q430 (4)
    s = applyHint(s, store, warmth); // -> T (3)
    s = applyHint(s, store, warmth); // -> TF (2) == terminal
    s = applyHint(s, store, warmth); // -> TR (1) < terminal
    expect(warmestSharedNodeId(s, store)).toBe("TR");
    expect(terminalClueActive(s, store)).toBe(true);
  });
  it("is inactive once the game is no longer playing", () => {
    const won = applyGuess(practice("TR"), "TR", store, warmth); // status "won"
    expect(won.status).toBe("won");
    expect(terminalClueActive(won, store)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t "terminalClueActive"`
Expected: FAIL — `terminalClueActive is not a function`.

- [ ] **Step 3: Implement the selector**

In `src/lib/game/engine-core.ts`, add the import at the top:

```ts
import { terminalClade } from "../tree/terminal";
```

and add the function (e.g. after `warmestSharedNodeId`):

```ts
// True once warmth has bottomed out at (or, via hints, below) the target's terminal clade —
// the moment the paleo clue should surface. Count-based, so a hint that reveals a monotypic
// node below the terminal clade still counts as "bottomed out".
export function terminalClueActive(state: GameState, store: TreeStore): boolean {
  if (state.status !== "playing") return false;
  const warmestId = warmestSharedNodeId(state, store);
  if (warmestId === null) return false;
  const terminalId = terminalClade(store.data, state.target);
  const warmestCount = store.getNode(warmestId)!.descendantGenusCount;
  const terminalCount = store.getNode(terminalId)!.descendantGenusCount;
  return warmestCount <= terminalCount;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/engine-core.test.ts && npx tsc --noEmit`
Expected: all engine-core tests PASS (now 25+); tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat: terminalClueActive trigger for the endgame paleo clue"
```

---

### Task 3: Clue data loader

Load the committed per-genus attributes and expose a single lookup. Mirrors `treeData.ts` (module-singleton JSON import), keeping the real JSON out of the pure engine.

**Files:**
- Create: `src/lib/game/clue.ts`
- Create: `src/lib/game/clue.test.ts`

**Interfaces:**
- Consumes: `GenusAttributes` / `GenusAttribute` from `../attributes`; `src/data/genus-attributes.json`.
- Produces: `export function clueFor(id: string): GenusAttribute | null` — the genus's attributes, or `null` if absent.

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/clue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clueFor } from "./clue";

describe("clueFor", () => {
  it("returns the attributes for a genus that has them", () => {
    // Q100196 is present in the committed genus-attributes.json.
    const clue = clueFor("Q100196");
    expect(clue).not.toBeNull();
    expect(clue!.discoveryLocation).toBe("Germany");
    expect(clue!.ageLabel).toBe("Tithonian-Barremian");
  });
  it("returns null for an unknown id", () => {
    expect(clueFor("not-a-real-id")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/clue.test.ts`
Expected: FAIL — cannot find module `./clue`.

- [ ] **Step 3: Implement the loader**

Create `src/lib/game/clue.ts`:

```ts
import type { GenusAttribute, GenusAttributes } from "../attributes";
import attrsJson from "../../data/genus-attributes.json";

const attrs = attrsJson as GenusAttributes;

// The paleo clue for a genus id, or null if none was harvested. (Every playable genus has one
// — guaranteed by the Plan A clue-eligibility filter — but callers should still handle null.)
export function clueFor(id: string): GenusAttribute | null {
  return attrs[id] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/clue.test.ts && npx tsc --noEmit`
Expected: both tests PASS; tsc no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/clue.ts src/lib/game/clue.test.ts
git commit -m "feat: clueFor loader over genus-attributes.json"
```

---

### Task 4: CluePanel + store getters + GameBoard wiring

Surface the clue in the UI for both Daily and Practice. Component is validated by types/svelte-check/build + a manual run (no Vitest — Svelte component per the working agreements).

**Files:**
- Modify: `src/lib/game/gameStore.svelte.ts`
- Modify: `src/lib/game/dailyStore.svelte.ts`
- Create: `src/lib/game/components/CluePanel.svelte`
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `terminalClueActive(state, store)` (Task 2), `clueFor(id)` (Task 3), `GenusAttribute` type.
- Produces: both stores gain `get clue(): GenusAttribute | null`. `GameBoard`'s `store` prop type gains `clue: GenusAttribute | null`. `CluePanel` prop: `{ clue: GenusAttribute | null }`.

- [ ] **Step 1: Add the `clue` getter to `gameStore.svelte.ts`**

Extend the imports:

```ts
import { applyGuess, newRoundState, warmestSharedNodeId, revealedNodeIds, terminalClueActive } from "./engine-core";
import { clueFor } from "./clue";
import type { GenusAttribute } from "../attributes";
```

Add the getter inside the returned object (e.g. after `revealed`):

```ts
    get clue(): GenusAttribute | null {
      return terminalClueActive(state, treeStore) ? clueFor(state.target) : null;
    },
```

- [ ] **Step 2: Add the identical `clue` getter to `dailyStore.svelte.ts`**

Extend the `./engine-core` import to include `terminalClueActive`, and add:

```ts
import { clueFor } from "./clue";
import type { GenusAttribute } from "../attributes";
```

Add the getter inside the returned object (e.g. after `revealed`):

```ts
    get clue(): GenusAttribute | null {
      return terminalClueActive(state, treeStore) ? clueFor(state.target) : null;
    },
```

- [ ] **Step 3: Create `CluePanel.svelte`**

Create `src/lib/game/components/CluePanel.svelte`:

```svelte
<script lang="ts">
  import type { GenusAttribute } from "../../attributes";

  let { clue }: { clue: GenusAttribute | null } = $props();
</script>

{#if clue}
  <aside class="clue" aria-label="Paleo clue">
    <span class="clue-label">Clue</span>
    {#if clue.ageLabel}
      <span class="clue-field"
        >Lived: {clue.ageLabel}{#if clue.ageStartMa != null && clue.ageEndMa != null} (~{clue.ageStartMa}–{clue.ageEndMa} Ma){/if}</span
      >
    {/if}
    {#if clue.discoveryLocation}
      <span class="clue-field">Found in: {clue.discoveryLocation}</span>
    {/if}
  </aside>
{/if}
```

- [ ] **Step 4: Wire `CluePanel` into `GameBoard.svelte`**

Add the import beside the other component imports:

```ts
  import CluePanel from "./CluePanel.svelte";
```

Extend the `store` prop type to include `clue`:

```ts
    store: {
      state: GameState;
      warmestId: string | null;
      revealed: Set<string>;
      clue: GenusAttribute | null;
      guess: (id: string) => void;
    };
```

Add the type import to the same `<script>` block:

```ts
  import type { GenusAttribute } from "../../attributes";
```

Render the panel immediately after the warmest trail:

```svelte
<WarmestTrail warmestId={store.warmestId} />
<CluePanel clue={store.clue} />
```

- [ ] **Step 5: Verify types, svelte-check, and build**

Run: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json && npm run build`
Expected: tsc no output; svelte-check 0 errors, 0 warnings; `vite build` succeeds.

- [ ] **Step 6: Manually verify the clue appears (verification-before-completion)**

Run: `npm run dev`, open the app, go to **Practice**. Guess dinosaurs until the warmest-trail count stops shrinking (you've reached a terminal clade — e.g. keep guessing tyrannosaurs). Confirm the **Clue** panel appears under the trail showing the target's age and/or location, and that it is *absent* earlier when warmth is still high. Repeat once in **Daily**.
Expected: clue panel shows exactly at the terminal-clade moment in both modes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/gameStore.svelte.ts src/lib/game/dailyStore.svelte.ts src/lib/game/components/CluePanel.svelte src/lib/game/components/GameBoard.svelte
git commit -m "feat: reveal the paleo clue panel at the terminal clade (Daily + Practice)"
```

---

### Task 5: Update project docs

Record Plan B as built (CLAUDE.md tracks live status).

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Move Plan B to Status**

In `CLAUDE.md`, under **## Status**, add a bullet:

```markdown
- **Leaf-disambiguation Plan B (clue mechanic)** — `terminalClueActive` fires when the warmest
  shared clade reaches the target's terminal clade; a `CluePanel` then auto-reveals the target's
  paleo clue (age + discovery location) from `genus-attributes.json`, in Daily and Practice.
  Guess budget is now the `DAILY_MAX_GUESSES` config constant.
```

Under **## What's next**, delete the "Leaf-disambiguation Plan B" bullet (now done); leave the "Look-and-feel pass" bullet, and note that the clue panel's styling belongs to it.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark leaf-disambiguation Plan B (clue mechanic) as built"
```

---

## Self-Review

**1. Spec coverage (spec §4 + §6 Plan B):**
- "Trigger when warmest shared clade equals terminal clade" → Task 2 (`terminalClueActive`), strengthened to `<=` count for the hint edge case (documented).
- "Auto-reveal clue, both fields together when present, either alone otherwise" → Task 4 `CluePanel` (independent `{#if ageLabel}` / `{#if discoveryLocation}` blocks).
- "Not a spent hint / deduction tiebreaker" → clue is a derived getter; it consumes no guess and does not mutate state.
- "Every playable genus has ≥1 clue field" → verified: all 674 attribute entries have age and/or location; `clueFor` still handles `null` defensively.
- "Applies to Daily and Practice" → getter added to both stores; panel rendered in shared `GameBoard`.
- "Renders in a small panel near the warmest trail; styling deferred" → placed directly after `<WarmestTrail>`, minimal markup, no polish.
- "Guess-budget-as-config" (§4/§6) → Task 1 `DAILY_MAX_GUESSES`.
- "No pool change; reads existing `playable` flag" → no data/build changes; confirmed in Global Constraints.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code and test step shows complete content. ✅

**3. Type consistency:** `terminalClueActive(state, store)` signature identical across Tasks 2/4. `clueFor(id): GenusAttribute | null` identical across Tasks 3/4. `store.clue: GenusAttribute | null` matches the getter return type and `CluePanel`'s prop. `GenusAttribute` imported from `../attributes` everywhere (reused, not redefined). `DAILY_MAX_GUESSES` from `./engine-core` in all consumers. ✅
