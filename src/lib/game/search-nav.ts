// Keyboard highlight navigation for the autocomplete listbox (issue #56).
//
// The active option is an index into the results, or -1 for "no option highlighted"
// (the input text stands on its own). Arrow keys cycle through a ring of count+1 states
// -1, 0, … count-1 so ArrowUp off the first option lands back on the input (-1), and
// ArrowDown past the last wraps around to it too. Pure + framework-free so it's unit-tested.

export const NONE = -1;

/**
 * Next active index when the user presses an arrow key.
 * @param current active index (-1 == none), assumed in [-1, count-1]
 * @param count   number of results
 * @param delta   +1 for ArrowDown, -1 for ArrowUp
 */
export function nextActiveIndex(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return NONE;
  // Shift the -1 "none" slot into a 0-based ring of length count+1, step, then shift back.
  const ring = count + 1;
  const stepped = (current + 1 + delta + ring) % ring;
  return stepped - 1;
}

/** Clamp a would-be active index back into [-1, count-1] after the result list changes. */
export function clampActiveIndex(current: number, count: number): number {
  if (current < 0 || current >= count) return NONE;
  return current;
}
