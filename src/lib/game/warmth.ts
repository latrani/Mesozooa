import type { TreeData, TreeNode } from "../tree/types";
import { terminalClade } from "../tree/terminal";
import type { Warmth } from "./types";

export interface WarmthProvider {
  warmth(node: TreeNode): Warmth; // node is the MRCA of (guess, target)
}

const DEFAULT_ANCHOR = 0.9; // warmth at the terminal clade (spec 3.2)

// Two-phase warmth: ramp linearly to ANCHOR as the MRCA reaches the target's terminal clade,
// then flat ANCHOR until solved. Depends only on branchDepth (monotypic runs collapsed), so
// clade size / bushiness never enters. Target-scoped: construct once the target is known.
export function createTwoPhaseWarmth(opts: {
  targetId: string;
  terminalBranchDepth: number;
  anchor?: number;
}): WarmthProvider {
  const anchor = opts.anchor ?? DEFAULT_ANCHOR;
  const denom = Math.max(1, opts.terminalBranchDepth); // prune guarantees >= 2; guard anyway
  return {
    warmth(node: TreeNode): Warmth {
      if (node.id === opts.targetId) return { fraction: 1 };
      if (node.branchDepth >= opts.terminalBranchDepth) return { fraction: anchor };
      return { fraction: anchor * (node.branchDepth / denom) };
    },
  };
}

// Build the provider for a given target: resolves its terminal clade and that clade's runway.
export function warmthForTarget(data: TreeData, targetId: string, anchor?: number): WarmthProvider {
  const terminalId = terminalClade(data, targetId);
  const terminalBranchDepth = data.nodes[terminalId].branchDepth;
  return createTwoPhaseWarmth({ targetId, terminalBranchDepth, anchor });
}
