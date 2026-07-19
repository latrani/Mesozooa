<script lang="ts">
  import type { Snippet } from "svelte";

  let { cluster, placard, tree }: {
    cluster: Snippet;
    placard: Snippet;
    tree: Snippet<[number]>;
  } = $props();

  // Measure the floating placard so the tree centers into the area LEFT of it; on narrow it stacks
  // in flow, so no inset. (This logic previously lived — identically — in both GameBoard and Explorer.)
  let placardW = $state(0);
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
  // inset = placard width + its right offset (--space-5 = 24px) + a breathing gap before the tree
  let rightInset = $derived(isDesktop && placardW ? placardW + 24 + 24 : 0);
</script>

<div class="board">
  <div class="cluster">
    <div class="cluster-main">
      {@render cluster()}
    </div>
    <div class="specimen-float" bind:clientWidth={placardW}>
      {@render placard()}
    </div>
  </div>

  <div class="tree-body">
    {@render tree(rightInset)}
  </div>
</div>

<style>
  /* Shared board skeleton — top cluster (mode content + floating placard), tree owns the body.
     Structural only; visual treatment of the cluster contents lives with each mode. */
  .board { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  @media (min-width: 641px) {
    .board { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    /* the cluster is a pegged top band; the placard floats over its top-right, sized to its own
       content; the tree fills the whole body below and centers into the area LEFT of it. */
    .cluster {
      position: relative; flex: 0 0 auto;
      padding: var(--space-4) var(--space-5);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    /* reserve room on the right so wrapping cluster content never slides under the floating placard */
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-3); padding-right: 22rem; }
    .specimen-float { position: absolute; top: var(--space-4); right: var(--space-5); z-index: 5; width: max-content; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; }
    /* SpineTree relies on its consumer to make .tree-scroll the flex row that seats the fixed
       runway spacer beside the SVG (issue #32) and enables vertical scroll + centering. */
    .tree-body :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
  }

  /* Minimal narrow collapse: single column, cluster above the tree. NOT the real responsive pass
     (#12) — just a correct fallback that doesn't reference the now-deleted .middle/.bottom classes. */
  @media (max-width: 640px) {
    .board { flex-direction: column; }
    .cluster { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-3); }
    .specimen-float { width: 100%; }
    .tree-body :global(.tree-viewport) { width: 100%; }
    .tree-body :global(.tree-scroll) { width: 100%; }
  }
</style>
