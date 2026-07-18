import { describe, it, expect } from "vitest";
import { parseAge, modalLocation, modalLocality } from "./pbdb-parse";

describe("parseAge", () => {
  it("labels a single interval and reads Ma bounds", () => {
    const a = parseAge({ early_interval: "Maastrichtian", late_interval: "Maastrichtian", firstapp_max_ma: 72.2, lastapp_min_ma: 66 });
    expect(a.ageLabel).toBe("Maastrichtian");
    expect(a.ageStartMa).toBe(72.2);
    expect(a.ageEndMa).toBe(66);
  });
  it("joins distinct early/late intervals", () => {
    expect(parseAge({ early_interval: "Coniacian", late_interval: "Maastrichtian" }).ageLabel).toBe("Coniacian-Maastrichtian");
  });
  it("is empty when no interval is present", () => {
    expect(parseAge({}).ageLabel).toBeUndefined();
  });
});

describe("modalLocation", () => {
  it("returns the most common country as a readable name", () => {
    expect(modalLocation([{ cc: "CA" }, { cc: "CA" }, { cc: "US" }])).toBe("Canada");
  });
  it("falls back to the raw code when unmapped", () => {
    expect(modalLocation([{ cc: "ZZ" }])).toBe("ZZ");
  });
  it("is undefined with no located rows", () => {
    expect(modalLocation([{}, {}])).toBeUndefined();
  });
});

describe("modalLocality", () => {
  it("drills modal country → modal state → modal formation as one coherent locale", () => {
    expect(
      modalLocality([
        { cc: "US", state: "Wyoming", formation: "Morrison" },
        { cc: "US", state: "Wyoming", formation: "Morrison" },
        { cc: "US", state: "Colorado", formation: "Morrison" },
      ]),
    ).toEqual({ country: "United States", state: "Wyoming", formation: "Morrison" });
  });

  it("never Frankensteins layers across countries", () => {
    // Portugal rows must not leak their state/formation into the US-modal locale.
    expect(
      modalLocality([
        { cc: "US", state: "Wyoming", formation: "Morrison" },
        { cc: "US", state: "Wyoming", formation: "Morrison" },
        { cc: "PT", state: "Lisbon", formation: "Lourinhã" },
      ]),
    ).toEqual({ country: "United States", state: "Wyoming", formation: "Morrison" });
  });

  it("picks the formation modal WITHIN the modal state, not across the country", () => {
    expect(
      modalLocality([
        { cc: "US", state: "Wyoming", formation: "Morrison" },
        { cc: "US", state: "Montana", formation: "Hell Creek" },
        { cc: "US", state: "Montana", formation: "Hell Creek" },
      ]),
    ).toEqual({ country: "United States", state: "Montana", formation: "Hell Creek" });
  });

  it("still surfaces a formation when no state is recorded", () => {
    expect(modalLocality([{ cc: "US", formation: "Morrison" }, { cc: "US", formation: "Morrison" }])).toEqual({
      country: "United States",
      formation: "Morrison",
    });
  });

  it("returns an empty locality when nothing is located", () => {
    expect(modalLocality([{}, {}])).toEqual({});
  });
});
