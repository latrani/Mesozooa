<script lang="ts">
  import { createSearch } from "../search";
  import type { SearchEntry } from "../search";
  import { scrollFade } from "../../actions/scrollFade";
  import { nextActiveIndex, clampActiveIndex, NONE } from "../search-nav";

  let {
    entries,
    onpick,
    placeholder = "Search…",
    ariaLabel = "Search dinosaurs",
    id = "searchbox",
  }: {
    entries: SearchEntry[];
    onpick: (id: string) => void;
    placeholder?: string;
    ariaLabel?: string;
    /** Base id for the ARIA combobox wiring; make it unique if two boxes ever coexist. */
    id?: string;
  } = $props();

  let search = $derived(createSearch(entries));
  let query = $state("");
  let results = $derived(search(query));
  let open = $derived(results.length > 0);

  // Which option is keyboard-highlighted (-1 == none; the typed text stands alone).
  let active = $state(NONE);
  // Keep the highlight valid as the result list changes under it (typing narrows results).
  $effect(() => {
    active = clampActiveIndex(active, results.length);
  });

  let listId = $derived(`${id}-listbox`);
  let activeOptionId = $derived(active >= 0 ? `${id}-opt-${active}` : undefined);

  let listEl: HTMLUListElement | undefined = $state();
  // Follow the highlight with the scroll viewport so an off-screen active option comes into view.
  $effect(() => {
    if (!activeOptionId || !listEl) return;
    listEl.querySelector<HTMLElement>(`#${CSS.escape(activeOptionId)}`)?.scrollIntoView({ block: "nearest" });
  });

  function pick(pickId: string) {
    onpick(pickId);
    query = "";
    active = NONE;
  }

  function onkeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        active = nextActiveIndex(active, results.length, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        active = nextActiveIndex(active, results.length, -1);
        break;
      case "Enter":
        // Highlighted option → pick it. Otherwise if exactly one result, pick that (fast path).
        if (active >= 0) {
          e.preventDefault();
          pick(results[active].id);
        } else if (results.length === 1) {
          e.preventDefault();
          pick(results[0].id);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          query = "";
          active = NONE;
        }
        break;
    }
  }
</script>

<div class="searchbox">
  <!-- svelte-ignore a11y_role_has_required_aria_props -- aria-controls only valid while the listbox is rendered -->
  <input
    {placeholder}
    aria-label={ariaLabel}
    bind:value={query}
    {onkeydown}
    autocomplete="off"
    role="combobox"
    aria-expanded={open}
    aria-controls={open ? listId : undefined}
    aria-autocomplete="list"
    aria-activedescendant={activeOptionId}
  />
  {#if open}
    <div class="menu">
      <ul bind:this={listEl} use:scrollFade={results} id={listId} role="listbox" aria-label={ariaLabel}>
        {#each results as r, i (r.id)}
          <li role="presentation">
            <button
              type="button"
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              class:active={i === active}
              onclick={() => pick(r.id)}
            >{r.name}</button>
          </li>
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
  .searchbox li button:hover,
  .searchbox li button.active { background: var(--bg-sunk); }
  @media (max-width: 640px) {
    .searchbox input { font-size: var(--type-body); padding: var(--space-3) var(--space-4); }
  }
</style>
