<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import { explorer } from "../explorerStore.svelte";
  import { searchSource, pathPositions } from "../explorer-core";
  import SpineTree from "../../game/components/SpineTree.svelte";
  import { displayName } from "../../game/displayName";
  import { warmthRampColor } from "../../game/warmth-ramp";
  import SearchBox from "../../game/components/SearchBox.svelte";
  import SpecimenPlacard from "../../game/components/SpecimenPlacard.svelte";
  import { nodeView } from "../../game/specimen-view";
  import BoardLayout from "../../game/components/BoardLayout.svelte";
  import Chip from "../../game/components/Chip.svelte";
  import type { Chip as ChipData } from "../../game/chip-view";

  const taxa = searchSource(treeStore);

  // Recently-viewed taxa as crumb chips, most-recent first (the current node leads the list).
  // Same <Chip> the guess list renders — the trail can't drift from the game's chips.
  let recent = $derived<Array<Extract<ChipData, { kind: "crumb" }>>>(
    explorer.history
      .map((id) => ({ id, name: treeStore.getNode(id)?.name }))
      .filter((r): r is { id: string; name: string } => r.name != null)
      .map((r) => ({ kind: "crumb", nodeId: r.id, name: displayName(r.name) })),
  );

  function onnodeselect(id: string) {
    const node = treeStore.getNode(id);
    if (node?.isGenus) explorer.selectGenus(id);
    else explorer.focus(id);
  }

  // The SpineTree instance, so a "Recently viewed" chip can move keyboard focus onto the node it
  // jumps to — same as clicking the node in the tree. Selecting from the trail is just another way
  // to select a node, so it should leave focus ready for arrow navigation.
  let spine = $state<SpineTree>();
  function jumpAndFocus(id: string) {
    explorer.jumpTo(id);
    spine?.focusNode(id);
  }

  // Explore highlights the selected path only (issue #6): on-path (spine) nodes hot, everything
  // else cold. Pinned to the GAME ramp's two endpoints via warmthRampColor(1)/(0) — not hand-picked
  // tokens — so Explore and game can never drift to different warmth colors again.
  let pathPos = $derived(pathPositions(treeStore, explorer.highlightId));
  const nodeColor = (id: string) => (pathPos.has(id) ? warmthRampColor(1) : warmthRampColor(0));
</script>

<main class="explorer">
  <BoardLayout>
    {#snippet cluster()}
      <SearchBox entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
      {#if recent.length}
        <ul class="recent" aria-label="Recently viewed">
          {#each recent as c (c.nodeId)}
            <Chip chip={c} onselect={jumpAndFocus} />
          {/each}
        </ul>
      {/if}
    {/snippet}

    {#snippet placard()}
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} />
      {/if}
    {/snippet}

    {#snippet tree(rightInset)}
      <SpineTree
        bind:this={spine}
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

  /* Inline (flow-wrapping) recently-viewed trail; the items are <Chip> crumbs. */
  .recent {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-2);
  }
</style>
