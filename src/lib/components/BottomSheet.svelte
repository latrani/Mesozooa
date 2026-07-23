<script lang="ts">
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";

  // Phone-only chrome: the specimen plaque as a real drawer.
  //
  // THE MODEL IS TRANSLATION, NOT HEIGHT. The drawer is one rigid block, always laid out at its
  // full natural height, sitting in a layer ON TOP of the board. Closed, it is pushed down so only
  // the heading row shows; pulling it up slides the WHOLE block — heading included — over the tree
  // rather than growing a panel that displaces it. If the block is taller than the screen, its
  // lower part stays hanging below the viewport edge, and pulling further carries the heading off
  // the top, exactly the way a physical drawer comes out of a cabinet.
  //
  // That is why there is no inner scroll box and no mask-fade: the content does not END at the
  // screen edge, it CONTINUES past it. A shadow pinned to the true bottom of the viewport says so.
  //
  // The drag lives on the heading row only, so it never competes with the tree's own pan gesture.
  let {
    expanded = $bindable(false),
    peek,
    children,
  }: {
    expanded?: boolean;
    peek: Snippet;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const bodyId = `sheet-body-${uid}`;

  /** a tap-open reveals at most this fraction of the viewport; a drag can go the whole way */
  const OPEN_MAX = 0.5;

  let sheetEl = $state<HTMLElement>();
  let peekEl = $state<HTMLElement>();

  let drawerH = $state(0);
  let peekH = $state(0);
  /** px pulled out beyond the heading row. 0 = closed, maxPull = fully extended. */
  let pull = $state(0);

  let maxPull = $derived(Math.max(0, drawerH - peekH));
  /** how far DOWN the block is pushed; 0 means fully out */
  let offset = $derived(Math.max(0, maxPull - pull));
  /** the block still runs past the bottom of the screen, so the shadow marks that it continues */
  let moreBelow = $derived(offset > 1);

  const vh = () => (typeof window === "undefined" ? 0 : window.innerHeight);
  const openPull = () => Math.min(maxPull, Math.max(0, vh() * OPEN_MAX - peekH));

  // Measure the block at its natural height. Both edges matter: the card's own content changes
  // (photo loads, clue rows appear) and so does the heading's wrap.
  $effect(() => {
    const s = sheetEl;
    const p = peekEl;
    if (!s || !p) return;
    const read = () => {
      drawerH = s.offsetHeight;
      peekH = p.offsetHeight;
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(s);
    ro.observe(p);
    return () => ro.disconnect();
  });

  // `expanded` is the outside world's handle (the game raises the drawer at end of round). Setting
  // it drives `pull`; the drag writes `pull` and reports back. untrack keeps the two from looping.
  $effect(() => {
    if (expanded) {
      if (untrack(() => pull) === 0) pull = openPull();
    } else if (untrack(() => pull) !== 0) {
      pull = 0;
    }
  });

  // --- drag ---------------------------------------------------------------------------------
  // One pointer sequence serves both gestures: under the slop threshold it is a tap and toggles,
  // above it it slides the drawer.
  const SLOP = 6;
  // $state because the template reads it (class:sliding suppresses the settle transition mid-drag)
  let dragging = $state(false);
  let startY = 0;
  let startPull = 0;
  let moved = false;

  function setPull(next: number) {
    pull = Math.max(0, Math.min(next, maxPull));
    expanded = pull > 0;
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    moved = false;
    startY = e.clientY;
    startPull = pull;
    peekEl?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dy = startY - e.clientY; // up is positive: pulling the drawer out
    if (!moved && Math.abs(dy) < SLOP) return;
    moved = true;
    setPull(startPull + dy);
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { peekEl?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!moved) {
      setPull(pull > 0 ? 0 : openPull());
      return;
    }
    // Only a DELIBERATE release tidies a sliver away. pointercancel must not, or an interrupted
    // gesture silently slams a drawer the user was still opening.
    if (e.type === "pointerup" && pull > 0 && pull < peekH) setPull(0);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPull(pull > 0 ? 0 : openPull());
    }
  }
</script>

<!-- A layer over the board, not a band inside it: the drawer slides ACROSS the UI. The layer
     itself is inert to pointers so the tree underneath stays fully interactive. -->
<div class="drawer-layer">
  <div
    class="sheet"
    class:sliding={dragging}
    bind:this={sheetEl}
    style="transform: translateY({offset}px)"
  >
    <div
      class="peek"
      role="button"
      tabindex="0"
      bind:this={peekEl}
      aria-expanded={pull > 0}
      aria-controls={bodyId}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onkeydown={onKeydown}
      ondragstart={(e) => e.preventDefault()}
      draggable="false" 
    >
      <span class="grabber" aria-hidden="true"></span>
      <span class="peek-content">{@render peek()}</span>
      <span class="chevron" aria-hidden="true">{pull > 0 ? "▼" : "▲"}</span>
    </div>

    <!-- Always rendered: the block must be laid out at full height for the translation to have
         anything to reveal. `inert` keeps the off-screen part out of the tab order and the a11y
         tree while it is stowed. -->
    <div class="body" id={bodyId} inert={pull === 0}>
      {@render children()}
    </div>
  </div>

  {#if moreBelow}
    <!-- Pinned to the TRUE bottom of the viewport, not to the drawer: it marks that the block
         continues past the screen edge, which a fade on the drawer itself cannot say. -->
    <div class="more-shadow" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .drawer-layer {
    position: absolute; inset: 0; z-index: 6;
    pointer-events: none; overflow: hidden;
  }
  .sheet {
    /* bottom-anchored and translated DOWN by `offset`: at offset 0 the block is fully out with its
       base on the screen edge; at offset == maxPull only the heading shows. Height is never
       constrained, so the stowed part simply hangs past the bottom and is clipped by the layer. */
    position: absolute; left: 0; right: 0; bottom: 0;
    pointer-events: auto;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border-top: 1px solid var(--specimen-edge);
    color: var(--specimen-text);
    --btn-secondary-ink: var(--cream);
    box-shadow: 0 -6px 16px -8px rgba(51, 38, 26, 0.35);
    display: flex; flex-direction: column;
    will-change: transform;
  }
  /* settle smoothly on tap-open/close, but never lag the finger mid-drag */
  .sheet:not(.sliding) { transition: transform var(--dur) var(--ease); }

  /* the heading row is both the toggle and the drag handle */
  .peek {
    display: flex; align-items: center; gap: var(--space-3);
    position: relative; width: 100%;
    padding: var(--space-3) var(--space-4) var(--space-2);
    background: none; border: 0; cursor: grab;
    color: inherit; text-align: left;
    flex: 0 0 auto; touch-action: none; user-select: none;
    /* Suppress the browser's native element/text drag. Without it the platform hijacks the
       pointer stream one move in and the drawer freezes mid-pull. */
    -webkit-user-drag: none;
  }
  .peek:active { cursor: grabbing; }
  .grabber {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    width: 2.25rem; height: 4px; border-radius: 2px;
    background: var(--cream); opacity: .35;
  }
  .peek-content { display: flex; align-items: center; gap: var(--space-3); flex: 1 1 auto; min-width: 0; }
  .chevron { flex: none; opacity: .7; font-size: var(--type-label); }
  .body {
    padding: 0 var(--space-4);
    /* clears the home indicator when the drawer is pulled fully out */
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
    flex: 0 0 auto;
  }
  /* Shadow, not a fade: the content is continuing past the screen edge, not dissolving. */
  .more-shadow {
    position: absolute; left: 0; right: 0; bottom: 0; height: 1.75rem;
    pointer-events: none;
    background: linear-gradient(to top, rgba(51, 38, 26, 0.38), rgba(51, 38, 26, 0));
  }
</style>
