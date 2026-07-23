import type { TreeStore } from "./treeStore";

export interface SpineNode {
  id: string;
  x: number;
  y: number;
  depth: number;
  onSpine: boolean;
}
export interface SpineEdge {
  parentId: string;
  childId: string;
  onSpine: boolean;
}
export interface SpineLayout {
  nodes: SpineNode[];
  edges: SpineEdge[];
  width: number;
  minY: number;
  maxY: number;
}

const EMPTY: SpineLayout = { nodes: [], edges: [], width: 0, minY: 0, maxY: 0 };

// A leaf-packed off-spine subtree: nodes carry a LOCAL y in [0, height]; caller translates.
interface PackedNode { id: string; depth: number; y: number }
interface Packed { nodes: PackedNode[]; edges: SpineEdge[]; height: number; rootY: number }

export function layoutSpine(
  store: TreeStore,
  revealed: Set<string>,
  warmestId: string | null,
): SpineLayout {
  const rootId = store.data.rootId;
  if (!warmestId || !revealed.has(rootId) || !revealed.has(warmestId)) return EMPTY;

  const spine = store.pathToRoot(warmestId).slice().reverse(); // root..warmest (the hero lineage)
  // Nodes root..warmest are the HERO spine (thick, warmth-colored). Anything the extension below
  // appends is a straightened monotypic continuation: it stays geometrically on the axis but is
  // emitted onSpine:false so it renders as an ordinary branch (thin edge, context dot).
  const heroLen = spine.length;

  const revealedChildren = (id: string) =>
    store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

  // Extend the spine through monotypic frontier continuation: while the tip is STRUCTURALLY
  // monotypic (exactly one child in the tree) and that child is revealed, absorb it onto the
  // spine so a non-branch descent lays straight instead of splaying as a phantom fork. Using the
  // tree's arity (not the revealed-child count) is deliberate: a branching node with only one
  // child currently revealed (e.g. Tyrannosauridae showing only Tyrannosaurus) must still splay.
  for (;;) {
    const tip = spine[spine.length - 1];
    const kids = store.children(tip);
    if (kids.length !== 1) break;
    const only = kids[0].id;
    if (!revealed.has(only) || spine.includes(only)) break;
    spine.push(only);
  }

  // Leaf-pack a subtree rooted at `id` (off the spine). Local y in [0, height].
  function pack(id: string, depth: number): Packed {
    const kids = revealedChildren(id);
    if (kids.length === 0) {
      return { nodes: [{ id, depth, y: 0 }], edges: [], height: 0, rootY: 0 };
    }
    const nodes: PackedNode[] = [];
    const edges: SpineEdge[] = [];
    const childRootYs: number[] = [];
    let cursor = 0;
    for (const k of kids) {
      const sub = pack(k.id, depth + 1);
      for (const n of sub.nodes) nodes.push({ ...n, y: n.y + cursor });
      for (const e of sub.edges) edges.push(e);
      edges.push({ parentId: id, childId: k.id, onSpine: false });
      childRootYs.push(sub.rootY + cursor);
      cursor += sub.height + 1;
    }
    const rootY = (childRootYs[0] + childRootYs[childRootYs.length - 1]) / 2;
    nodes.push({ id, depth, y: rootY });
    return { nodes, edges, height: cursor - 1, rootY };
  }

  const nodes: SpineNode[] = [];
  const edges: SpineEdge[] = [];
  let minY = 0;
  let maxY = 0;

  // First pass: emit the straight spine and collect every off-spine block, tagged with the
  // spine node it hangs from (attachDepth) AND its child NAME, so the A-Z split can decide
  // which side of the axis it lands on.
  interface OffBlock { attachDepth: number; parentId: string; childId: string; childName: string; packed: Packed }
  const offBlocks: OffBlock[] = [];

  spine.forEach((id, depth) => {
    // Hero nodes (root..warmest) render as the spine; the straightened continuation past the
    // warmest node stays on the axis (y:0) but renders as a normal branch.
    const isHero = depth < heroLen;
    nodes.push({ id, x: depth, y: 0, depth, onSpine: isHero });
    // The edge into this node is hero only when this node is (the warmest→continuation edge is
    // a branch, so it renders thin).
    if (depth > 0) edges.push({ parentId: spine[depth - 1], childId: id, onSpine: isHero });

    const nextSpine = spine[depth + 1];
    for (const child of revealedChildren(id)) {
      if (child.id === nextSpine) continue; // stay on the spine
      offBlocks.push({ attachDepth: depth, parentId: id, childId: child.id, childName: child.name, packed: pack(child.id, depth + 1) });
    }
  });

  // Side assignment by A-Z split around the on-spine child. Each spine node's on-spine child
  // (the next spine node) is the anchor: off-spine children whose NAME sorts before it land
  // ABOVE the axis (y<0), those after land BELOW (y>0). This is stable under re-selection —
  // switching which child is on-spine only moves the anchor, never the relative A-Z order of
  // the fan. Within a side, blocks are ordered axis-inward = alphabetically nearest the anchor
  // (above read outward as names DESCEND from the anchor; below as they ASCEND).
  //
  // A FRONTIER spine node (the tip, no on-spine child) has no anchor, so its A-Z-sorted fan is
  // split at the midpoint to CENTER the fan on the axis — but NOTHING is pinned to the axis
  // itself: the axis (y=0) is reserved for the spine and structural-monotypic continuations only.
  // So a lone revealed child of a branch point SPLAYS off-axis (e.g. in the game, a single wrong
  // guess's lineage must not run straight down the spine — the spine means "warm/correct"). The
  // "more is hidden" cue is the expandable stub, not a straight-through.
  interface Sided { above: OffBlock[]; below: OffBlock[]; attachDepth: number }
  const sided: Sided[] = [];

  const byAttach = new Map<number, OffBlock[]>();
  for (const b of offBlocks) {
    if (!byAttach.has(b.attachDepth)) byAttach.set(b.attachDepth, []);
    byAttach.get(b.attachDepth)!.push(b);
  }
  for (const [attachDepth, blocks] of byAttach) {
    blocks.sort((a, b) => a.childName.localeCompare(b.childName)); // A-Z
    const nextSpine = spine[attachDepth + 1];
    const onName = nextSpine ? store.getNode(nextSpine)?.name ?? null : null;
    if (onName !== null) {
      const above = blocks.filter((b) => b.childName.localeCompare(onName) < 0);
      const below = blocks.filter((b) => b.childName.localeCompare(onName) >= 0);
      sided.push({ above, below, attachDepth });
    } else {
      // No anchor: split A-Z at the midpoint so the fan is balanced around the axis, but with no
      // straddle block — a lone child (n=1) goes entirely above (ceil(1/2)=1) and splays (never y=0).
      const half = Math.ceil(blocks.length / 2);
      sided.push({ above: blocks.slice(0, half), below: blocks.slice(half), attachDepth });
    }
  }

  // Per-side vertical stacking. Each block reserves its OWN vertical band — the whole block is
  // pushed outward past everything already placed on that side, so no two off-spine nodes ever
  // share a row (even at different depths / x-columns). This is what makes the fan read as a clean
  // top-to-bottom list: a deeper fan doesn't slot into the same rows as a shallower sibling. It's
  // taller than per-column packing, deliberately — legibility over compactness. A single scalar
  // cursor per side tracks the furthest-out band edge consumed so far.
  //
  // Order (deterministic, selection-independent): deepest-attached spine node first, so its fan
  // sits INNERMOST (nearest the axis); within a side, axis-inward = alphabetically nearest the
  // anchor (above read outward as names DESCEND from the anchor; below as they ASCEND).
  let aboveCursor = 0; // distance already consumed above the axis (>=0)
  let belowCursor = 0;

  const placeBlock = (b: OffBlock, sign: 1 | -1) => {
    edges.push({ parentId: b.parentId, childId: b.childId, onSpine: false });
    edges.push(...b.packed.edges);
    const cursor = sign < 0 ? aboveCursor : belowCursor;
    const base = cursor + 1; // ≥1 gap from the axis / previous band
    for (const n of b.packed.nodes) {
      const y = sign * (base + n.y);
      nodes.push({ id: n.id, x: n.depth, y, depth: n.depth, onSpine: false });
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const consumed = base + b.packed.height; // this band now occupies [base, base+height]
    if (sign < 0) aboveCursor = consumed;
    else belowCursor = consumed;
  };

  // Deepest-attached spine node first, so its fan sits innermost on each side.
  const deepestFirst = sided.slice().sort((a, b) => b.attachDepth - a.attachDepth);

  // Above: axis-inward is alphabetically nearest the anchor, i.e. names DESCENDING -> reverse A-Z.
  for (const s of deepestFirst) {
    for (const b of s.above.slice().reverse()) placeBlock(b, -1);
  }
  // Below: axis-inward is alphabetically nearest the anchor, i.e. names ASCENDING -> A-Z order.
  for (const s of deepestFirst) {
    for (const b of s.below) placeBlock(b, 1);
  }

  const width = nodes.reduce((mx, n) => Math.max(mx, n.depth), 0);
  return { nodes, edges, width, minY, maxY };
}

// The square-cladogram elbow path from parent pixel-point `p` to child pixel-point `c`: a vertical
// riser at the parent's x, a rounded quadratic corner, then a horizontal arm to the child. A
// same-row child (dy===0) has no riser, so it draws the straight arm. Ported verbatim from the
// inline `edgePath` in SpineTree.svelte, taking resolved pixel points instead of ids+px/py.
export function edgePathBetween(
  p: { x: number; y: number },
  c: { x: number; y: number },
  cornerRadius: number,
): string {
  const x0 = p.x, y0 = p.y;
  const cx = p.x, cy = c.y; // the elbow corner
  const x1 = c.x;
  const dy = cy - y0; // riser direction: +down / -up (0 when child shares the parent's row)
  // A same-row child has no riser, so no corner to round — draw the straight arm.
  if (dy === 0) return `M ${x0} ${y0} H ${x1}`;
  // Round the elbow with a quadratic whose control point is the sharp corner; clamp the radius
  // to half of each leg so short segments don't over-round or overshoot.
  const dirY = Math.sign(dy);
  const r = Math.min(cornerRadius, Math.abs(dy) / 2, (x1 - cx) / 2);
  return `M ${x0} ${y0} V ${cy - r * dirY} Q ${cx} ${cy} ${cx + r} ${cy} H ${x1}`;
}

export interface ViewMetrics {
  xGap: number;
  pad: number;
  contentWidth: number;
  viewportWidth: number;
  /** px of the viewport's right edge hidden behind an overlay (the specimen). Centering
      targets the visible window LEFT of it; scroll clamp still uses the full viewport. */
  rightInset?: number;
}

export function centerOffsetFor(depth: number, m: ViewMetrics): number {
  const nodePx = m.pad + depth * m.xGap;
  const window = m.viewportWidth - (m.rightInset ?? 0);
  const raw = nodePx - window / 2;
  const max = Math.max(0, m.contentWidth - m.viewportWidth);
  return Math.min(Math.max(0, raw), max);
}

/**
 * A "step-back" move: the new tip is a PROPER ancestor of the old tip (navigating shallower in the
 * same lineage). `pathToRoot(id)` includes `id` itself, so the `newTip !== oldTip` guard is required
 * — without it, a same-node no-op would report as a step-back. Returns false on first mount
 * (oldTip null) and for forward/lateral moves.
 */
export function isStepBack(store: TreeStore, oldTip: string | null, newTip: string): boolean {
  if (!oldTip || oldTip === newTip) return false;
  return store.pathToRoot(oldTip).includes(newTip);
}
