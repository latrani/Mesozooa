import { describe, it, expect } from "vitest";
import { enwikiTitleFromUrl } from "./enwiki-title";

describe("enwikiTitleFromUrl", () => {
  it("extracts and decodes the article title", () => {
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Tyrannosaurus")).toBe("Tyrannosaurus");
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Drinker_nisti")).toBe("Drinker nisti");
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Foo%20bar")).toBe("Foo bar");
  });
  it("returns undefined for missing/non-article urls", () => {
    expect(enwikiTitleFromUrl(undefined)).toBeUndefined();
    expect(enwikiTitleFromUrl("")).toBeUndefined();
  });
});
