import { describe, it, expect } from "vitest";
import { EASY_SET } from "./easy-set";
import { tiers, tierStores } from "../game/treeData";
import { createLens } from "./lens";
import treeJson from "../../data/tree.json";
import attrsJson from "../../data/genus-attributes.json";
import type { TreeData } from "./types";
import type { GenusAttributes, GenusAttribute } from "../attributes";

const tree = treeJson as unknown as TreeData;
const attrs = attrsJson as GenusAttributes;

/**
 * Runs against the REAL committed data, not a fixture. This is what replaces the build-time
 * curation report: a typo in EASY_SET, or a Wikidata refresh that maroons a member, fails
 * `npm test` rather than printing a warning nobody reads.
 */
describe("EASY_SET resolves", () => {
  it("is exactly 100 distinct names", () => {
    expect(EASY_SET.length).toBe(100);
    expect(new Set(EASY_SET).size).toBe(100);
  });

  it("resolves every name to a genus in the committed tree", () => {
    expect(tiers.unresolved).toEqual([]);
  });

  it("produces the pool sizes the design spec commits to", () => {
    expect(tierStores.easy.playableGenera().length).toBe(100);
    expect(tierStores.medium.playableGenera().length).toBe(734);
    expect(tierStores.hard.playableGenera().length).toBe(1170);
  });
});

// The displayed clue, as a comparable key: the coarse lead plus the finer layer the placard
// renders beneath it. Two genera sharing this are indistinguishable to a player at the anchor.
function clueKey(a: GenusAttribute | undefined): string {
  if (!a) return "?";
  return [a.ageEpoch ?? a.ageLabel, a.ageLabel, a.discoveryLocation, a.discoveryState, a.discoveryFormation]
    .map((x) => x ?? "")
    .join("|");
}

describe("EASY_SET curation gate", () => {
  const pool = tiers.pool("easy");
  const lens = createLens(tree, pool);
  const descendants = (anc: string) =>
    pool.filter((id) => {
      let c: string | null = id;
      while (c) { if (c === anc) return true; c = tree.nodes[c].parentId; }
      return false;
    });

  const rows = pool.map((id) => {
    const terminal = lens.terminalClade(id);
    const siblings = descendants(terminal);
    return {
      name: tree.nodes[id].name,
      size: lens.poolCount(terminal),
      survivors: siblings.filter((s) => clueKey(attrs[s]) === clueKey(attrs[id])).length,
    };
  });

  it("leaves no member both marooned AND clue-ambiguous", () => {
    // The PAIR is the test, not either half. A big terminal clade is survivable when the clue
    // singles you out (Dilophosaurus, 48 members, unique clue); a shared clue is survivable in a
    // small clade (you can brute-force it). Both together is an unfindable target.
    const stuck = rows.filter((r) => r.size > 10 && r.survivors > 1);
    expect(stuck.map((r) => `${r.name} (clade ${r.size}, ${r.survivors} share its clue)`)).toEqual([]);
  });

  it("keeps every clue-ambiguous member inside a brute-forceable clade", () => {
    // The other half of the gate. Sharing a clue is fine as long as the neighbourhood is small
    // enough to just guess through — today the five that share one sit in clades of 3 to 8.
    const ambiguous = rows.filter((r) => r.survivors > 1);
    expect(ambiguous.every((r) => r.size <= 10)).toBe(true);
  });

  it("keeps the badly marooned to the one knowingly accepted", () => {
    // 11 members sit above the size threshold, all clue-unique. Only Dilophosaurus is extreme,
    // and only because Wikidata hangs it straight off Neotheropoda with no family in between.
    expect(rows.filter((r) => r.size > 20).map((r) => r.name)).toEqual(["Dilophosaurus"]);
  });

  it("keeps almost every member uniquely identified by its clue", () => {
    expect(rows.filter((r) => r.survivors === 1).length).toBeGreaterThanOrEqual(95);
  });

  it("puts most members in a tight neighbourhood", () => {
    expect(rows.filter((r) => r.size <= 3).length).toBeGreaterThanOrEqual(60);
  });
});
