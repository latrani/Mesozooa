<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import { explorer } from "../explorerStore.svelte";
  import { searchSource, pathPositions } from "../explorer-core";
  import SpineTree from "../../game/components/SpineTree.svelte";
  import { displayName } from "../../game/displayName";
  import SearchBox from "../../game/components/SearchBox.svelte";
  import SpecimenPlacard from "../../game/components/SpecimenPlacard.svelte";
  import { nodeView } from "../../game/specimen-view";
  import BoardLayout from "../../game/components/BoardLayout.svelte";

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
</script>

<main class="explorer">
  <BoardLayout>
    {#snippet cluster()}
      <SearchBox entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
      {#if recent.length}
        <nav class="recent" aria-label="Recently viewed">
          {#each recent as r (r.id)}
            <button type="button" class="link" onclick={() => explorer.jumpTo(r.id)}>{displayName(r.name)}</button>
          {/each}
        </nav>
      {/if}
    {/snippet}

    {#snippet placard()}
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} />
      {/if}
    {/snippet}

    {#snippet tree(rightInset)}
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
    {/snippet}
  </BoardLayout>
</main>

<style>
  /* Minimal wrapper — BoardLayout owns the board skeleton; .explorer just fills its slot. */
  .explorer { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }

  /* Inline (flow-wrapping) recently-viewed trail; links echo the guess-name affordance. */
  .recent {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4);
    font-size: var(--type-label);
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
</style>
