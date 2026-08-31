import type { TreeNode } from "../tree/types";
import type { TreeStore } from "./treeStore";
import type { Warmth } from "./types";

export interface WarmthProvider {
  warmth(node: TreeNode): Warmth; // node is the MRCA of (guess, target)
}

const DEFAULT_ANCHOR = 0.9; // warmth at the terminal clade (spec 3.2)

// Two-phase warmth: ramp linearly to ANCHOR as the MRCA reaches the target's terminal clade,
// then flat ANCHOR until solved. Depends only on branchDepth (monotypic runs collapsed), so
// clade size / bushiness never enters. Target-scoped: construct once the target is known.
//
// branchDepthOf is supplied by the caller rather than read off the node, because the ruler is
// POOL-relative under a difficulty tier — a node's own `branchDepth` is the true-tree value and
// would compare two different rulers. See ../tree/lens.ts.
export function createTwoPhaseWarmth(opts: {
  targetId: string;
  terminalBranchDepth: number;
  branchDepthOf: (id: string) => number;
  anchor?: number;
}): WarmthProvider {
  const anchor = opts.anchor ?? DEFAULT_ANCHOR;
  const denom = Math.max(1, opts.terminalBranchDepth); // a degenerate pool can bottom this out
  return {
    warmth(node: TreeNode): Warmth {
      if (node.id === opts.targetId) return { fraction: 1 };
      const bd = opts.branchDepthOf(node.id);
      if (bd >= opts.terminalBranchDepth) return { fraction: anchor };
      return { fraction: anchor * (bd / denom) };
    },
  };
}

// Build the provider for a given target: resolves its terminal clade and that clade's runway,
// both against the store's pool.
export function warmthForTarget(store: TreeStore, targetId: string, anchor?: number): WarmthProvider {
  const terminalId = store.terminalClade(targetId);
  return createTwoPhaseWarmth({
    targetId,
    terminalBranchDepth: store.poolBranchDepth(terminalId),
    branchDepthOf: (id) => store.poolBranchDepth(id),
    anchor,
  });
}
