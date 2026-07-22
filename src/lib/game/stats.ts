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

// Whole-day difference between two "YYYY-MM-DD" strings (b - a). Parsed as UTC midnight so DST
// never shifts the count. No Date.now(); inputs are explicit.
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function windowStats(
  stats: Stats,
  now: number,
  days: number,
): { played: number; won: number; ratio: number | null } {
  const cutoff = now - days * 86_400_000;
  let played = 0;
  let won = 0;
  for (const p of stats.log) {
    if (p.t >= cutoff) {
      played += 1;
      if (p.won) won += 1;
    }
  }
  return { played, won, ratio: played === 0 ? null : won / played };
}

export function avgMoves(acc: Acc): number | null {
  return acc.won === 0 ? null : acc.moveSum / acc.won;
}

function bump(acc: Acc, won: boolean, moves: number): Acc {
  return {
    played: acc.played + 1,
    won: acc.won + (won ? 1 : 0),
    moveSum: acc.moveSum + (won ? moves : 0),
  };
}

// Returns a NEW Stats. Not idempotent for the log/accumulators — the caller (the store hook)
// must fire this exactly once per completed game. The same-day guard protects the STREAK only.
export function recordPlay(stats: Stats, play: PlayLog, today: string): Stats {
  const next: Stats = {
    ...stats,
    daily: play.mode === "daily" ? bump(stats.daily, play.won, play.moves) : stats.daily,
    overall: bump(stats.overall, play.won, play.moves),
    log: [...stats.log, play],
    streak: { ...stats.streak },
  };

  if (play.mode === "daily") {
    if (play.won) {
      if (next.streak.lastWinDate === today) {
        // same-day repeat: leave the streak untouched
      } else {
        const consecutive = next.streak.lastWinDate !== null && dayDiff(next.streak.lastWinDate, today) === 1;
        next.streak.current = consecutive ? next.streak.current + 1 : 1;
        next.streak.best = Math.max(next.streak.best, next.streak.current);
        next.streak.lastWinDate = today;
      }
    } else {
      next.streak.current = 0;
    }
  }
  return next;
}
