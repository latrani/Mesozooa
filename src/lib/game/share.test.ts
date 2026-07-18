import { describe, it, expect } from "vitest";
import { buildShareText } from "./share";
import type { GameState, GuessResult } from "./types";

function g(fraction: number, kind: "guess" | "branchHint" | "leafHint" = "guess", guessId = "x", cost = 1): GuessResult {
  return { guessId, sharedNodeId: "s", warmth: { value: 1, display: "", fraction }, kind, cost };
}

describe("buildShareText", () => {
  it("headers a win with n/20 and marks the winning guess", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "branchHint"), g(1, "guess", "T")],
      status: "won",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 1,
    };
    const text = buildShareText(state, "2026-07-12");
    expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-12  3/20 · 🔦1");
    expect(text).toContain("🟦"); // cold guess
    expect(text).toContain("💡"); // hint
    expect(text).toContain("🎯"); // winning guess
  });
  it("headers a loss with X/20 and no target marker", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.9)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const text = buildShareText(state, "2026-07-12");
    expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-12  X/20");
    expect(text).not.toContain("🎯");
    expect(text).toContain("🟥"); // hot guess
  });
  it("wraps emoji 5 per line", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.1), g(0.1), g(0.1), g(0.1), g(0.1)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const lines = buildShareText(state, "2026-07-12").split("\n");
    expect([...lines[1]].length).toBe(5); // 5 emoji on the first grid line
    expect([...lines[2]].length).toBe(1); // 1 on the second
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
    expect(buildShareText(state, "2026-07-12").split("\n")[0]).toBe("Mesozooa 2026-07-12  2/10");
  });
  it("expands a hint into cost-many 💡 and tallies presses with 🔦", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "branchHint", "h", 4), g(1, "guess", "T")],
      status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 1,
    };
    const text = buildShareText(state, "2026-07-16");
    // movesUsed = 1 + 4 + 1 = 6
    expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-16  6/25 · 🔦1");
    expect([...text].filter((c) => c === "💡").length).toBe(4); // 4 lightbulbs for the cost-4 hint
  });
  it("omits the 🔦 tally when no hints were used", () => {
    const state: GameState = {
      target: "T", guesses: [g(0.1), g(1, "guess", "T")],
      status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 0,
    };
    expect(buildShareText(state, "2026-07-16").split("\n")[0]).toBe("Mesozooa 2026-07-16  2/25");
  });
});
