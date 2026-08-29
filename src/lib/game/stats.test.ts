import { describe, it, expect } from "vitest";
import { emptyStats, serializeStats, deserializeStats, dayDiff, windowStats, avgMoves, avgExplored, recordPlay, currentStreak } from "./stats";

describe("emptyStats", () => {
  it("is a zeroed record", () => {
    expect(emptyStats()).toEqual({
      version: 1,
      streak: { current: 0, best: 0, lastWinDate: null },
      daily: { played: 0, won: 0, moveSum: 0, exploredSum: 0 },
      overall: { played: 0, won: 0, moveSum: 0, exploredSum: 0 },
      log: [],
    });
  });
});

describe("serializeStats / deserializeStats", () => {
  it("round-trips", () => {
    const s = emptyStats();
    s.streak.current = 3;
    s.log.push({ t: 100, mode: "daily", won: true, moves: 5, explored: 2 });
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
    { t: now - 2 * DAY, mode: "daily", won: true, moves: 5, explored: 0 },
    { t: now - 6 * DAY, mode: "practice", won: false, moves: 8, explored: 0 },
    { t: now - 9 * DAY, mode: "daily", won: true, moves: 4, explored: 0 },
  ];
  it("counts only plays within the trailing window", () => {
    expect(windowStats(base, now, 7)).toEqual({ played: 2, won: 1, ratio: 0.5 });
  });
  it("includes a play exactly at the window edge", () => {
    // the 7-day-old play sits exactly on the boundary (now - 7*DAY)
    const s = emptyStats();
    s.log = [{ t: now - 7 * DAY, mode: "daily", won: true, moves: 3, explored: 0 }];
    expect(windowStats(s, now, 7)).toEqual({ played: 1, won: 1, ratio: 1 });
  });
  it("ratio is null with no plays in window", () => {
    expect(windowStats(emptyStats(), now, 7)).toEqual({ played: 0, won: 0, ratio: null });
  });
});

describe("avgMoves", () => {
  it("averages moveSum over wins", () => {
    expect(avgMoves({ played: 5, won: 2, moveSum: 14, exploredSum: 0 })).toBe(7);
  });
  it("is null with zero wins", () => {
    expect(avgMoves({ played: 3, won: 0, moveSum: 0, exploredSum: 0 })).toBeNull();
  });
});

describe("recordPlay — accumulators", () => {
  it("bumps overall + daily on a daily win, adds moves to both moveSums", () => {
    const s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 6, explored: 0 }, "2026-07-22");
    expect(s.overall).toEqual({ played: 1, won: 1, moveSum: 6, exploredSum: 0 });
    expect(s.daily).toEqual({ played: 1, won: 1, moveSum: 6, exploredSum: 0 });
    expect(s.log).toHaveLength(1);
  });
  it("bumps only overall on a practice play, and only moveSum on a win", () => {
    const win = recordPlay(emptyStats(), { t: 1, mode: "practice", won: true, moves: 9, explored: 0 }, "2026-07-22");
    expect(win.overall).toEqual({ played: 1, won: 1, moveSum: 9, exploredSum: 0 });
    expect(win.daily).toEqual({ played: 0, won: 0, moveSum: 0, exploredSum: 0 });
    const loss = recordPlay(emptyStats(), { t: 1, mode: "practice", won: false, moves: 9, explored: 0 }, "2026-07-22");
    expect(loss.overall).toEqual({ played: 1, won: 0, moveSum: 0, exploredSum: 0 }); // loss adds no moves
  });
  it("does not mutate the input", () => {
    const s0 = emptyStats();
    recordPlay(s0, { t: 1, mode: "daily", won: true, moves: 6, explored: 0 }, "2026-07-22");
    expect(s0).toEqual(emptyStats());
  });
});

describe("recordPlay — streak", () => {
  const dailyWin = (moves = 5): PlayImport => ({ t: 1, mode: "daily", won: true, moves, explored: 0 });
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
    s = recordPlay(s, { t: 2, mode: "daily", won: false, moves: 20, explored: 0 }, "2026-07-22");
    expect(s.streak).toEqual({ current: 0, best: 1, lastWinDate: "2026-07-21" });
  });
  it("ignores practice plays for the streak", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22"); // current 1
    s = recordPlay(s, { t: 3, mode: "practice", won: false, moves: 4, explored: 0 }, "2026-07-22");
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

describe("avgExplored", () => {
  it("divides by PLAYED, not won — a loss with lookups still counts", () => {
    // 2 games, one won, 10 lookups total => 5.0 per game (not 10.0 per win)
    expect(avgExplored({ played: 2, won: 1, moveSum: 5, exploredSum: 10 })).toBe(5);
  });
  it("is null with nothing played", () => {
    expect(avgExplored({ played: 0, won: 0, moveSum: 0, exploredSum: 0 })).toBeNull();
  });
});

describe("recordPlay explored", () => {
  it("accumulates explored counts across modes", () => {
    let s = emptyStats();
    s = recordPlay(s, { t: 1, mode: "daily", won: true, moves: 4, explored: 3 }, "2026-08-28");
    s = recordPlay(s, { t: 2, mode: "practice", won: false, moves: 9, explored: 7 }, "2026-08-28");
    expect(s.daily.exploredSum).toBe(3);
    expect(s.overall.exploredSum).toBe(10);
  });
  it("accumulates explored on a LOSS too (unlike moveSum)", () => {
    const s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: false, moves: 9, explored: 6 }, "2026-08-28");
    expect(s.overall.moveSum).toBe(0);
    expect(s.overall.exploredSum).toBe(6);
  });
});

describe("legacy stats saves", () => {
  it("defaults exploredSum to 0 on records written before the field existed", () => {
    const legacy = JSON.stringify({
      version: 1,
      streak: { current: 2, best: 3, lastWinDate: "2026-08-27" },
      daily: { played: 4, won: 3, moveSum: 20 },
      overall: { played: 6, won: 4, moveSum: 30 },
      log: [{ t: 1, mode: "daily", won: true, moves: 5 }],
    });
    const s = deserializeStats(legacy);
    expect(s.daily.exploredSum).toBe(0);
    expect(s.overall.exploredSum).toBe(0);
    expect(s.log[0].explored).toBe(0);
    expect(s.overall.played).toBe(6); // the rest of the record survives
  });
});
