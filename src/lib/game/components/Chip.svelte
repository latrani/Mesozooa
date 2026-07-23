<script lang="ts">
  import type { Chip } from "../chip-view";
  import { fly } from "svelte/transition";

  // The chip primitive: a pill referencing a tree node, in every variant the app shows —
  // a guess, a branch/leaf hint, the end-state answer, or an Explore recent (crumb). One
  // renderer, so the guess list and the explorer trail can't drift. Interactive elements are
  // always inner .link buttons; the pill itself is a list item.
  //
  // ONE pill for everything: the .chip <li> IS the pill (size + geometry + cream-dim fill live
  // here, not in an inner span). Every variant is the SAME --type-heading cream-dim pill by
  // default — guess/answer differentiate by FLOODING it with a warmth color (via .flood), NOT by size.
  // There is deliberately no small/quiet opt-out: a new chip kind that styles nothing inherits
  // the right look. (Hints kept drifting because prominence used to hide in an opt-in span keyed
  // to size — unifying size and differentiating by paint is what fixes it.)
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

  // Guess + answer flood the pill with a warmth color (inline bg). Everything else stays cream-dim.
  let floodColor = $derived(
    chip.kind === "guess" ? chip.dotColor : chip.kind === "answer" ? chip.bgColor : null,
  );
</script>

<li
  class="chip chip-{chip.kind}"
  class:flood={floodColor != null}
  class:answer={chip.kind === "answer"}
  class:warmest
  style={floodColor != null ? `background: ${floodColor}; --glow: ${floodColor}` : ""}
  in:fly={{ y: -10, duration: animateIn ? 200 : 0 }}
>
  {#if chip.kind === "answer"}
    <span class="conn">Answer:</span>
    <button type="button" class="link name on-fill" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
  {:else if chip.kind === "leafHint"}
    {chip.label}
  {:else if chip.kind === "branchHint"}
    Hint: <button type="button" class="link" onclick={() => onselect(chip.sharedNodeId)}>{chip.sharedName}</button>
  {:else if chip.kind === "crumb"}
    <button type="button" class="link name" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
  {:else}
    <button type="button" class="link name on-fill" onclick={() => onselect(chip.nodeId)}>{chip.name}</button>
    <span class="conn">shares</span>
    <button type="button" class="link on-fill" onclick={() => onselect(chip.sharedNodeId)}>{chip.sharedName}</button>
  {/if}
</li>

<style>
  /* THE pill — one capsule for every chip. Default: --type-heading, normal weight, ink, cream-dim fill. Variants
     override FROM here; nothing opts into size, so a new chip kind can't drift to a quiet look. */
  .chip {
    display: inline-flex; align-items: center; gap: .3em;
    padding: .1rem .6rem; border-radius: var(--radius-pill);
    font-size: var(--type-heading); font-weight: var(--fw-regular);  /* WCAG-large floor; see tokens.css */
    background: var(--cream-dim); color: var(--ink);
  }
  /* hint family (branch + leaf) — same pill, set apart by italic + light weight. */
  .chip-branchHint, .chip-leafHint { font-style: italic; font-weight: var(--fw-light); }

  /* guess + answer flood the whole pill with a warmth color; white text clears 3:1 across the
     0..90% ramp where guesses live (>= 14pt = WCAG large). bg set inline per warmth. The links
     inside are the bold underlined names/nodes. */
  .chip.flood {
    color: #fff;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 14%, transparent);
  }
  .conn { font-weight: var(--fw-semibold); opacity: .85; }
  /* default name inherits the pill's normal weight; only the flooded guess/answer names go bold */
  .chip.flood .name { font-weight: var(--fw-black); }

  .link {
    background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit;
    text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px;
    text-decoration-color: var(--sand-400);
  }
  .link:hover { text-decoration-color: var(--turq); color: var(--turq-dp); }
  /* flooded (guess/answer) links: white + bold + underlined per spec */
  .link.on-fill { color: #fff; font-weight: var(--fw-bold); text-decoration-color: color-mix(in srgb, #fff 55%, transparent); }
  .link.on-fill:hover { color: #fff; text-decoration-color: #fff; }
  /* answer chip = a flooded pill with a prominent glow in its OWN warmth color (win = fully-lit;
     loss = your warmest guess's color), set via --glow inline. */
  .chip.answer {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 14%, transparent),
                0 0 5px 3px color-mix(in srgb, var(--glow) 75%, transparent);
  }

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
</style>
