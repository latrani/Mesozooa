# Responsive Phone Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mesozooa a designed phone-portrait layout (issue #12) derived from the settled desktop IA, replacing the four placeholder `max-width: 640px` scraps.

**Architecture:** One breakpoint at 640px; desktop is untouched. Phone becomes a locked `100dvh` shell with three bands: input cluster pegged top, tree owning the middle, and the specimen plaque as a two-height bottom sheet (peek / expanded). Guess chips truncate editorially to Latest + Warmest + an overflow count. Where behavior (not just styling) differs by viewport, components read a single shared `viewport.isPhone` rune rather than each running their own `matchMedia`.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite, Vitest for pure logic, plain CSS with the two-layer token system in `src/lib/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-07-22-responsive-phone-layout-design.md`

## Global Constraints

- **Breakpoint is 640px, and there is only one.** Phone rules use `@media (max-width: 640px)`; desktop rules use `@media (min-width: 641px)`. Do not introduce a third tier.
- **Desktop behavior and appearance must not change.** Any diff that alters the ≥641px rendering is a defect.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Vitest does NOT catch violations.
- **Before every commit run:** `npx tsc --noEmit`, `npx svelte-check`, and `npm test`. All three must be clean.
- **No em-dashes in user-facing UI copy.** (Fine in code comments and docs. En-dash ranges are always fine.)
- **No dark theme.** Do not add `prefers-color-scheme` rules.
- **Colors come from `src/lib/styles/tokens.css`.** Do not hand-pick hex values in components.
- **Commits reference the issue** (`... (#12)`) and are left **unpushed**. Indi pushes.
- **`npm run build:data` must NOT be run** by any task in this plan. It regenerates committed data from machine-local raws and will silently degrade output.

---

### Task 1: Shared viewport rune

`BoardLayout.svelte` currently runs its own `matchMedia` to decide desktop vs narrow. Tasks 4, 6, 8 and 9 all need the same signal, so extract it once before anything else duplicates it.

**Files:**
- Create: `src/lib/viewport.svelte.ts`
- Modify: `src/lib/game/components/BoardLayout.svelte:10-24`

**Interfaces:**
- Consumes: nothing.
- Produces: `viewport.isPhone: boolean` — a reactive module singleton, `true` at ≤640px. Import as `import { viewport } from "../../viewport.svelte";` (adjust depth per consumer).

- [ ] **Step 1: Create the rune module**

Create `src/lib/viewport.svelte.ts`:

```ts
// One source of truth for "are we on the phone layout". Components that only need to LOOK
// different use a CSS media query; this is for the cases where BEHAVIOR differs (which chips
// get selected, whether the plaque is a sheet, whether the tree opens zoomed out).
//
// Module singleton: the listener lives for the app's lifetime by design, so there is nothing
// to tear down and every consumer observes the same boolean.
const QUERY = "(max-width: 640px)";

function createViewport() {
  // SSR/test-safe default: no matchMedia means treat it as desktop, matching BoardLayout's
  // previous behavior.
  let isPhone = $state(typeof matchMedia !== "undefined" && matchMedia(QUERY).matches);

  if (typeof matchMedia !== "undefined") {
    const mq = matchMedia(QUERY);
    mq.addEventListener("change", () => (isPhone = mq.matches));
  }

  return {
    get isPhone() {
      return isPhone;
    },
  };
}

export const viewport = createViewport();
```

- [ ] **Step 2: Replace BoardLayout's private matchMedia**

In `src/lib/game/components/BoardLayout.svelte`, replace the whole `isDesktop` block (lines 12-24) with a read of the shared rune. The script becomes:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import { viewport } from "../../viewport.svelte";

  let { cluster, placard, tree }: {
    cluster: Snippet;
    placard: Snippet;
    tree: Snippet<[number]>;
  } = $props();

  // Measure the floating placard so the tree centers into the area LEFT of it; on phone it stacks
  // in flow, so no inset.
  let placardW = $state(0);
  // inset = placard width + its right offset (--space-5 = 24px) + a breathing gap before the tree
  let rightInset = $derived(!viewport.isPhone && placardW ? placardW + 24 + 24 : 0);
</script>
```

Leave the markup and all styles in that file untouched.

- [ ] **Step 3: Verify types and build**

Run: `npx tsc --noEmit && npx svelte-check && npm test`
Expected: all clean, no new errors.

- [ ] **Step 4: Verify desktop is unchanged**

Run: `npm run dev`, open the app at desktop width, play one Practice guess.
Expected: the tree still centers to the left of the floating placard exactly as before (this is the `rightInset` path). Resize the window across 640px and confirm the layout still swaps.

- [ ] **Step 5: Commit**

```bash
git add src/lib/viewport.svelte.ts src/lib/game/components/BoardLayout.svelte
git commit -m "refactor(layout): extract shared viewport.isPhone rune (#12)"
```

---

### Task 2: Shell foundations

The three global enablers for a locked phone shell. No visual redesign yet, so the app will look mostly the same; this is the substrate the later tasks stand on.

**Files:**
- Modify: `index.html:3`
- Modify: `src/lib/styles/base.css:11-19`
- Modify: `src/lib/game/components/SpineTree.svelte:947`

**Interfaces:**
- Consumes: nothing.
- Produces: a `#app` that is a locked flex column at every width.

- [ ] **Step 1: Add `interactive-widget` to the viewport meta**

In `index.html`, change the viewport meta content from:

```
width=device-width, initial-scale=1, viewport-fit=cover
```

to:

```
width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content
```

This makes the soft keyboard resize the layout viewport instead of scrolling it, which is what lets a top-pegged input stay put without any `visualViewport` tracking. Leave `viewport-fit=cover` alone — it is load-bearing for the WebKit window-chrome tint.

- [ ] **Step 2: Extend the locked shell to phone**

In `src/lib/styles/base.css`, replace the `@media (min-width: 641px)` block (lines 14-19) and its preceding comment with an unconditional version:

```css
/* Lock the app to the viewport at EVERY width and scroll WITHIN regions (tree, sheet), so the
   page itself never scrolls and interactive elements stay put. On phone this is what makes the
   input band and the plaque sheet stay pegged; the viewport meta's interactive-widget=resizes-content
   shrinks this shell when the soft keyboard opens rather than scrolling it out from under us. */
#app {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#app > .app-header { flex: 0 0 auto; }
#app > main { flex: 1 1 auto; min-height: 0; }
#app > .app-footer { flex: 0 0 auto; }
```

Keep the `#app { min-height: 100dvh; background: var(--bg-page); }` rule above it as-is; `height` here overrides the `min-height` intent without removing the background.

- [ ] **Step 3: Contain overscroll in the tree**

