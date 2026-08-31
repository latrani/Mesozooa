<script lang="ts">
  import { tierSetting } from "../game/tierStore.svelte";
  import { nav } from "../nav.svelte";
  import { daily } from "../game/dailyStore.svelte";
  import { practice } from "../game/practiceStore.svelte";
  import { tierStores } from "../game/treeData";
  import { TIERS, TIER_LABEL, TIER_BLURB, type Tier } from "../tree/tiers";

  let open = $state(false);
  let rootEl = $state<HTMLElement>();

  const size = (t: Tier) => tierStores[t].playableGenera().length;
  // The dot means the same thing here as in the tab bar: a game of THIS lane is mid-play at that
  // difficulty. Reading the lane off nav keeps one control serving both (Explore has no chip).
  const progress = $derived(
    nav.tab === "daily" ? daily.progressByTier : nav.tab === "practice" ? practice.progressByTier : null,
  );

  function pick(t: Tier) {
    tierSetting.set(t);
    open = false;
  }

  // Close on outside click / Escape. Bound on window only while open, so the listeners cost
  // nothing in the common case.
  $effect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open = false;
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<span class="tier-control" bind:this={rootEl}>
  <button
    type="button"
    class="tier-button"
    aria-haspopup="true"
    aria-expanded={open}
    aria-label="Difficulty: {TIER_LABEL[tierSetting.tier]}"
    onclick={() => (open = !open)}>{TIER_LABEL[tierSetting.tier]}<span class="caret" aria-hidden="true">▾</span></button
  >

  {#if open}
    <div class="menu tier-menu" role="menu" aria-label="Difficulty">
      <p class="menu-head">Difficulty</p>
      {#each TIERS as t (t)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={tierSetting.tier === t}
          class="option"
          class:active={tierSetting.tier === t}
          onclick={() => pick(t)}
        >
          <span class="option-name"
            >{TIER_LABEL[t]}{#if progress?.[t]}<span class="progress-dot" aria-hidden="true"></span
              ><span class="sr-only"> (in progress)</span>{/if}</span
          >
          <span class="option-meta">{size(t)} · {TIER_BLURB[t]}</span>
        </button>
      {/each}
    </div>
  {/if}
</span>

<style>
  .tier-control { position: relative; display: inline-flex; align-items: center; }
  /* No button chrome. It sits INSIDE the tab bar and shares the active tab's underline, so a
     pill would read as a separate control sitting on top of one. Inherits the nav's colour and
     weight; smaller, because the lane is the heading and the difficulty qualifies it. */
  .tier-button {
    background: none; border: none; padding: .15rem 0; cursor: pointer;
    font-family: inherit; font-size: var(--type-label); font-weight: var(--fw-semibold);
    color: inherit; white-space: nowrap;
  }
  .caret { margin-left: 0.3em; font-size: 0.8em; opacity: 0.75; }

  .menu {
    position: absolute; top: calc(100% + var(--space-2)); right: 0; z-index: 20;
    min-width: 15rem;
    /* never wider than the viewport on a narrow phone */
    max-width: calc(100vw - 2 * var(--space-4));
    display: flex; flex-direction: column; gap: 2px;
    padding: var(--space-3);
    background: var(--bg-card, var(--bg-page)); color: var(--ink);
    border: 1px solid var(--placard-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard);
  }

  .menu-head {
    margin: 0 0 var(--space-2); font-size: var(--type-label); font-weight: var(--fw-bold);
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-mute);
  }
  .option {
    display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
    width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-2) var(--space-3);
    background: none; border: none; border-radius: var(--radius-pill);
    font-family: inherit; color: var(--ink);
    border-radius: 0px;
  }
  .option:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .option.active { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .option-name { font-size: var(--type-body); font-weight: var(--fw-bold); white-space: nowrap; }
  /* Same marker as the tab bar's, on the menu's own ground rather than the header's. */
  .progress-dot {
    display: inline-block; width: .4em; height: .4em; margin-left: .4em;
    border-radius: 50%; background: var(--accent); vertical-align: middle;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .option-meta { font-size: var(--type-label); color: var(--ink-mute); }
</style>
