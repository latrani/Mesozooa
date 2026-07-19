<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
  import Modal from "../../components/Modal.svelte";
  import { buildShareText } from "../share";

  let shareOpen = $state(false);
  let copied = $state(false);
  let shareText = $derived(buildShareText(daily.state, daily.date));

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
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
  <pre class="share-preview">{shareText}</pre>
  <button type="button" class="btn-secondary" onclick={copy}>{copied ? "Copied" : "Copy"}</button>
</Modal>

<style>
  .daily { padding-top: var(--space-2); }
  @media (min-width: 641px) {
    .daily { padding-top: 0; display: flex; flex-direction: column; min-height: 0; }
  }
  /* pre keeps the emoji grid rows aligned; structural only */
  .share-preview {
    font-family: inherit;
    white-space: pre;
    margin: 0 0 var(--space-3);
    line-height: 1.4;
  }
</style>
