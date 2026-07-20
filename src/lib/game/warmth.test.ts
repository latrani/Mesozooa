import { describe, it, expect } from "vitest";
import { assembleTree } from "../tree/assemble";
import { MONO_FIXTURE_RAWS } from "../tree/fixture";
import { createTwoPhaseWarmth } from "./warmth";

// MONO tree branchDepths (from Task 1): MR=0, B1=1, MA=1, MB=1, SA=2.
// Use target with terminalBranchDepth = 2 (a target under SA).
const tree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
const w = createTwoPhaseWarmth({ targetId: "GA1", terminalBranchDepth: 2 });
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
    const shallow = createTwoPhaseWarmth({ targetId: "x", terminalBranchDepth: 5 });
    const deep = createTwoPhaseWarmth({ targetId: "y", terminalBranchDepth: 12 });
    const atTerminal = { branchDepth: 5 } as any;
    const atTerminalDeep = { branchDepth: 12 } as any;
    expect(shallow.warmth(atTerminal).fraction).toBeCloseTo(0.9);
    expect(deep.warmth(atTerminalDeep).fraction).toBeCloseTo(0.9);
  });
});
