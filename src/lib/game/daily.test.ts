import { describe, it, expect } from "vitest";
import { hashDate, dailyAnswer, dailyAnswersByTier, todayString } from "./daily";

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

describe("dailyAnswersByTier", () => {
  // Nested pools, as the tiers really are: easy ⊆ medium ⊆ hard.
  const easy = [{ id: "Q1" }, { id: "Q2" }, { id: "Q3" }];
  const medium = [...easy, { id: "Q4" }, { id: "Q5" }, { id: "Q6" }];
  const hard = [...medium, { id: "Q7" }, { id: "Q8" }, { id: "Q9" }];
  const pools = { easy, medium, hard };

  it("gives the three tiers three DIFFERENT answers", () => {
    // Without exclusion the nested pools would routinely collide, and solving one tier would
    // hand you another for free.
    for (const date of ["2026-07-12", "2026-08-30", "2026-12-25", "2027-01-01"]) {
      const a = dailyAnswersByTier(date, pools, {});
      expect(new Set([a.easy, a.medium, a.hard]).size).toBe(3);
    }
  });

  it("draws every answer from its own tier's pool", () => {
    const a = dailyAnswersByTier("2026-08-30", pools, {});
    expect(easy.some((p) => p.id === a.easy)).toBe(true);
    expect(medium.some((p) => p.id === a.medium)).toBe(true);
    expect(hard.some((p) => p.id === a.hard)).toBe(true);
  });

  it("honours a calendar entry on Medium and moves the others out of its way", () => {
    const a = dailyAnswersByTier("2026-08-30", pools, { "2026-08-30": "Q2" });
    expect(a.medium).toBe("Q2");
    expect(a.easy).not.toBe("Q2");
    expect(a.hard).not.toBe("Q2");
  });

  it("falls back when the calendar names something outside Medium's pool", () => {
    const a = dailyAnswersByTier("2026-08-30", pools, { "2026-08-30": "Q999" });
    expect(medium.some((p) => p.id === a.medium)).toBe(true);
  });

  it("is stable for a given date", () => {
    expect(dailyAnswersByTier("2026-08-30", pools, {})).toEqual(
      dailyAnswersByTier("2026-08-30", pools, {}),
    );
  });

  it("still answers when exclusion would empty a tier's pool", () => {
    // A degenerate one-genus pool shared by every tier: distinctness is impossible, and the
    // answer must still be a real genus rather than undefined.
    const one = [{ id: "Q1" }];
    const a = dailyAnswersByTier("2026-08-30", { easy: one, medium: one, hard: one }, {});
    expect(a.easy).toBe("Q1");
    expect(a.medium).toBe("Q1");
    expect(a.hard).toBe("Q1");
  });
});
