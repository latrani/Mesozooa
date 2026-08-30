import { describe, it, expect } from "vitest";
import { assembleTree } from "../tree/assemble";
import { MONO_FIXTURE_RAWS } from "../tree/fixture";
import { createTwoPhaseWarmth, warmthForTarget } from "./warmth";
import { createTreeStore } from "./treeStore";
import { markPlayable } from "../tree/playable";

// MONO tree branchDepths (from Task 1): MR=0, B1=1, MA=1, MB=1, SA=2.
// Use target with terminalBranchDepth = 2 (a target under SA).
const tree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
markPlayable(tree);
const store = createTreeStore(tree);
// The whole pool is playable here, so the lens ruler matches the true-tree one and these
// expectations are the pre-lens ones unchanged.
const byId = (id: string) => tree.nodes[id].branchDepth;
const w = createTwoPhaseWarmth({ targetId: "GA1", terminalBranchDepth: 2, branchDepthOf: byId });
const f = (id: string) => w.warmth(tree.nodes[id]).fraction;

describe("two-phase warmth", () => {
  it("is 1.0 when the MRCA is the target (solved)", () => {
    expect(f("GA1")).toBe(1);
  });
  it("is the anchor at or below the terminal clade", () => {
    expect(f("SA")).toBeCloseTo(0.9); // branchDepth 2 >= 2
  });
  it("ramps linearly to the anchor through phase 1", () => {
    expect(f("MR")).toBeCloseTo(0.0);   // bd 0 / 2
    expect(f("B1")).toBeCloseTo(0.45);  // 0.9 * 1 / 2
  });
  it("gives the same anchor to targets of different depth", () => {
    const depths: Record<string, number> = { atTerminal: 5, atTerminalDeep: 12 };
    const of = (id: string) => depths[id] ?? 0;
    const shallow = createTwoPhaseWarmth({ targetId: "x", terminalBranchDepth: 5, branchDepthOf: of });
    const deep = createTwoPhaseWarmth({ targetId: "y", terminalBranchDepth: 12, branchDepthOf: of });
    expect(shallow.warmth({ id: "atTerminal" } as never).fraction).toBeCloseTo(0.9);
    expect(deep.warmth({ id: "atTerminalDeep" } as never).fraction).toBeCloseTo(0.9);
  });
});

describe("warmthForTarget — the ruler is pool-relative", () => {
  it("measures against the store's pool, giving a sparse pool a shorter runway", () => {
    // Full pool: GA1's terminal clade is SA at pool-branchDepth 2, so the ramp has two steps and
    // the root sits at 0.
    const full = warmthForTarget(store, "GA1");
    expect(full.warmth(tree.nodes["MR"]).fraction).toBeCloseTo(0.0);
    expect(full.warmth(tree.nodes["B1"]).fraction).toBeCloseTo(0.45);
    expect(full.warmth(tree.nodes["SA"]).fraction).toBeCloseTo(0.9);

    // Sparse pool: GA2 is gone, so SA holds one pool member and is no longer a terminal clade.
    // GA1's terminal clade climbs to MR, whose pool-branchDepth is 0 — every clade above the
    // target is already at the anchor. The runway is gone, which is precisely the effect that
    // makes a 100-genus Easy tier playable at all.
    const sparse = warmthForTarget(createTreeStore(tree, ["GA1", "GB1", "OT"]), "GA1");
    expect(sparse.warmth(tree.nodes["B1"]).fraction).toBeCloseTo(0.9);
    expect(sparse.warmth(tree.nodes["GA1"]).fraction).toBe(1);
  });
});
