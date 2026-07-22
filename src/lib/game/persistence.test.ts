import { describe, it, expect } from "vitest";
import { serializeGame, deserializeGame, dailyKey, staleDailyKeys } from "./persistence";
import type { GameState } from "./types";

const sample: GameState = {
  target: "Q100",
  guesses: [
    { guessId: "Q9", sharedNodeId: "Q1", warmth: { fraction: 0.3 }, kind: "guess", cost: 1 },
  ],
  status: "playing",
  mode: "daily",
  maxGuesses: 20,
  hintsUsed: 0,
};

const practiceSample: GameState = { ...sample, mode: "practice", maxGuesses: null };

describe("serializeGame / deserializeGame", () => {
  it("round-trips a daily state", () => {
    expect(deserializeGame(serializeGame(sample), "daily")).toEqual(sample);
  });
  it("round-trips a practice state", () => {
    expect(deserializeGame(serializeGame(practiceSample), "practice")).toEqual(practiceSample);
  });
  it("returns null on non-JSON", () => {
    expect(deserializeGame("not json", "daily")).toBeNull();
  });
  it("returns null when required fields are missing", () => {
    expect(deserializeGame(JSON.stringify({ target: "Q1" }), "daily")).toBeNull();
  });
  it("returns null when a guess row is malformed", () => {
    const bad = { ...sample, guesses: [{ guessId: "Q9" }] }; // missing sharedNodeId/kind/warmth
    expect(deserializeGame(JSON.stringify(bad), "daily")).toBeNull();
  });
  it("returns null when the stored mode doesn't match the expected mode", () => {
    // A practice blob must not deserialize as daily, and vice versa.
    expect(deserializeGame(serializeGame(practiceSample), "daily")).toBeNull();
    expect(deserializeGame(serializeGame(sample), "practice")).toBeNull();
  });
  it("backfills cost and normalizes legacy kinds on rows from before the rename", () => {
    const legacy = JSON.stringify({
      target: "T",
      guesses: [
        { guessId: "a", sharedNodeId: "s", warmth: { fraction: 0.2 }, kind: "guess" },
        // Pre-rename shipped literals — must map onto the current kind names.
        { guessId: "b", sharedNodeId: "s", warmth: { fraction: 0.5 }, kind: "hint" },
        { guessId: "c", sharedNodeId: "s", warmth: { fraction: 0.6 }, kind: "clue" },
      ],
      status: "playing",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 2,
    });
    const state = deserializeGame(legacy, "daily");
    expect(state).not.toBeNull();
    expect(state!.guesses[0].cost).toBe(1); // guess backfills to 1
    expect(state!.guesses[1].kind).toBe("branchHint"); // legacy "hint" -> branchHint
    expect(state!.guesses[1].cost).toBeGreaterThanOrEqual(1); // hint backfills to a positive cost
    expect(state!.guesses[2].kind).toBe("leafHint"); // legacy "clue" -> leafHint
    expect(state!.guesses[2].cost).toBeGreaterThanOrEqual(1);
  });
});

describe("dailyKey / staleDailyKeys", () => {
  it("namespaces the key by date", () => {
    expect(dailyKey("2026-07-12")).toBe("mesozooa:daily:1:2026-07-12");
  });
  it("returns daily keys that aren't today's, ignoring other keys", () => {
    const keys = [
      "mesozooa:daily:1:2026-07-10",
      "mesozooa:daily:1:2026-07-12",
      "some:other:key",
    ];
    expect(staleDailyKeys(keys, "2026-07-12")).toEqual(["mesozooa:daily:1:2026-07-10"]);
  });
});
