import { describe, it, expect } from "vitest";
import { sanitizeArtist, formatCredit } from "./image-credits";

describe("sanitizeArtist", () => {
  it("strips an anchor tag to its text", () => {
    const html = '<a href="//commons.wikimedia.org/wiki/User:Ferahgo" title="User:Ferahgo">Emily Willoughby</a>';
    expect(sanitizeArtist(html)).toBe("Emily Willoughby");
  });
  it("strips nested spans and collapses whitespace", () => {
    expect(sanitizeArtist('<span class="x">  Jane   Paleo </span>')).toBe("Jane Paleo");
  });
  it("decodes common HTML entities", () => {
    expect(sanitizeArtist("Muse&#039;um &amp; Co")).toBe("Muse'um & Co");
  });
  it("returns undefined for empty or tag-only input", () => {
    expect(sanitizeArtist("")).toBeUndefined();
    expect(sanitizeArtist("<span></span>")).toBeUndefined();
    expect(sanitizeArtist(undefined)).toBeUndefined();
  });
});

describe("formatCredit", () => {
  it("returns author + linked license when both present", () => {
    expect(formatCredit({ author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://cc/by-sa/4.0" }))
      .toEqual({ author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://cc/by-sa/4.0" });
  });
  it("keeps license unlinked when url is missing", () => {
    expect(formatCredit({ author: "Jane Paleo", licenseShort: "PD" }))
      .toEqual({ author: "Jane Paleo", licenseShort: "PD", licenseUrl: null });
  });
  it("nulls author when absent (license only)", () => {
    expect(formatCredit({ licenseShort: "CC BY 4.0", licenseUrl: "https://cc/by/4.0" }))
      .toEqual({ author: null, licenseShort: "CC BY 4.0", licenseUrl: "https://cc/by/4.0" });
  });
  it("nulls everything for bare or undefined input", () => {
    expect(formatCredit({})).toEqual({ author: null, licenseShort: null, licenseUrl: null });
    expect(formatCredit(undefined)).toEqual({ author: null, licenseShort: null, licenseUrl: null });
  });
});
