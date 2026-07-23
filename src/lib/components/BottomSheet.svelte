<script lang="ts">
  import type { Snippet } from "svelte";
  import { scrollFade } from "../actions/scrollFade";
  import { untrack } from "svelte";

  // Phone-only chrome: the specimen plaque as a real drawer. PEEK is one row, always visible, so
  // the exhibit is never absent (the museum-fixture conceit the desktop spec established).
  //
  // The drawer's HEIGHT is the model, not an inner scroll box. Opening sets it to half the screen
  // at most; dragging the heading row upward grows the whole drawer past that, heading and all,
  // the way a physical drawer slides. The body only scrolls once the drawer is at its full extent
  // and the card is still taller, which is the honest fallback rather than the primary mechanic.
  //
  // The drag lives ON the heading row, never on the tree above it, so it cannot collide with the
  // tree's own pan gesture.
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

  // Fractions of the viewport. OPEN_MAX is where a tap-open stops; DRAG_MAX is how far a drag can
  // take it. Not full height: the tree must never be completely buried.
  const OPEN_MAX = 0.5;
  const DRAG_MAX = 0.9;

  let sheetEl = $state<HTMLElement>();
  let peekEl = $state<HTMLElement>();
  let bodyEl = $state<HTMLElement>();
  /** drawer height in px while expanded; null means "not yet sized" (use the open default) */
  let height = $state<number | null>(null);

  const vh = () => (typeof window === "undefined" ? 0 : window.innerHeight);
  const peekH = () => peekEl?.offsetHeight ?? 0;
  /** natural height of peek + fully laid-out card, so the drawer never opens taller than its content */
  function contentH(): number {
    return peekH() + (bodyEl ? bodyEl.scrollHeight : 0);
  }
  function openHeight(): number {
    return Math.min(contentH(), vh() * OPEN_MAX);
  }
  function clampH(h: number): number {
    return Math.max(peekH(), Math.min(h, Math.min(contentH(), vh() * DRAG_MAX)));
  }

  // Opening sizes the drawer once, after the body has laid out so contentH() is real. Collapsing
  // clears it so the next open re-measures rather than inheriting the last drag.
  $effect(() => {
    if (!expanded) {
      height = null;
      return;
    }
    // Only size an open that has not already been sized. A drag that OPENS the drawer sets both
    // `expanded` and `height` in the same gesture; without this guard the deferred measurement
    // below would fire a frame later and yank the drawer to the cap mid-drag.
    if (untrack(() => height) != null) return;
    const id = requestAnimationFrame(() => {
      if (untrack(() => height) == null) height = openHeight();
    });
    return () => cancelAnimationFrame(id);
  });

  // --- drag ---------------------------------------------------------------------------------
  // A drag that never travels is a tap, so one pointer sequence serves both: below the slop
  // threshold we toggle, above it we resize and swallow the click.
  const SLOP = 6;
  let dragging = false;
  let startY = 0;
  let startH = 0;
  let moved = false;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    moved = false;
    startY = e.clientY;
    startH = expanded ? (height ?? openHeight()) : peekH();
    peekEl?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dy = startY - e.clientY; // up is positive: dragging up opens further
    if (!moved && Math.abs(dy) < SLOP) return;
    if (!moved) {
      moved = true;
      // The first real movement out of a collapsed drawer is what opens it.
      if (!expanded && dy > 0) expanded = true;
    }
    height = clampH(startH + dy);
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    peekEl?.releasePointerCapture(e.pointerId);
    if (!moved) {
      expanded = !expanded;
      return;
    }
    // Released near the bottom: treat it as a close rather than leaving a sliver open.
    if (expanded && (height ?? 0) < peekH() + vh() * 0.08) expanded = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      expanded = !expanded;
    }
  }
</script>

<div
  class="sheet"
  class:expanded
  bind:this={sheetEl}
  style={expanded && height != null ? `height: ${height}px` : ""}
>
  <div
    class="peek"
    role="button"
    tabindex="0"
    bind:this={peekEl}
    aria-expanded={expanded}
    aria-controls={expanded ? bodyId : undefined}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeydown}
  >
    <span class="grabber" aria-hidden="true"></span>
    <span class="peek-content">{@render peek()}</span>
    <span class="chevron" aria-hidden="true">{expanded ? "▼" : "▲"}</span>
  </div>

  {#if expanded}
    <div class="body" id={bodyId} bind:this={bodyEl} use:scrollFade={[expanded, height]}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .sheet {
    flex: 0 0 auto;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border-top: 1px solid var(--specimen-edge);
    color: var(--specimen-text);
    --btn-secondary-ink: var(--cream);
    /* lifts off the tree canvas, matching the header's downward shadow */
    box-shadow: 0 -6px 16px -8px rgba(51, 38, 26, 0.35);
    z-index: 4;
    display: flex; flex-direction: column; min-height: 0;
  }
  /* the heading row is both the toggle and the drag handle. touch-action:none is what lets a
     vertical drag resize the drawer instead of being claimed as a page scroll. */
  .peek {
    display: flex; align-items: center; gap: var(--space-3);
    position: relative;
    width: 100%;
    padding: var(--space-3) var(--space-4) max(var(--space-2), env(safe-area-inset-bottom));
    background: none; border: 0; cursor: grab;
    color: inherit; text-align: left;
    flex: 0 0 auto; touch-action: none; user-select: none;
  }
  /* The universal drawer affordance. Without it the heading reads as a plain bar and nobody
     discovers the drag, which makes the drawer behave exactly like the fixed panel it replaced. */
  .grabber {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    width: 2.25rem; height: 4px; border-radius: 2px;
    background: var(--cream); opacity: .35;
  }
  .peek-content { display: flex; align-items: center; gap: var(--space-3); flex: 1 1 auto; min-width: 0; }
  .chevron { flex: none; opacity: .7; font-size: var(--type-label); }
  /* The body fills whatever the drawer's height leaves. It only scrolls when the drawer is already
     at full extent and the card is still taller; scrollFade then marks the hidden edge. */
  .body {
    padding: 0 var(--space-4) var(--space-4);
    flex: 1 1 auto; min-height: 0;
    overflow-y: auto; overscroll-behavior: contain;
  }
</style>
