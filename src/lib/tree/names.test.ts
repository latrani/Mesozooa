import { describe, it, expect } from "vitest";
import { nameCandidates, resolveName, findConflicts, findDecisionCollisions } from "./names";
import type { RawTaxon } from "./types";

const raw = (over: Partial<RawTaxon> & { id: string }): RawTaxon => ({
  name: over.id, rankId: null, parentId: null, ...over,
});

describe("nameCandidates", () => {
  it("excludes the Q-id placeholder (name === id) as a non-candidate", () => {
    // Troodon: no en label (name===id), P225 present
    expect(nameCandidates(raw({ id: "Q131043", taxonName: "Troodon", enwikiTitle: "Troodon" })))
      .toEqual(["Troodon"]);
  });
  it("collapses identical candidates to one", () => {
    expect(nameCandidates(raw({ id: "Q1", name: "Allosaurus", taxonName: "Allosaurus", enwikiTitle: "Allosaurus" })))
      .toEqual(["Allosaurus"]);
  });
  it("keeps distinct candidates in en/P225/enwiki priority order", () => {
    expect(nameCandidates(raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus", enwikiTitle: "Carnotaurus" })))
      .toEqual(["Carnottaurus", "Carnotaurus"]);
  });
  it("treats trimmed-equal as identical but case/space differences as distinct", () => {
    expect(nameCandidates(raw({ id: "Q2", name: "Drinker", taxonName: "Drinker nisti" })))
      .toEqual(["Drinker", "Drinker nisti"]);
    expect(nameCandidates(raw({ id: "Q3", name: "bird", enwikiTitle: "Bird", taxonName: "Aves" })))
      .toEqual(["bird", "Bird", "Aves"]);
  });
});

describe("resolveName", () => {
  it("uses a decision when present", () => {
    expect(resolveName(raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus" }),
      { Q18510948: { name: "Carnotaurus" } })).toBe("Carnotaurus");
  });
  it("uses the sole candidate when unambiguous (Troodon)", () => {
    expect(resolveName(raw({ id: "Q131043", taxonName: "Troodon" }), {})).toBe("Troodon");
  });
  it("falls back to the placeholder when there are no candidates", () => {
    expect(resolveName(raw({ id: "Q999" }), {})).toBe("Q999");
  });
});

describe("findConflicts", () => {
  it("flags ≥2-distinct-candidate nodes with no decision, sorted by id", () => {
    const raws = [
      raw({ id: "Q5", name: "Iguanodontia", taxonName: "Iguaonodontia" }),
      raw({ id: "Q1", name: "Allosaurus", taxonName: "Allosaurus" }), // agree -> no conflict
      raw({ id: "Q131043", taxonName: "Troodon" }),                    // 1 candidate -> no conflict
      raw({ id: "Q3", name: "bird", enwikiTitle: "Bird", taxonName: "Aves", redirectTarget: "Bird" }),
    ];
    const conflicts = findConflicts(raws, {});
    expect(conflicts.map((c) => c.id)).toEqual(["Q3", "Q5"]);
    expect(conflicts[0]).toMatchObject({ id: "Q3", en: "bird", taxonName: "Aves", redirectTarget: "Bird" });
  });
  it("does not flag a conflict that has a decision", () => {
    const raws = [raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus" })];
    expect(findConflicts(raws, { Q18510948: { name: "Carnotaurus" } })).toEqual([]);
  });
});

describe("findDecisionCollisions", () => {
  it("flags a decision that picks an enwiki-only name colliding with a distinct node", () => {
    // The caught draft: Q132824's en+P225 both say "Hesperornithiformes"; renaming it to its
    // enwiki candidate "Hesperornithes" collides with the real, DISTINCT Hesperornithes node and
    // collapses a clade rung via dedupe. The enwiki candidate must NOT clear the guard.
    const raws = [
      raw({ id: "Q132824", name: "Hesperornithiformes", taxonName: "Hesperornithiformes", enwikiTitle: "Hesperornithes" }),
      raw({ id: "Q21446301", name: "Hesperornithes", taxonName: "Hesperornithes" }),
    ];
    expect(findDecisionCollisions(raws, { Q132824: { name: "Hesperornithes" } })).toEqual([
      { id: "Q132824", name: "Hesperornithes", mergesInto: ["Q21446301"] },
    ]);
  });

  it("does NOT flag a lowercase Wikidata twin capped to merge into the real node (intended)", () => {
    // The real pattern (13 of the current decisions): a lowercase P225 ghost (Q124775780
    // "psittacosaurus") is decided UP to "Psittacosaurus" so dedupe merges it into the real,
    // already-capitalized node (Q132672). The decision only re-cases the node's OWN name, so it
    // must not be flagged even though the resolved names then match exactly.
    const raws = [
      raw({ id: "Q132672", name: "Psittacosaurus", taxonName: "Psittacosaurus" }),
      raw({ id: "Q124775780", name: "psittacosaurus", taxonName: "psittacosaurus" }),
    ];
    expect(findDecisionCollisions(raws, { Q124775780: { name: "Psittacosaurus" } })).toEqual([]);
  });

  it("returns [] when a decision's name is unique among nodes", () => {
    const raws = [
      raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus" }),
      raw({ id: "Q1", name: "Allosaurus", taxonName: "Allosaurus" }),
    ];
    expect(findDecisionCollisions(raws, { Q18510948: { name: "Carnotaurus" } })).toEqual([]);
  });

  it("flags two decisions that resolve to the same name (mutual merge)", () => {
    const raws = [
      raw({ id: "Q10", name: "Aname", taxonName: "Aname" }),
      raw({ id: "Q20", name: "Bname", taxonName: "Bname" }),
    ];
    const collisions = findDecisionCollisions(raws, {
      Q10: { name: "Samename" },
      Q20: { name: "Samename" },
    });
    expect(collisions).toEqual([
      { id: "Q10", name: "Samename", mergesInto: ["Q20"] },
      { id: "Q20", name: "Samename", mergesInto: ["Q10"] },
    ]);
  });
});
