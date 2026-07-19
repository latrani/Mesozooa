# Visual batch: Modal + How-to-play + Share + in-progress nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three "adds-new-visuals" issues (#3 in-progress nav, #4 how-to-play, #7 emoji sharing) with a single shared Modal component, function-first and visually minimal, so the CSS pass can follow independently.

**Architecture:** One new native-`<dialog>`-based `Modal.svelte` in a fresh `src/lib/components/` dir, consumed by a `HowToPlay.svelte` wrapper (in the header) and by a share modal in `Daily.svelte`. `GameBoard` gains an `onshare` prop mirroring `onnew`. Pure helpers (`hasProgress`, recolored `bucket`) are TDD-tested; Svelte components validated by build + gallery.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. Vitest for pure logic. Native HTML `<dialog>`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does NOT catch this; run `npx tsc --noEmit` and `npx svelte-check` before committing.
- Pure logic is TDD-tested; Svelte components validated by build + running/gallery.
- Function-first: structurally-correct, visually-minimal UI. No visual polish — that's a later user-driven pass. Minimal styling uses existing tokens only.
- Commit each task; leave unpushed (Indi pushes). Add `Closes #N` to the commit that completes an issue.
- Merge workflow: no PRs.

---

### Task 1: `hasProgress` helper + in-progress nav (#3)

**Files:**
- Modify: `src/lib/game/engine-core.ts` (add `hasProgress`)
- Test: `src/lib/game/engine-core.test.ts`
- Modify: `src/App.svelte` (tab labels)

