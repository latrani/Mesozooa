<script lang="ts">
  import { statsStore } from "../game/statsStore.svelte";

  let confirming = $state(false);

  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const avg = (m: number | null) => (m === null ? "—" : m.toFixed(1));

  // Empty state: nothing ever recorded.
  let empty = $derived(statsStore.allTime.played === 0);
</script>

<div class="stats">
  {#if empty}
    <p class="stats-empty">Play the daily to start a streak.</p>
  {:else}
    <div class="streak">
      <span class="big">{statsStore.streak.current}</span>
      <span class="streak-label">day streak</span>
      <span class="streak-best">Best: {statsStore.streak.best}</span>
    </div>

    <dl class="grid">
      <div><dt>Last 7 days</dt><dd>{statsStore.week.played} plays · {pct(statsStore.week.ratio)} won</dd></div>
      <div><dt>Last 30 days</dt><dd>{statsStore.month.played} plays · {pct(statsStore.month.ratio)} won</dd></div>
      <div><dt>Avg moves (daily)</dt><dd>{avg(statsStore.dailyAvg)}</dd></div>
      <div><dt>Avg moves (overall)</dt><dd>{avg(statsStore.overallAvg)}</dd></div>
      <div><dt>All-time</dt><dd>{statsStore.allTime.played} plays · {pct(statsStore.allTime.ratio)} won</dd></div>
    </dl>

    <div class="reset">
      {#if confirming}
        <span class="reset-warn">Erase all stats? This can't be undone.</span>
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="btn-secondary btn-small" onclick={() => { statsStore.reset(); confirming = false; }}>Erase</button>
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
