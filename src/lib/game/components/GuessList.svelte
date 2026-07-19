<script lang="ts">
  import { treeStore } from "../treeData";
  import { chipsFor } from "../chip-view";
  import type { GuessResult } from "../types";
  import Chip from "./Chip.svelte";

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

{#if chips.length}
  <ul class="chips">
    {#each chips as c, i (keyOf(c, i))}
      <Chip chip={c} {onselect} animateIn />
    {/each}
  </ul>
{/if}

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-2);
    align-items: center; min-width: 0;
  }
</style>
