export interface Warmth {
  fraction: number; // 0..1 color driver (two-phase spine warmth); the only field consumed
}

export type GuessKind = "guess" | "branchHint" | "leafHint";

export interface GuessResult {
  guessId: string;
  sharedNodeId: string;
  warmth: Warmth;
  kind: GuessKind;
  cost: number; // guess-slots this row consumed (guess=1, branchHint=depth-scaled, leafHint=HINT_COST_MIN)
}

export type GameMode = "practice" | "daily";
export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  target: string;
  guesses: GuessResult[];
  status: GameStatus;
  mode: GameMode;
  maxGuesses: number | null;
  hintsUsed: number;
  /** set only when a practice round is started from a seed URL; excluded from stats. */
  seeded?: true;
  /**
   * Node ids opened in Explore while this round was in play, deduped, in view order (#72).
   * Lives on the game (not the explorer store) so it persists with the save and so a new round
   * starts a fresh count — browsing done BEFORE the round began isn't part of this game's story.
   * Absent on rounds saved before the field existed.
   */
  exploreViews?: string[];
}
