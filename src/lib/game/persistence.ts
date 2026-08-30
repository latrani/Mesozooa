import type { GameState, GameMode, GuessResult, GuessKind } from "./types";
import type { Tier } from "../tree/tiers";

// v2 namespaces the tier: each tier holds its own game in each lane, so switching difficulty
// mid-round never destroys the round you left.
const DAILY_PREFIX = "mesozooa:daily:2:";
const PRACTICE_PREFIX = "mesozooa:practice:2:";

// v1, pre-tiers. Read once so an in-progress game survives the upgrade, then pruned. Both belong
// to what is now Medium — that was the only pool.
export const LEGACY_DAILY_PREFIX = "mesozooa:daily:1:";
export const LEGACY_PRACTICE_KEY = "mesozooa:practice:1";

export function dailyKey(tier: Tier, date: string): string {
  return `${DAILY_PREFIX}${tier}:${date}`;
}

export function practiceKey(tier: Tier): string {
  return PRACTICE_PREFIX + tier;
}

export function legacyDailyKey(date: string): string {
  return LEGACY_DAILY_PREFIX + date;
}

// Daily keys worth dropping on load: any tier's key for a past date, plus every v1 daily key
// (superseded once the migration below has had its one chance to read them).
export function staleDailyKeys(allKeys: string[], today: string): string[] {
  return allKeys.filter((k) => {
    if (k.startsWith(LEGACY_DAILY_PREFIX)) return true;
    if (!k.startsWith(DAILY_PREFIX)) return false;
    return !k.endsWith(`:${today}`);
  });
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

function isValidGuessRow(g: unknown): g is GuessResult {
  if (!g || typeof g !== "object") return false;
  const r = g as Record<string, unknown>;
  return (
    typeof r.guessId === "string" &&
    typeof r.sharedNodeId === "string" &&
    // Legacy-tolerant: accept the current kinds AND the pre-rename literals ("hint"/"clue"),
    // which are normalized to branchHint/leafHint in deserializeDaily.
    (r.kind === "guess" ||
      r.kind === "branchHint" ||
      r.kind === "leafHint" ||
      r.kind === "hint" ||
      r.kind === "clue") &&
    !!r.warmth &&
    typeof r.warmth === "object" &&
    typeof (r.warmth as Record<string, unknown>).fraction === "number"
  );
}

export function deserializeGame(json: string, expectedMode: GameMode): GameState | null {
  try {
    const obj = JSON.parse(json);
    if (
      obj &&
      typeof obj.target === "string" &&
      Array.isArray(obj.guesses) &&
      obj.guesses.every(isValidGuessRow) &&
      typeof obj.status === "string" &&
      obj.mode === expectedMode &&
      typeof obj.hintsUsed === "number" &&
      (obj.maxGuesses === null || typeof obj.maxGuesses === "number")
    ) {
      const guesses = (obj.guesses as (Omit<GuessResult, "kind"> & { kind: string })[]).map((g) => {
        // Legacy normalization: the shipped saves use the pre-rename kind literals
        // "hint"/"clue"; map them onto the current branchHint/leafHint names so in-progress
        // games survive the rename.
        const kind: GuessKind =
          g.kind === "hint"
            ? "branchHint"
            : g.kind === "clue"
              ? "leafHint"
              : (g.kind as GuessKind);
        return {
          ...g,
          kind,
          // Legacy saves predate per-row cost. Guesses cost 1; legacy hints predate the
          // depth-scaled model — charge the minimum so restored budgets stay sane.
          cost: typeof g.cost === "number" ? g.cost : kind === "guess" ? 1 : 2,
        };
      });
      return { ...(obj as GameState), guesses };
    }
    return null;
  } catch {
    return null;
  }
}
