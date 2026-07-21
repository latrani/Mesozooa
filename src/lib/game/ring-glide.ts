// Pure math for the focus-ring glide (see docs/superpowers/specs/2026-07-21-ring-glide-design.md).
// No DOM / no Svelte — the component owns the tween and rendering; this owns the numbers.

// Provisional durations (ms). Two distinct, trigger-selected speeds; exact values are a
// look-and-feel knob (#52). Keyboard hops get the full skate; commits (click / guess-row) a
// compressed glide so a deliberate "put it there" doesn't dawdle.
export const GLIDE_MS_KEYBOARD = 180;
export const GLIDE_MS_COMMIT = 90;

export type GlideTrigger = "keyboard" | "commit";

export function glideDuration(trigger: GlideTrigger): number {
  return trigger === "commit" ? GLIDE_MS_COMMIT : GLIDE_MS_KEYBOARD;
}

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

// Collapsed-dot radius (provisional; look-and-feel knob). Sized to rhyme with the node glyph
// discs without covering them.
export const DOT_R = 5;

export interface RingGeom { cx: number; cy: number; width: number; height: number; radius: number }

// The rendered ring's geometry for a phase. One element morphs between these: a DOT_R circle
// on the glyph center (dot / in-transit) and the full label-hugging box (bloom / settled).
// A null labelBox (not yet measured) always yields a dot — there's nothing to hug.
export function ringGeom(
  phase: GlidePhase,
  center: Point,
  labelBox: { x: number; y: number; width: number; height: number } | null,
  ringH: number,
  ringPadX: number,
): RingGeom {
  if (phase === "dot" || !labelBox) {
    return { cx: center.x, cy: center.y, width: DOT_R * 2, height: DOT_R * 2, radius: DOT_R };
  }
  return {
    cx: center.x + labelBox.x - ringPadX,
    cy: center.y - ringH,
    width: labelBox.width + 2 * ringPadX,
    height: ringH,
    radius: 6,
  };
}
