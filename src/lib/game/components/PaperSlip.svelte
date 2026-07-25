<script lang="ts">
  // A little curator's slip laid on the specimen mount — a handwritten note on lighter paper,
  // faintly shadowed and tilted. Absolutely positioned; the host mount must be position:relative.
  let { text, tilt = -4 }: { text: string; tilt?: number } = $props();
</script>

<span class="paper-slip" style="--slip-tilt: {tilt}deg">{text}</span>

<style>
  .paper-slip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(var(--slip-tilt));
    padding: 0.6rem 1.1rem;
    background: linear-gradient(183deg,
      color-mix(in hsl, #000 10%, #fff),
      color-mix(in hsl, #fff 60%, var(--bg-page)) 
    );
    color: var(--ink);
    font-family: var(--font-hand);
    font-size: var(--type-heading);
    line-height: 1.1;
    white-space: nowrap;
    border-radius: 2px;
    box-shadow: 0 2px 5px rgba(70, 40, 22, 0.22); /* faint lift off the mount */
    pointer-events: none;
  }
</style>
