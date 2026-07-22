import { describe, it, expect } from "vitest";
import { emptyStats, serializeStats, deserializeStats, dayDiff, windowStats, avgMoves, recordPlay, currentStreak } from "./stats";

describe("emptyStats", () => {
  it("is a zeroed record", () => {
    expect(emptyStats()).toEqual({
      version: 1,
      streak: { current: 0, best: 0, lastWinDate: null },
      daily: { played: 0, won: 0, moveSum: 0 },
      overall: { played: 0, won: 0, moveSum: 0 },
      log: [],
    });
  });
});

describe("serializeStats / deserializeStats", () => {
  it("round-trips", () => {
    const s = emptyStats();
    s.streak.current = 3;
    s.log.push({ t: 100, mode: "daily", won: true, moves: 5 });
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
    const bad = { ...emptyStats(), log: [{ t: 1, mode: "daily" }] };
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
    { t: now - 2 * DAY, mode: "daily", won: true, moves: 5 },
    { t: now - 6 * DAY, mode: "practice", won: false, moves: 8 },
    { t: now - 9 * DAY, mode: "daily", won: true, moves: 4 },
  ];
  it("counts only plays within the trailing window", () => {
    expect(windowStats(base, now, 7)).toEqual({ played: 2, won: 1, ratio: 0.5 });
  });
  it("includes a play exactly at the window edge", () => {
    // the 7-day-old play sits exactly on the boundary (now - 7*DAY)
    const s = emptyStats();
    s.log = [{ t: now - 7 * DAY, mode: "daily", won: true, moves: 3 }];
    expect(windowStats(s, now, 7)).toEqual({ played: 1, won: 1, ratio: 1 });
  });
  it("ratio is null with no plays in window", () => {
    expect(windowStats(emptyStats(), now, 7)).toEqual({ played: 0, won: 0, ratio: null });
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
    const s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 6 }, "2026-07-22");
    expect(s.overall).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.daily).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.log).toHaveLength(1);
  });
  it("bumps only overall on a practice play, and only moveSum on a win", () => {
    const win = recordPlay(emptyStats(), { t: 1, mode: "practice", won: true, moves: 9 }, "2026-07-22");
    expect(win.overall).toEqual({ played: 1, won: 1, moveSum: 9 });
    expect(win.daily).toEqual({ played: 0, won: 0, moveSum: 0 });
    const loss = recordPlay(emptyStats(), { t: 1, mode: "practice", won: false, moves: 9 }, "2026-07-22");
    expect(loss.overall).toEqual({ played: 1, won: 0, moveSum: 0 }); // loss adds no moves
  });
  it("does not mutate the input", () => {
    const s0 = emptyStats();
    recordPlay(s0, { t: 1, mode: "daily", won: true, moves: 6 }, "2026-07-22");
    expect(s0).toEqual(emptyStats());
  });
});

describe("recordPlay — streak", () => {
  const dailyWin = (moves = 5): PlayImport => ({ t: 1, mode: "daily", won: true, moves });
  it("starts a streak at 1 on the first daily win", () => {
    const s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    expect(s.streak).toEqual({ current: 1, best: 1, lastWinDate: "2026-07-22" });
  });
  it("extends on consecutive days", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.streak).toEqual({ current: 2, best: 2, lastWinDate: "2026-07-22" });
  });
  it("resets to 1 after a gap, keeping best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-20");
    s = recordPlay(s, dailyWin(), "2026-07-21"); // current 2, best 2
    s = recordPlay(s, dailyWin(), "2026-07-25"); // gap
    expect(s.streak).toEqual({ current: 1, best: 2, lastWinDate: "2026-07-25" });
  });
  it("is idempotent for a second win on the same day", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.streak.current).toBe(1);
  });
  it("resets current to 0 on a daily loss but preserves best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21"); // current 1, best 1
    s = recordPlay(s, { t: 2, mode: "daily", won: false, moves: 20 }, "2026-07-22");
    expect(s.streak).toEqual({ current: 0, best: 1, lastWinDate: "2026-07-21" });
  });
  it("ignores practice plays for the streak", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22"); // current 1
    s = recordPlay(s, { t: 3, mode: "practice", won: false, moves: 4 }, "2026-07-22");
    expect(s.streak.current).toBe(1);
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