In `src/lib/game/components/SpineTree.svelte`, change the `.tree-scroll` rule (line 947) from:

```css
.tree-scroll { overflow-x: auto; overflow-y: hidden; max-width: 100%; touch-action: pan-x pan-y; }
```

to:

```css
/* overscroll-behavior: panning to the tree's edge must not scroll-chain to the page or trigger
   pull-to-refresh. touch-action stays pan-x pan-y: the browser handles one-finger panning
   natively while pinch goes through the gesturechange/wheel handlers below. */
.tree-scroll {
  overflow-x: auto; overflow-y: hidden; max-width: 100%;
  touch-action: pan-x pan-y; overscroll-behavior: contain;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Verify in a phone viewport**

Run: `npm run dev`, open devtools responsive mode at 390x844.
Expected: the page no longer scrolls as a document; the header stays pinned; dragging the tree to its left/right extreme does not bounce the whole page.

- [ ] **Step 6: Commit**

```bash
git add index.html src/lib/styles/base.css src/lib/game/components/SpineTree.svelte
git commit -m "feat(layout): lock the app shell at phone widths (#12)"
```

---

### Task 3: Phone chip selection (pure)

The editorial truncation: Latest + Warmest + a hidden count. Pure function, TDD.

**Files:**
- Modify: `src/lib/game/chip-view.ts`
- Test: `src/lib/game/chip-view.test.ts`

**Interfaces:**
- Consumes: `Chip` and `chipsFor` from `src/lib/game/chip-view.ts`.
- Produces:
  ```ts
  export interface PhoneChipSelection {
    shown: Chip[];          // render order: answer (if any), then latest, then warmest
    warmestChip: Chip | null; // identity match against a member of `shown`, or null
    hiddenCount: number;    // chips omitted; 0 means no overflow control
  }
  export function phoneChips(chips: Chip[], warmestNodeId: string | null): PhoneChipSelection
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/game/chip-view.test.ts`:

```ts
import { phoneChips } from "./chip-view";

describe("phoneChips", () => {
  it("returns nothing for an empty log", () => {
    const sel = phoneChips([], null);
    expect(sel.shown).toEqual([]);
    expect(sel.warmestChip).toBeNull();
    expect(sel.hiddenCount).toBe(0);
  });

  it("shows one chip when latest IS warmest, without backfilling a second", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, {});
    const sel = phoneChips(chips, "TF");
    expect(sel.shown).toHaveLength(1);
    expect(sel.warmestChip).toBe(sel.shown[0]);
    expect(sel.hiddenCount).toBe(0);
  });

  it("shows latest then warmest when they differ", () => {
    // chipsFor returns newest-first, so the LAST row given is chips[0].
    const chips = chipsFor(
      [row("guess", "TR", "TF"), row("guess", "AL", "Q430")],
      store,
      {},
    );
    const sel = phoneChips(chips, "TF");
    expect(sel.shown).toHaveLength(2);
    expect(sel.shown[0]).toBe(chips[0]); // latest = the Q430 guess
    expect(sel.warmestChip).toBe(sel.shown[1]);
    if (sel.shown[1].kind !== "guess") throw new Error("kind");
    expect(sel.shown[1].sharedNodeId).toBe("TF");
    expect(sel.hiddenCount).toBe(0);
  });

  it("counts every chip it omits", () => {
    const chips = chipsFor(
      [row("guess", "TR", "TF"), row("guess", "AL", "Q430"), row("guess", "ST", "Q430")],
      store,
      {},
    );
    const sel = phoneChips(chips, "TF");
    expect(sel.shown).toHaveLength(2);
    expect(sel.hiddenCount).toBe(chips.length - 2);
  });

  it("never picks a leafHint as warmest (it references no node)", () => {
    const chips = chipsFor([row("guess", "TR", "TF"), row("leafHint", "TR", "TF")], store, {});
    const sel = phoneChips(chips, "TF");
    expect(sel.shown[0].kind).toBe("leafHint"); // latest
    expect(sel.warmestChip).not.toBeNull();
    expect(sel.warmestChip!.kind).toBe("guess");
  });

  it("picks a branchHint as warmest when it revealed the warmest node", () => {
    const chips = chipsFor([row("guess", "AL", "Q430"), row("branchHint", "TF", "TF")], store, {});
    const sel = phoneChips(chips, "TF");
    expect(sel.warmestChip).not.toBeNull();
    expect(sel.warmestChip!.kind).toBe("branchHint");
  });

  it("pins the answer chip first at end state and still shows latest", () => {
    const chips = chipsFor([row("guess", "AL", "Q430")], store, {
      answerId: "TR",
      won: false,
      lastGuessFraction: 0.4,
    });
    const sel = phoneChips(chips, "Q430");
    expect(sel.shown[0].kind).toBe("answer");
    expect(sel.shown[1].kind).toBe("guess");
  });

  it("treats a null warmest node as no warmest chip", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, {});
    const sel = phoneChips(chips, null);
    expect(sel.warmestChip).toBeNull();
    expect(sel.shown).toHaveLength(1);
  });
});
```

Note: `row`, `store` and `chipsFor` already exist at the top of this test file. Node ids `TR`, `TF`, `AL`, `ST`, `Q430` come from `src/lib/tree/fixture.ts` — if any of `AL`/`ST` is not a valid genus in that fixture, substitute two other playable genus ids from it and keep the test intent identical.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/game/chip-view.test.ts`
Expected: FAIL — `phoneChips is not a function` / no exported member `phoneChips`.

- [ ] **Step 3: Implement `phoneChips`**

Append to `src/lib/game/chip-view.ts`:

```ts
export interface PhoneChipSelection {
  /** render order: answer (if present), then latest, then warmest */
  shown: Chip[];
  /** identity-equal to a member of `shown`, so the renderer can ring exactly one chip */
  warmestChip: Chip | null;
  /** how many chips were omitted; 0 means render no overflow control */
  hiddenCount: number;
}

// Phone truncation. NOT "the most recent N": the two chips that carry live meaning are the
// LATEST (feedback for the turn just taken) and the WARMEST (the anchor of the search, and the
// node the spine is centered on). Selecting by meaning is why the band can stay two rows tall
// without hiding anything the player is actually using.
//
// Deliberately does NOT backfill a second chip when latest IS warmest: a backfilled slot would
// silently redefine the pair as "top 2 guesses", a different and less honest claim.
export function phoneChips(chips: Chip[], warmestNodeId: string | null): PhoneChipSelection {
  const answer = chips.find((c) => c.kind === "answer") ?? null;
  const rest = chips.filter((c) => c.kind !== "answer");

  const latest = rest[0] ?? null;
  // leafHint carries no sharedNodeId, so it can never be warmest — which is correct: it spends
  // moves on the field clue and reveals no tree node.
  const warmest =
    warmestNodeId == null
      ? null
      : (rest.find(
          (c) =>
            (c.kind === "guess" || c.kind === "branchHint") && c.sharedNodeId === warmestNodeId,
        ) ?? null);

  const shown: Chip[] = [];
  if (answer) shown.push(answer);
  if (latest) shown.push(latest);
  if (warmest && warmest !== latest) shown.push(warmest);

  return { shown, warmestChip: warmest, hiddenCount: chips.length - shown.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/game/chip-view.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/chip-view.ts src/lib/game/chip-view.test.ts
git commit -m "feat(chips): phoneChips selects latest + warmest with an overflow count (#12)"
```

