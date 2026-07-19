import type { GameState } from "./types";
import { DAILY_MAX_GUESSES } from "./engine-core";

function bucket(fraction: number): string {
  if (fraction >= 0.8) return "🟥";
  if (fraction >= 0.6) return "🟧";
  if (fraction >= 0.4) return "⬜";
  if (fraction >= 0.2) return "🟦";
  return "⬛";
}

export function buildShareText(state: GameState, dateStr: string): string {
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
  const rows: string[] = [];
  for (let i = 0; i < emojis.length; i += 5) rows.push(emojis.slice(i, i + 5).join(""));
  return `Mesozooa ${dateStr}  ${score}${tally}\n${rows.join("\n")}`;
}
