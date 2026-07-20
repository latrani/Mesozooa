<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
  import Modal from "../../components/Modal.svelte";
  import { buildShareText, buildShareParts } from "../share";

  let shareOpen = $state(false);
  let shareText = $derived(buildShareText(daily.state, daily.date));
  let shareParts = $derived(buildShareParts(daily.state, daily.date));

  async function copyAndClose() {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Clipboard denied (e.g. insecure context) — still close; the preview stays visible next open.
    }
    shareOpen = false;
  }
</script>

<main class="daily">
  <GameBoard
    store={daily}
    disabled={daily.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
    onshare={() => (shareOpen = true)}
  />
</main>

<Modal bind:open={shareOpen} title="Share your result">
  <!-- Preview shows the three blocks with paragraph spacing (display-only); the clipboard copy is
       compact single line breaks (see buildShareText). -->
  <div class="share-preview">
    <p class="share-block">{shareParts.headline}</p>
    <p class="share-block">{shareParts.score}</p>
    <pre class="share-block share-grid">{shareParts.grid.join("\n")}</pre>
  </div>
  <div class="share-actions">
    <button type="button" class="btn-primary" onclick={copyAndClose}>Copy and close</button>
  </div>
</Modal>

<style>
  .daily { padding-top: var(--space-2); }
  @media (min-width: 641px) {
    .daily { padding-top: 0; display: flex; flex-direction: column; min-height: 0; }
  }
  /* Framed preview on a lighter sunk ground — the result reads as a lifted-out card, distinct
     from the modal body. Blocks are spaced as paragraphs (display-only; copied text is compact). */
  .share-preview {
    display: flex; flex-direction: column; gap: var(--space-3);
    background: var(--bg-page);
    border: 1px solid var(--placard-edge);
    border-radius: var(--radius-card);
    padding: var(--space-4);
    margin: 0 0 var(--space-4);
    line-height: 1.4;
  }
  .share-block { margin: 0; }
  /* pre keeps the emoji grid rows aligned */
  .share-grid { font-family: inherit; white-space: pre; }
  .share-actions { display: flex; justify-content: flex-end; }
</style>
