import type { GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import { warmthRampColor } from "./warmth-ramp";
import { displayName } from "./displayName";

export type Chip =
  | { kind: "guess"; guessId: string; nodeId: string; name: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "branchHint"; nodeId: string; dotColor: string; sharedNodeId: string; sharedName: string }
  | { kind: "leafHint"; label: string }
  | { kind: "answer"; nodeId: string; name: string; won: boolean; bgColor: string }
  // A plain node-reference chip: the Explore recents. Not produced by chipsFor (which maps the
  // guess log); the explorer builds these directly. Kept in the shared union so <Chip> is the one
  // renderer for every chip variant.
  | { kind: "crumb"; nodeId: string; name: string };

export interface ChipOpts {
  /** the answer node — present only at end state */
  answerId?: string | null;
  won?: boolean;
  /** warmth fraction of the most-recent real guess — colors the loss answer chip */
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
      chips.push({ kind: "leafHint", label: "Paleo-data" });
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
      // On a win, the winning guess (guessId === answer) is collapsed into the answer chip
      // below — skip it here so it doesn't also render as a self-referential guess chip.
      if (opts.won && opts.answerId != null && g.guessId === opts.answerId) continue;
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
    // Win: the answer was found -> fully lit (fraction 1). Loss: colored by your most-recent
    // (warmest) guess's warmth, so the reveal reflects how close you got. Both fill + glow.
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
