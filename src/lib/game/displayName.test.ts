import { describe, it, expect } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("title-cases the known lowercase root label", () => {
    expect(displayName("dinosaur")).toBe("Dinosauria");
  });

  it("leaves proper taxon names untouched", () => {
    expect(displayName("Tyrannosaurus")).toBe("Tyrannosaurus");
  });
});
