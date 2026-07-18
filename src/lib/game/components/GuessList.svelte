<script lang="ts">
  import { treeStore } from "../treeData";
  import { warmthRampColor } from "../warmth-ramp";
  import { displayName } from "../displayName";
  import type { GuessResult } from "../types";
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { scrollFade } from "../../actions/scrollFade";

  let {
    guesses,
    onselect,
    targetId = null,
    revealId = null,
  }: {
    guesses: GuessResult[];
    onselect: (nodeId: string) => void;
    /** the winning guess — shown with name + full bar, but no "shared" clade (meaningless) */
    targetId?: string | null;
    /** the revealed answer on a LOSS — pinned above as a distinct row (never guessed, so no bar) */
    revealId?: string | null;
  } = $props();

  // Newest first: the latest guess lands on top and shoves older ones down.
  let ordered = $derived(guesses.slice().reverse());

  // The loss badge inherits the color of the most recent real guess (the one whose miss expired
  // the budget), so the reveal reads as "this is where your last try landed you".
  let lastGuessFraction = $derived(
    [...guesses].reverse().find((g) => g.kind === "guess")?.warmth.fraction ?? 0,
  );
</script>

<div class="guesses-frame">
<ul class="guesses" use:scrollFade={ordered}>
  {#if revealId}
    {@const answer = treeStore.getNode(revealId)}
    <li class="row">
      <span class="answer-badge" style="background: {warmthRampColor(lastGuessFraction)}">Answer</span>
      <span class="sentence">
        <button type="button" class="link guess-name" onclick={() => onselect(revealId)}>{displayName(answer?.name)}</button>
      </span>
    </li>
  {/if}
  {#each ordered as g (g.guessId)}
    {@const guess = treeStore.getNode(g.guessId)}
    {@const shared = treeStore.getNode(g.sharedNodeId)}
    {@const isWin = g.guessId === targetId}
    <li class="row" class:win={isWin} in:fly={{ y: -18, duration: 260 }} animate:flip={{ duration: 260 }}>
      {#if isWin}
        <span class="answer-badge win" style="background: {warmthRampColor(1)}">Answer</span>
      {:else if g.kind === "leafHint"}
        <span class="bar" aria-hidden="true"></span>
      {:else}
        <span class="bar">
          <span class="fill" class:gem={g.warmth.fraction >= 0.7}
            style="width: {Math.round(g.warmth.fraction * 100)}%; background: {warmthRampColor(g.warmth.fraction)}"></span>
        </span>
      {/if}
      <span class="sentence">
        {#if g.kind === "leafHint"}
          <span class="guess-name">Field clue</span> <span class="hint-tag">clue −{g.cost}</span>
        {:else}
          <button type="button" class="link guess-name" onclick={() => onselect(g.guessId)}>{displayName(guess?.name)}</button>{#if g.kind === "branchHint"} <span class="hint-tag">hint −{g.cost}</span>{/if}{#if !isWin}{" "}<span class="clade">shared: <button type="button" class="link" onclick={() => onselect(g.sharedNodeId)}>{displayName(shared?.name)}</button></span>{/if}
        {/if}
      </span>
    </li>
  {/each}
</ul>
</div>

<style>
  /* Frame carries any chrome/height cap (from GameBoard) and clips; the inner <ul> scrolls and
     bears the scroll-fade mask, so the mask never eats a future background/border. */
  .guesses-frame { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .guesses { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; --bar-w: 7rem; }
  /* text/track roles default to ink/light via the var fallback; a dark-placard parent
     re-points them by setting --guess-* (inherited, so the fallback is skipped). */
  /* The warmth bar (or answer badge) leads at a fixed width; everything after it flows as an
     inline sentence — "Genus shared: Taxon" — so only the bar reserves space. */
  .row {
    display: flex; align-items: center; gap: var(--space-3);
    padding: .2rem 0; color: var(--guess-text, var(--ink)); font-size: var(--type-body);
  }
  .sentence { min-width: 0; }
  /* clickable text -> underlined to signal the affordance */
  .link {
    background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit;
    text-align: left; text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 2px; text-decoration-color: var(--sand-400);
  }
  .link:hover { text-decoration-color: var(--turq); color: var(--turq-dp); }
  .guess-name { font-weight: var(--fw-medium); }
  .hint-tag {
    font-size: var(--type-eyebrow); font-weight: var(--fw-black); letter-spacing: .1em; text-transform: uppercase;
    color: var(--placard-dp); background: var(--sand-200); border-radius: var(--radius-pill);
    padding: .05rem .45rem; vertical-align: .1em;
  }
  /* answer badge: fills the warmth-bar column instead of a bar. The answer's warmth is meaningless
     (win = trivially full; loss = never guessed), so the pill carries outcome color: the gem end of
     the ramp on a win, the most-recent guess's warmth on a loss. Same footprint as .bar. */
  .answer-badge {
    flex: 0 0 var(--bar-w);
    display: flex; align-items: center; justify-content: center;
    font-size: var(--type-eyebrow); font-weight: var(--fw-black); letter-spacing: .1em; text-transform: uppercase;
    color: var(--cream); border-radius: var(--radius-pill); padding: .1rem .55rem;
  }
  .answer-badge.win { box-shadow: var(--gem-glow); }
  .clade { color: var(--guess-text-dim, var(--ink-soft)); font-size: var(--type-label); }
  .bar { flex: 0 0 var(--bar-w); height: .75rem; background: var(--guess-track, var(--bg-sunk)); border-radius: var(--radius-pill); overflow: hidden; box-shadow: var(--inset-well); }
  .fill { display: block; height: 100%; border-radius: var(--radius-pill); }
  .fill.gem { box-shadow: var(--gem-glow); }
</style>
