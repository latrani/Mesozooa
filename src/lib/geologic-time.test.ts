import { describe, it, expect } from "vitest";
import { epochForStage, stageAtMa, enrichAge, isMesozoic } from "./geologic-time";

describe("epochForStage", () => {
  it("maps a Cretaceous stage to its epoch", () => {
    expect(epochForStage("Maastrichtian")).toBe("Late Cretaceous");
  });
  it("maps a Jurassic stage to its epoch", () => {
    expect(epochForStage("Tithonian")).toBe("Late Jurassic");
  });
  it("covers Cenozoic straggler stages", () => {
    expect(epochForStage("Danian")).toBe("Paleocene");
  });
  it("returns undefined for an unknown token", () => {
    expect(epochForStage("Sasquatchian")).toBeUndefined();
  });
});

describe("stageAtMa", () => {
  it("resolves the coarse Morrison start to Oxfordian / Late Jurassic", () => {
    expect(stageAtMa(157.9)).toEqual({ stage: "Oxfordian", epoch: "Late Jurassic" });
  });
  it("resolves a latest-Cretaceous age to Maastrichtian", () => {
    expect(stageAtMa(68)).toEqual({ stage: "Maastrichtian", epoch: "Late Cretaceous" });
  });
});

describe("enrichAge", () => {
  it("adds an epoch to an existing single-stage label, leaving the label untouched", () => {
    expect(enrichAge({ ageLabel: "Maastrichtian", ageStartMa: 72.1, ageEndMa: 66 })).toEqual({
      ageLabel: "Maastrichtian",
      ageEpoch: "Late Cretaceous",
      ageStartMa: 72.1,
      ageEndMa: 66,
    });
  });

  it("spans two epochs for a cross-epoch range label", () => {
    expect(enrichAge({ ageLabel: "Tithonian-Barremian", ageStartMa: 149.2, ageEndMa: 121.4 })).toEqual({
      ageLabel: "Tithonian-Barremian",
      ageEpoch: "Late Jurassic–Early Cretaceous",
      ageStartMa: 149.2,
      ageEndMa: 121.4,
    });
  });

  it("does not duplicate the epoch when a range stays inside one epoch", () => {
    expect(enrichAge({ ageLabel: "Campanian-Maastrichtian", ageStartMa: 83.6, ageEndMa: 66 })?.ageEpoch).toBe(
      "Late Cretaceous",
    );
  });

  it("derives a stage label AND epoch from Ma alone (the rescued genera)", () => {
    expect(enrichAge({ ageStartMa: 157.9, ageEndMa: 143.1 })).toEqual({
      ageLabel: "Oxfordian-Tithonian",
      ageEpoch: "Late Jurassic",
      ageStartMa: 157.9,
      ageEndMa: 143.1,
    });
  });

  it("derives a single-stage label when Ma-only collapses to one stage", () => {
    expect(enrichAge({ ageStartMa: 71, ageEndMa: 67 })).toEqual({
      ageLabel: "Maastrichtian",
      ageEpoch: "Late Cretaceous",
      ageStartMa: 71,
      ageEndMa: 67,
    });
  });

  it("returns undefined when there is neither a label nor Ma numbers", () => {
    expect(enrichAge({})).toBeUndefined();
  });
});

describe("isMesozoic", () => {
  it("keeps a genus whose whole range predates the K–Pg boundary", () => {
    expect(isMesozoic({ ageStartMa: 72.2, ageEndMa: 66 })).toBe(true);
  });
  it("rejects a genus that first appears after the boundary", () => {
    expect(isMesozoic({ ageStartMa: 56, ageEndMa: 48.07 })).toBe(false); // Psittacopes
  });
  it("keeps a boundary-straddler — it did live in the Mesozoic", () => {
    expect(isMesozoic({ ageStartMa: 68, ageEndMa: 60 })).toBe(true);
  });
  it("treats an origin exactly at the boundary as Mesozoic", () => {
    expect(isMesozoic({ ageStartMa: 66, ageEndMa: 60 })).toBe(true);
  });
  it("keeps an undated genus — absence of a date is not evidence of a Cenozoic one", () => {
    expect(isMesozoic({})).toBe(true);
  });
});
