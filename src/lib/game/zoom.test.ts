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
  it("adds the runway (fixed screen px) to the max scroll without scaling it", () => {
    // Scroll hard to the right so the result saturates the max: content 1000*2=2000 scaled px,
    // plus a 300px runway that does NOT scale, minus viewport 200 -> maxLeft 2100.
    const { left } = scrollForZoom({
      ...base, origin: { x: 0, y: 0 }, scroll: { left: 9000, top: 0 },
      oldZoom: 1, newZoom: 2, runway: 300,
    });
    expect(left).toBe(2100);
  });
  it("keeps the runway a FIXED gutter as zoom shrinks (the #32 fix)", () => {
    // The tree fits the viewport when zoomed out, but the runway still reserves its full 300px
    // regardless of zoom, so max scroll never collapses below runway - viewport.
    const { left } = scrollForZoom({
      ...base, origin: { x: 0, y: 0 }, scroll: { left: 9000, top: 0 },
      oldZoom: 1, newZoom: 0.1, content: { w: 1000, h: 100 }, runway: 300,
    });
    // 1000*0.1=100 scaled tree + 300 runway - 200 viewport = 200. Not 0 (runway unscaled).
    expect(left).toBe(200);
  });
  it("defaults runway to 0 (back-compatible)", () => {
    const { left } = scrollForZoom({ ...base, oldZoom: 1, newZoom: 2 });
    expect(left).toBe(100); // unchanged from the no-runway case
  });
});

// Regression guard for the WebKit pinch drift: WebKit fires 100+ gesturechange events per
// pinch, so how each event MAPS its baseline matters. Applied absolutely from a fixed gesturestart
// snapshot, N tiny steps land exactly where one big step would. Chained off the live (rounded)
// scroll each event, sub-pixel error compounds and walks the anchor into the corner.
describe("scrollForZoom under many-event pinch (the WebKit anchor drift)", () => {
  const geom = {
    origin: { x: 400, y: 0 }, // pointer held still, right of center
    viewport: { w: 600, h: 100 },
    content: { w: 4000, h: 100 },
    runway: 0,
  };
  const startScroll = { left: 1500, top: 0 };
  const startZoom = 1;
  const endZoom = 0.6; // a zoom-OUT sweep

  it("absolute mapping from the start snapshot equals a single direct step", () => {
    // 140 events, each mapped from the SAME (startScroll, startZoom) baseline — as the fixed
    // WebKit handler does. The last event uses the final cumulative scale, so it must match a
    // lone start->end step exactly.
    const direct = scrollForZoom({ ...geom, scroll: startScroll, oldZoom: startZoom, newZoom: endZoom });
    let last = { left: 0, top: 0 };
    for (let i = 1; i <= 140; i++) {
      const z = startZoom + (endZoom - startZoom) * (i / 140);
      last = scrollForZoom({ ...geom, scroll: startScroll, oldZoom: startZoom, newZoom: z });
    }
    expect(last.left).toBeCloseTo(direct.left, 6);
    expect(last.top).toBeCloseTo(direct.top, 6);
  });

  it("chaining off rounded live scroll drifts the anchor toward 0 (the bug the fix avoids)", () => {
    // The OLD incremental path: each event maps from the previous event's rounded scrollLeft and
    // the previous zoom. Rounding models the browser storing integer scroll. Over 140 events this
    // must NOT equal the exact target — proving why the absolute mapping was necessary.
    const direct = scrollForZoom({ ...geom, scroll: startScroll, oldZoom: startZoom, newZoom: endZoom });
    let scroll = { ...startScroll };
    let prevZoom = startZoom;
    for (let i = 1; i <= 140; i++) {
      const z = startZoom + (endZoom - startZoom) * (i / 140);
      const step = scrollForZoom({ ...geom, scroll, oldZoom: prevZoom, newZoom: z });
      scroll = { left: Math.round(step.left), top: Math.round(step.top) }; // browser rounds scroll
      prevZoom = z;
    }
    expect(Math.abs(scroll.left - direct.left)).toBeGreaterThan(1); // drifted off target
  });
});
