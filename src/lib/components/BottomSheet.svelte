<script lang="ts">
  import type { Snippet } from "svelte";

  // Phone-only chrome: the specimen plaque at two heights. PEEK is one row, always visible, so
  // the exhibit is never absent (the museum-fixture conceit the desktop spec established).
  // EXPANDED is the full card, scrolling internally so it can never grow past the shell.
  //
  // Tap toggles. There is deliberately no drag gesture: the tree directly above owns dragging,
  // and a second drag surface an inch away would collide.
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
</script>

<div class="sheet" class:expanded>
  <button
    type="button"
    class="peek"
    aria-expanded={expanded}
    aria-controls={bodyId}
    onclick={() => (expanded = !expanded)}
  >
    <span class="peek-content">{@render peek()}</span>
    <span class="chevron" aria-hidden="true">{expanded ? "▼" : "▲"}</span>
  </button>

  {#if expanded}
    <div class="body" id={bodyId}>
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
  /* the peek row IS the toggle: a full-width button carrying one line of specimen identity */
  .peek {
    display: flex; align-items: center; gap: var(--space-3);
    width: 100%; padding: var(--space-2) var(--space-4) max(var(--space-2), env(safe-area-inset-bottom));
    background: none; border: 0; cursor: pointer;
    color: inherit; text-align: left;
  }
  .peek-content { display: flex; align-items: center; gap: var(--space-3); flex: 1 1 auto; min-width: 0; }
  .chevron { flex: none; opacity: .7; font-size: var(--type-label); }
  /* expanded body scrolls internally so the sheet can never push the tree out of the shell */
  .body {
    padding: 0 var(--space-4) var(--space-4);
    overflow-y: auto; overscroll-behavior: contain;
    max-height: 55dvh;
  }
</style>
