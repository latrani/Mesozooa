import type { PlayLog, Stats } from "./stats";
import { emptyStats, deserializeStats, serializeStats, recordPlay, windowStats, avgMoves, currentStreak } from "./stats";
import { todayString } from "./daily";
import type { Tier } from "../tree/tiers";
import { tierSetting } from "./tierStore.svelte";

const STATS_KEY = "mesozooa:stats:1";

/** The read surface StatsContent renders. The live store satisfies it; the gallery supplies
    frozen fixture views (same pattern as FixtureStore for GameBoard). */
export interface StatsView {
  readonly streak: { current: number; best: number; lastWinDate: string | null };
  readonly week: { played: number; won: number; ratio: number | null };
  readonly month: { played: number; won: number; ratio: number | null };
  readonly dailyAvg: number | null;
  readonly overallAvg: number | null;
  readonly allTime: { played: number; won: number; ratio: number | null };
  reset: () => void;
}

function load(): Stats {
  if (typeof localStorage === "undefined") return emptyStats();
  return deserializeStats(localStorage.getItem(STATS_KEY));
}

function createStatsStore() {
  let state = $state<Stats>(load());

  function save() {
    if (typeof localStorage !== "undefined") localStorage.setItem(STATS_KEY, serializeStats(state));
  }

  /** One tier's slice of the record, in the shape StatsContent already consumes. */
  function viewFor(tier: Tier): StatsView {
    return {
      get streak() {
        const s = state.byTier[tier].streak;
        return { ...s, current: currentStreak(s, todayString()) };
      },
      get week() {
        return windowStats(state, Date.now(), 7, tier);
      },
      get month() {
        return windowStats(state, Date.now(), 30, tier);
      },
      get dailyAvg(): number | null {
        return avgMoves(state.byTier[tier].daily);
      },
      get overallAvg(): number | null {
        return avgMoves(state.byTier[tier].overall);
      },
      get allTime(): { played: number; won: number; ratio: number | null } {
        const o = state.byTier[tier].overall;
        return { played: o.played, won: o.won, ratio: o.played === 0 ? null : o.won / o.played };
      },
      reset,
    };
  }

  /** Reset is GLOBAL — one button wipes every tier. Scoping it per tier would leave the panel
      showing a mix of erased and kept history with no way to tell which. */
  function reset() {
    state = emptyStats();
    if (typeof localStorage !== "undefined") localStorage.removeItem(STATS_KEY);
  }

  return {
    get stats(): Stats {
      return state;
    },
    viewFor,
    /** The active tier's view — what the panel opens on. */
    get streak() { return viewFor(tierSetting.tier).streak; },
    get week() { return viewFor(tierSetting.tier).week; },
    get month() { return viewFor(tierSetting.tier).month; },
    get dailyAvg(): number | null { return viewFor(tierSetting.tier).dailyAvg; },
    get overallAvg(): number | null { return viewFor(tierSetting.tier).overallAvg; },
    get allTime() { return viewFor(tierSetting.tier).allTime; },
    /** Log one completed, non-seeded game. Caller fires this exactly once per game. */
    record(play: Omit<PlayLog, "t"> & { t?: number }) {
      const full: PlayLog = { t: play.t ?? Date.now(), mode: play.mode, won: play.won, moves: play.moves, tier: play.tier };
      state = recordPlay(state, full, todayString());
      save();
    },
    reset,
  };
}

export const statsStore = createStatsStore();
