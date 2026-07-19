export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const ZOOM_DEFAULT = 1;
export const ZOOM_STEP = 1.3; // multiplicative step per +/- button press

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function zoomStep(z: number, dir: 1 | -1): number {
  return clampZoom(dir > 0 ? z * ZOOM_STEP : z / ZOOM_STEP);
}

export interface ScrollForZoomInput {
  origin: { x: number; y: number }; // px, relative to the scroller's top-left
  oldZoom: number;
  newZoom: number;
  scroll: { left: number; top: number };
  viewport: { w: number; h: number };
  content: { w: number; h: number }; // UNSCALED tree-only content dims (no specimen bleed)
  /** Fixed screen-px gutter reserved AFTER the (scaled) tree — the specimen's covered width.
      It's a separate unscaled spacer, not baked into content.w, so the reserved clearance stays
      a constant pixel width at every zoom level (issue #32). Defaults to 0. */
  runway?: number;
}

// New scroll offset that keeps `origin` over the same content point across a zoom change,
// clamped to the scrollable range. The scrollable width is the SCALED tree plus the FIXED runway;
// the tree is left-anchored (min 0), so when the scaled tree is narrower than the viewport the
// only scrollable distance is whatever the runway pokes past the right edge.
export function scrollForZoom(p: ScrollForZoomInput): { left: number; top: number } {
  const runway = p.runway ?? 0;
  const cx = (p.scroll.left + p.origin.x) / p.oldZoom;
  const cy = (p.scroll.top + p.origin.y) / p.oldZoom;
  const rawLeft = cx * p.newZoom - p.origin.x;
  const rawTop = cy * p.newZoom - p.origin.y;
  const maxLeft = Math.max(0, p.content.w * p.newZoom + runway - p.viewport.w);
  const maxTop = Math.max(0, p.content.h * p.newZoom - p.viewport.h);
  return {
    left: Math.min(Math.max(0, rawLeft), maxLeft),
    top: Math.min(Math.max(0, rawTop), maxTop),
  };
}
