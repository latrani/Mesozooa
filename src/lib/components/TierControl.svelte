<script lang="ts">
  import { tierSetting } from "../game/tierStore.svelte";
  import { tierStores } from "../game/treeData";
  import { TIERS, type Tier } from "../tree/tiers";

  // `compact` is the phone placement (the board status row); the default is the header button.
  let { compact = false }: { compact?: boolean } = $props();

  let open = $state(false);
  let rootEl = $state<HTMLElement>();

  const LABEL: Record<Tier, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const BLURB: Record<Tier, string> = {
    easy: "the famous ones",
    medium: "the standard set",
    hard: "Mesozoic Mind",
  };
  const size = (t: Tier) => tierStores[t].playableGenera().length;

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

<span class="tier-control" class:compact bind:this={rootEl}>
  <button
    type="button"
    class="tier-button"
    class:btn-secondary={!compact}
    class:btn-secondary-inverse={!compact}
    class:btn-small={!compact}
    aria-haspopup="true"
    aria-expanded={open}
    aria-label="Difficulty: {LABEL[tierSetting.tier]}"
    onclick={() => (open = !open)}>{LABEL[tierSetting.tier]}<span class="caret" aria-hidden="true">▾</span></button
  >

  {#if open}
    <div class="menu" role="menu" aria-label="Difficulty">
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
          <span class="option-name">{LABEL[t]}</span>
          <span class="option-meta">{size(t)} · {BLURB[t]}</span>
        </button>
      {/each}
      <p class="menu-foot">Each difficulty keeps its own daily puzzle and its own round — switching never loses one.</p>
    </div>
  {/if}
</span>

<style>
  .tier-control { position: relative; display: inline-flex; align-items: center; }
  .caret { margin-left: 0.35em; font-size: 0.8em; opacity: 0.75; }

  /* Compact (phone status row): reads as a quiet inline control beside the move counter rather
     than a second button competing with Hint. */
  .compact .tier-button {
    background: none; border: none; padding: 0;
    font-family: inherit; font-size: var(--type-body); font-weight: var(--fw-black);
    color: var(--btn-secondary-ink); white-space: nowrap; cursor: pointer;
  }
  .compact .tier-button:hover { text-decoration: underline; }

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
  /* No compact override: on phone the status row sits near the TOP of the board (y~164 of 844),
     so the default downward, right-anchored menu is the one that stays on screen. Opening it
     upward put it at y=-160. */

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
  }
  .option:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .option.active { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .option-name { font-size: var(--type-body); font-weight: var(--fw-bold); }
  .option-meta { font-size: var(--type-label); color: var(--ink-mute); }
  .menu-foot {
    margin: var(--space-2) 0 0; padding-top: var(--space-2);
    border-top: 1px solid var(--placard-edge);
    font-size: var(--type-label); color: var(--ink-mute); line-height: 1.35;
  }
</style>
