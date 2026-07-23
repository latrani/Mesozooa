import { describe, it, expect } from "vitest";
import { buildShareText, buildShareParts } from "./share";
import type { GameState, GuessResult } from "./types";

function g(fraction: number, kind: "guess" | "branchHint" | "leafHint" = "guess", guessId = "x", cost = 1): GuessResult {
  return { guessId, sharedNodeId: "s", warmth: { fraction }, kind, cost };
}

describe("buildShareParts", () => {
  it("splits a win into headline, score, and emoji grid", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "branchHint"), g(1, "guess", "T")],
      status: "won",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 1,
    };
    const parts = buildShareParts(state, "2026-07-12");
    expect(parts.headline).toBe("Mesozooa 2026-07-12");
    expect(parts.score).toBe("3/20 · 🔦1");
    expect(parts.grid.join("")).toContain("🧊"); // cold guess
    expect(parts.grid.join("")).toContain("💡"); // hint
    expect(parts.grid.join("")).toContain("🎯"); // winning guess
  });
  it("scores a loss X/cap with no target marker", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.9)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const parts = buildShareParts(state, "2026-07-12");
    expect(parts.score).toBe("X/20");
    expect(parts.grid.join("")).not.toContain("🎯");
    expect(parts.grid.join("")).toContain("🌋"); // hot guess
  });
  it("wraps the emoji grid 5 per row", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.1), g(0.1), g(0.1), g(0.1), g(0.1)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const { grid } = buildShareParts(state, "2026-07-12");
    expect([...grid[0]].length).toBe(5); // 5 emoji on the first grid row
    expect([...grid[1]].length).toBe(1); // 1 on the second
  });
  it("derives the score cap from maxGuesses", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(1, "guess", "T")],
      status: "won",
      mode: "daily",
      maxGuesses: 10,
      hintsUsed: 0,
    };
    expect(buildShareParts(state, "2026-07-12").score).toBe("2/10");
  });
  it("expands a hint into cost-many 💡 and tallies presses with 🔦", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "branchHint", "h", 4), g(1, "guess", "T")],
      status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 1,
    };
    const parts = buildShareParts(state, "2026-07-16");
    // movesUsed = 1 + 4 + 1 = 6
    expect(parts.score).toBe("6/25 · 🔦1");
    expect([...parts.grid.join("")].filter((c) => c === "💡").length).toBe(4); // 4 lightbulbs for the cost-4 hint
  });
  it("omits the 🔦 tally when no hints were used", () => {
    const state: GameState = {
      target: "T", guesses: [g(0.1), g(1, "guess", "T")],
      status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 0,
    };
    expect(buildShareParts(state, "2026-07-16").score).toBe("2/25");
  });
});

describe("buildShareText", () => {
  // Clipboard form: compact single line breaks, NO blank-line paragraph spacing (that's the
  // preview's display-only concern).
  it("joins the parts with single line breaks, headline then score then grid", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "branchHint"), g(1, "guess", "T")],
      status: "won",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 1,
    };
    const lines = buildShareText(state, "2026-07-12").split("\n");
    expect(lines[0]).toBe("Mesozooa 2026-07-12");
    expect(lines[1]).toBe("3/20 · 🔦1");
    expect(lines.every((l) => l !== "")).toBe(true); // no blank paragraph lines in the copy
    expect([...lines[2]].length).toBe(3); // the single grid row: cold + 💡 + 🎯
  });
});
