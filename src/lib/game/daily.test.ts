import { describe, it, expect } from "vitest";
import { hashDate, dailyAnswer, todayString } from "./daily";

describe("hashDate", () => {
  it("is deterministic", () => {
    expect(hashDate("2026-07-12")).toBe(hashDate("2026-07-12"));
  });
  it("differs for different dates", () => {
    expect(hashDate("2026-07-12")).not.toBe(hashDate("2026-07-13"));
  });
});

describe("dailyAnswer", () => {
  const pool = [{ id: "Q100" }, { id: "Q9" }, { id: "Q30" }];
  it("returns an id from the pool", () => {
    expect(pool.map((p) => p.id)).toContain(dailyAnswer("2026-07-12", pool));
  });
  it("is deterministic for a given date", () => {
    expect(dailyAnswer("2026-07-12", pool)).toBe(dailyAnswer("2026-07-12", pool));
  });
  it("is stable regardless of input order (sorts by numeric QID)", () => {
    const shuffled = [{ id: "Q30" }, { id: "Q100" }, { id: "Q9" }];
    expect(dailyAnswer("2026-07-12", pool)).toBe(dailyAnswer("2026-07-12", shuffled));
  });
  it("can differ across dates", () => {
    const answers = new Set(
      ["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15"].map((d) => dailyAnswer(d, pool)),
    );
    expect(answers.size).toBeGreaterThan(1);
  });
  it("returns the calendar override when the date is present and the id is in the pool", () => {
    expect(dailyAnswer("2026-07-28", pool, { "2026-07-28": "Q30" })).toBe("Q30");
  });
  it("ignores an override whose id is NOT in the pool (falls back to deterministic)", () => {
    const cal = { "2026-07-28": "Q999" }; // Q999 not in pool
    expect(dailyAnswer("2026-07-28", pool, cal)).toBe(dailyAnswer("2026-07-28", pool));
  });
  it("uses the deterministic pick for a date not in the calendar", () => {
    const cal = { "2026-07-28": "Q30" };
    expect(dailyAnswer("2026-07-12", pool, cal)).toBe(dailyAnswer("2026-07-12", pool));
  });
  it("defaults to no calendar (2-arg call unchanged)", () => {
    expect(pool.map((p) => p.id)).toContain(dailyAnswer("2026-07-12", pool));
  });
});

describe("todayString", () => {
  it("formats local date components zero-padded", () => {
    // Local Jan 5 2026 -> "2026-01-05" (month is 0-indexed in Date)
    expect(todayString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
