import { describe, it, expect } from "vitest";
import { parseHash, formatHash } from "./route";

describe("parseHash", () => {
  it("reads a bare tab", () => {
    expect(parseHash("#/practice")).toEqual({ tab: "practice" });
  });
  it("defaults empty/absent hash to daily", () => {
    expect(parseHash("")).toEqual({ tab: "daily" });
    expect(parseHash("#/")).toEqual({ tab: "daily" });
    expect(parseHash("#")).toEqual({ tab: "daily" });
  });
  it("falls back to daily for an unknown tab", () => {
    expect(parseHash("#/bogus")).toEqual({ tab: "daily" });
  });
  it("reads a taxon param on explore", () => {
    expect(parseHash("#/explore?taxon=coelophysis")).toEqual({
      tab: "explore",
      taxon: "coelophysis",
    });
  });
  it("decodes a percent-encoded taxon value", () => {
    expect(parseHash("#/explore?taxon=foo%20bar")).toEqual({ tab: "explore", taxon: "foo bar" });
  });
  it("ignores a taxon param on non-explore tabs (daily, practice)", () => {
    expect(parseHash("#/daily?taxon=coelophysis")).toEqual({ tab: "daily" });
    // plain practice is param-free — the target is the answer, never in the URL you play under
    expect(parseHash("#/practice?taxon=stegosaurus")).toEqual({ tab: "practice" });
  });
  it("reads the practice/seed action route with a taxon", () => {
    expect(parseHash("#/practice/seed?taxon=stegosaurus")).toEqual({
      tab: "practice",
      taxon: "stegosaurus",
      seed: true,
    });
  });
  it("decodes a percent-encoded seed taxon", () => {
    expect(parseHash("#/practice/seed?taxon=foo%20bar")).toEqual({
      tab: "practice",
      taxon: "foo bar",
      seed: true,
    });
  });
  it("treats practice/seed with no taxon as a plain practice route", () => {
    expect(parseHash("#/practice/seed")).toEqual({ tab: "practice" });
    expect(parseHash("#/practice/seed?taxon=")).toEqual({ tab: "practice" });
  });
  it("treats an empty taxon value as absent", () => {
    expect(parseHash("#/explore?taxon=")).toEqual({ tab: "explore" });
  });
});

describe("formatHash", () => {
  it("formats a bare tab", () => {
    expect(formatHash("explore")).toBe("#/explore");
  });
  it("appends an encoded taxon on explore", () => {
    expect(formatHash("explore", "coelophysis")).toBe("#/explore?taxon=coelophysis");
    expect(formatHash("explore", "foo bar")).toBe("#/explore?taxon=foo%20bar");
  });
  it("drops the taxon on non-explore tabs", () => {
    expect(formatHash("daily", "coelophysis")).toBe("#/daily");
  });
  it("round-trips with parseHash", () => {
    for (const h of ["#/daily", "#/practice", "#/explore", "#/explore?taxon=coelophysis"]) {
      expect(formatHash(parseHash(h).tab, parseHash(h).taxon)).toBe(h);
    }
  });
});
