import { describe, it, expect } from "vitest";
import { pluralGenera } from "./plural";

describe("pluralGenera", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralGenera(1)).toBe("1 genus");
  });
  it("uses the plural for zero and many", () => {
    expect(pluralGenera(0)).toBe("0 genera");
    expect(pluralGenera(2)).toBe("2 genera");
    expect(pluralGenera(674)).toBe("674 genera");
  });
});
