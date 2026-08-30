import { describe, it, expect } from "vitest";
import { emptyStats, serializeStats, deserializeStats, dayDiff, windowStats, avgMoves, recordPlay, currentStreak } from "./stats";

describe("emptyStats", () => {
  it("is a zeroed record", () => {
    const zeroTier = {
      streak: { current: 0, best: 0, lastWinDate: null },
      daily: { played: 0, won: 0, moveSum: 0 },
      overall: { played: 0, won: 0, moveSum: 0 },
    };
    expect(emptyStats()).toEqual({
      version: 2,
      byTier: { easy: zeroTier, medium: zeroTier, hard: zeroTier },
      log: [],
    });
  });
});

describe("serializeStats / deserializeStats", () => {
  it("round-trips", () => {
    const s = emptyStats();
    s.byTier.medium.streak.current = 3;
    s.log.push({ t: 100, mode: "daily", won: true, moves: 5 , tier: "medium" as const });
    expect(deserializeStats(serializeStats(s))).toEqual(s);
  });
  it("returns emptyStats on null", () => {
    expect(deserializeStats(null)).toEqual(emptyStats());
  });
  it("returns emptyStats on garbage", () => {
    expect(deserializeStats("not json")).toEqual(emptyStats());
    expect(deserializeStats(JSON.stringify({ version: 99 }))).toEqual(emptyStats());
  });
  it("returns emptyStats when a log entry is malformed", () => {
    const bad = { ...emptyStats(), log: [null] };
    expect(deserializeStats(JSON.stringify(bad))).toEqual(emptyStats());
  });
  it("returns emptyStats when a log entry is missing fields", () => {
    const bad = { ...emptyStats(), log: [{ t: 1, mode: "daily" , tier: "medium" as const }] };
    expect(deserializeStats(JSON.stringify(bad))).toEqual(emptyStats());
  });
});

describe("dayDiff", () => {
  it("counts whole days between dates", () => {
    expect(dayDiff("2026-07-21", "2026-07-22")).toBe(1);
    expect(dayDiff("2026-07-22", "2026-07-22")).toBe(0);
    expect(dayDiff("2026-07-22", "2026-07-21")).toBe(-1);
  });
  it("spans month boundaries", () => {
    expect(dayDiff("2026-06-30", "2026-07-01")).toBe(1);
  });
});

describe("windowStats", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  const base = emptyStats();
  base.log = [
    { t: now - 2 * DAY, mode: "daily", won: true, moves: 5 , tier: "medium" as const },
    { t: now - 6 * DAY, mode: "practice", won: false, moves: 8 , tier: "medium" as const },
    { t: now - 9 * DAY, mode: "daily", won: true, moves: 4 , tier: "medium" as const },
  ];
  it("counts only plays within the trailing window", () => {
    expect(windowStats(base, now, 7, "medium")).toEqual({ played: 2, won: 1, ratio: 0.5 });
  });
  it("includes a play exactly at the window edge", () => {
    // the 7-day-old play sits exactly on the boundary (now - 7*DAY)
    const s = emptyStats();
    s.log = [{ t: now - 7 * DAY, mode: "daily", won: true, moves: 3 , tier: "medium" as const }];
    expect(windowStats(s, now, 7, "medium")).toEqual({ played: 1, won: 1, ratio: 1 });
  });
  it("ratio is null with no plays in window", () => {
    expect(windowStats(emptyStats(), now, 7, "medium")).toEqual({ played: 0, won: 0, ratio: null });
  });
});

describe("avgMoves", () => {
  it("averages moveSum over wins", () => {
    expect(avgMoves({ played: 5, won: 2, moveSum: 14 })).toBe(7);
  });
  it("is null with zero wins", () => {
    expect(avgMoves({ played: 3, won: 0, moveSum: 0 })).toBeNull();
  });
});

describe("recordPlay — accumulators", () => {
  it("bumps overall + daily on a daily win, adds moves to both moveSums", () => {
    const s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 6 , tier: "medium" as const }, "2026-07-22");
    expect(s.byTier.medium.overall).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.byTier.medium.daily).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.log).toHaveLength(1);
  });
  it("bumps only overall on a practice play, and only moveSum on a win", () => {
    const win = recordPlay(emptyStats(), { t: 1, mode: "practice", won: true, moves: 9 , tier: "medium" as const }, "2026-07-22");
    expect(win.byTier.medium.overall).toEqual({ played: 1, won: 1, moveSum: 9 });
    expect(win.byTier.medium.daily).toEqual({ played: 0, won: 0, moveSum: 0 });
    const loss = recordPlay(emptyStats(), { t: 1, mode: "practice", won: false, moves: 9 , tier: "medium" as const }, "2026-07-22");
    expect(loss.byTier.medium.overall).toEqual({ played: 1, won: 0, moveSum: 0 }); // loss adds no moves
  });
  it("does not mutate the input", () => {
    const s0 = emptyStats();
    recordPlay(s0, { t: 1, mode: "daily", won: true, moves: 6 , tier: "medium" as const }, "2026-07-22");
    expect(s0).toEqual(emptyStats());
  });
});