---

### Task 4: Phone chip band rendering

Render the selection, ring the warmest, and put the overflow behind a Modal (reusing the existing modal rather than inventing a second sheet).

**Files:**
- Modify: `src/lib/game/components/Chip.svelte`
- Modify: `src/lib/game/components/GuessList.svelte`
- Modify: `src/lib/game/components/GameBoard.svelte:121-126`

**Interfaces:**
- Consumes: `phoneChips` and `PhoneChipSelection` (Task 3); `viewport.isPhone` (Task 1); `Modal` from `src/lib/components/Modal.svelte`.
- Produces: `GuessList` gains a `warmestId?: string | null` prop. `Chip` gains a `warmest?: boolean` prop.

**Note on what a chip actually looks like:** despite the desktop spec's "warmth dot" language, the shipped chip is a pill *flooded* with its warmth color (`Chip.svelte`, `.chip.flood`), reading `Name shares Clade`. There is no dot. So the warmest marking must be a ring on the pill, and it must not be confusable with `.chip.answer`, which already uses a warmth-colored outer glow. Use a hard turquoise ring instead — turquoise is the app's interactive accent and reads as "this one", not "this is hot".

> **This ring is the provisional part of the design.** If it does not clearly distinguish the warmest chip once seen at 390px, the agreed fallback is eyebrow labels (`LATEST` / `WARMEST`) at a cost of roughly two extra lines. Do not spend long tuning it; build it, show it, expect notes.

- [ ] **Step 1: Add the warmest ring to the chip primitive**

In `src/lib/game/components/Chip.svelte`, add `warmest` to the props:

```svelte
  let {
    chip,
    onselect,
    animateIn = false,
    warmest = false,
  }: {
    chip: Chip;
    onselect: (nodeId: string) => void;
    /** guess list: fly each chip in as it lands. Static lists (recents) leave it off. */
    animateIn?: boolean;
    /** phone only: this chip is the warmest shared node, i.e. the node the spine is centered on. */
    warmest?: boolean;
  } = $props();
```

Add `class:warmest` to the `<li>`:

```svelte
<li
  class="chip chip-{chip.kind}"
  class:flood={floodColor != null}
  class:answer={chip.kind === "answer"}
  class:warmest
  style={floodColor != null ? `background: ${floodColor}; --glow: ${floodColor}` : ""}
  in:fly={{ y: -10, duration: animateIn ? 200 : 0 }}
>
```

And add the rule at the end of the `<style>` block:

```css
  /* Phone: the warmest chip wears the same ring vocabulary as the spine tip, so the chip and the
     tree node read as ONE object rather than two things that happen to agree. Turquoise (the
     interactive accent), NOT a warmth color — .chip.answer already owns the warmth-colored glow
     and the two must not be confusable. */
  .chip.warmest {
    box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--turq);
  }
  .chip.warmest.flood {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 14%, transparent),
                0 0 0 2px var(--bg-surface), 0 0 0 4px var(--turq);
  }
```

- [ ] **Step 2: Verify the ring does not leak to desktop**

Run: `npx svelte-check && npm run build`
Expected: clean. Nothing sets `warmest` yet, so desktop rendering is byte-identical.

- [ ] **Step 3: Render the phone selection in GuessList**

