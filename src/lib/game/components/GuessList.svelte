<script lang="ts">
  import { treeStore } from "../treeData";
  import { chipsFor } from "../chip-view";
  import type { GuessResult } from "../types";
  import { fly } from "svelte/transition";

  let {
    guesses,
    onselect,
    targetId = null,
    revealId = null,
  }: {
    guesses: GuessResult[];
    onselect: (nodeId: string) => void;
    /** the winning guess — becomes the answer chip (won) */
    targetId?: string | null;
    /** the revealed answer on a LOSS — becomes the answer chip (lost) */
    revealId?: string | null;
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

  // stable key per chip for the flex list / transitions
  function keyOf(c: ReturnType<typeof chipsFor>[number], i: number): string {
    if (c.kind === "answer") return "answer";
    if (c.kind === "leafHint") return `leaf-${i}`;
    return `${c.kind}-${c.nodeId}`;
  }
</script>

<ul class="chips">
  {#each chips as c, i (keyOf(c, i))}
    <li class="chip chip-{c.kind}" in:fly={{ y: -10, duration: 200 }}>
      {#if c.kind === "answer"}
        <span class="answer-fill" class:win={c.won} style="background: {c.bgColor}">
          Answer: <button type="button" class="link on-fill" onclick={() => onselect(c.nodeId)}>{c.name}</button>
        </span>
      {:else if c.kind === "leafHint"}
        <span class="hint-text">{c.label}</span>
      {:else if c.kind === "branchHint"}
        <span class="dot" style="background: {c.dotColor}"></span>
        <span class="hint-text">Hint: <button type="button" class="link" onclick={() => onselect(c.sharedNodeId)}>{c.sharedName}</button></span>
      {:else}
        <span class="dot" style="background: {c.dotColor}"></span>
        <button type="button" class="link name" onclick={() => onselect(c.nodeId)}>{c.name}</button>
        <span class="arrow" aria-hidden="true">→</span>
        <button type="button" class="link" onclick={() => onselect(c.sharedNodeId)}>{c.sharedName}</button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3);
    align-items: center; min-width: 0;
  }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--type-label); color: var(--ink);
  }
  .dot {
    flex: none; width: .7rem; height: .7rem; border-radius: var(--radius-pill);
    box-shadow: var(--inset-well);
  }
  .link {
    background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit;
    text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px;
    text-decoration-color: var(--sand-400);
  }
  .link:hover { text-decoration-color: var(--turq); color: var(--turq-dp); }
  .name { font-weight: var(--fw-semibold); }
  .arrow { color: var(--ink-soft); }
  /* hint styling family — branchHint + leafHint share this quieter treatment, set apart from guesses */
  .hint-text { color: var(--ink-soft); font-style: italic; }
  .hint-text .link { color: var(--ink-soft); }
  .hint-text .link:hover { color: var(--turq-dp); }
  /* answer chip — outcome color as the fill, cream ink over it */
  .answer-fill {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .15rem .6rem; border-radius: var(--radius-pill);
    font-weight: var(--fw-bold); color: var(--cream);
  }
  .answer-fill.win { box-shadow: var(--gem-glow); }
  .answer-fill .link.on-fill { color: var(--cream); text-decoration-color: color-mix(in srgb, var(--cream) 60%, transparent); }
  .answer-fill .link.on-fill:hover { color: var(--cream); text-decoration-color: var(--cream); }
</style>
