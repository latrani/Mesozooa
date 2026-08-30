import type { GameMode } from "./types";
import { TIERS, type Tier } from "../tree/tiers";

export interface Acc {
  played: number;
  won: number;
  moveSum: number; // Σ movesUsed over won games; divided by `won` for average moves
  exploredSum: number; // Σ Explore lookups over ALL played games; divided by `played` (#72)
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
  explored: number; // unique Explore lookups made during the round (#72)
  tier: Tier; // which pool it was played against — an Easy 4/20 is not a Hard 4/20
}

/** One tier's record. Tiers do not share a scoreboard: the same score means a different feat. */
export interface TierStats {
  streak: StreakRec;
  daily: Acc;
  overall: Acc;
}

export interface Stats {
  version: 2;
  byTier: Record<Tier, TierStats>;
  log: PlayLog[];
}

export function emptyTierStats(): TierStats {
  return {
    streak: { current: 0, best: 0, lastWinDate: null },
    daily: { played: 0, won: 0, moveSum: 0, exploredSum: 0 },
    overall: { played: 0, won: 0, moveSum: 0, exploredSum: 0 },
  };
}

export function emptyStats(): Stats {
  return {
    version: 2,
    byTier: Object.fromEntries(TIERS.map((t) => [t, emptyTierStats()])) as Record<Tier, TierStats>,
    log: [],
  };
}

export function serializeStats(s: Stats): string {
  return JSON.stringify(s);
}

// exploredSum/explored are NOT required: records written before #72 are valid, and rejecting
// them would silently wipe a player's whole history. Missing values are backfilled with 0 below.
function isAcc(a: unknown): a is Acc {
  const r = a as Record<string, unknown>;
  return !!a && typeof r.played === "number" && typeof r.won === "number" && typeof r.moveSum === "number";
}

function withExplored(a: Acc): Acc {
  return { ...a, exploredSum: typeof a.exploredSum === "number" ? a.exploredSum : 0 };
}

/** Backfill both of the fields a record may predate: #72's explored counts and the tier. */
function healTierStats(t: TierStats): TierStats {
  return { streak: t.streak, daily: withExplored(t.daily), overall: withExplored(t.overall) };
}

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

// Tier-tolerant: a v1 log entry has no tier and is backfilled to Medium by the migration below.
function isPlayLog(p: unknown): p is Omit<PlayLog, "tier"> & { tier?: unknown } {
  const r = p as Record<string, unknown>;
  return (
    !!p && typeof p === "object" &&
    typeof r.t === "number" &&
    (r.mode === "daily" || r.mode === "practice") &&
    typeof r.won === "boolean" &&
    typeof r.moves === "number"
  );
}

function isTierStats(v: unknown): v is TierStats {
  const r = v as Record<string, unknown>;
  const streak = r?.streak as Record<string, unknown> | undefined;
  return (
    !!v &&
    !!streak &&
    typeof streak.current === "number" &&
    typeof streak.best === "number" &&
    (streak.lastWinDate === null || typeof streak.lastWinDate === "string") &&
    isAcc(r.daily) &&
    isAcc(r.overall)
  );
}

