// Pure math for the Explore relayout FLIP (see docs/superpowers/specs/2026-07-21-relayout-flip-design.md).
// No DOM / no Svelte — the component owns the tween + rendering; this owns the classification + numbers.

export interface Pos { x: number; y: number }

export interface LayoutDiff {
  persisting: Array<{ id: string; from: Pos; to: Pos }>;
  entering: Array<{ id: string; to: Pos; parentFrom: Pos | null; parentTo: Pos | null }>;
  leaving: Array<{ id: string; lastPos: Pos; parentFrom: Pos | null; parentTo: Pos | null }>;
}

// Classify a relayout by node id. parentFrom/parentTo on entering/leaving are scope-C groundwork
// (grow-in scales from the parent, shrink-out collapses toward it); slice-2-A ignores them.
export function layoutDiff(
  prev: Map<string, Pos>,
  next: Map<string, Pos>,
  parentOf: (id: string) => string | null,
): LayoutDiff {
  const parentPos = (id: string, m: Map<string, Pos>): Pos | null => {
    const p = parentOf(id);
    return p ? m.get(p) ?? null : null;
  };
  const persisting: LayoutDiff["persisting"] = [];
  const entering: LayoutDiff["entering"] = [];
  const leaving: LayoutDiff["leaving"] = [];

  for (const [id, to] of next) {
    const from = prev.get(id);
    if (from) persisting.push({ id, from, to });
    else entering.push({ id, to, parentFrom: parentPos(id, prev), parentTo: parentPos(id, next) });
  }
  for (const [id, lastPos] of prev) {
    if (!next.has(id)) leaving.push({ id, lastPos, parentFrom: parentPos(id, prev), parentTo: parentPos(id, next) });
  }
  return { persisting, entering, leaving };
}
