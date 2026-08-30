import { describe, it, expect } from "vitest";
import { serializeGame, deserializeGame, dailyKey, practiceKey, staleDailyKeys } from "./persistence";
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

describe("dailyKey / practiceKey / staleDailyKeys", () => {
  it("namespaces the daily key by tier AND date", () => {
    expect(dailyKey("medium", "2026-07-12")).toBe("mesozooa:daily:2:medium:2026-07-12");
    expect(dailyKey("easy", "2026-07-12")).toBe("mesozooa:daily:2:easy:2026-07-12");
  });
  it("namespaces the practice key by tier", () => {
    expect(practiceKey("hard")).toBe("mesozooa:practice:2:hard");
  });
  it("keeps today's key for EVERY tier", () => {
    // The bug this guards: pruning by a single expected key would wipe the two tiers you are not
    // currently playing, silently ending games the player never finished.
    const keys = [
      "mesozooa:daily:2:easy:2026-07-12",
      "mesozooa:daily:2:medium:2026-07-12",
      "mesozooa:daily:2:hard:2026-07-12",
    ];
    expect(staleDailyKeys(keys, "2026-07-12")).toEqual([]);
  });
  it("drops past dates across all tiers, and ignores unrelated keys", () => {
    const keys = [
      "mesozooa:daily:2:easy:2026-07-10",
      "mesozooa:daily:2:medium:2026-07-12",
      "mesozooa:daily:2:hard:2026-07-11",
      "mesozooa:practice:2:easy",
      "some:other:key",
    ];
    expect(staleDailyKeys(keys, "2026-07-12").sort()).toEqual([
      "mesozooa:daily:2:easy:2026-07-10",
      "mesozooa:daily:2:hard:2026-07-11",
    ]);
  });
  it("drops every v1 daily key, today's included — the migration has already read it", () => {
    const keys = ["mesozooa:daily:1:2026-07-12", "mesozooa:daily:1:2026-07-10"];
    expect(staleDailyKeys(keys, "2026-07-12").sort()).toEqual(keys.sort());
  });
});
