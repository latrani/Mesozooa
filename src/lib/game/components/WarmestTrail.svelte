<script lang="ts">
  import { treeStore } from "../treeData";
  import { displayName } from "../displayName";

  let {
    warmestId,
    onpan,
  }: {
    warmestId: string | null;
    onpan?: (id: string) => void;
  } = $props();

  let trail = $derived(warmestId ? treeStore.pathToRoot(warmestId).slice().reverse() : []);
</script>

<nav class="trail" aria-label="Warmest shared lineage">
  {#each trail as id, i (id)}
    {@const node = treeStore.getNode(id)}
    <button type="button" class="crumb" class:active={i === trail.length - 1} onclick={() => onpan?.(id)} disabled={!onpan}>
      <span class="rung-dot" aria-hidden="true"></span>{displayName(node?.name)}
    </button>
    {#if i < trail.length - 1}<span class="sep"> › </span>{/if}
  {/each}
</nav>

<style>
  .trail {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: linear-gradient(var(--trail-surface), var(--trail-dp));
    border: 1px solid var(--trail-edge);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    color: var(--trail-text);
  }
  .crumb {
    font-size: var(--type-label); font-weight: var(--fw-semibold);
    color: var(--trail-text); background: none; border: 0; cursor: pointer;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-pill);
    transition: background var(--dur-fast) var(--ease);
  }
  .crumb:hover:not(:disabled), .crumb.active {
    background: rgba(247,239,224,.18);
    box-shadow: inset 0 0 0 1px rgba(247,239,224,.35);
  }
  .crumb:disabled { cursor: default; }
  .sep { color: var(--trail-text-dim); opacity: .6; }
  /* dot marker: hidden in the desktop horizontal crumb row, shown as a rung marker at narrow */
  .rung-dot { display: none; }

  /* Narrow: the crumb row becomes a vertical stacked lineage placard (root -> frontier). */
  @media (max-width: 640px) {
    .trail {
      flex-direction: column; align-items: stretch; flex-wrap: nowrap;
      border-radius: var(--radius-card); gap: 0; padding: var(--space-2) var(--space-1);
    }
    .crumb {
      display: flex; align-items: center; gap: var(--space-2); width: 100%;
      padding: var(--space-2) var(--space-4); font-size: var(--type-heading); border-radius: 0; position: relative;
    }
    .crumb.active { font-weight: var(--fw-black); font-size: var(--type-title); }
    .rung-dot {
      display: block; width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto;
      background: var(--turq); box-shadow: 0 0 0 3px rgba(13,154,168,.18);
    }
    .crumb.active .rung-dot {
      width: 18px; height: 18px; background: var(--turq-dp);
      box-shadow: 0 0 0 4px rgba(247,239,224,.35);
    }
    /* connector line between rungs */
    .crumb:not(:last-child)::after {
      content: ""; position: absolute; left: calc(1rem + 6px); top: 2rem;
      width: 2px; height: calc(100% - .8rem); background: var(--turq); opacity: .55;
    }
    .sep { display: none; }
  }
</style>
