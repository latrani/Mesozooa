import { describe, it, expect } from "vitest";
import { createCountWarmth } from "./warmth";
import type { TreeNode } from "../tree/types";

function node(count: number): TreeNode {
  return {
    id: "x", name: "X", rankId: null, parentId: null, childrenIds: [],
    depth: 0, descendantGenusCount: count, isGenus: false, playable: false, sitelinks: 0,
  };
}

const warmth = createCountWarmth(4); // fixture root count

describe("createCountWarmth", () => {
  it("reports the genus count as value", () => {
    expect(warmth.warmth(node(2)).value).toBe(2);
  });
  it("pluralizes the display", () => {
    expect(warmth.warmth(node(1)).display).toBe("1 genus");
    expect(warmth.warmth(node(4)).display).toBe("4 genera");
  });
  it("fraction is 1 at the answer (count 1) and 0 at the whole tree", () => {
    expect(warmth.warmth(node(1)).fraction).toBeCloseTo(1, 6);
    expect(warmth.warmth(node(4)).fraction).toBeCloseTo(0, 6);
  });
  it("fraction is monotonic: smaller clade is warmer", () => {
    expect(warmth.warmth(node(2)).fraction).toBeGreaterThan(warmth.warmth(node(4)).fraction);
    expect(warmth.warmth(node(1)).fraction).toBeGreaterThan(warmth.warmth(node(2)).fraction);
  });
  it("clamps fraction to [0,1]", () => {
    const f = warmth.warmth(node(1000)).fraction; // count > rootCount
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
  it("compresses the tail: narrowing to a small clade already reads as 'pretty close'", () => {
    // p=0.4 concave curve. Against a 2072-genus tree, 57 genera should land ~0.74 (well past
    // half), and the first ~half cut (1330) should register a real step, not a sliver.
    const big = createCountWarmth(2072);
    expect(big.warmth(node(57)).fraction).toBeGreaterThan(0.7);
    expect(big.warmth(node(1330)).fraction).toBeGreaterThan(0.25);
  });
  it("is concave vs the plain log: a mid clade is warmer than linear-in-log would give", () => {
    // The power curve lifts every interior point above the raw log fraction.
    const big = createCountWarmth(2072);
    const rawLog = 1 - Math.log(57) / Math.log(2072); // ~0.47
    expect(big.warmth(node(57)).fraction).toBeGreaterThan(rawLog);
  });
});