**Interfaces:**
- Produces: `hasProgress(state: GameState): boolean`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/engine-core.test.ts` (import `hasProgress` in the existing top import block from `./engine-core`, and reuse the existing `newDailyState`, `applyGuess`, `store`, `warmth` helpers already set up in that file):

```ts
describe("hasProgress", () => {
  it("is false for a fresh game, true mid-play, false once ended", () => {
    const fresh = newDailyState("TR");
    expect(hasProgress(fresh)).toBe(false);
    const mid = applyGuess(fresh, "TC", store, warmth); // one guess, still playing
    expect(hasProgress(mid)).toBe(true);
    const won = applyGuess(newDailyState("TC"), "TC", store, warmth); // guessed the target
    expect(hasProgress(won)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t hasProgress`
Expected: FAIL — `hasProgress is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/game/engine-core.ts` (near `movesUsed`, top of file after the cost helpers):

```ts
// A game that's been started but not finished — drives the "in progress" nav label (#3).
export function hasProgress(state: GameState): boolean {
  return state.guesses.length > 0 && state.status === "playing";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t hasProgress`
Expected: PASS.

- [ ] **Step 5: Wire the nav labels**

In `src/App.svelte`, add to the `<script>` imports:

```ts
  import { hasProgress } from "./lib/game/engine-core";
  import { daily } from "./lib/game/dailyStore.svelte";
  import { game } from "./lib/game/gameStore.svelte";
```

Change the Daily and Practice `<nav>` buttons (currently plain text `Daily` / `Practice`) to:

```svelte
    <button type="button" class:active={nav.tab === "daily"} onclick={() => nav.set("daily")}>Daily{#if hasProgress(daily.state)} — in progress{/if}</button>
    <button type="button" class:active={nav.tab === "practice"} onclick={() => nav.set("practice")}>Practice{#if hasProgress(game.state)} — in progress{/if}</button>
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts src/App.svelte
git commit -m "feat(nav): show '— in progress' on tabs with a started game

Closes #3"
```

---

### Task 2: Shared `Modal.svelte`

**Files:**
- Create: `src/lib/components/Modal.svelte`

**Interfaces:**
- Produces: `Modal` component. Props: `open: boolean` (bindable), `title: string`, `children` (default snippet). Dismisses via ✕, Esc, or backdrop click; all paths set `open = false`.

- [ ] **Step 1: Create the component**

Create `src/lib/components/Modal.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    children,
  }: {
    open?: boolean;
    title: string;
    children: Snippet;
  } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  // Sync the `open` prop to the native dialog. showModal() gives us focus-trap, top-layer
  // stacking, ::backdrop, and Esc-to-close for free.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  // Native close (Esc, or dialog.close()) writes back so the binding stays consistent.
  function onclose() {
    open = false;
  }

  // A click whose target is the <dialog> itself (not inner content) is a backdrop click.
  function onclick(e: MouseEvent) {
    if (e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} {onclose} {onclick} class="modal">
  <div class="modal-inner">
    <header class="modal-head">
      <h2>{title}</h2>
      <button type="button" class="modal-close" aria-label="Close" onclick={() => (open = false)}>✕</button>
    </header>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</dialog>

<style>
  /* Structural only — the visual pass refines this. Uses existing tokens for legibility. */
  .modal {
    border: 1px solid var(--placard-edge);
    border-radius: var(--space-2);
    padding: 0;
    background: var(--bg-surface);
    color: var(--ink);
    max-width: min(32rem, 90vw);
  }
  .modal::backdrop {
    background: rgba(51, 38, 26, 0.45);
  }
  .modal-inner {
    padding: var(--space-4);
  }
  .modal-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .modal-head h2 {
    font-family: var(--font-head);
    font-size: var(--type-h);
    margin: 0;
  }
  .modal-close {
    background: none;
    border: 0;
    cursor: pointer;
    font-size: var(--type-body);
    color: var(--ink-mute);
    align-self: center;
  }
  .modal-close:hover {
    color: var(--ink);
  }
  .modal-body {
    font-size: var(--type-body);
  }
</style>
```

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --threshold error`
Expected: 0 errors. (Nothing consumes it yet; the gallery wiring in later tasks exercises it.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/Modal.svelte
git commit -m "feat(ui): shared Modal component (native <dialog>)"
```

---

### Task 3: How to play (#4)

**Files:**
- Create: `src/lib/components/HowToPlay.svelte`
- Modify: `src/App.svelte` (render `<HowToPlay />` after the tagline)

**Interfaces:**
- Consumes: `Modal` (Task 2).
- Produces: `HowToPlay` component (no props; self-contained button + modal).

- [ ] **Step 1: Create the component**

Create `src/lib/components/HowToPlay.svelte` (copy is from issue #4, with the three approved typo fixes — "moves", "spend moves", "a single move will tell"):

```svelte
<script lang="ts">
  import Modal from "./Modal.svelte";
  let open = $state(false);
</script>

<button type="button" class="how-to-play-link" onclick={() => (open = true)}>How to play</button>

<Modal bind:open title="How to play">
  <p>Find today's dinosaur by its similarity to others.</p>
  <p>Guess any dinosaur, and you'll see the clade that it shares with the one you're hunting for. Try to find the target in the fewest moves!</p>
  <p>You can spend moves on hints to move down the tree. When you're almost at the end of the tree, a single move will tell you more details about the dino, to help you sort through the genera.</p>
  <p>If you're stuck, or just want to learn more, check out Explore mode to see the whole tree. Not every dinosaur in Explore mode is playable, but every playable dinosaur is in Explore.</p>
</Modal>

<style>
  .how-to-play-link {
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0;
    font-size: var(--type-body);
    font-weight: var(--fw-medium);
    color: var(--cream-dim);
    text-decoration: underline;
    align-self: center;
  }
  .how-to-play-link:hover {
    color: var(--cream);
  }
</style>
```

- [ ] **Step 2: Render it in the header**

In `src/App.svelte`, add to the `<script>` imports:

```ts
  import HowToPlay from "./lib/components/HowToPlay.svelte";
```

Insert `<HowToPlay />` in the header immediately after the tagline `<span>`:

```svelte
  <span class="tagline">Find today's dinosaur!</span>
  <HowToPlay />
  <nav class="modes">
```

(Per spec §2: the how-to-play link stays visible at ≤640px even though `.tagline` hides — no extra media-query rule needed since `HowToPlay` isn't inside `.tagline`.)

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 4: Verify in the running app**

Run the dev server, open the app, click "How to play" → modal opens with the four paragraphs; ✕ / Esc / backdrop-click all close it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/HowToPlay.svelte src/App.svelte
git commit -m "feat(ui): How to play panel in the header

Closes #4"
```

---

### Task 4: Recolor the warmth buckets (#7 part a)

**Files:**
- Modify: `src/lib/game/share.ts` (`bucket`)
- Test: `src/lib/game/share.test.ts`

**Interfaces:**
- Produces: recolored `bucket` output — `⬛ <0.2`, `🟦 <0.4`, `⬜ <0.6`, `🟧 <0.8`, `🟥 ≥0.8`.

- [ ] **Step 1: Update the failing tests**

In `src/lib/game/share.test.ts`, the win test (around line 22) asserts a cold `0.1` guess renders `🟦`. Under the new ramp `0.1` → `⬛`. Change that assertion:

```ts
    expect(text).toContain("⬛"); // cold guess
```

The loss test's hot assertion `expect(text).toContain("🟥")` (fraction `0.9`) is unchanged — still `🟥`. No other assertions name a bucket emoji.

- [ ] **Step 2: Run tests to verify the win test fails**

Run: `npx vitest run src/lib/game/share.test.ts`
Expected: FAIL — the win test can't find `⬛` (still old ramp).

- [ ] **Step 3: Update `bucket`**

In `src/lib/game/share.ts`, replace the `bucket` body:

```ts
function bucket(fraction: number): string {
  if (fraction >= 0.8) return "🟥";
  if (fraction >= 0.6) return "🟧";
  if (fraction >= 0.4) return "⬜";
  if (fraction >= 0.2) return "🟦";
  return "⬛";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/share.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/share.ts src/lib/game/share.test.ts
git commit -m "feat(share): recolor warmth ramp to black/blue/white/orange/red"
```

---

### Task 5: Share button + share modal (#7 part b)

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte` (add `onshare` prop + Share button)
- Modify: `src/lib/game/components/Daily.svelte` (owns the share modal)

**Interfaces:**
- Consumes: `Modal` (Task 2); `buildShareText(state, dateStr)` (existing); `daily.date`, `daily.state` (existing store getters); recolored `bucket` (Task 4).
- Produces: `GameBoard` gains optional prop `onshare?: () => void`.

- [ ] **Step 1: Add the `onshare` prop + button to GameBoard**

In `src/lib/game/components/GameBoard.svelte`, add `onshare` to the destructured `$props()` and its type (alongside `onnew`):

```ts
  let {
    store,
    disabled,
    onexplore,
    onnew,
    onshare,
  }: {
    // ...existing store type unchanged...
    disabled: boolean;
    onexplore?: (id: string) => void;
    onnew?: () => void;
    onshare?: () => void;
  } = $props();
```

In the placard `action` snippet, extend the ended-state actions to include Share when `onshare` is present:

```svelte
      {#snippet action()}
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
```

- [ ] **Step 2: Own the share modal in Daily**

Replace `src/lib/game/components/Daily.svelte` `<script>` and markup with:

```svelte
<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
  import Modal from "../../components/Modal.svelte";
  import { buildShareText } from "../share";

  let shareOpen = $state(false);
  let copied = $state(false);
  let shareText = $derived(buildShareText(daily.state, daily.date));

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<main class="daily">
  <GameBoard
    store={daily}
    disabled={daily.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
    onshare={() => (shareOpen = true)}
  />
</main>

<Modal bind:open={shareOpen} title="Share your result">
  <pre class="share-preview">{shareText}</pre>
  <button type="button" class="btn-secondary" onclick={copy}>{copied ? "Copied" : "Copy"}</button>
</Modal>

<style>
  .daily { padding-top: var(--space-2); }
  @media (min-width: 641px) {
    .daily { padding-top: 0; display: flex; flex-direction: column; min-height: 0; }
  }
  /* pre keeps the emoji grid rows aligned; structural only */
  .share-preview {
    font-family: inherit;
    white-space: pre;
    margin: 0 0 var(--space-3);
    line-height: 1.4;
  }
</style>
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 4: Verify in the running app**

Play/force a daily to completion (or use gallery — see Task 6). The Share button appears on the specimen placard; clicking opens the modal with the emoji grid preview; Copy writes to clipboard and flips to "Copied" for ~1.5s. Confirm Practice still shows "New round" and NOT Share.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte src/lib/game/components/Daily.svelte
git commit -m "feat(share): Share button + modal with grid preview and Copy

Closes #7"
```

---

### Task 6: Gallery states for the visual pass

**Files:**
- Modify: `src/gallery/Gallery.svelte` (add Modal / How-to-play / Share-modal views)

**Interfaces:**
- Consumes: `Modal`, `HowToPlay` (Tasks 2–3); `buildShareText` (existing); `stateSolvedWon` fixture (existing in `src/gallery/fixtures.ts`).

- [ ] **Step 1: Add a gallery section**

In `src/gallery/Gallery.svelte` `<script>`, add imports:

```ts
  import Modal from "../lib/components/Modal.svelte";
  import HowToPlay from "../lib/components/HowToPlay.svelte";
  import { buildShareText } from "../lib/game/share";
```

Add local state for an always-open preview and the sample share text (the gallery shows states inline; render the modal's inner content directly so it's visible without opening a dialog):

```ts
  const sampleShareText = buildShareText(stateSolvedWon, "2026-07-18");
```

- [ ] **Step 2: Render the views**

Add a section to the gallery markup (near the other component sections). Because a native `<dialog>` renders in the top layer only when opened, expose two things: (a) a live `HowToPlay` button the reviewer can click, and (b) a static preview of the share text so the grid/recolor is visible without opening:

```svelte
<section>
  <h2>Modal & sharing</h2>
  <p>Click to open the live How-to-play modal:</p>
  <div style="background: var(--placard); padding: var(--space-3); display: inline-block;">
    <HowToPlay />
  </div>
  <p>Share text (recolored ramp), as shown in the Share modal:</p>
  <pre style="white-space: pre; line-height: 1.4;">{sampleShareText}</pre>
</section>
```

- [ ] **Step 3: Verify build + gallery**

Run: `npx svelte-check --threshold error`
Expected: 0 errors. Open `/gallery.html`, confirm the How-to-play button opens the modal and the share-text preview shows the ⬛🟦⬜🟧🟥 ramp + 🎯.

- [ ] **Step 4: Commit**

```bash
git add src/gallery/Gallery.svelte
git commit -m "chore(gallery): Modal, How-to-play, and share-text preview states"
```

---

### Task 7: Full verification

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors.

- [ ] **Step 3: Manual end-to-end in the running app**

- Fresh Daily → tab reads "Daily"; make one guess → tab reads "Daily — in progress".
- Same for Practice.
- "How to play" link (header, visible on narrow screens too) → modal with four paragraphs; ✕/Esc/backdrop close.
- Complete a daily → Share button on placard → modal with recolored grid preview + Copy → "Copied".
- Practice completion still shows "New round", no Share.

No commit — verification only.

## Self-review notes

- **Spec coverage:** Modal (Task 2) ✓; #4 how-to-play + narrow-screen visibility (Task 3) ✓; #7 recolor (Task 4) + share UI/date/preview/Copy (Task 5) ✓; #3 helper + labels (Task 1) ✓; gallery (Task 6) ✓.
- **Types:** `onshare?: () => void` consistent across GameBoard prop + Daily callsite; `hasProgress(state: GameState): boolean` consistent; `Modal` `open`/`title`/`children` consistent across HowToPlay + Daily.
- **daily.date** confirmed present on the store (returned literal in `createDaily`). `buildShareText` confirmed existing + tested.
