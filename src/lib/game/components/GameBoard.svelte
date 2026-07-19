<script lang="ts">
  import { treeStore } from "../treeData";
  import type { GameState } from "../types";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import SpineTree from "./SpineTree.svelte";
  import SpecimenPlacard from "./SpecimenPlacard.svelte";
  import { specimenView } from "../specimen-view";

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
</script>

<div class="game">
  <!-- trail is desktop-hidden (the guess list covers lineage); kept for narrow layout -->
  <div class="trail-slot">
    <WarmestTrail warmestId={store.warmestId} onpan={(id) => spine?.panTo(id)} />
  </div>

  <div class="middle">
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

  <div class="bottom">
    {#if ended}
      <!-- the correct guess (or revealed answer) fills the input area as a result banner -->
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
          <button type="button" class="btn-secondary btn-forfeit" onclick={() => store.forfeit?.()}>
            Forfeit
          </button>
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
      onselect={(id) => {
        highlightId = id;
        spine?.panTo(id);
      }}
    />
  </div>
</div>

<style>
  /* Structural only — three stacked regions; the middle splits tree | specimen. */
  .game { display: flex; flex-direction: column; gap: var(--space-5); padding: 0 var(--space-6) var(--space-6); }
  .middle { display: flex; gap: var(--space-6); align-items: stretch; min-height: 0; }
  .middle :global(.tree-viewport) { flex: 1 1 auto; min-width: 0; }
  .bottom { display: flex; flex-direction: column; gap: var(--space-4); }
  .input-row { display: flex; gap: var(--space-3); align-items: center; }

  /* Desktop: the middle is a CANVAS. The tree fills it edge-to-edge and centers vertically;
     the specimen FLOATS over the top-right, sized to its own content. The tree's scroll-to-
     center targets the area left of the specimen (rightInset). Bottom region is pegged and
     shows the input + ~5 recent guesses without pushing the page. The trail is dropped. */
  @media (min-width: 641px) {
    /* edge-to-edge canvas: no padding on .game; the tree fills the full viewport, and the
       guess list's own bottom fade softens the lower edge (no padding-bottom needed).
       Horizontal padding returns only on the pegged bottom, aligned with the app header. */
    .game { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    /* edge-to-edge light placard (sunk): casts a soft shadow UP onto the tree, so the canvas
       reads as inset between it and the (dark) header. Dark ink text — guess-list roles keep
       their ink/light defaults, so nothing to re-point here. */
    .bottom {
      padding: var(--space-4) var(--space-5) var(--space-3); position: relative; z-index: 4;
      background: var(--bg-surface);
      border-top: 1px solid var(--hairline);
      box-shadow: 0 -6px 16px -8px rgba(51, 38, 26, 0.35);
    }
    .trail-slot { display: none; }
    .middle { position: relative; display: block; flex: 1 1 auto; min-height: 0; gap: 0; }
    /* tree scroller fills the canvas. Horizontal is LEFT-pinned (issue #34): the tree's left edge
       is a hard wall — nothing lives left of the root, so a small/zoomed-out tree anchors flush
       left instead of floating to center. Vertical uses `safe center`: centered when the tree
       fits, falls back to top-aligned scroll when it's taller — no clipping either way. */
    .middle :global(.tree-viewport) { position: absolute; inset: 0; }
    .middle :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
    .middle :global(.tree) { flex: none; }
    .specimen-float {
      position: absolute; top: 50%; right: var(--space-5); transform: translateY(-50%);
      z-index: 3; width: max-content;
    }
    .bottom { flex: 0 0 auto; }
    /* Always RESERVE ~5 rows of height: a stable landing zone for the autocomplete and no
       layout shift as guesses accumulate. Fewer than 5 -> empty space held; more -> scrolls.
       Height is on the frame; the inner list fills it and scrolls (fade lives on the list). */
    .bottom :global(.guesses-frame) {
      height: calc(5 * 2rem + 4 * var(--space-2));
    }
    .bottom :global(.guesses) { flex: 1 1 auto; overflow-y: auto; }
  }
  .budget {
    font-size: var(--type-body); font-weight: var(--fw-black);
    color: var(--btn-secondary-ink); 
    white-space: nowrap;
  }
  /* Result banner — fills the input slot on end state. A bar of high-alpha turquoise glow;
     body-color text, one uniform bold line. Same height footprint as the input row. */
  .result {
    display: flex; align-items: center;
    /* padding + transparent 2px border == the SearchBox input's box, so this banner is exactly
       the same height as the input row it replaces (no vertical shift on end state). */
    padding: var(--space-3) 1.25rem; border: 2px solid transparent; border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--turq) 32%, transparent);
    box-shadow: var(--gem-glow);
  }
  .result-line { font-size: var(--type-body); font-weight: var(--fw-bold); color: var(--ink); }
  /* Narrow screens: tree fills the middle; specimen drops below it, above the pegged input. */
  @media (max-width: 640px) {
    /* single column: trail (above) -> tree (full-size, scrolls) -> specimen -> pegged input.
       .middle becomes a column so the specimen naturally stacks under the tree; the SVG's own
       min-width:max-content (Task 1) keeps the tree full-size and horizontally scrollable. */
    .middle { flex-direction: column; }
    .middle :global(.tree-viewport) { width: 100%; }
    .middle :global(.tree-scroll) { width: 100%; }
    .input-row { position: sticky; bottom: 0; background: var(--bg-page); padding-bottom: var(--space-3); z-index: 2; }
  }
</style>
