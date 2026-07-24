<script lang="ts">
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";

  // Phone-only chrome: the specimen plaque(s) as a real drawer.
  //
  // THE MODEL IS TRANSLATION, NOT HEIGHT. The drawer is one rigid block, always laid out at its
  // full natural height, sitting in a layer ON TOP of the board. Closed, it is pushed down so only
  // the TOP card's header shows; pulling it up slides the WHOLE block over the tree rather than
  // growing a panel that displaces it. If the block is taller than the screen, its lower part stays
  // hanging below the viewport edge, and pulling further carries the top header off the top, exactly
  // the way a physical drawer comes out of a cabinet.
  //
  // That is why there is no inner scroll box and no mask-fade: the content does not END at the
  // screen edge, it CONTINUES past it. A shadow pinned to the true bottom of the viewport says so.
  //
  // THE STACK IS PEER CARDS. The sheet itself is a transparent flex column; each card carries its
  // own frame and its own header (grabber + peek content + caret), mirroring the desktop float where
  // the specimen and the selected-node placard are two framed peers with a gap. The drag lives on
  // the whole sheet, so a drag from ANY card slides the drawer; a TAP on any card's header toggles
  // it. Retracting from either header retracts the whole stack to a peek of the top card's header.
  interface Card {
    /** the header row's content (the placard in peek mode: title + note) */
    head: Snippet;
    /** the card's full body (the placard with its own title hidden on phone) */
    body: Snippet;
  }
  let {
    expanded = $bindable(false),
    cards,
  }: {
    expanded?: boolean;
    cards: Card[];
  } = $props();

  const uid = $props.id();

  /** a tap-open reveals at most this fraction of the viewport; a drag can go the whole way */
  const OPEN_MAX = 0.5;

  let sheetEl = $state<HTMLElement>();

  let drawerH = $state(0);
  /** the retracted footprint: the TOP card's header height (what stays visible when stowed) */
  let peekH = $state(0);
  /** px pulled out beyond the top header. 0 = closed, maxPull = fully extended. */
  let pull = $state(0);

  let maxPull = $derived(Math.max(0, drawerH - peekH));
  /** how far DOWN the block is pushed; 0 means fully out */
  let offset = $derived(Math.max(0, maxPull - pull));
  /** the block still runs past the bottom of the screen, so the shadow marks that it continues */
  let moreBelow = $derived(offset > 1);

  const vh = () => (typeof window === "undefined" ? 0 : window.innerHeight);
  const offsetFor = (h: number, ph: number, p: number) => Math.max(0, (h - ph) - p);
  const openPull = () => Math.min(maxPull, Math.max(0, vh() * OPEN_MAX - peekH));

  // Suppresses the settle transition for the frame(s) where the drawer's measured size changes.
  // The sheet is bottom-anchored, so growing it (adding the 2nd card, a photo loading) shifts its
  // top UP instantly; the compensating transform is under `transition: transform`, so it would
  // ANIMATE back down — a visible snap-up-then-slide ("the funky jump"). Snapping kills the animation.
  let remeasuring = $state(false);

  // THE TRANSFORM IS IMPERATIVE, not template-bound, so a size change and its compensating offset
  // land in the SAME pre-paint frame. Otherwise one frame paints the taller stack against the stale
  // transform — a raw flicker no transition-suppression can hide ("the funky jump" adding a 2nd card).
  const applyTransform = (px: number) => { if (sheetEl) sheetEl.style.transform = `translateY(${px}px)`; };

  // Re-measure + re-transform. `snap` suppresses the settle transition for this change (a size change
  // must not animate the offset back — it should look instantaneous). Reads offsetHeight, forcing a
  // synchronous layout, then writes the corrected transform immediately.
  let raf = 0;
  function remeasure(snap: boolean) {
    const s = sheetEl;
    if (!s) return;
    const h = s.offsetHeight;
    const head = s.querySelector<HTMLElement>(".card-head");
    const ph = head ? head.offsetHeight : 0;
    const changed = h !== drawerH || ph !== peekH;
    drawerH = h;
    peekH = ph;
    if (snap && changed) {
      remeasuring = true; // suppress the transition for this frame
      applyTransform(offsetFor(h, ph, pull));
      // Restore the transition only after ≥1 painted frame carries the snap (a single rAF can batch
      // into the size-change frame). Double-rAF is the reliable "next painted frame" signal.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => { remeasuring = false; });
      });
    }
  }

  // Card add/remove is a REACTIVE size change: tracking `cards` re-runs this effect inside Svelte's
  // pre-paint flush (effects run in a microtask after the DOM updates, before the browser paints), so
  // the synchronous remeasure + transform write beats the paint — no flicker. This is why the RO
  // (async, one paint too late) can't be the fix for the reported jump.
  $effect(() => {
    void cards.length;
    remeasure(true);
  });

  // Async size changes with no reactive trigger — a photo loading, a clue row arriving, the header
  // wrapping on rotate. ResizeObserver catches these; the synchronous transform write in remeasure
  // keeps them from sliding too.
  $effect(() => {
    const s = sheetEl;
    if (!s) return;
    const ro = new ResizeObserver(() => remeasure(true));
    ro.observe(s);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  });

  // The reactive transform writer for offset changes that are NOT size changes: drag, open/close,
  // pull. Uses the same offsetFor formula so there's one source of truth for the drawer's position.
  $effect(() => { applyTransform(offset); });

  // Publish the retracted footprint (top header + the drawer's own inset) so anything floating at the
  // bottom of the board -- the tree's zoom controls -- can sit clear of it. A shared custom property
  // rather than a magic number, because the header's height moves with its content.
  $effect(() => {
    const px = peekH ? peekH + 12 : 0;
    document.documentElement.style.setProperty("--drawer-peek-h", `${px}px`);
    return () => document.documentElement.style.removeProperty("--drawer-peek-h");
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
  /** a gesture that began on a card HEADER may TAP-toggle; one begun on a card body only drags */
  let fromHead = false;

  function setPull(next: number) {
    pull = Math.max(0, Math.min(next, maxPull));
    expanded = pull > 0;
  }

  function onPointerDown(e: PointerEvent) {
    // Links and buttons inside a card keep their own behaviour: pressing Wikipedia or Share must
    // not be swallowed by the drag.
    if ((e.target as HTMLElement | null)?.closest("a, button, input")) return;
    dragging = true;
    moved = false;
    fromHead = !!(e.target as HTMLElement | null)?.closest(".card-head");
    startY = e.clientY;
    startPull = pull;
    sheetEl?.setPointerCapture(e.pointerId);
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
    try { sheetEl?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!moved) {
      // Only a HEADER toggles on a tap. Tapping a card body should do nothing, or reading it would
      // keep snapping the drawer shut.
      if (fromHead) setPull(pull > 0 ? 0 : openPull());
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
  <!-- svelte-ignore a11y_no_static_element_interactions -- the drag is a pointer-only enhancement;
       each header inside is a real role=button with keyboard handling, which is the a11y path -->
  <div
    class="sheet"
    class:sliding={dragging || remeasuring}
    bind:this={sheetEl}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondragstart={(e) => e.preventDefault()}
  >
    {#each cards as card, i (i)}
      {@const bodyId = `${uid}-body-${i}`}
      <!-- Cards below the top one are entirely off-screen while stowed, so the whole card is inert
           then (header included) — only the top card's header stays interactive to extend the
           drawer. When pulled out, nothing is inert. -->
      <div class="card">
        <div
          class="card-head"
          role="button"
          tabindex="0"
          inert={pull === 0 && i > 0}
          aria-expanded={pull > 0}
          aria-controls={pull > 0 ? bodyId : undefined}
          onkeydown={onKeydown}
        >
          <span class="grabber" aria-hidden="true"></span>
          <span class="head-content">{@render card.head()}</span>
          <span class="chevron" aria-hidden="true">{pull > 0 ? "▼" : "▲"}</span>
        </div>
        <!-- Always rendered so the block is laid out at full height for the translation to reveal.
             `inert` keeps the stowed body out of the tab order and the a11y tree. -->
        <div class="card-body" id={bodyId} inert={pull === 0}>
          {@render card.body()}
        </div>
      </div>
    {/each}
  </div>

  {#if moreBelow}
    <!-- Pinned to the TRUE bottom of the viewport, not to the drawer: it marks that the block
         continues past the screen edge, which a fade on the drawer itself cannot say. -->
    <div class="more-shadow" aria-hidden="true"></div>
  {/if}
</div>

<style>
  /* Fixed, not absolute: the drawer must be able to travel ABOVE the app header, both so a long
     pull is not clipped at the board's top edge and so a header stays grabbable no matter how
     far up it has been pulled. z-index clears the header's 4. */
  .drawer-layer {
    position: fixed; inset: 0; z-index: 8;
    pointer-events: none; overflow: hidden;
  }
  /* The sheet is now a TRANSPARENT flex column: it owns only positioning, the drag, and the
     translate. The frame moved onto each card, so the stack reads as peer cards with a gap
     (mirroring the desktop float). */
  .sheet {
    --drawer-inset: 12px;
    /* bottom-anchored and translated DOWN by `offset`: at offset 0 the block is fully out with its
       base on the screen edge; at offset == maxPull only the top header shows. Height is never
       constrained, so the stowed part simply hangs past the bottom and is clipped by the layer. */
    position: absolute; left: var(--drawer-inset); right: var(--drawer-inset);
    bottom: calc(var(--drawer-inset) + env(safe-area-inset-bottom));
    pointer-events: auto;
    /* the whole object drags, so nothing inside it may claim the gesture */
    touch-action: none; user-select: none; -webkit-user-drag: none;
    display: flex; flex-direction: column; gap: var(--space-4);
    will-change: transform;
  }
  /* settle smoothly on tap-open/close, but never lag the finger mid-drag */
  .sheet:not(.sliding) { transition: transform var(--dur) var(--ease); }

  /* Each card carries the frame the sheet used to. */
  .card {
    border-radius: var(--radius-card);
    border: 1px solid var(--specimen-edge);
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    color: var(--specimen-text);
    box-shadow: var(--shadow-placard, 0 -6px 16px -8px rgba(51, 38, 26, 0.35));
    display: flex; flex-direction: column; overflow: hidden;
  }

  /* the header row is both the toggle and the drag handle, per card */
  .card-head {
    display: flex; align-items: center; gap: var(--space-3);
    position: relative; width: 100%;
    padding: var(--space-3) var(--space-4) var(--space-2);
    background: none; border: 0; cursor: grab;
    color: inherit; text-align: left;
    flex: 0 0 auto;
  }
  .card-head:active { cursor: grabbing; }
  .grabber {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    width: 2.25rem; height: 4px; border-radius: 2px;
    background: var(--cream); opacity: .35;
  }
  .head-content { display: flex; align-items: center; gap: var(--space-3); flex: 1 1 auto; min-width: 0; }
  .chevron { flex: none; opacity: .7; font-size: var(--type-label); }
  .card-body {
    padding: 0 var(--space-4) var(--space-4);
    flex: 0 0 auto;
  }
  /* Shadow, not a fade: the content is continuing past the screen edge, not dissolving. */
  .more-shadow {
    position: absolute; left: 0; right: 0; bottom: 0; height: 1.75rem;
    pointer-events: none;
    background: linear-gradient(to top, rgba(51, 38, 26, 0.38), rgba(51, 38, 26, 0));
  }
</style>
