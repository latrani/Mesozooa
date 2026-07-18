<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import { explorer } from "../explorerStore.svelte";
  import { searchSource, pathPositions } from "../explorer-core";
  import SpineTree from "../../game/components/SpineTree.svelte";
  import { displayName } from "../../game/displayName";
  import SearchBox from "../../game/components/SearchBox.svelte";
  import SpecimenPlacard from "../../game/components/SpecimenPlacard.svelte";
  import { nodeView } from "../../game/specimen-view";

  const taxa = searchSource(treeStore);

  // Recently-viewed taxa, most-recent first (the current node leads the list).
  let recent = $derived(
    explorer.history
      .map((id) => ({ id, name: treeStore.getNode(id)?.name }))
      .filter((r) => r.name),
  );

  function onnodeselect(id: string) {
    const node = treeStore.getNode(id);
    if (node?.isGenus) explorer.selectGenus(id);
    else explorer.focus(id);
  }

  // Explore highlights the selected path only (issue #6): on-path (spine) nodes turquoise,
  // everything else ore. Intentionally diverges from game mode's warmth coloring.
  let pathPos = $derived(pathPositions(treeStore, explorer.highlightId));
  const nodeColor = (id: string) => (pathPos.has(id) ? "var(--turq)" : "var(--placard-edge)");

  // Match the game board: measure the floating detail card so the tree centers into the area
  // left of it, with no inset on narrow (card stacks in flow).
  let detailW = $state(0);
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
  // inset only on desktop, where the detail card floats over the tree
  let rightInset = $derived(isDesktop && detailW ? detailW + 24 + 24 : 0);
</script>

<main class="explorer">
  <div class="middle">
    <SpineTree
      revealed={explorer.revealed}
      tipId={explorer.highlightId}
      highlightId={explorer.highlightId}
      {nodeColor}
      {onnodeselect}
      {rightInset}
      gradeByPlayable
      emptyLabel="Search for a taxon to explore the tree."
    />
    <div class="detail-float" bind:clientWidth={detailW}>
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} />
      {/if}
    </div>
  </div>

  <div class="bottom">
    <SearchBox entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
    {#if recent.length}
      <nav class="recent" aria-label="Recently viewed">
        <span class="recent-label">Recent:</span>
        {#each recent as r (r.id)}
          <button type="button" class="link" onclick={() => explorer.jumpTo(r.id)}>{displayName(r.name)}</button>
        {/each}
      </nav>
    {/if}
  </div>
</main>

<style>
  /* Structural mirror of the game board: hero tree canvas + floating detail + bottom search. */
  .explorer { display: flex; flex-direction: column; gap: var(--space-4); padding: 0 var(--space-6) var(--space-6); }

  /* Inline (flow-wrapping) recently-viewed trail; links echo the guess-name affordance. */
  .recent {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4);
    margin-top: var(--space-3); font-size: var(--type-label);
  }
  .recent-label {
    color: var(--ink-soft); font-size: var(--type-eyebrow); font-weight: var(--fw-black);
    letter-spacing: .1em; text-transform: uppercase;
  }
  .recent .link {
    background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: var(--ink);
    font-weight: var(--fw-medium); text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 2px; text-decoration-color: var(--sand-400);
  }
  .recent .link:hover { text-decoration-color: var(--turq); color: var(--turq-dp); }
  .middle { display: flex; gap: var(--space-6); align-items: flex-start; min-height: 0; }
  .middle :global(.tree-viewport) { flex: 1 1 auto; min-width: 0; }

  @media (min-width: 641px) {
    /* fill the viewport slot; tree is an edge-to-edge canvas, detail floats over it, search
       is a pegged placard mirroring the game's guess area. */
    .explorer { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    .middle { position: relative; display: block; flex: 1 1 auto; min-height: 0; }
    .middle :global(.tree-viewport) { position: absolute; inset: 0; }
    .middle :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: safe center; overflow: auto;
    }
    .middle :global(.tree) { flex: none; }
    .detail-float {
      position: absolute; top: 50%; right: var(--space-5); transform: translateY(-50%);
      z-index: 3; width: max-content;
    }
    /* edge-to-edge surface placard with a soft shadow UP onto the tree (matches the game). */
    .bottom {
      flex: 0 0 auto; padding: var(--space-4) var(--space-5) var(--space-3); position: relative; z-index: 4;
      background: var(--bg-surface); border-top: 1px solid var(--hairline);
      box-shadow: 0 -6px 16px -8px rgba(51, 38, 26, 0.35);
    }
  }
  /* Narrow: tree fills, detail stacks below, search pegged at the bottom. */
  @media (max-width: 640px) {
    .explorer { padding-top: var(--space-4); }
    .middle { flex-direction: column; }
    .middle :global(.tree-viewport) { width: 100%; }
    .middle :global(.tree-scroll) { width: 100%; }
    .bottom { position: sticky; bottom: 0; background: var(--bg-page); padding-bottom: var(--space-3); z-index: 2; }
  }
</style>
