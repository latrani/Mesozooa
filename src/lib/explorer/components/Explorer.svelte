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
  import { scrollFade } from "../../actions/scrollFade";
  import { viewport } from "../../viewport.svelte";
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
  // Phone: the trail is one horizontally-scrolling line with a fade on whichever edge still hides
  // chips, and a Show all that grows it in place — the same collapse/expand contract the game's
  // chip band uses. Whether the toggle is needed is MEASURED (does the row actually overflow?)
  // rather than guessed from a chip count, because chip widths vary wildly with taxon name length.
  let recentEl = $state<HTMLElement>();
  let recentsOpen = $state(false);
  let recentsOverflow = $state(false);
  $effect(() => {
    void viewport.isPhone;
    recentsOpen = false;
  });
  $effect(() => {
    void [recent, recentsOpen, viewport.isPhone];
    const el = recentEl;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      recentsOverflow = el.scrollWidth > el.clientWidth + 1;
    });
    return () => cancelAnimationFrame(id);
  });
  let showRecentsToggle = $derived(viewport.isPhone && (recentsOverflow || recentsOpen));

  let pathPos = $derived(pathPositions(treeStore, explorer.highlightId));
  const nodeColor = (id: string) => (pathPos.has(id) ? warmthRampColor(1) : warmthRampColor(0));
</script>

<main class="explorer">
  <BoardLayout>
    {#snippet cluster()}
      <SearchBox id="explore" entries={taxa} onpick={(id) => explorer.jumpTo(id)} placeholder="Find any taxon…" />
      {#if recent.length}
        <ul
          class="recent"
          class:open={recentsOpen}
          aria-label="Recently viewed"
          bind:this={recentEl}
          use:scrollFade={[recent, recentsOpen]}
        >
          {#each recent as c (c.nodeId)}
            <Chip chip={c} onselect={jumpAndFocus} />
          {/each}
        </ul>
        {#if showRecentsToggle}
          <button type="button" class="recents-toggle" onclick={() => (recentsOpen = !recentsOpen)}>
            {recentsOpen ? "Show fewer" : "Show all"}
          </button>
        {/if}
      {/if}
    {/snippet}

    {#snippet placard(peek: boolean)}
      {#if treeStore.getNode(explorer.highlightId)}
        <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} {peek} />
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

  /* Phone: recency here is a convenience trail, not game state, so it gets exactly one line and
     the overflow is simply clipped. No +N control; it has not earned a sheet of its own. */
  @media (max-width: 640px) {
    /* collapsed: one line that scrolls sideways, scrollFade marking the edge that still hides chips */
    .recent { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; }
    /* chips must fall off the edge, not squeeze: without this they all shrink toward min-content
       and clip mid-word instead of the trailing ones simply running past the cut. */
    .recent :global(.chip) { flex: none; }
    /* expanded: wraps in place, capped so it can never swallow the tree */
    .recent.open {
      flex-wrap: wrap; overflow-x: visible;
      max-height: 30dvh; overflow-y: auto; overscroll-behavior: contain;
    }
    .recents-toggle {
      background: none; border: 0; padding: 0; cursor: pointer;
      font-size: var(--type-label); font-weight: var(--fw-semibold);
      color: var(--btn-secondary-ink); align-self: flex-start;
      text-decoration: underline; text-underline-offset: 2px;
    }
  }
  /* desktop keeps the plain wrapping trail: no toggle is rendered there at all */
</style>
