import type { TreeNode } from "../tree/types";
import type { Warmth } from "./types";

export interface WarmthProvider {
  warmth(node: TreeNode): Warmth;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// Concave exponent applied to the log fraction. p<1 compresses the tail so narrowing to a
// small clade already reads as "pretty close", and frees bar-distance for the early cuts to
// register — matching intuition better than raw linear-in-log (see warmth.test.ts anchors).
const WARMTH_CURVE = 0.4;

export function createCountWarmth(rootCount: number): WarmthProvider {
  const denom = Math.log(rootCount) || 1;
  return {
    warmth(node: TreeNode): Warmth {
      const value = node.descendantGenusCount;
      // base = linear-in-log progress (equal step per halving); curve lifts the interior.
      const base = clamp01(1 - Math.log(value) / denom);
      const fraction = Math.pow(base, WARMTH_CURVE);
      const display = `${value} ${value === 1 ? "genus" : "genera"}`;
      return { value, display, fraction };
    },
  };
}
