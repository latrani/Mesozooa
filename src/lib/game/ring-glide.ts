// Pure math for the focus-ring glide (see docs/superpowers/specs/2026-07-21-ring-glide-design.md).
// No DOM / no Svelte — the component owns the tween and rendering; this owns the numbers.

export interface Point { x: number; y: number }

// The glyph disc's center in SVG space — the puck's skate anchor at both ends. The node's
// local origin (0,0 in its <g>) is the glyph center, so this is just the group transform.
export function glyphCenter(
  node: { x: number; y: number },
  px: (x: number) => number,
  py: (y: number) => number,
): Point {
  return { x: px(node.x), y: py(node.y) };
}

export type GlidePhase = "dot" | "bloom";

// x/y are the rect's TOP-LEFT corner — one consistent coordinate frame across both phases, so
// the tween interpolates a single frame and there's no discontinuity at a phase boundary.
export interface RingGeom { x: number; y: number; width: number; height: number; radius: number }

// The rendered ring's geometry for a phase. One element morphs between these: a glyph-sized
// ring centered on the glyph (dot / in-transit) and the full label-hugging box (bloom /
// settled). `dotR` is the collapsed radius — the caller passes GLYPH_GENUS / 2 so the dot
// frames the glyph disc exactly. A null labelBox (not yet measured) always yields a dot —
// there's nothing to hug.
export function ringGeom(
  phase: GlidePhase,
  center: Point,
  labelBox: { x: number; y: number; width: number; height: number } | null,
  ringH: number,
  ringPadX: number,
  dotR: number,
): RingGeom {
  if (phase === "dot" || !labelBox) {
    // dotR circle centered on the glyph → top-left is center minus the radius on both axes.
    return {
      x: center.x - dotR,
      y: center.y - dotR,
      width: dotR * 2,
      height: dotR * 2,
      radius: dotR,
    };
  }
  return {
    x: center.x + labelBox.x - ringPadX,
    y: center.y - ringH,
    width: labelBox.width + 2 * ringPadX,
    height: ringH,
    radius: 6,
  };
}

// Interpolate two ring geometries field-by-field. Used to morph the ring between its dot and bloom
// shapes (t=0 → dot, t=1 → bloom) while both are computed at the SAME live center — so the ring's
// position rides the shared clock and the size morph is orthogonal (can't induce a wheel).
export function lerpRingGeom(a: RingGeom, b: RingGeom, t: number): RingGeom {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    x: l(a.x, b.x),
    y: l(a.y, b.y),
    width: l(a.width, b.width),
    height: l(a.height, b.height),
    radius: l(a.radius, b.radius),
  };
}
