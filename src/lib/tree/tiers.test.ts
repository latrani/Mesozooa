import { describe, it, expect } from "vitest";
import { resolveTiers, TIERS } from "./tiers";
import { assembleTree, pruneSubtree } from "./assemble";
import { markPlayable } from "./playable";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";
import type { GenusAttributes } from "../attributes";

// FIXTURE: Q430 > T > TF > {TR, TB}; T > LO; Q430 > O > CF > TC. All four genera have articles,
// so markPlayable flags TR, TB, LO, TC.
function fresh() {
  const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
  markPlayable(tree);
  return tree;
}
const clue = { ageLabel: "Maastrichtian", ageStartMa: 72, ageEndMa: 66, discoveryLocation: "United States" };
// TR and TB clear every Hard gate; TC has no image; LO has no clue.
const attrs: GenusAttributes = { TR: clue, TB: clue, LO: {}, TC: clue };

describe("resolveTiers — ranks", () => {
  it("ranks a resolved EASY name 0 even when it fails every gate", () => {
    const tree = fresh();
    tree.nodes["TC"].playable = false; // not even Medium
    const t = resolveTiers(tree, { TC: {} }, ["Triceratops"]); // no clue, no image
    expect(t.rankOf("TC")).toBe(0);
    expect(t.pool("easy")).toContain("TC");
  });

  it("ranks a playable genus 1", () => {
    const t = resolveTiers(fresh(), attrs, []);
    expect(t.rankOf("TR")).toBe(1);
  });

  it("ranks a hard-eligible non-playable genus 2", () => {
    const tree = fresh();
    tree.nodes["TR"].playable = false;
    const t = resolveTiers(tree, attrs, []);
    expect(t.rankOf("TR")).toBe(2);
  });

  it("leaves a genus that fails every tier unranked", () => {
    const tree = fresh();
    tree.nodes["LO"].playable = false; // LO has no clue in `attrs`, so it fails Hard too
    const t = resolveTiers(tree, attrs, []);
    expect(t.rankOf("LO")).toBeUndefined();
    expect(t.pool("hard")).not.toContain("LO");
  });

  it("never ranks a clade", () => {
    const t = resolveTiers(fresh(), attrs, []);
    expect(t.rankOf("TF")).toBeUndefined();
  });
});

describe("resolveTiers — nesting is structural", () => {
  it("keeps easy subset-of medium subset-of hard", () => {
    const tree = fresh();
    tree.nodes["TC"].playable = false; // Easy pin must drag it into Medium and Hard anyway
    const t = resolveTiers(tree, attrs, ["Triceratops"]);
    const easy = new Set(t.pool("easy"));
    const medium = new Set(t.pool("medium"));
    const hard = new Set(t.pool("hard"));
    for (const id of easy) expect(medium.has(id)).toBe(true);
    for (const id of medium) expect(hard.has(id)).toBe(true);
    expect(medium.has("TC")).toBe(true);
  });

  it("orders the pools by size", () => {
    const t = resolveTiers(fresh(), attrs, ["Tyrannosaurus"]);
    expect(t.pool("easy").length).toBeLessThanOrEqual(t.pool("medium").length);
    expect(t.pool("medium").length).toBeLessThanOrEqual(t.pool("hard").length);
  });

  it("exposes the tiers in ascending order", () => {
    expect([...TIERS]).toEqual(["easy", "medium", "hard"]);
  });
});

describe("resolveTiers — name resolution", () => {
  it("reports an unresolvable EASY name instead of throwing", () => {
    const t = resolveTiers(fresh(), attrs, ["Tyrannosaurus", "Notadinosaur"]);
    expect(t.unresolved).toEqual(["Notadinosaur"]);
    expect(t.pool("easy")).toEqual(["TR"]);
  });

  it("does not resolve a NAME that belongs to a clade rather than a genus", () => {
    const t = resolveTiers(fresh(), attrs, ["Tyrannosauridae"]);
    expect(t.unresolved).toEqual(["Tyrannosauridae"]);
  });
});
