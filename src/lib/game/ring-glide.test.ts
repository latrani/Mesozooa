import { describe, it, expect } from "vitest";
import {
  glideDuration, glyphCenter, GLIDE_MS_KEYBOARD, GLIDE_MS_COMMIT,
} from "./ring-glide";

describe("glideDuration", () => {
  it("keyboard hops use the full skate duration", () => {
    expect(glideDuration("keyboard")).toBe(GLIDE_MS_KEYBOARD);
  });
  it("commits (click / guess-row) use the compressed duration", () => {
    expect(glideDuration("commit")).toBe(GLIDE_MS_COMMIT);
  });
  it("commit is faster than keyboard", () => {
    expect(GLIDE_MS_COMMIT).toBeLessThan(GLIDE_MS_KEYBOARD);
  });
});

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
