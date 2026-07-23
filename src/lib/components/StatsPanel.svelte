<script lang="ts">
  import Modal from "./Modal.svelte";
  import StatsContent from "./StatsContent.svelte";
  let open = $state(false);
</script>

<button type="button" class="stats-link btn-secondary btn-small" onclick={() => (open = true)}>Stats</button>

<Modal bind:open title="Your stats">
  <StatsContent />
</Modal>

<style>
  .stats-link {
    --btn-secondary-ink: var(--cream);
    align-self: baseline; /* share the tagline baseline, matching HowToPlay */
  }
  .stats-link:hover { color: var(--cream); }
  @media (max-width: 640px) {
    .stats-link { padding: .25rem .45rem; font-size: var(--type-label); }
  }
</style>
