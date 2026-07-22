import type { PlayLog, Stats } from "./stats";
import { emptyStats, deserializeStats, serializeStats, recordPlay, windowStats, avgMoves, currentStreak } from "./stats";
import { todayString } from "./daily";

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

  return {
    get stats(): Stats {
      return state;
    },
    get streak() {
      return { ...state.streak, current: currentStreak(state.streak, todayString()) };
    },
    get week() {
      return windowStats(state, Date.now(), 7);
    },
    get month() {
      return windowStats(state, Date.now(), 30);
    },
    get dailyAvg(): number | null {
      return avgMoves(state.daily);
    },
    get overallAvg(): number | null {
      return avgMoves(state.overall);
    },
    get allTime(): { played: number; won: number; ratio: number | null } {
      const o = state.overall;
      return { played: o.played, won: o.won, ratio: o.played === 0 ? null : o.won / o.played };
    },
    /** Log one completed, non-seeded game. Caller fires this exactly once per game. */
    record(play: Omit<PlayLog, "t"> & { t?: number }) {
      const full: PlayLog = { t: play.t ?? Date.now(), mode: play.mode, won: play.won, moves: play.moves };
      state = recordPlay(state, full, todayString());
      save();
    },
    reset() {
      state = emptyStats();
      if (typeof localStorage !== "undefined") localStorage.removeItem(STATS_KEY);
    },
  };
}

export const statsStore = createStatsStore();
