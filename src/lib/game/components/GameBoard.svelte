<script lang="ts">
  import { untrack } from "svelte";
  import { treeStore } from "../treeData";
  import type { GameState } from "../types";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import SpineTree from "./SpineTree.svelte";
  import SpecimenPlacard from "./SpecimenPlacard.svelte";
  import BoardLayout from "./BoardLayout.svelte";
  import { statsModal } from "../../components/statsModal.svelte";
  import { specimenView } from "../specimen-view";
  import type { WarmthProvider } from "../warmth";
  import { viewport } from "../../viewport.svelte";

  let {
    store,
    disabled,
    onexplore,
    onnew,
    onshare,
  }: {
    store: {
      state: GameState;
      warmestId: string | null;
      revealed: Set<string>;
      warmthProvider: WarmthProvider;
      guess: (id: string) => void;
      canHint?: boolean;
      hint?: () => void;
      nextHintCost?: number;
      movesRemaining?: number;
      movesUsed?: number;
      guessesUsed?: number;
      /** present only in Practice (unbounded) — surfaces a Forfeit button. */
      forfeit?: () => void;
    };
    disabled: boolean;
    onexplore?: (id: string) => void;
    onnew?: () => void;
    onshare?: () => void;
  } = $props();

  const playableEntries = treeStore.playableGenera().map((n) => ({ id: n.id, name: n.name }));
  // Autocomplete hides genera already guessed this round — no point re-guessing them.
  let guessedIds = $derived(
    new Set(store.state.guesses.filter((g) => g.kind === "guess").map((g) => g.guessId)),
  );
  let availableEntries = $derived(playableEntries.filter((e) => !guessedIds.has(e.id)));

  let highlightId = $state<string | null>(null);
  $effect(() => {
    if (store.state.guesses.length === 0) highlightId = null;
  });

  // guessId -> warmth fraction, so each guessed genus dot in the tree matches its bar color.
  let guessWarmth = $derived.by(() => {
    const map = new Map<string, number>();
    for (const g of store.state.guesses) map.set(g.guessId, g.warmth.fraction);
    return map;
  });

  // Before the first guess there's no warmest node, so show the bare root (Dinosauria) sitting
  // ore-colored on the axis rather than a placeholder message. Once a guess lands, warmestId +
  // revealed drive the spine as usual (revealed always includes the root via pathToRoot).
  // On a loss the target was never guessed, so make the now-revealed answer lineage the spine
  // (revealedNodeIds adds it on end state) and center on it; otherwise follow the warmest guess,
  // or the bare root before any guess.
  let treeTipId = $derived(
    store.state.status === "lost"
      ? store.state.target
      : (store.warmestId ?? treeStore.data.rootId),
  );
  let treeRevealed = $derived(
    store.warmestId ? store.revealed : new Set([treeStore.data.rootId]),
  );

  // Always show a move counter; max is null in Practice (unbounded) -> rendered as a bare count.
  let budget = $derived({
    used: store.movesUsed ?? store.state.guesses.length,
    max: store.state.maxGuesses,
  });


  // End state: the correct guess leaves the record and becomes the result banner.
  let ended = $derived(store.state.status !== "playing");
  let won = $derived(store.state.status === "won");
  let answerName = $derived(treeStore.getNode(store.state.target)?.name ?? store.state.target);
  // Turns = number of real guesses (includes the winning guess). Hints tracked separately.
  let turnCount = $derived(store.state.guesses.filter((g) => g.kind === "guess").length);
  let hintsUsed = $derived(store.state.hintsUsed ?? 0);

  // Component ref to the spine tree so trail crumbs can pan it (spec §3B).
  let spine = $state<ReturnType<typeof SpineTree>>();

  // Phone end state: the reveal RISES rather than the cluster inflating, because end state is
  // when the tree is most worth looking at (answer lineage revealed, every node an Explore link).
  // It stays dismissible for exactly that reason; the peek row re-opens it.
  let sheetExpanded = $state(false);
  $effect(() => {
    if (!ended) return;
    if (untrack(() => viewport.isPhone)) sheetExpanded = true;
  });
