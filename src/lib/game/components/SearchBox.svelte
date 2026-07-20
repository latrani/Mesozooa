<script lang="ts">
  import { createSearch } from "../search";
  import type { SearchEntry } from "../search";
  import { scrollFade } from "../../actions/scrollFade";

  let {
    entries,
    onpick,
    placeholder = "Search…",
  }: { entries: SearchEntry[]; onpick: (id: string) => void; placeholder?: string } = $props();

  let search = $derived(createSearch(entries));
  let query = $state("");
  let results = $derived(search(query));

  function pick(id: string) {
    onpick(id);
    query = "";
  }
</script>

<div class="searchbox">
  <input {placeholder} bind:value={query} autocomplete="off" />
  {#if results.length}
    <div class="menu">
      <ul use:scrollFade={results}>
        {#each results as r (r.id)}
          <li><button type="button" onclick={() => pick(r.id)}>{r.name}</button></li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .searchbox { position: relative; flex: 1; }
  .searchbox input {
    width: 100%; font-size: var(--type-body); color: var(--ink);
    /* sunk well so the field reads as inset against a surface-colored placard */
    background: var(--bg-sunk); border: 2px solid var(--hairline);
    border-radius: var(--radius-pill); padding: var(--space-3) 1.25rem; box-shadow: var(--inset-well);
  }
  .searchbox input::placeholder { color: var(--ink-mute); }
  .searchbox input:focus { outline: none; border-color: var(--accent); }
  /* chrome lives on the wrapper so the inner scroll-fade mask never eats bg/border/shadow.
     Opens DOWNWARD — after the layout rework the search box sits in the TOP cluster in both the
     game and Explore, so the menu drops below the input. */
  .searchbox .menu {
    position: absolute; z-index: 5; left: 0; right: 0; top: 100%; margin-top: var(--space-1);
    background: var(--bg-page); border: 1px solid var(--hairline);
    border-radius: var(--radius-card); box-shadow: var(--shadow-lift); overflow: hidden;
  }
  .searchbox ul {
    /* cap to ~5 rows so it stays within the reserved guess area; the rest scroll */
    max-height: calc(5 * 2.5rem); overflow-y: auto;
  }
  .searchbox li button {
    width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
    padding: var(--space-2) var(--space-4); font-size: var(--type-body); color: var(--ink);
  }
  .searchbox li button:hover { background: var(--bg-sunk); }
  @media (max-width: 640px) {
    .searchbox input { font-size: var(--type-body); padding: var(--space-3) var(--space-4); }
  }
</style>
