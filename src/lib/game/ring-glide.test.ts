import { describe, it, expect } from "vitest";
import { glyphCenter, ringGeom } from "./ring-glide";
import type { Point } from "./ring-glide";

describe("glyphCenter", () => {
  const px = (x: number) => 40 + x * 200; // mirrors SpineTree px()
  const py = (y: number) => 44 + y * 52;  // mirrors SpineTree py()
  it("maps a node's layout coords through px/py to the glyph origin", () => {
    expect(glyphCenter({ x: 2, y: 1 }, px, py)).toEqual({ x: 440, y: 96 });
  });
  it("is a pure projection — no dependence on other nodes", () => {
    expect(glyphCenter({ x: 0, y: 0 }, px, py)).toEqual({ x: 40, y: 44 });
  });
});

describe("ringGeom", () => {
  const center: Point = { x: 100, y: 200 };
  const labelBox = { x: 14, y: -20, width: 80, height: 16 };
  const RING_H = 28, RING_PAD_X = 14, DOT_R = 12; // dotR = GLYPH_GENUS / 2 = 24 / 2

  it("dot phase is a dotR circle centered on the glyph (top-left = center - dotR)", () => {
    const g = ringGeom("dot", center, labelBox, RING_H, RING_PAD_X, DOT_R);
    expect(g).toEqual({
      x: 100 - DOT_R,
      y: 200 - DOT_R,
      width: DOT_R * 2,
      height: DOT_R * 2,
      radius: DOT_R,
    });
  });

  it("dot radius tracks the passed dotR (dot = glyph size by construction)", () => {
    const g = ringGeom("dot", center, labelBox, RING_H, RING_PAD_X, 8);
    expect(g).toEqual({ x: 92, y: 192, width: 16, height: 16, radius: 8 });
  });

  it("dot phase ignores a null labelBox (still a valid dot)", () => {
    const g = ringGeom("dot", center, null, RING_H, RING_PAD_X, DOT_R);
    expect(g.width).toBe(DOT_R * 2);
    expect(g.x).toBe(100 - DOT_R);
  });

  it("bloom phase expands to the label-ring box in SVG space", () => {
    const g = ringGeom("bloom", center, labelBox, RING_H, RING_PAD_X, DOT_R);
    // x = center.x + labelBox.x - padX; y = center.y - RING_H
    expect(g).toEqual({
      x: 100 + 14 - 14,      // 100
      y: 200 - 28,           // 172
      width: 80 + 2 * 14,    // 108
      height: 28,
      radius: 6,
    });
  });

  it("bloom with a null labelBox falls back to a dot (nothing to hug yet)", () => {
    const g = ringGeom("bloom", center, null, RING_H, RING_PAD_X, DOT_R);
    expect(g.width).toBe(DOT_R * 2);
    expect(g.x).toBe(100 - DOT_R);
  });
});
