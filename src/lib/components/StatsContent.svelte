<script lang="ts">
  import { statsStore, type StatsView } from "../game/statsStore.svelte";

  // Defaults to the live singleton (the app never passes a source). The gallery passes a frozen
  // fixture view so multiple stats states render side by side on one page.
  let { source = statsStore }: { source?: StatsView } = $props();

  let confirming = $state(false);

  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const avg = (m: number | null) => (m === null ? "—" : m.toFixed(1));

  // Empty state: nothing ever recorded.
  let empty = $derived(source.allTime.played === 0);
</script>

<div class="stats">
  {#if empty}
    <p class="stats-empty">Play the daily to start a streak.</p>
  {:else}
    <div class="streak">
      <span class="big">{source.streak.current}</span>
      <span class="streak-label">day streak</span>
      <span class="streak-best">Best: {source.streak.best}</span>
    </div>

    <dl class="grid">
      <div><dt>Last 7 days</dt><dd>{source.week.played} plays · {pct(source.week.ratio)} won</dd></div>
      <div><dt>Last 30 days</dt><dd>{source.month.played} plays · {pct(source.month.ratio)} won</dd></div>
      <div><dt>Avg moves (daily)</dt><dd>{avg(source.dailyAvg)}</dd></div>
      <div><dt>Avg moves (overall)</dt><dd>{avg(source.overallAvg)}</dd></div>
      <div><dt>All-time</dt><dd>{source.allTime.played} plays · {pct(source.allTime.ratio)} won</dd></div>
    </dl>

    <div class="reset">
      {#if confirming}
        <span class="reset-warn">Erase all stats? This can't be undone.</span>
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="btn-secondary btn-small" onclick={() => { source.reset(); confirming = false; }}>Erase</button>
      {:else}
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = true)}>Reset stats</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stats { display: flex; flex-direction: column; gap: var(--space-4); }
  .streak { display: flex; align-items: baseline; gap: var(--space-2); }
  .streak .big { font-size: 2.5rem; font-weight: var(--fw-black); color: var(--ink); }
  .streak-label { font-size: var(--type-body); color: var(--ink); }
  .streak-best { margin-left: auto; color: var(--ink-mute); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2) var(--space-4); margin: 0; }
  .grid dt { color: var(--ink-mute); font-size: var(--type-meta); }
  .grid dd { margin: 0; color: var(--ink); }
  .reset { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .reset-warn { color: var(--ink); font-size: var(--type-meta); }
  .stats-empty { color: var(--ink-mute); }
</style>
