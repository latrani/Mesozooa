import { describe, it, expect } from "vitest";
import { dedupeRaws } from "./dedupe";
import type { RawTaxon } from "./types";

const R = (id: string, name: string, parentId: string | null, sitelinks = 0): RawTaxon => ({
  id, name, rankId: null, parentId, sitelinks,
});

describe("dedupeRaws", () => {
  it("keeps the higher-sitelinks node in a case-duplicate pair and drops the other", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("B", "Triceratops", "A", 50),
      R("C", "triceratops", "A", 0),
    ]);
    const ids = out.map((r) => r.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });

  it("tie-breaks equal sitelinks by preferring a capitalized initial", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("low", "stegosaurus", "A", 5),
      R("Cap", "Stegosaurus", "A", 5),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Cap"]);
  });

  it("reparents a survivor whose parent was dropped onto the surviving twin", () => {
    // kept child 'K' under dropped 'cerat'; 'Cerat' is the surviving twin of that name group
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("Cerat", "Ceratopsia", "A", 40),
      R("cerat", "ceratopsia", "A", 0),
      R("K", "Triceratops", "cerat", 50),
    ]);
    const k = out.find((r) => r.id === "K")!;
    expect(k.parentId).toBe("Cerat"); // remapped from dropped 'cerat'
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Cerat", "K"]);
  });

  it("resolves a decided node's name (Carnotaurus) so it dedupes against the lowercase ghost", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("Q18510948", "Carnottaurus", "A", 53),
      R("ghost", "carnotaurus", "A", 0),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Q18510948"]);
    expect(out.find((r) => r.id === "Q18510948")!.name).toBe("Carnotaurus");
  });

  it("handles a 3-member group, keeping only the max", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("x", "Rhinorex", "A", 7),
      R("y", "rhinorex", "A", 3),
      R("z", "RHINOREX", "A", 1),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "x"]);
  });

  it("leaves a unique-name node untouched", () => {
    const out = dedupeRaws([R("A", "Root", null, 10), R("B", "Velociraptor", "A", 20)]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "B"]);
  });
});