describe("recordPlay — streak", () => {
  const dailyWin = (moves = 5): PlayImport => ({ t: 1, mode: "daily", won: true, moves , tier: "medium" as const });
  it("starts a streak at 1 on the first daily win", () => {
    const s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    expect(s.byTier.medium.streak).toEqual({ current: 1, best: 1, lastWinDate: "2026-07-22" });
  });
  it("extends on consecutive days", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.byTier.medium.streak).toEqual({ current: 2, best: 2, lastWinDate: "2026-07-22" });
  });
  it("resets to 1 after a gap, keeping best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-20");
    s = recordPlay(s, dailyWin(), "2026-07-21"); // current 2, best 2
    s = recordPlay(s, dailyWin(), "2026-07-25"); // gap
    expect(s.byTier.medium.streak).toEqual({ current: 1, best: 2, lastWinDate: "2026-07-25" });
  });
  it("is idempotent for a second win on the same day", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.byTier.medium.streak.current).toBe(1);
  });
  it("resets current to 0 on a daily loss but preserves best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21"); // current 1, best 1
    s = recordPlay(s, { t: 2, mode: "daily", won: false, moves: 20 , tier: "medium" as const }, "2026-07-22");
    expect(s.byTier.medium.streak).toEqual({ current: 0, best: 1, lastWinDate: "2026-07-21" });
  });
  it("ignores practice plays for the streak", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22"); // current 1
    s = recordPlay(s, { t: 3, mode: "practice", won: false, moves: 4 , tier: "medium" as const }, "2026-07-22");
    expect(s.byTier.medium.streak.current).toBe(1);
  });
});

describe("currentStreak", () => {
  const rec = (current: number, lastWinDate: string | null) => ({ current, best: 9, lastWinDate });
  it("shows the live streak when the last win was today", () => {
    expect(currentStreak(rec(3, "2026-07-22"), "2026-07-22")).toBe(3);
  });
  it("shows the live streak when the last win was yesterday (still extendable)", () => {
    expect(currentStreak(rec(3, "2026-07-21"), "2026-07-22")).toBe(3);
  });
  it("shows 0 once a day was missed (gap >= 2)", () => {
    expect(currentStreak(rec(3, "2026-07-20"), "2026-07-22")).toBe(0);
  });
  it("returns the stored current when there is no last win date", () => {
    // non-zero stored current so this proves "returns stored", not a hardcoded 0
    expect(currentStreak(rec(3, null), "2026-07-22")).toBe(3);
  });
});

type PlayImport = import("./stats").PlayLog;

describe("v1 -> v2 migration", () => {
  // Exactly what a pre-tier player has sitting in localStorage.
  const v1 = JSON.stringify({
    version: 1,
    streak: { current: 4, best: 11, lastWinDate: "2026-07-22" },
    daily: { played: 30, won: 25, moveSum: 180 },
    overall: { played: 42, won: 33, moveSum: 250 },
    log: [
      { t: 1000, mode: "daily", won: true, moves: 6 },
      { t: 2000, mode: "practice", won: false, moves: 12 },
    ],
  });

  it("folds a v1 record wholesale into Medium — nothing is lost", () => {
    const s = deserializeStats(v1);
    expect(s.version).toBe(2);
    expect(s.byTier.medium.streak).toEqual({ current: 4, best: 11, lastWinDate: "2026-07-22" });
    expect(s.byTier.medium.daily).toEqual({ played: 30, won: 25, moveSum: 180 });
    expect(s.byTier.medium.overall).toEqual({ played: 42, won: 33, moveSum: 250 });
  });

  it("leaves Easy and Hard empty — the history was never theirs", () => {
    const s = deserializeStats(v1);
    expect(s.byTier.easy).toEqual(emptyStats().byTier.easy);
    expect(s.byTier.hard).toEqual(emptyStats().byTier.hard);
  });

  it("backfills every logged play to Medium so the rolling windows still see them", () => {
    const s = deserializeStats(v1);
    expect(s.log.map((p) => p.tier)).toEqual(["medium", "medium"]);
    expect(windowStats(s, 3000, 1, "medium").played).toBe(2);
    expect(windowStats(s, 3000, 1, "easy").played).toBe(0);
  });

  it("round-trips the migrated record as v2", () => {
    const once = deserializeStats(v1);
    expect(deserializeStats(serializeStats(once))).toEqual(once);
  });
});

describe("tiers keep separate scoreboards", () => {
  it("a win on Easy does not touch Medium's streak", () => {
    let s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 5, tier: "medium" }, "2026-07-21");
    s = recordPlay(s, { t: 2, mode: "daily", won: true, moves: 5, tier: "easy" }, "2026-07-22");
    expect(s.byTier.medium.streak.current).toBe(1); // still just its own single win
    expect(s.byTier.easy.streak.current).toBe(1);
    expect(s.byTier.hard.streak.current).toBe(0);
  });

  it("a loss on Hard does not break an Easy streak", () => {
    let s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 5, tier: "easy" }, "2026-07-22");
    s = recordPlay(s, { t: 2, mode: "daily", won: false, moves: 20, tier: "hard" }, "2026-07-22");
    expect(s.byTier.easy.streak.current).toBe(1);
    expect(s.byTier.hard.streak.current).toBe(0);
  });

  it("scopes the rolling window to its tier", () => {
    let s = recordPlay(emptyStats(), { t: 1000, mode: "daily", won: true, moves: 5, tier: "easy" }, "2026-07-22");
    s = recordPlay(s, { t: 1000, mode: "daily", won: false, moves: 20, tier: "hard" }, "2026-07-22");
    expect(windowStats(s, 2000, 1, "easy")).toEqual({ played: 1, won: 1, ratio: 1 });
    expect(windowStats(s, 2000, 1, "hard")).toEqual({ played: 1, won: 0, ratio: 0 });
  });
});