Replace the whole of `src/lib/game/components/GuessList.svelte` with:

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { chipsFor, phoneChips } from "../chip-view";
  import type { GuessResult } from "../types";
  import Chip from "./Chip.svelte";
  import Modal from "../../components/Modal.svelte";
  import { viewport } from "../../viewport.svelte";

  let {
    guesses,
    onselect,
    targetId = null,
    revealId = null,
    warmestId = null,
  }: {
    guesses: GuessResult[];
    onselect: (nodeId: string) => void;
    /** the winning guess — becomes the answer chip (won) */
    targetId?: string | null;
    /** the revealed answer on a LOSS — becomes the answer chip (lost) */
    revealId?: string | null;
    /** warmest shared node; on phone it selects and rings one chip. Desktop ignores it. */
    warmestId?: string | null;
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

  // Phone shows latest + warmest + a count; desktop shows the full list. Selection is pure
  // (chip-view), so this component stays a renderer.
  let selection = $derived(phoneChips(chips, warmestId));
  let visible = $derived(viewport.isPhone ? selection.shown : chips);
  let overflow = $derived(viewport.isPhone ? selection.hiddenCount : 0);

  let showAll = $state(false);

  // stable key per chip for the flex list / transitions
  function keyOf(c: ReturnType<typeof chipsFor>[number], i: number): string {
    if (c.kind === "answer") return "answer";
    if (c.kind === "leafHint") return `leaf-${i}`;
    return `${c.kind}-${c.nodeId}`;
  }
</script>

{#if visible.length}
  <ul class="chips">
    {#each visible as c, i (keyOf(c, i))}
      <Chip chip={c} {onselect} animateIn warmest={viewport.isPhone && c === selection.warmestChip} />
    {/each}
  </ul>
{/if}

{#if overflow > 0}
  <button type="button" class="overflow" onclick={() => (showAll = true)}>
    + {overflow} more
  </button>
{/if}

<Modal bind:open={showAll} title="Your guesses">
  <ul class="chips all-chips">
    {#each chips as c, i (keyOf(c, i))}
      <Chip
        chip={c}
        onselect={(id) => { showAll = false; onselect(id); }}
        warmest={c === selection.warmestChip}
      />
    {/each}
  </ul>
</Modal>

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-2);
    align-items: center; min-width: 0;
  }
  /* the overflow list reads as a column so long chips don't wrap into an unreadable brick */
  .all-chips { flex-direction: column; align-items: flex-start; }
  .overflow {
    background: none; border: 0; padding: 0; cursor: pointer;
    font-size: var(--type-label); font-weight: var(--fw-semibold);
    color: var(--btn-secondary-ink); align-self: flex-start;
    text-decoration: underline; text-underline-offset: 2px;
  }
</style>
```

Note the copy is `+ 3 more`, not `+ 3 more —` anything. No em-dashes in UI copy.

- [ ] **Step 4: Pass the warmest node in from GameBoard**

In `src/lib/game/components/GameBoard.svelte`, add the prop to the `<GuessList>` call (currently lines 121-126):

```svelte
    <GuessList
      guesses={store.state.guesses}
      targetId={won ? store.state.target : null}
      revealId={ended && !won ? store.state.target : null}
      warmestId={store.warmestId}
      onselect={(id) => { highlightId = id; spine?.panTo(id); }}
    />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: clean.

- [ ] **Step 6: Verify behavior at both widths**

Run: `npm run dev`. At desktop width, play four Practice guesses.
Expected: all four chips render, no ring, no `+ N more` control — identical to before.

Resize to 390px.
Expected: two chips (or one if latest is warmest), the warmest wearing a turquoise ring, and a `+ N more` control that opens a modal listing every chip. Tapping a chip in the modal closes it and pans the tree.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/Chip.svelte src/lib/game/components/GuessList.svelte src/lib/game/components/GameBoard.svelte
git commit -m "feat(chips): phone chip band with warmest ring and overflow modal (#12)"
```

---

### Task 5: The plaque bottom sheet primitive

A two-height sheet: a peek row that is always visible, and an expanded body. Tap toggles.

**Files:**
- Create: `src/lib/components/BottomSheet.svelte`

**Interfaces:**
- Consumes: nothing (pure presentational).
- Produces: a component with props
  ```ts
  {
    expanded?: boolean;   // $bindable
    peek: Snippet;        // the always-visible single row
    children: Snippet;    // the expanded body
    label?: string;       // accessible name, default "Specimen"
  }
  ```

**Scope note:** drag-to-expand is deliberately NOT implemented. Tap-to-toggle covers the whole interaction; a drag gesture sitting directly above the tree's own drag surface is exactly the gesture collision the spec warned about, and it should be added later only if tapping proves insufficient. File a follow-up issue rather than improvising it here.

- [ ] **Step 1: Create the component**

Create `src/lib/components/BottomSheet.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  // Phone-only chrome: the specimen plaque at two heights. PEEK is one row, always visible, so
  // the exhibit is never absent (the museum-fixture conceit the desktop spec established).
  // EXPANDED is the full card, scrolling internally so it can never grow past the shell.
  //
  // Tap toggles. There is deliberately no drag gesture: the tree directly above owns dragging,
  // and a second drag surface an inch away would collide.
  let {
    expanded = $bindable(false),
    peek,
    children,
    label = "Specimen",
  }: {
    expanded?: boolean;
    peek: Snippet;
    children: Snippet;
    label?: string;
  } = $props();

  const uid = $props.id();
  const bodyId = `sheet-body-${uid}`;
</script>

<aside class="sheet" class:expanded aria-label={label}>
  <button
    type="button"
    class="peek"
    aria-expanded={expanded}
    aria-controls={bodyId}
    onclick={() => (expanded = !expanded)}
  >
    <span class="peek-content">{@render peek()}</span>
    <span class="chevron" aria-hidden="true">{expanded ? "▾" : "▴"}</span>
  </button>

  {#if expanded}
    <div class="body" id={bodyId}>
      {@render children()}
    </div>
  {/if}
</aside>

<style>
  .sheet {
    flex: 0 0 auto;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border-top: 1px solid var(--specimen-edge);
    color: var(--specimen-text);
    --btn-secondary-ink: var(--cream);
    /* lifts off the tree canvas, matching the header's downward shadow */
    box-shadow: 0 -6px 16px -8px rgba(51, 38, 26, 0.35);
    z-index: 4;
    display: flex; flex-direction: column; min-height: 0;
  }
  /* the peek row IS the toggle: a full-width button carrying one line of specimen identity */
  .peek {
    display: flex; align-items: center; gap: var(--space-3);
    width: 100%; padding: var(--space-2) var(--space-4);
    background: none; border: 0; cursor: pointer;
    color: inherit; text-align: left;
  }
  .peek-content { display: flex; align-items: center; gap: var(--space-3); flex: 1 1 auto; min-width: 0; }
  .chevron { flex: none; opacity: .7; font-size: var(--type-label); }
  /* expanded body scrolls internally so the sheet can never push the tree out of the shell */
  .body {
    padding: 0 var(--space-4) var(--space-4);
    overflow-y: auto; overscroll-behavior: contain;
    max-height: 55dvh;
  }
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx svelte-check && npm run build`
Expected: clean. Nothing consumes it yet, so nothing renders differently.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/BottomSheet.svelte
git commit -m "feat(layout): add the two-height BottomSheet primitive (#12)"
```

---

### Task 6: Placard peek and expanded layouts

Replace the placeholder `max-width: 640px` grid in `SpecimenPlacard` with a real peek row, and delete the source of the #22 baseline jitter.

**Files:**
- Modify: `src/lib/game/components/SpecimenPlacard.svelte`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SpecimenPlacard` gains a `peek?: boolean` prop. When true it renders a single row: thumbnail + title + note. When false (the default) it renders exactly what it renders today.

- [ ] **Step 1: Add the peek prop and row**

In `src/lib/game/components/SpecimenPlacard.svelte`, change the props:

```svelte
  let { view, action, peek = false }: { view: SpecimenView; action?: Snippet; peek?: boolean } = $props();
```

Replace the whole `<aside>` markup with a peek branch plus the existing full card:

```svelte
{#if peek}
  <!-- One deliberate single line: fixed-size thumbnail, then title and note as a text column.
       This is what retires the #22 narrow-screen jitter — the old narrow layout was a grid
       vertically centering rows of mismatched height, so `align-items: baseline` shifted as
       content changed. A row with one fixed-height figure and one text column cannot jitter. -->
  <span class="peek-row">
    <span class="peek-thumb" class:empty={view.mount.kind !== "photo"}>
      {#if view.mount.kind === "photo"}
        <img class="photo" src={view.mount.url} alt="" />
      {/if}
    </span>
    <span class="peek-text">
      <span class="peek-title">{view.title ?? "? ? ?"}</span>
      {#if view.note}<span class="peek-note">{view.note}</span>{/if}
    </span>
  </span>
{:else}
  <aside class="specimen-placard" aria-label="Specimen">
    <h2 class="title">{view.title ?? "? ? ?"}</h2>

    <figure class="figure">
      <div class="shadowbox" class:empty={view.mount.kind !== "photo"}>
        {#if view.mount.kind === "photo"}
          <img class="photo" src={view.mount.url} alt={view.mount.alt} />
        {:else}
          <PaperSlip text={view.mount.text} tilt={view.mount.tilt} />
        {/if}
      </div>
      {#if view.mount.kind === "photo" && view.mount.credit}
        {@const credit = view.mount.credit}
        <figcaption class="credit">
          <span class="credit-author" title={credit.author ?? "Wikimedia Commons"}>{credit.author ?? "Wikimedia Commons"}</span>{#if credit.licenseShort}<span class="credit-license"> · {#if credit.licenseUrl}<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.licenseShort}</a>{:else}{credit.licenseShort}{/if}</span>{/if}
        </figcaption>
      {/if}
    </figure>

    {#if view.fields.length}
      <dl class="fields">
        {#each view.fields as f (f.label)}
          <div class="field">
            <dt>{f.label}</dt>
            <dd class:placeholder={f.value == null}>{f.value ?? "? ? ?"}{#if f.detail}<span class="detail">{f.detail}</span>{/if}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if view.note}<p class="note">{view.note}</p>{/if}

    {#if view.link}
      <a class="wiki" href={view.link.href} target="_blank" rel="noopener noreferrer">{view.link.label}</a>
    {/if}

    {@render action?.()}
  </aside>
{/if}
```

`aria-label="Specimen"` stays only on the full card; the peek row is inside `BottomSheet`'s labelled `<aside>`, so labelling it again would double-announce.

- [ ] **Step 2: Replace the narrow styles**

Delete the entire `@media (max-width: 640px)` block at the end of the file and replace it with the peek-row styles (unconditional — the peek row only renders when a consumer asks for it):

```css
  /* PEEK — the sheet's always-visible row. Fixed-height thumbnail + a text column; no grid,
     no vertical centering of mismatched rows, so there is nothing for the old #22 jitter to
     act on. */
  .peek-row { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
  .peek-thumb {
    flex: none; width: 56px; height: 42px; border-radius: 4px; overflow: hidden;
    background: radial-gradient(120% 120% at 50% 30%, #f3e6cf 0%, #e3cba6 100%);
    box-shadow: inset 0 2px 6px rgba(95,44,30,.45);
    border: 2px solid var(--specimen-edge);
  }
  .peek-thumb .photo { width: 100%; height: 100%; object-fit: cover; }
  .peek-text { display: flex; flex-direction: column; min-width: 0; }
  .peek-title {
    font-family: var(--font-head); font-size: var(--type-heading); font-weight: var(--fw-bold);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .peek-note {
    font-size: var(--type-label); color: var(--specimen-text-dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Inside the sheet the card is already on the specimen ground and full-bleed, so it drops its
     own frame, fixed width and shadow. */
  @media (max-width: 640px) {
    .specimen-placard {
      width: 100%; flex: 1 1 auto;
      background: none; border: 0; box-shadow: none; padding: 0;
    }
  }
```

- [ ] **Step 3: Verify desktop is untouched**

Run: `npx svelte-check && npm run build && npm run dev`
Expected: at desktop width the placard is pixel-identical to before (nothing passes `peek`, and the new `max-width: 640px` rule cannot apply).

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/components/SpecimenPlacard.svelte
git commit -m "feat(specimen): peek row layout, retiring the #22 narrow jitter (#12)"
```

---

### Task 7: Wire the phone stack in BoardLayout

Put the three bands together: input cluster pegged top, tree body, plaque sheet bottom.

**Files:**
- Modify: `src/lib/game/components/BoardLayout.svelte`

**Interfaces:**
- Consumes: `BottomSheet` (Task 5), `viewport.isPhone` (Task 1).
- Produces: `BoardLayout`'s `placard` snippet now receives one argument: `Snippet<[boolean]>` where the boolean is `peek`. Consumers (`GameBoard`, `Explorer`) must accept and forward it.

- [ ] **Step 1: Restructure BoardLayout**

Replace `src/lib/game/components/BoardLayout.svelte` entirely:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import { viewport } from "../../viewport.svelte";
  import BottomSheet from "../../components/BottomSheet.svelte";

  let { cluster, placard, tree, sheetExpanded = $bindable(false) }: {
    cluster: Snippet;
    /** rendered twice on phone (peek row + expanded card) and once on desktop; the flag says which */
    placard: Snippet<[boolean]>;
    tree: Snippet<[number]>;
    /** phone only: lets a consumer force the sheet open, e.g. GameBoard on end state */
    sheetExpanded?: boolean;
  } = $props();

  // Desktop measures the floating placard so the tree centers into the area LEFT of it. On phone
  // the placard is a bottom sheet in flow, so there is no inset.
  let placardW = $state(0);
  let rightInset = $derived(!viewport.isPhone && placardW ? placardW + 24 + 24 : 0);
</script>

<div class="board">
  <div class="cluster">
    <div class="cluster-main">
      {@render cluster()}
    </div>
    {#if !viewport.isPhone}
      <div class="specimen-float" bind:clientWidth={placardW}>
        {@render placard(false)}
      </div>
    {/if}
  </div>

  <div class="tree-body">
    {@render tree(rightInset)}
  </div>

  {#if viewport.isPhone}
    <BottomSheet bind:expanded={sheetExpanded}>
      {#snippet peek()}{@render placard(true)}{/snippet}
      {@render placard(false)}
    </BottomSheet>
  {/if}
</div>

<style>
  /* Shared board skeleton. Desktop: top cluster with a floating placard, tree owns the body.
     Phone: input band pegged top, tree owns the middle, plaque sheet pegged bottom. */
  .board { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  @media (min-width: 641px) {
    .board { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    .cluster {
      position: relative; flex: 0 0 auto;
      padding: var(--space-4);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    /* reserve room on the right so wrapping cluster content never slides under the floating placard */
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-4); padding-right: 22rem; }
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

  /* PHONE — three pegged bands. The cluster and the sheet are flex:0 0 auto so the tree body
     absorbs every remaining pixel; nothing here scrolls the document (base.css locks the shell). */
  @media (max-width: 640px) {
    .cluster {
      flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; width: 100%; }
    .tree-body :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
  }
</style>
```

- [ ] **Step 2: Update GameBoard's placard snippet signature**

In `src/lib/game/components/GameBoard.svelte`, change the snippet declaration (line 129) from `{#snippet placard()}` to:

```svelte
  {#snippet placard(peek: boolean)}
    <SpecimenPlacard view={specimenView(store.state, treeStore)} {peek}>
```

The rest of the snippet body is unchanged. The `action` snippet inside it renders only on end state, which the peek branch of `SpecimenPlacard` ignores.

- [ ] **Step 3: Update Explorer's placard snippet signature**

In `src/lib/explorer/components/Explorer.svelte`, change (line 61):

```svelte
    {#snippet placard(peek: boolean)}
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} {peek} />
      {/if}
    {/snippet}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: Verify both layouts**

Run: `npm run dev`.
At desktop width: identical to before — floating placard top-right, tree centering left of it.
At 390px: input band pegged top, tree filling the middle, a specimen peek row pegged at the bottom that expands to the full card on tap and collapses again. Switch to Explore and confirm the same sheet works there with a real taxon.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/BoardLayout.svelte src/lib/game/components/GameBoard.svelte src/lib/explorer/components/Explorer.svelte
git commit -m "feat(layout): phone board stack with the plaque as a bottom sheet (#12)"
```

---

### Task 8: End-state reveal

On phone, win/loss auto-raises the sheet instead of inflating the cluster, and the inline Daily stats move into the sheet.

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`

**Interfaces:**
- Consumes: `BoardLayout`'s `sheetExpanded` bindable (Task 7), `viewport.isPhone` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Bind and auto-raise the sheet**

In `src/lib/game/components/GameBoard.svelte`, add the import and state:

```svelte
  import { viewport } from "../../viewport.svelte";
```

and near the other derived state:

```svelte
  // Phone end state: the reveal RISES rather than the cluster inflating, because end state is
  // when the tree is most worth looking at (answer lineage revealed, every node an Explore link).
  // It stays dismissible for exactly that reason; the peek row re-opens it.
  let sheetExpanded = $state(false);
  $effect(() => {
    if (ended && viewport.isPhone) sheetExpanded = true;
  });
```

Change the opening tag to `<BoardLayout bind:sheetExpanded>`.

- [ ] **Step 2: Move the end-state extras into the placard on phone**

In the `cluster` snippet, gate the inline stats so they do not also render on phone (they move into the sheet below):

```svelte
      {#if store.state.mode === "daily" && !viewport.isPhone}
        <div class="end-stats"><StatsContent /></div>
      {/if}
```

Then in the `placard` snippet, render the result line and stats inside the expanded card via the existing `action` snippet, so they ride the sheet:

```svelte
  {#snippet placard(peek: boolean)}
    <SpecimenPlacard view={specimenView(store.state, treeStore)} {peek}>
      {#snippet action()}
        {#if ended && viewport.isPhone && store.state.mode === "daily"}
          <div class="end-stats"><StatsContent /></div>
        {/if}
        {#if ended && (onnew || onshare)}
          <div class="actions">
            {#if onshare}
              <button type="button" class="btn-secondary" onclick={() => onshare?.()}>Share</button>
            {/if}
            {#if onnew}
              <button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>
            {/if}
          </div>
        {/if}
      {/snippet}
    </SpecimenPlacard>
  {/snippet}
```

The result banner stays in the cluster at both widths: it is one line, it replaces the input row exactly (same height, by design), and duplicating it into the sheet would say the same thing twice.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: clean.

- [ ] **Step 4: Verify the end state at both widths**

Run: `npm run dev`. Play Practice to a win (use `#/practice/seed?taxon=<slug>` to pick an easy target).
At desktop width: banner in the cluster, stats inline, plaque top-right with Share / New round — unchanged.
At 390px: the sheet rises by itself showing the revealed specimen, stats and actions; collapsing it leaves the revealed tree with tappable Explore links; the peek row re-opens it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte
git commit -m "feat(game): phone end state raises the reveal sheet (#12)"
```

---

### Task 9: Explore recents cap

**Files:**
- Modify: `src/lib/explorer/components/Explorer.svelte:88-90`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Cap the trail to one line on phone**

In `src/lib/explorer/components/Explorer.svelte`, add to the `<style>` block:

```css
  /* Phone: recency here is a convenience trail, not game state, so it gets exactly one line and
     the overflow is simply clipped. No +N control; it has not earned a sheet of its own. */
  @media (max-width: 640px) {
    .recent { flex-wrap: nowrap; overflow: hidden; }
  }
```

- [ ] **Step 2: Verify**

Run: `npx svelte-check && npm run build && npm run dev`
Expected: at 390px, Explore's recent trail is one clipped line no matter how many taxa you visit; at desktop width it still wraps freely.

- [ ] **Step 3: Commit**

```bash
git add src/lib/explorer/components/Explorer.svelte
git commit -m "feat(explore): cap the recents trail to one line on phone (#12)"
```

---

### Task 10: Phone header

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Replace the progress suffix with a dot**

In `src/App.svelte`, the `modes` derived currently bakes " – in progress" into the label. Split it so the marker can be an element:

```svelte
  const modes = $derived([
    { tab: "daily" as const, label: "Daily", progress: hasProgress(daily.state) },
    { tab: "practice" as const, label: "Practice", progress: hasProgress(practice.state) },
    { tab: "explore" as const, label: "Explore", progress: false },
  ]);
```

and the button body:

```svelte
        onclick={() => nav.set(m.tab)}>{m.label}{#if m.progress}<span class="progress-dot" aria-label="in progress"></span>{/if}</button
      >
```

This is not phone-only: the dot replaces the suffix at every width, because the sliding indicator has to re-measure on every label width change and a short stable label is better everywhere. Verify the indicator still tracks correctly at desktop width after this change.

- [ ] **Step 2: Add the dot style**

In the `<style>` block:

```css
  .progress-dot {
    display: inline-block; width: .4em; height: .4em; margin-left: .35em;
    border-radius: 50%; background: var(--accent); vertical-align: middle;
  }
```

- [ ] **Step 3: Drop the wordmark on phone**

Replace the existing `@media (max-width: 640px)` block (the one hiding `.tagline`) with:

```css
  /* Phone: one header row, and the claw carries the brand alone. It is already rotated 180deg
     outside the tree specifically so it reads as an "M", so the wordmark is redundant at this
     width and the ~40px a second row would cost is 8% of the tree's height budget. */
  @media (max-width: 640px) {
    .tagline { display: none; }
    .wordmark { display: none; }
    .app-header { gap: var(--space-3); padding: var(--space-2) var(--space-3); }
    .modes { gap: var(--space-3); font-size: var(--type-body); }
  }
```

- [ ] **Step 4: Shrink the utility buttons on phone**

`HowToPlay` and `StatsPanel` render text buttons. Rather than swapping to icon components (new assets, new work), reduce them to compact labels on phone. In `src/lib/components/HowToPlay.svelte`, add:

```css
  /* Phone: the header row is at its width budget, so the label shortens to fit. */
  @media (max-width: 640px) {
    .how-to-play-link { padding: .25rem .45rem; font-size: var(--type-label); }
  }
```

and the same treatment in `src/lib/components/StatsPanel.svelte`:

```css
  @media (max-width: 640px) {
    .stats-link { padding: .25rem .45rem; font-size: var(--type-label); }
  }
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build && npm run dev`
Expected: at desktop width, the header reads `▲ Mesozooa | Find today's dinosaur! | How to play | Stats | Daily• Practice Explore`, with the sliding indicator tracking correctly. At 390px it is one row that does not wrap, with the claw alone as the brand.

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte src/lib/components/HowToPlay.svelte src/lib/components/StatsPanel.svelte
git commit -m "feat(header): single-row phone header, progress dot replaces the suffix (#12)"
```

---

### Task 11: Modal height, and attribution moves into How to play

**Files:**
- Modify: `src/lib/components/Modal.svelte`
- Modify: `src/lib/components/HowToPlay.svelte`
- Modify: `src/App.svelte` (footer)

**Interfaces:**
- Consumes: `meta.dataPulledAt` from `src/data/meta.json` (already imported in `App.svelte`; needs importing in `HowToPlay.svelte`).
- Produces: nothing new.

- [ ] **Step 1: Bound the modal's height**

In `src/lib/components/Modal.svelte`, change the `.modal` rule to add a height cap, and make the body scroll:

```css
  .modal {
    border: 1px solid var(--placard-edge);
    border-radius: var(--space-2);
    padding: 0;
    background: var(--bg-surface);
    color: var(--ink);
    max-width: min(32rem, 90vw);
    /* Without a cap, tall content (How to play, now carrying attributions; Stats) overflows the
       viewport on a phone with no way to reach the bottom. */
    max-height: 85dvh;
    overflow: hidden;
  }
  .modal-inner {
    padding: var(--space-4);
    max-height: 85dvh;
    display: flex; flex-direction: column; min-height: 0;
  }
```

and the body:

```css
  .modal-body {
    font-size: var(--type-body);
    overflow-y: auto; overscroll-behavior: contain; min-height: 0;
  }
```

- [ ] **Step 2: Add the About section to How to play**

In `src/lib/components/HowToPlay.svelte`, import the metadata and append an About block inside the modal body:

```svelte
<script lang="ts">
  import Modal from "./Modal.svelte";
  import meta from "../../data/meta.json";
  let open = $state(false);
</script>
```

and after the last `<p>` in `.how-to-play-body`:

```svelte
    <hr class="rule" />
    <h3 class="about-head">About</h3>
    <p>
      Inspired by <a href="https://metazooa.com" target="_blank" rel="noopener noreferrer">Metazooa</a>.
    </p>
    <p>
      Data from <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0),
      the <a href="https://paleobiodb.org" target="_blank" rel="noopener noreferrer">Paleobiology Database</a>,
      and <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>.
      Updated {meta.dataPulledAt}.
    </p>
```

with styles:

```css
  .rule { border: 0; border-top: 1px solid var(--hairline); width: 100%; margin: var(--space-2) 0 0; }
  .about-head {
    font-family: var(--font-head); font-size: var(--type-heading);
    font-weight: var(--fw-bold); margin: 0;
  }
```

Check the import depth: `HowToPlay.svelte` lives at `src/lib/components/`, so `src/data/meta.json` is `../../data/meta.json`.

- [ ] **Step 3: Hide the footer on phone**

In `src/App.svelte`, add to the `<style>` block:

```css
  /* Phone: the attribution strip wraps to ~4 lines of --type-meta, roughly 10% of the tree's
     height budget, for text nobody reads in a strip. It lives in How to play > About instead;
     per-image CC credits stay on the specimen card, so the license obligation is met either way. */
  @media (max-width: 640px) {
    .app-footer { display: none; }
  }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build && npm run dev`
Expected: at desktop width the footer is unchanged and How to play has gained an About section. At 390px there is no footer, and How to play scrolls internally within a modal that fits the screen. Open Stats at 390px and confirm it also fits and scrolls.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Modal.svelte src/lib/components/HowToPlay.svelte src/App.svelte
git commit -m "feat(about): move attributions into How to play, bound modal height (#12)"
```

---

### Task 12: Phone default zoom

**Files:**
- Modify: `src/lib/game/zoom.ts`
- Test: `src/lib/game/zoom.test.ts` (create if absent)
- Modify: `src/lib/game/components/SpineTree.svelte:420` and its `resetZoom` path (~line 624)

**Interfaces:**
- Consumes: `ZOOM_DEFAULT`, `clampZoom` from `src/lib/game/zoom.ts`.
- Produces: `export const ZOOM_PHONE_DEFAULT: number` and `export function defaultZoomFor(isPhone: boolean): number`.

- [ ] **Step 1: Write the failing tests**

Create or append to `src/lib/game/zoom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultZoomFor, ZOOM_DEFAULT, ZOOM_PHONE_DEFAULT, ZOOM_MIN, ZOOM_MAX } from "./zoom";

describe("defaultZoomFor", () => {
  it("opens at the normal default on desktop", () => {
    expect(defaultZoomFor(false)).toBe(ZOOM_DEFAULT);
  });

  it("opens zoomed out on phone so more of the spine is on screen", () => {
    expect(defaultZoomFor(true)).toBe(ZOOM_PHONE_DEFAULT);
    expect(ZOOM_PHONE_DEFAULT).toBeLessThan(ZOOM_DEFAULT);
  });

  it("keeps the phone default inside the zoom bounds", () => {
    expect(ZOOM_PHONE_DEFAULT).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(ZOOM_PHONE_DEFAULT).toBeLessThanOrEqual(ZOOM_MAX);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/game/zoom.test.ts`
Expected: FAIL — no exported member `defaultZoomFor` / `ZOOM_PHONE_DEFAULT`.

- [ ] **Step 3: Implement**

Append to `src/lib/game/zoom.ts`:

```ts
// A phone is a small window onto a wide spine, so opening at 1.0 lands you mid-canvas with two
// nodes visible. Opening zoomed out trades label size for orientation, then panTo/follow brings
// the interesting node to you.
//
// This is a DIAL, not a derived value: a true fit-to-width would collapse a deep tree to an
// illegible 0.15. Tune it by looking at 390px, not by computing it.
export const ZOOM_PHONE_DEFAULT = 0.6;

export function defaultZoomFor(isPhone: boolean): number {
  return isPhone ? ZOOM_PHONE_DEFAULT : ZOOM_DEFAULT;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/game/zoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into SpineTree**

In `src/lib/game/components/SpineTree.svelte`:

Add `defaultZoomFor` to the existing zoom import on line 15, and import the viewport rune:

```svelte
  import { viewport } from "../../viewport.svelte";
```

Change the initial zoom (line 420) from `let zoom = $state(ZOOM_DEFAULT);` to:

```svelte
  let zoom = $state(defaultZoomFor(viewport.isPhone));
```

Then replace every remaining `zoom = ZOOM_DEFAULT` reset (there are three: inside `panTo` ~line 583, `resetZoom` ~line 624, and the scroll-target branch ~line 650) with:

```svelte
      zoom = defaultZoomFor(viewport.isPhone);
```

so the home button and pan-to-node both return to the width-appropriate rest state rather than snapping to 1.0.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build && npm run dev`
Expected: clean. At desktop width the tree opens and resets exactly as before. At 390px it opens zoomed out with several spine nodes visible, and the home button returns to that same zoom.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/zoom.ts src/lib/game/zoom.test.ts src/lib/game/components/SpineTree.svelte
git commit -m "feat(tree): open zoomed out on phone (#12)"
```

---

### Task 13: Delete WarmestTrail, add phone gallery frames

`WarmestTrail.svelte` is dead code — its only reference is a gallery frame. This design declined to revive it, so leaving it in place leaves a decoy for the next reader.

**Files:**
- Delete: `src/lib/game/components/WarmestTrail.svelte`
- Modify: `src/gallery/Gallery.svelte:8`, `:191-199`, `:232-242`
- Modify: `src/gallery/Frame.svelte:34-38`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Mechanism note:** the gallery already renders narrow boards correctly — `Gallery.svelte` embeds `<iframe src="/gallery.html?frame=<stateKey>">` and `src/gallery/main.ts` mounts `Frame.svelte` instead of `Gallery.svelte` when `?frame=` is present. An iframe has its own viewport, so `matchMedia` inside it fires against the iframe's width. That means `viewport.isPhone` (Task 1) works correctly in these frames with no special handling. Do not build a second mechanism.

- [ ] **Step 1: Remove the trail panel and its import**

In `src/gallery/Gallery.svelte`, delete the import on line 8:

```svelte
  import WarmestTrail from "../lib/game/components/WarmestTrail.svelte";
```

and delete this whole panel (lines ~193-199):

```svelte
    <div class="panel wide">
      <span class="panel-label">trail — deep lineage</span>
      <div class="panel-body">
        <WarmestTrail warmestId={fixtureStore(stateSolvedWon).warmestId} onpan={() => {}} />
      </div>
    </div>
```

Then retitle the section it lived in, since it is now only about guesses. Change:

```svelte
    <h2>Trail &amp; guess history</h2>
```

to:

```svelte
    <h2>Guess history</h2>
```

- [ ] **Step 2: Delete the component**

```bash
git rm src/lib/game/components/WarmestTrail.svelte
```

- [ ] **Step 3: Verify nothing else referenced it**

Run: `grep -rn "WarmestTrail" src/`
Expected: no output.

Run: `grep -n "stateSolvedWon" src/gallery/Gallery.svelte`
Expected: still referenced elsewhere. If the deleted panel was its only use, also remove it from the fixtures import block on lines 18-28 to avoid an unused-import warning.

- [ ] **Step 4: Retarget the narrow frames to phone width**

In `src/gallery/Gallery.svelte`, the existing section (lines ~232-242) embeds boards at 420px. Retarget it to the actual design width. Change the heading:

```svelte
    <h2>Full board — phone (390px)</h2>
```

and the iframe dimensions:

```svelte
          <iframe title={"phone-" + s.key} src={"/gallery.html?frame=" + s.key} width="390" height="740"></iframe>
```

Also update the comment above the section:

```svelte
  <!-- FULL BOARD (phone via iframe — the iframe's own viewport makes media queries AND
       viewport.isPhone fire against 390px, not the gallery window) -->
```

- [ ] **Step 5: Make the frame fill its iframe**

`Frame.svelte` mounts into `#gallery`, not `#app`, so the locked-shell rules added in Task 2 do not apply inside it — without a height the board will not peg its bands. In `src/gallery/Frame.svelte` replace the style block:

```css
<style>
  /* The board expects a locked, full-height shell (base.css does this for #app in the real app).
     The gallery mounts into #gallery, so the frame supplies the same contract itself. */
  .frame-main {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: clean.

Run: `npm run dev`, open `/gallery.html` at any window width.
Expected: the "Full board — phone (390px)" section shows every fixture state with the pegged input band, the tree filling the middle, and the plaque peek pegged at the bottom. The two solved states show the reveal sheet already raised. This works regardless of the gallery window's own width, because each board is inside its own 390px iframe viewport.

- [ ] **Step 7: Commit**

```bash
git add -A src/gallery src/lib/game/components/
git commit -m "chore(gallery): drop dead WarmestTrail, add phone board frames (#12)"
```

---

### Task 14: Final verification and issue closure

**Files:** none modified unless verification turns up defects.

- [ ] **Step 1: Full check**

Run: `npx tsc --noEmit && npx svelte-check && npm test && npm run build`
Expected: all clean.

- [ ] **Step 2: Desktop regression walk**

Run: `npm run dev` at desktop width. Walk all three tabs: play a Practice round to a win, play a Daily guess, browse Explore. Compare against the pre-change behavior.
Expected: no visible difference anywhere. Any difference is a defect to fix before closing.

- [ ] **Step 3: Phone walk at 390x844**

In devtools responsive mode, walk the same three tabs:
- Header is one row, no wrap, claw-only brand, progress dot on Daily once a round is in progress.
- Input band pegged top; tapping the input opens the keyboard without the header or input moving.
- Chip band shows at most two chips plus `+ N more`; the warmest wears its ring; the modal lists everything.
- Tree fills the middle, opens zoomed out, drags without bouncing the page.
- Plaque peek pegged bottom, expands and collapses on tap.
- On a win the sheet rises on its own with stats and actions, collapses to reveal the tappable tree.
- Explore's recents are one clipped line; its plaque sheet works with a real taxon.
- No footer; How to play carries About; both modals fit and scroll.

- [ ] **Step 4: File follow-ups rather than expanding scope**

Open GitHub issues on `latrani/Mesozooa` for anything deferred here:
- `tech-debt`: drag-to-expand on `BottomSheet` (tap-only was deliberate, see Task 5).
- `tech-debt`: `ZOOM_PHONE_DEFAULT` is an untuned dial; needs a look at real content.
- Anything the phone walk surfaced that is out of this plan's scope.

- [ ] **Step 5: Close the issue in the final commit**

If any fixes were needed in steps 2-3, commit them with:

```bash
git commit -m "fix(layout): <what> (#12)"
```

Then confirm the branch is committed and **unpushed** — Indi pushes.

Run: `git log --oneline origin/main..HEAD`
Expected: the full task series listed, none pushed.
