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
}
