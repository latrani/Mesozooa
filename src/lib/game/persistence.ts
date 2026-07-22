import type { GameState, GameMode, GuessResult, GuessKind } from "./types";

const DAILY_PREFIX = "mesozooa:daily:1:";

// Practice is a single slot (no date to namespace by) — the current round, whatever its status.
export const PRACTICE_KEY = "mesozooa:practice:1";

export function dailyKey(date: string): string {
  return DAILY_PREFIX + date;
}

// Daily-namespaced keys that aren't today's — safe to prune on load.
export function staleDailyKeys(allKeys: string[], today: string): string[] {
  const keep = dailyKey(today);
  return allKeys.filter((k) => k.startsWith(DAILY_PREFIX) && k !== keep);
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
