// Deep ore (cold/far) -> luminous cyan (hot/near). CSS-var refs so token edits flow through.
// Two-segment "elbow" shape: `at` positions hold the earthy->green range across the lower ~80%,
// then compress the brighten into the top: teal at 0.85 (the elbow), a bright "almost there" at
// 0.95, and the luminous "fully lit" solved cyan at 1. Every stop clears white >= 3:1, since guess
// chips flood-fill with white text. warmthRampColor interpolates continuously (color-mix).
export interface WarmthStop {
  at: number;
  color: string;
}
export const WARMTH_RAMP: readonly WarmthStop[] = [
  { at: 0, color: "var(--warm-0)" }, // deep ore
  { at: 0.2, color: "var(--warm-1)" }, // umber
  { at: 0.5, color: "var(--warm-2)" }, // olive-green
  { at: 0.85, color: "var(--warm-3)" }, // teal — the elbow
  { at: 0.95, color: "var(--warm-4)" }, // bright teal-cyan — "almost there"
  { at: 1, color: "var(--warm-5)" }, // luminous cyan — "fully lit" / solved
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
