/**
 * Reports what switching the game rulers from true-tree to pool-relative does to the SHIPPING
 * pool. Not a build step — a characterization report, so the change lands as a recorded number
 * rather than a playtest surprise. See docs/superpowers/plans/2026-08-30-difficulty-tier-lens.md.
 *
 *   npx tsx scripts/lens-impact.ts
 */
import treeJson from "../src/data/tree.json";
import type { TreeData } from "../src/lib/tree/types";
import { createLens } from "../src/lib/tree/lens";
import { terminalClade } from "../src/lib/tree/terminal";
import { playableGenera } from "../src/lib/tree/playable";

const tree = treeJson as unknown as TreeData;
const pool = playableGenera(tree);
const lens = createLens(tree, pool.map((n) => n.id));

let movedTerminal = 0;
let movedRootward = 0;
let degenerate = 0;
const deltas: number[] = [];

for (const g of pool) {
  const trueTerminal = terminalClade(tree, g.id);
  const lensTerminal = lens.terminalClade(g.id);
  if (trueTerminal !== lensTerminal) {
    movedTerminal++;
    if (tree.nodes[trueTerminal].depth > tree.nodes[lensTerminal].depth) movedRootward++;
  }
  if (lens.branchDepth(lensTerminal) <= 1) degenerate++;
  const delta = lens.branchDepth(lensTerminal) - tree.nodes[trueTerminal].branchDepth;
  if (delta !== 0) deltas.push(delta);
}

deltas.sort((a, b) => a - b);
console.log(`pool size:                       ${pool.length}`);
console.log(`terminal clade moved:            ${movedTerminal} (${((100 * movedTerminal) / pool.length).toFixed(0)}%), rootward: ${movedRootward}`);
console.log(`warmth denominator changed:      ${deltas.length} (${((100 * deltas.length) / pool.length).toFixed(0)}%)`);
if (deltas.length) {
  console.log(`  delta range:                   ${deltas[0]} .. ${deltas[deltas.length - 1]} (median ${deltas[deltas.length >> 1]})`);
}
console.log(`degenerate lens terminal clade:  ${degenerate}`);
