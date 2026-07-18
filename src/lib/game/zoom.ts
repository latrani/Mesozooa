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
  content: { w: number; h: number }; // UNSCALED svg content dims
}

// New scroll offset that keeps `origin` over the same content point across a zoom change,
// clamped to the scrollable range. When the scaled content is smaller than the viewport the max
// is 0, so this returns 0 and CSS centering takes over.
export function scrollForZoom(p: ScrollForZoomInput): { left: number; top: number } {
  const cx = (p.scroll.left + p.origin.x) / p.oldZoom;
  const cy = (p.scroll.top + p.origin.y) / p.oldZoom;
  const rawLeft = cx * p.newZoom - p.origin.x;
  const rawTop = cy * p.newZoom - p.origin.y;
  const maxLeft = Math.max(0, p.content.w * p.newZoom - p.viewport.w);
  const maxTop = Math.max(0, p.content.h * p.newZoom - p.viewport.h);
  return {
    left: Math.min(Math.max(0, rawLeft), maxLeft),
    top: Math.min(Math.max(0, rawTop), maxTop),
  };
}