</script>

<BoardLayout bind:sheetExpanded>
  {#snippet cluster()}
    {#if ended}
      <!-- End state reuses the input row's geometry: banner in the field's place, end actions
           trailing it exactly where Hint/Forfeit sit during play (#63). -->
      <div class="input-row">
        <div class="result" class:won class:lost={!won} aria-live="polite">
          <span class="result-line">{#if won}Congratulations! {answerName} guessed in {turnCount} {turnCount === 1 ? "turn" : "turns"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}!{:else}It was {answerName} — out of guesses after {turnCount} {turnCount === 1 ? "turn" : "turns"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}{/if}</span>
        </div>
        {#if onshare}
          <button type="button" class="btn-secondary" onclick={() => onshare?.()}>Share</button>
        {/if}
        {#if store.state.mode === "daily"}
          <button type="button" class="btn-secondary" onclick={() => (statsModal.open = true)}>Stats</button>
        {/if}
        {#if onnew}
          <button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>
        {/if}
      </div>
    {:else}
      <div class="input-row">
        <SearchBox id="guess" entries={availableEntries} onpick={(id) => store.guess(id)} placeholder="Guess a dinosaur…" />
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
      warmestId={store.warmestId}
      onselect={(id) => { highlightId = id; spine?.panTo(id); }}
    />
  {/snippet}

  {#snippet placard(peek: boolean)}
    <SpecimenPlacard view={specimenView(store.state, treeStore)} {peek} />
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
      speakShared
      warmthProvider={store.warmthProvider}
      onnodeselect={ended && onexplore ? (id) => onexplore(id) : undefined}
      linkLabels={ended}
    />
  {/snippet}
</BoardLayout>

<style>
  /* Region skeleton is owned by BoardLayout; these rules back the snippet CONTENT only. */
  .input-row { display: flex; gap: var(--space-3); align-items: center; }
  .budget {
    font-size: var(--type-body); font-weight: var(--fw-black);
    color: var(--btn-secondary-ink); 
    white-space: nowrap;
  }
  /* Result banner — fills the input slot on end state. A bar of high-alpha turquoise glow;
     body-color text, one uniform bold line. Same height footprint as the input row. */
  .result {
    display: flex; align-items: center;
    /* takes the search field's place in the row, so it flexes and the end actions trail it */
    flex: 1 1 auto; min-width: 0;
    /* padding + transparent 2px border == the SearchBox input's box, so this banner is exactly
       the same height as the input row it replaces (no vertical shift on end state). */
    padding: var(--space-3) 1.25rem; border: 2px solid transparent; border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--turq) 32%, transparent);
    box-shadow: var(--gem-glow);
  }
  .result-line { font-size: var(--type-body); font-weight: var(--fw-bold); color: var(--ink); }

  /* Phone: the search field takes its own full-width line and the controls wrap beneath it.
     Without this the row's incompressible content overflows a 390px cluster and, since the shell
     is overflow:hidden, is clipped rather than scrollable. */
  @media (max-width: 640px) {
    .input-row { flex-wrap: wrap; gap: var(--space-2); }
    .input-row :global(.searchbox) { flex: 1 0 100%; min-width: 0; }
    /* the banner takes the field's line, so the end actions wrap onto their own row beneath it */
    .result { flex: 1 0 100%; padding: var(--space-2) 1rem; }
    /* match the header's utility buttons (.btn-small) so every pill on screen shares one geometry */
    .input-row :global(.btn-secondary) { padding: 0.375rem 0.625rem; }
    /* The controls line holds Hint and Forfeit only conditionally, so without a floor it collapses
       to bare text height and the whole cluster jumps as buttons appear and disappear. The budget
       is the one element always present, so it carries the reservation. */
    .budget {
      margin-left: auto; font-size: var(--type-label);
      min-height: 2.375rem; display: flex; align-items: center;
    }
  }
</style>
