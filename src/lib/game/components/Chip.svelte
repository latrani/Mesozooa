<script lang="ts">
  import type { Chip } from "../chip-view";
  import { fly } from "svelte/transition";

  // The chip primitive: a pill referencing a tree node, in every variant the app shows —
  // a guess, a branch/leaf hint, the end-state answer, or an Explore recent (crumb). One
  // renderer, so the guess list and the explorer trail can't drift. Interactive elements are
  // always inner .link buttons; the pill itself is a list item.
  let {
    chip,
    onselect,
    animateIn = false,
  }: {
    chip: Chip;
    onselect: (nodeId: string) => void;
    /** guess list: fly each chip in as it lands. Static lists (recents) leave it off. */
    animateIn?: boolean;
  } = $props();
</script>

<li class="chip chip-{chip.kind}" in:fly={{ y: -10, duration: animateIn ? 200 : 0 }}>
  {#if chip.kind === "answer"}
    <span class="answer-fill" class:win={chip.won} style="background: {chip.bgColor}">
      Answer: <button type="button" class="link on-fill" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
    </span>
  {:else if chip.kind === "leafHint"}
    <span class="hint-text">{chip.label}</span>
  {:else if chip.kind === "branchHint"}
    <span class="dot" style="background: {chip.dotColor}"></span>
    <span class="hint-text">Hint: <button type="button" class="link" onclick={() => onselect(chip.sharedNodeId)}>{chip.sharedName}</button></span>
  {:else if chip.kind === "crumb"}
    <button type="button" class="link name" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
  {:else}
    <span class="dot" style="background: {chip.dotColor}"></span>
    <span class="chip-text">
      <button type="button" class="link name" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
      shares
      <button type="button" class="link" onclick={() => onselect(chip.sharedNodeId)}>{chip.sharedName}</button>
    </span>
  {/if}
</li>

<style>
  /* The pill: a cream-dim capsule whose height is its text line box. Padding hugs the left so a
     leading dot sits near the edge; variants that carry no dot re-pad below. */
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-1);
    font-size: var(--type-label); color: var(--ink);
    background: var(--cream-dim); border-radius: var(--radius-pill);
    padding: 0 0.4rem 0 4px;
  }
  /* the answer chip's fill IS the pill, so strip the outer pill's padding to let it fill edge-to-edge */
  .chip.chip-answer { padding: 0; }
  /* crumb + leafHint carry no dot — even up the padding so text isn't lopsided toward the left */
  .chip.chip-crumb, .chip.chip-leafHint { padding: 0 .55rem; }

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
  .chip-crumb .name { font-weight: var(--fw-medium); }
  /* hint styling family — branchHint + leafHint share this quieter treatment, set apart from guesses */
  .hint-text { color: var(--ink-soft); font-style: italic; }
  .hint-text .link { color: var(--ink-soft); }
  .hint-text .link:hover { color: var(--turq-dp); }
  /* answer chip — outcome color as the fill, cream ink over it */
  .answer-fill {
    display: inline-flex; align-items: center; gap: .35rem;
    /* no vertical padding: match the dot-carrying chips, whose height is their text line box. */
    padding: 0 .6rem; border-radius: var(--radius-pill);
    font-weight: var(--fw-bold); color: var(--cream);
  }
  .answer-fill.win { box-shadow: var(--gem-glow); }
  .answer-fill .link.on-fill { color: var(--cream); text-decoration-color: color-mix(in srgb, var(--cream) 60%, transparent); }
  .answer-fill .link.on-fill:hover { color: var(--cream); text-decoration-color: var(--cream); }
</style>
