import type { GameState } from "./types";
import { DAILY_MAX_GUESSES } from "./engine-core";

function bucket(fraction: number): string {
  if (fraction >= 0.8) return "🌋";
  if (fraction >= 0.6) return "🔥";
  if (fraction >= 0.4) return "⛅";
  if (fraction >= 0.2) return "💧";
  return "🧊";
}

// The three "thoughts" of a share result, each its own block. The preview renders these with
// paragraph spacing between blocks; the clipboard text joins them with plain line breaks.
export interface ShareParts {
  /** "Mesozooa 2026-07-12" */
  headline: string;
  /** "3/20 · 🔦1" (or "X/20" on a loss) */
  score: string;
  /** emoji grid, 5 per row */
  grid: string[];
}

export function buildShareParts(state: GameState, dateStr: string): ShareParts {
  const won = state.status === "won";
  const cap = state.maxGuesses ?? DAILY_MAX_GUESSES;
  const moves = state.guesses.reduce((sum, g) => sum + (g.cost ?? 1), 0);
  const hintPresses = state.guesses.filter((g) => g.kind === "branchHint" || g.kind === "leafHint").length;
  const score = won ? `${moves}/${cap}` : `X/${cap}`;
  const tally = hintPresses > 0 ? ` · 🔦${hintPresses}` : "";

  // Grid: a hint row expands to cost-many 💡 (visualizes moves spent on help).
  const emojis: string[] = [];
  for (const r of state.guesses) {
    if (r.kind === "branchHint" || r.kind === "leafHint") {
      for (let i = 0; i < (r.cost ?? 1); i++) emojis.push("💡");
    } else if (won && r.guessId === state.target) {
      emojis.push("🎯");
    } else {
      emojis.push(bucket(r.warmth.fraction));
    }
  }
  const grid: string[] = [];
  for (let i = 0; i < emojis.length; i += 5) grid.push(emojis.slice(i, i + 5).join(""));

  return { headline: `Mesozooa ${dateStr}`, score: `${score}${tally}`, grid };
}

// Clipboard form: plain line breaks between every line (no blank-line paragraph spacing — that's
// display-only, added by the preview's CSS). Keeps pasted results compact.
export function buildShareText(state: GameState, dateStr: string): string {
  const { headline, score, grid } = buildShareParts(state, dateStr);
  return [headline, score, ...grid].join("\n");
}
