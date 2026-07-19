<script lang="ts">
  import Modal from "./Modal.svelte";
  let open = $state(false);
</script>

<button type="button" class="how-to-play-link" onclick={() => (open = true)}>How to play</button>

<Modal bind:open title="How to play">
  <p>Find today's dinosaur by its similarity to others.</p>
  <p>Guess any dinosaur, and you'll see the clade that it shares with the one you're hunting for. Try to find the target in the fewest moves!</p>
  <p>You can spend moves on hints to move down the tree. When you're almost at the end of the tree, a single move will tell you more details about the dino, to help you sort through the genera.</p>
  <p>If you're stuck, or just want to learn more, check out Explore mode to see the whole tree. Not every dinosaur in Explore mode is playable, but every playable dinosaur is in Explore.</p>
</Modal>

<style>
  .how-to-play-link {
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0;
    font-size: var(--type-body);
    font-weight: var(--fw-medium);
    color: var(--cream-dim);
    text-decoration: underline;
    align-self: baseline;   /* share the tagline's baseline, not the header's center line */
  }
  .how-to-play-link:hover {
    color: var(--cream);
  }
</style>
