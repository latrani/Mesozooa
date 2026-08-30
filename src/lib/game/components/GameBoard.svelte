<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { TreeStore } from "../treeStore";
  import type { GameState } from "../types";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import SpineTree from "./SpineTree.svelte";
  import SpecimenPlacard from "./SpecimenPlacard.svelte";
  import BoardLayout from "./BoardLayout.svelte";
  import { statsModal } from "../../components/statsModal.svelte";
  import TierControl from "../../components/TierControl.svelte";
  import { specimenView, nodeView } from "../specimen-view";
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
      /** The tier lens this game is played against. Comes from the game store rather than a
          module import, so the board always renders against the tier its OWN game is in. */
      tree: TreeStore;
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

  // Autocomplete offers exactly the active tier's pool — the guess box and the answer pool are
  // one and the same set (design spec § Tier definitions).
  let playableEntries = $derived(store.tree.playableGenera().map((n) => ({ id: n.id, name: n.name })));
  // Autocomplete hides genera already guessed this round — no point re-guessing them.
  let guessedIds = $derived(
    new Set(store.state.guesses.filter((g) => g.kind === "guess").map((g) => g.guessId)),
  );
  let availableEntries = $derived(playableEntries.filter((e) => !guessedIds.has(e.id)));

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
      : (store.warmestId ?? store.tree.data.rootId),
  );
  let treeRevealed = $derived(
    store.warmestId ? store.revealed : new Set([store.tree.data.rootId]),
  );

  // Always show a move counter; max is null in Practice (unbounded) -> rendered as a bare count.
  let budget = $derived({
    used: store.movesUsed ?? store.state.guesses.length,
    max: store.state.maxGuesses,
  });


  // End state: the correct guess leaves the record and becomes the result banner.
  let ended = $derived(store.state.status !== "playing");
  let won = $derived(store.state.status === "won");
  let answerName = $derived(store.tree.getNode(store.state.target)?.name ?? store.state.target);
  // Real guesses only — gates the Forfeit button (nothing to forfeit before the first guess).
  let turnCount = $derived(store.state.guesses.filter((g) => g.kind === "guess").length);
  // The result banner counts MOVES, the same currency the budget spends: guesses plus what each
  // hint cost. Hints are still called out separately, so the count must include them, not sit
  // beside them as a second unrelated number.
  let moveCount = $derived(budget.used);
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

  // End state replaces the focused search input with the result banner, so focus would otherwise
  // fall to <body>. Move it to the mode's primary action — Share (daily) or New round (practice) —
  // which leads the action row in DOM, so Tab flows on to the rest. Same fix at every width; the
  // buttons live in the top cluster regardless of viewport. #59
  let shareBtn = $state<HTMLButtonElement>();
  let newBtn = $state<HTMLButtonElement>();
  $effect(() => {
    if (!ended) return;
    tick().then(() => untrack(() => shareBtn ?? newBtn)?.focus());
  });
</script>

<BoardLayout
  bind:sheetExpanded
  hasExtraPanel={selectedId != null && store.tree.getNode(selectedId) != null}
  extraPanelKey={selectedId != null && store.tree.getNode(selectedId) != null ? selectedId : null}
>
  {#snippet cluster()}
    {#if ended}
      <!-- End state reuses the input row's geometry: banner in the field's place, end actions
           trailing it exactly where Hint/Forfeit sit during play (#63). -->
      <div class="input-row">
        <div class="result" class:won class:lost={!won} aria-live="polite">
          <span class="result-line">{#if won}Congratulations! {answerName} guessed in {moveCount} {moveCount === 1 ? "move" : "moves"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}!{:else}It was {answerName} — out of guesses after {moveCount} {moveCount === 1 ? "move" : "moves"} with {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}{/if}</span>
        </div>
        {#if onshare}
          <button type="button" class="btn-secondary" bind:this={shareBtn} onclick={() => onshare?.()}>Share</button>
        {/if}
        {#if store.state.mode === "daily"}
          <button type="button" class="btn-secondary" onclick={() => (statsModal.open = true)}>Stats</button>
        {/if}
        {#if onnew}
          <button type="button" class="btn-secondary" bind:this={newBtn} onclick={() => onnew?.()}>New round</button>
        {/if}
      </div>
    {:else}
      <div class="input-row">
        <SearchBox id="guess" entries={availableEntries} onpick={(id) => store.guess(id)} placeholder="Guess a Mesozoic dinosaur…" />
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
        <!-- Phone only: the header has no room for a fourth control, and the tier has to stay
             readable while playing — this is the line already read between guesses. -->
        <span class="tier-inline"><TierControl compact /></span>
      </div>
    {/if}
    <GuessList
      guesses={store.state.guesses}
      targetId={won ? store.state.target : null}
      revealId={ended && !won ? store.state.target : null}
      warmestId={store.warmestId}
      onselect={(id) => { selectedId = id; spine?.panTo(id); }}
    />
  {/snippet}

  {#snippet placard(peek: boolean)}
    <SpecimenPlacard view={specimenView(store.state, store.tree)} {peek} onexplore={onexplore} />
  {/snippet}

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
      focusOnClick={false}
    />
  {/snippet}

  {#snippet extraPanel(peek: boolean)}
    {#if selectedId && store.tree.getNode(selectedId)}
      <SpecimenPlacard view={nodeView(store.tree.getNode(selectedId)!)} {peek} />
    {/if}
  {/snippet}
</BoardLayout>

<style>
  /* Region skeleton is owned by BoardLayout; these rules back the snippet CONTENT only. */
  .input-row { display: flex; gap: var(--space-3); align-items: center; }
  .tier-inline { display: none; }
  @media (max-width: 640px) { .tier-inline { display: inline-flex; } }
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
