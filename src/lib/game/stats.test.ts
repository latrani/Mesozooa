import { describe, it, expect } from "vitest";
import { emptyStats, serializeStats, deserializeStats } from "./stats";

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
});
