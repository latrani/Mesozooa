import { describe, it, expect } from "vitest";
import { WARMTH_RAMP, warmthRampColor } from "./warmth-ramp";

describe("warmthRampColor", () => {
  it("returns the exact endpoint stops at 0 and 1 (no mix)", () => {
    expect(warmthRampColor(0)).toBe(WARMTH_RAMP[0].color);
    expect(warmthRampColor(1)).toBe(WARMTH_RAMP[WARMTH_RAMP.length - 1].color);
  });
  it("returns an exact stop color when the fraction lands on that stop's position", () => {
    const s = WARMTH_RAMP[2];
    expect(warmthRampColor(s.at)).toBe(s.color);
  });
  it("interpolates continuously between neighboring stops via color-mix, weighted by position", () => {
    const a = WARMTH_RAMP[0];
    const b = WARMTH_RAMP[1];
    const mid = (a.at + b.at) / 2; // halfway between the first two stops
    const c = warmthRampColor(mid);
    expect(c).toContain("color-mix");
    expect(c).toContain(a.color);
    expect(c).toContain(b.color);
    expect(c).toContain("50%");
  });
  it("clamps out-of-range input to the endpoints", () => {
    expect(warmthRampColor(-1)).toBe(WARMTH_RAMP[0].color);
    expect(warmthRampColor(2)).toBe(WARMTH_RAMP[WARMTH_RAMP.length - 1].color);
  });
  it("stops run cold->hot with strictly increasing positions from 0 to 1", () => {
    expect(WARMTH_RAMP[0]).toEqual({ at: 0, color: "var(--placard-edge)" });
    expect(WARMTH_RAMP[WARMTH_RAMP.length - 1]).toEqual({ at: 1, color: "var(--warm-5)" });
    for (let i = 1; i < WARMTH_RAMP.length; i++) {
      expect(WARMTH_RAMP[i].at).toBeGreaterThan(WARMTH_RAMP[i - 1].at);
    }
  });
  it("compresses the turquoise cluster into the hot end (varied earth/green spread across most of the bar)", () => {
    // warm-4 (near-turquoise) sits high, so the top band 80-100% is where turquoise lives and
    // the earthy->green range occupies the lower ~80%.
    const warm4 = WARMTH_RAMP.find((s) => s.color === "var(--warm-4)")!;
    expect(warm4.at).toBeGreaterThanOrEqual(0.9);
  });
});
