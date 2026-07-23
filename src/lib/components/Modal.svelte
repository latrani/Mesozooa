<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    children,
  }: {
    open?: boolean;
    title: string;
    children: Snippet;
  } = $props();

  // Unique per instance so the title can name the dialog even with multiple modals in the DOM.
  const uid = $props.id();
  const titleId = `modal-title-${uid}`;

  let dialog = $state<HTMLDialogElement | null>(null);

  // Sync the `open` prop to the native dialog. showModal() gives us focus-trap, top-layer
  // stacking, ::backdrop, and Esc-to-close for free.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  // Native close (Esc, or dialog.close()) writes back so the binding stays consistent.
  function onclose() {
    open = false;
  }

  // A click whose target is the <dialog> itself (not inner content) is a backdrop click.
  function onclick(e: MouseEvent) {
    if (e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} {onclose} {onclick} class="modal" aria-labelledby={titleId}>
  <div class="modal-inner">
    <header class="modal-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" class="modal-close" aria-label="Close" onclick={() => (open = false)}>✕</button>
    </header>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</dialog>

<style>
  /* Structural only — the visual pass refines this. Uses existing tokens for legibility. */
  .modal {
    border: 1px solid var(--placard-edge);
    border-radius: var(--space-2);
    padding: 0;
    background: var(--bg-surface);
    color: var(--ink);
    max-width: min(32rem, 90vw);
    overflow: hidden;
  }
  .modal::backdrop {
    background: rgba(51, 38, 26, 0.45);
  }
  .modal-inner {
    padding: var(--space-4);
    /* Load-bearing, not decorative: this cap bounds the flex column so .modal-body can shrink
       (flex + min-height:0) and become the scroll container. Without it tall content (How to play
       with attributions; Stats) grows the column past the viewport with no way to reach the
       bottom. .modal itself needs no separate cap — it content-sizes to this. */
    max-height: 85dvh;
    display: flex; flex-direction: column; min-height: 0;
  }
  .modal-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .modal-head h2 {
    font-family: var(--font-head);
    font-size: var(--type-heading);
    margin: 0;
  }
  .modal-close {
    background: none;
    border: 0;
    cursor: pointer;
    font-size: var(--type-body);
    color: var(--ink-mute);
    align-self: center;
  }
  .modal-close:hover {
    color: var(--ink);
  }
  .modal-body {
    font-size: var(--type-body);
    overflow-y: auto; overscroll-behavior: contain; min-height: 0;
  }
</style>