export function deserializeStats(raw: string | null): Stats {
  if (raw === null) return emptyStats();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(o.log) || !o.log.every(isPlayLog)) return emptyStats();

    if (o.version === 2) {
      const byTier = o.byTier as Record<string, unknown> | undefined;
      if (!byTier || !TIERS.every((t) => isTierStats(byTier[t]))) return emptyStats();
      const healed = Object.fromEntries(
        TIERS.map((t) => [t, healTierStats(byTier[t] as TierStats)]),
      ) as Record<Tier, TierStats>;
      const log = (o.log as PlayLog[]).map((p) => ({
        ...p,
        tier: isTier(p.tier) ? p.tier : "medium",
        explored: typeof p.explored === "number" ? p.explored : 0,
      }));
      return { version: 2, byTier: healed, log };
    }

    // v1 -> v2. Everything recorded before tiers existed was played against what is now Medium,
    // so that is the only honest home for it — folded in wholesale rather than discarded.
    if (isTierStats(o)) {
      const migrated = emptyStats();
      migrated.byTier.medium = healTierStats({
        streak: (o as unknown as TierStats).streak,
        daily: (o as unknown as TierStats).daily,
        overall: (o as unknown as TierStats).overall,
      });
      // A v1 record may predate #72 as well as the tiers, so heal both fields at once.
      migrated.log = (o.log as Omit<PlayLog, "tier">[]).map((p) => ({
        ...p,
        tier: "medium" as Tier,
        explored: typeof (p as PlayLog).explored === "number" ? (p as PlayLog).explored : 0,
      }));
      return migrated;
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

// The streak's CURRENT value as of `today`, accounting for a lazy break: recordPlay only
// updates the streak on a recorded play, so between plays a missed day leaves a stale `current`.
// Displayed current is live only while lastWinDate is today or yesterday; otherwise the streak
// is already dead (the next win can only restart at 1). `best`/`lastWinDate` are untouched.
export function currentStreak(streak: StreakRec, today: string): number {
  if (streak.lastWinDate === null) return streak.current;
  const gap = dayDiff(streak.lastWinDate, today);
  return gap === 0 || gap === 1 ? streak.current : 0;
}

export function windowStats(
  stats: Stats,
  now: number,
  days: number,
  tier: Tier,
): { played: number; won: number; ratio: number | null } {
  const cutoff = now - days * 86_400_000;
  let played = 0;
  let won = 0;
  for (const p of stats.log) {
    if (p.tier === tier && p.t >= cutoff) {
      played += 1;
      if (p.won) won += 1;
    }
  }
  return { played, won, ratio: played === 0 ? null : won / played };
}

export function avgMoves(acc: Acc): number | null {
  return acc.won === 0 ? null : acc.moveSum / acc.won;
}

// Denominator is `played`, not `won` (see bump).
export function avgExplored(acc: Acc): number | null {
  return acc.played === 0 ? null : acc.exploredSum / acc.played;
}

// exploredSum accumulates on EVERY play, won or lost — unlike moveSum, which only means
// something for a win. A round you lost after twelve lookups is exactly what this stat is about.
function bump(acc: Acc, won: boolean, moves: number, explored: number): Acc {
  return {
    played: acc.played + 1,
    won: acc.won + (won ? 1 : 0),
    moveSum: acc.moveSum + (won ? moves : 0),
    exploredSum: acc.exploredSum + explored,
  };
}

// Returns a NEW Stats. Not idempotent for the log/accumulators — the caller (the store hook)
// must fire this exactly once per completed game. The same-day guard protects the STREAK only.
export function recordPlay(stats: Stats, play: PlayLog, today: string): Stats {
  // Only the played tier's slot moves — a win on Easy must not extend a Medium streak.
  const prev = stats.byTier[play.tier];
  const slot: TierStats = {
    daily: play.mode === "daily" ? bump(prev.daily, play.won, play.moves, play.explored) : prev.daily,
    overall: bump(prev.overall, play.won, play.moves, play.explored),
    streak: { ...prev.streak },
  };
  const next: Stats = {
    ...stats,
    byTier: { ...stats.byTier, [play.tier]: slot },
    log: [...stats.log, play],
  };

  if (play.mode === "daily") {
    if (play.won) {
      if (slot.streak.lastWinDate === today) {
        // same-day repeat: leave the streak untouched
      } else {
        const consecutive = slot.streak.lastWinDate !== null && dayDiff(slot.streak.lastWinDate, today) === 1;
        slot.streak.current = consecutive ? slot.streak.current + 1 : 1;
        slot.streak.best = Math.max(slot.streak.best, slot.streak.current);
        slot.streak.lastWinDate = today;
      }
    } else {
      slot.streak.current = 0;
    }
  }
  return next;
}
