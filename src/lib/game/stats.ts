import type { GameMode } from "./types";

export interface Acc {
  played: number;
  won: number;
  moveSum: number; // Σ movesUsed over won games; divided by `won` for average moves
}

export interface StreakRec {
  current: number;
  best: number;
  lastWinDate: string | null; // "YYYY-MM-DD" of the most recent daily win
}

export interface PlayLog {
  t: number; // epoch ms — the only thing rolling windows read
  mode: GameMode;
  won: boolean;
  moves: number; // movesUsed at completion
}

export interface Stats {
  version: 1;
  streak: StreakRec;
  daily: Acc;
  overall: Acc;
  log: PlayLog[];
}

export function emptyStats(): Stats {
  return {
    version: 1,
    streak: { current: 0, best: 0, lastWinDate: null },
    daily: { played: 0, won: 0, moveSum: 0 },
    overall: { played: 0, won: 0, moveSum: 0 },
    log: [],
  };
}

export function serializeStats(s: Stats): string {
  return JSON.stringify(s);
}

function isAcc(a: unknown): a is Acc {
  const r = a as Record<string, unknown>;
  return !!a && typeof r.played === "number" && typeof r.won === "number" && typeof r.moveSum === "number";
}

export function deserializeStats(raw: string | null): Stats {
  if (raw === null) return emptyStats();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const streak = o.streak as Record<string, unknown> | undefined;
    if (
      o.version === 1 &&
      streak &&
      typeof streak.current === "number" &&
      typeof streak.best === "number" &&
      (streak.lastWinDate === null || typeof streak.lastWinDate === "string") &&
      isAcc(o.daily) &&
      isAcc(o.overall) &&
      Array.isArray(o.log)
    ) {
      return o as unknown as Stats;
    }
    return emptyStats();
  } catch {
    return emptyStats();
  }
}
