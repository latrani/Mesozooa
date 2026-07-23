<script lang="ts">
  import { treeStore } from "../treeData";
  import { chipsFor, phoneChips } from "../chip-view";
  import type { GuessResult } from "../types";
  import Chip from "./Chip.svelte";
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

  // Phone shows latest + warmest + a count until the band is expanded; desktop always shows the
  // full list. Selection is pure (chip-view), so this component stays a renderer.
  let selection = $derived(phoneChips(chips, warmestId));

  let expanded = $state(false);
  let collapsed = $derived(viewport.isPhone && !expanded);
  // Expanding renders the SAME chip objects in their true order. Because the keys below are
  // stable, Svelte reuses the two already-visible chips' DOM nodes and mounts only the newcomers
  // — so in:fly animates exactly the chips that appeared, and the two you had settle into their
  // rightful slots. No animate:flip: `animate:` cannot be applied to a component, and the keyed
  // reuse already gives the effect.
  let visible = $derived(collapsed ? selection.shown : chips);
  let overflow = $derived(collapsed ? selection.hiddenCount : 0);

  // stable key per chip for the flex list / transitions
  function keyOf(c: ReturnType<typeof chipsFor>[number], i: number): string {
    if (c.kind === "answer") return "answer";
    if (c.kind === "leafHint") return `leaf-${i}`;
    return `${c.kind}-${c.nodeId}`;
  }
</script>

{#if visible.length}
  <ul class="chips" class:expanded={viewport.isPhone && expanded}>
    {#each visible as c, i (keyOf(c, i))}
      <Chip chip={c} {onselect} animateIn warmest={viewport.isPhone && c === selection.warmestChip} />
    {/each}
  </ul>
{/if}

{#if overflow > 0}
  <button type="button" class="overflow" onclick={() => (expanded = true)}>+ {overflow} more</button>
{:else if viewport.isPhone && expanded && selection.hiddenCount > 0}
  <button type="button" class="overflow" onclick={() => (expanded = false)}>Show fewer</button>
{/if}

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-2);
    align-items: center; min-width: 0;
  }
  /* Expanded on phone: the band grows in place, but it must never eat the tree whole, so it caps
     and scrolls internally. */
  .chips.expanded {
    max-height: 38dvh; overflow-y: auto; overscroll-behavior: contain;
    align-items: flex-start; align-content: flex-start;
  }
  .overflow {
    background: none; border: 0; padding: 0; cursor: pointer;
    font-size: var(--type-label); font-weight: var(--fw-semibold);
    color: var(--btn-secondary-ink); align-self: flex-start;
    text-decoration: underline; text-underline-offset: 2px;
  }
</style>
