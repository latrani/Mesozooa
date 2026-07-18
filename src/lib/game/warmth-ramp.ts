// Dark earth (cold/far) -> turquoise gem (hot/near). CSS-var refs so token edits flow through.
// Positioned control STOPS: `at` places each stop along 0..1, so we can STRETCH the varied
// earth->green range across most of the bar and COMPRESS the near-identical turquoise cluster
// (warm-3/4/5) into the hot end, where even spacing wasted the top fifth. warmthRampColor
// interpolates continuously between stops (color-mix) so it reads as a smooth gradient.
export interface WarmthStop {
  at: number;
  color: string;
}
export const WARMTH_RAMP: readonly WarmthStop[] = [
  { at: 0, color: "var(--placard-edge)" }, // deep ore
  { at: 0.28, color: "var(--warm-0)" }, // dark tan
  { at: 0.52, color: "var(--warm-1)" }, // olive
  { at: 0.74, color: "var(--warm-2)" }, // green
  { at: 0.88, color: "var(--warm-3)" }, // teal-green — turquoise cluster begins
  { at: 0.95, color: "var(--warm-4)" }, // near-turquoise
  { at: 1, color: "var(--warm-5)" }, // gem turquoise
] as const;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// Continuous color along the ramp. Finds the segment [stop i, stop i+1] the fraction falls in
// and mixes the two by within-segment position. Lands exactly on a stop's color at its `at`
// position (no mix); mixes elsewhere.
export function warmthRampColor(fraction: number): string {
  const f = clamp01(fraction);
  const stops = WARMTH_RAMP;
  const last = stops.length - 1;
  // find the upper stop whose position is >= f
  let hi = 1;
  while (hi < last && stops[hi].at < f) hi++;
  const lo = hi - 1;
  const a = stops[lo];
  const b = stops[hi];
  const span = b.at - a.at || 1;
  const t = clamp01((f - a.at) / span); // 0..1 within the segment
  if (t === 0) return a.color;
  if (t === 1) return b.color;
  // color-mix `A p%, B` puts p% of A. We want (1-t) of the lower stop.
  const lowerPct = Math.round((1 - t) * 100);
  return `color-mix(in srgb, ${a.color} ${lowerPct}%, ${b.color})`;
}
