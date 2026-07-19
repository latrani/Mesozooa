import type { GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import { warmthRampColor } from "./warmth-ramp";
import { displayName } from "./displayName";

export type Chip =
  | { kind: "guess"; guessId: string; nodeId: string; name: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "branchHint"; nodeId: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "leafHint"; label: string }
  | { kind: "answer"; nodeId: string; name: string; won: boolean; bgColor: string };

export interface ChipOpts {
  /** the answer node — present only at end state */
  answerId?: string | null;
  won?: boolean;
  /** warmth fraction of the most-recent real guess (drives the loss answer color) */
  lastGuessFraction?: number;
}

// Map the guess log (+ optional end-state answer) to newest-first chip descriptors. Pure: all
// color/label resolution happens here so GuessList is a thin renderer. Guess/branchHint carry a
// warmth-colored dot; leafHint is text-only (it reveals no tree node); the answer is a filled chip.
export function chipsFor(guesses: GuessResult[], store: TreeStore, opts: ChipOpts): Chip[] {
  const chips: Chip[] = [];

  // newest-first
  for (const g of guesses.slice().reverse()) {
    if (g.kind === "leafHint") {
      chips.push({ kind: "leafHint", label: "Field clue" });
    } else if (g.kind === "branchHint") {
      const shared = store.getNode(g.sharedNodeId);
      chips.push({
        kind: "branchHint",
        nodeId: g.sharedNodeId,
        dotColor: warmthRampColor(g.warmth.fraction),
        sharedNodeId: g.sharedNodeId,
        sharedName: displayName(shared?.name),
      });
    } else {
      const guess = store.getNode(g.guessId);
      const shared = store.getNode(g.sharedNodeId);
      chips.push({
        kind: "guess",
        guessId: g.guessId,
        nodeId: g.guessId,
        name: displayName(guess?.name),
        dotColor: warmthRampColor(g.warmth.fraction),
        sharedNodeId: g.sharedNodeId,
        sharedName: displayName(shared?.name),
      });
    }
  }

  // answer chip pinned on top at end state
  if (opts.answerId) {
    const node = store.getNode(opts.answerId);
    const bgColor = opts.won ? warmthRampColor(1) : warmthRampColor(opts.lastGuessFraction ?? 0);
    chips.unshift({
      kind: "answer",
      nodeId: opts.answerId,
      name: displayName(node?.name),
      won: !!opts.won,
      bgColor,
    });
  }

  return chips;
}
