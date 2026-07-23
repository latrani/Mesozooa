<script lang="ts">
  import type { Snippet } from "svelte";
  import { viewport } from "../../viewport.svelte";
  import BottomSheet from "../../components/BottomSheet.svelte";

  let { cluster, placard, tree, sheetExpanded = $bindable(false) }: {
    cluster: Snippet;
    /** rendered twice on phone (peek row + expanded card) and once on desktop; the flag says which */
    placard: Snippet<[boolean]>;
    tree: Snippet<[number]>;
    /** phone only: lets a consumer force the sheet open, e.g. GameBoard on end state */
    sheetExpanded?: boolean;
  } = $props();

  // Desktop measures the floating placard so the tree centers into the area LEFT of it. On phone
  // the placard is a bottom sheet in flow, so there is no inset.
  let placardW = $state(0);
  let rightInset = $derived(!viewport.isPhone && placardW ? placardW + 24 + 24 : 0);

  // Crossing the breakpoint re-lays-out the board, so the sheet must return to its collapsed
  // default rather than reappearing expanded. Rotating a phone crosses 640px twice.
  $effect(() => {
    void viewport.isPhone;
    sheetExpanded = false;
  });

  // The desktop placard is a fixed top-floating layer (see the style block). It publishes two vars, the
  // same documentElement channel the mobile drawer uses for --drawer-peek-h, because the readers
  // (the placard's own rest pad; the zoom controls in a different stacking context) can't see this
  // element directly:
  //   --placard-rest-top : scroll-box top pad, so at rest the card sits below the header as today.
  //   --placard-clearance: how far the zoom controls slide LEFT, non-zero only when the card is
  //                        tall enough to reach their bottom-right corner (#65 open question).
  let placardEl = $state<HTMLElement>();
  $effect(() => {
    if (viewport.isPhone) return; // phone uses the BottomSheet; no fixed layer, no vars
    const el = placardEl;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const headerH = document.querySelector<HTMLElement>(".app-header")?.offsetHeight ?? 0;
      root.style.setProperty("--placard-rest-top", `${headerH + 16}px`); // 16 == --space-4 cluster pad
      // The card's on-screen bottom at scrollTop 0 == its scrollHeight (rest pad is inside the box).
      // Compare to the zoom controls' DEFAULT (unshifted) band top, so shifting them never changes
      // this test (no oscillation). Measure the controls' height; fall back if not mounted yet.
      const zh = document.querySelector<HTMLElement>(".zoom-controls")?.offsetHeight ?? 36;
      const controlsBandTop = window.innerHeight - 16 - zh; // 16 == --space-4 bottom inset
      const overlaps = el.scrollHeight > controlsBandTop;
      root.style.setProperty("--placard-clearance", overlaps ? `${el.offsetWidth + 24}px` : "0px"); // 24 == --space-5 gap
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--placard-rest-top");
      root.style.removeProperty("--placard-clearance");
    };
  });
</script>

<div class="board">
  <div class="cluster">
    <div class="cluster-main">
      {@render cluster()}
    </div>
    {#if !viewport.isPhone}
      <div class="specimen-float" bind:this={placardEl} bind:clientWidth={placardW}>
        {@render placard(false)}
      </div>
    {/if}
  </div>

  <div class="tree-body">
    {@render tree(rightInset)}
  </div>

  {#if viewport.isPhone}
    <BottomSheet bind:expanded={sheetExpanded}>
      {#snippet peek()}{@render placard(true)}{/snippet}
      {@render placard(false)}
    </BottomSheet>
  {/if}
</div>

<style>
  /* Shared board skeleton. Desktop: top cluster with a floating placard, tree owns the body.
     Phone: input band pegged top, tree owns the middle, plaque sheet pegged bottom. */
  .board { display: flex; flex-direction: column; height: 100%; min-height: 0; position: relative; }

  @media (min-width: 641px) {
    .board { flex: 1 1 auto; min-height: 0; gap: 0; padding: 0; }
    /* the cluster is a pegged top band; the placard floats over its top-right, sized to its own
       content; the tree fills the whole body below and centers into the area LEFT of it. */
    .cluster {
      position: relative; flex: 0 0 auto;
      padding: var(--space-4);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    /* reserve room on the right so wrapping cluster content never slides under the floating placard */
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-4); padding-right: 22rem; }
    /* The placard is the top-floating element: a fixed layer above the header (z 8 > header 4),
       clipped only by the viewport edges. It scrolls as ONE rigid block — the rest pad seats the
       card below the header at scrollTop 0 (pixel-identical to the old absolute rest), and scrolling
       slides the whole card up over the header and down over the footer. The layer is inert so the
       tree stays interactive behind it; the card re-enables pointers. (Mirrors the mobile drawer.) */
    .specimen-float {
      position: fixed; top: 0; right: var(--space-5); z-index: 8;
      width: max-content; max-height: 100dvh;
      overflow-y: auto; overscroll-behavior: contain;
      padding-top: var(--placard-rest-top, var(--space-4));
      pointer-events: none;
    }
    .specimen-float > :global(*) { pointer-events: auto; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; }
    /* SpineTree relies on its consumer to make .tree-scroll the flex row that seats the fixed
       runway spacer beside the SVG (issue #32) and enables vertical scroll + centering. */
    .tree-body :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
  }

  /* PHONE — three pegged bands. The cluster and the sheet are flex:0 0 auto so the tree body
     absorbs every remaining pixel; nothing here scrolls the document (base.css locks the shell). */
  @media (max-width: 640px) {
    .cluster {
      flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--bg-surface); border-bottom: 1px solid var(--hairline);
      box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35); z-index: 4;
    }
    .cluster-main { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
    .tree-body { position: relative; flex: 1 1 auto; min-height: 0; }
    .tree-body :global(.tree-viewport) { position: absolute; inset: 0; width: 100%; }
    .tree-body :global(.tree-scroll) {
      position: absolute; inset: 0; display: flex;
      align-items: safe center; justify-content: flex-start; overflow: auto;
    }
  }
</style>
