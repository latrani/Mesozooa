import { describe, it, expect } from "vitest";
import { createSearch } from "./search";

// ASCII-only dataset for ordering assertions (avoids locale-dependent accent collation).
const search = createSearch([
  { id: "1", name: "Tyrannosaurus" },
  { id: "2", name: "Tarbosaurus" },
  { id: "3", name: "Triceratops" },
  { id: "4", name: "Allosaurus" },
]);
// Separate single-entry store for the diacritic check (no sort to depend on).
const diacritic = createSearch([{ id: "5", name: "Écrasaurus" }]);

describe("createSearch", () => {
  it("returns [] for empty/whitespace query", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });
  it("orders substring matches alphabetically", () => {
    // 'saurus' is a substring of these three (not Triceratops); none start with it.
    const names = search("saurus").map((r) => r.name);
    expect(names).toEqual(["Allosaurus", "Tarbosaurus", "Tyrannosaurus"]);
  });
  it("ranks prefix matches before substring matches", () => {
    const names = search("t").map((r) => r.name);
    // prefix tier (alphabetical): Tarbosaurus, Triceratops, Tyrannosaurus. Allosaurus has no 't'.
    expect(names).toEqual(["Tarbosaurus", "Triceratops", "Tyrannosaurus"]);
  });
  it("is case- and diacritic-insensitive", () => {
    expect(diacritic("ecra").map((r) => r.name)).toEqual(["Écrasaurus"]);
    expect(diacritic("ECRA").map((r) => r.name)).toEqual(["Écrasaurus"]);
  });
  it("respects the limit", () => {
    expect(search("saurus", 2)).toHaveLength(2);
  });
});
