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
