import { describe, it, expect } from "vitest";
import { ZOOM_MIN, ZOOM_MAX, clampZoom, zoomStep, scrollForZoom } from "./zoom";

describe("clampZoom", () => {
  it("clamps below, above, and passes through within", () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps up and down multiplicatively and clamps at the bounds", () => {
    expect(zoomStep(1, 1)).toBeGreaterThan(1);
    expect(zoomStep(1, -1)).toBeLessThan(1);
    expect(zoomStep(2.9, 1)).toBe(ZOOM_MAX); // 2.9*step > 3 -> clamped
    expect(zoomStep(0.11, -1)).toBe(ZOOM_MIN); // 0.11/step < 0.1 -> clamped
  });
});

describe("scrollForZoom", () => {
  const base = {
    origin: { x: 100, y: 0 },
    scroll: { left: 0, top: 0 },
    viewport: { w: 200, h: 100 },
    content: { w: 1000, h: 100 },
  };
  it("keeps the point under the origin fixed while zooming in", () => {
    // content point under screen-x 100 is content-x 100; at 2x it must stay under screen-x 100,
    // i.e. scrollLeft = 100*2 - 100 = 100.
    const { left } = scrollForZoom({ ...base, oldZoom: 1, newZoom: 2 });
    expect(left).toBe(100);
  });
  it("clamps scroll into [0, max] and yields 0 when content fits the viewport", () => {
    const fits = scrollForZoom({
      ...base, origin: { x: 50, y: 0 }, oldZoom: 1, newZoom: 0.1, content: { w: 1000, h: 100 },
    });
    expect(fits.left).toBe(0); // 1000*0.1=100 < viewport 200 -> maxLeft 0
  });
});
