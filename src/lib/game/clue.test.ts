import { describe, it, expect } from "vitest";
import { clueFor, formatClueAge, formatClueLocation } from "./clue";

describe("clueFor", () => {
  it("returns the attributes for a genus that has them", () => {
    // Q100196 is present in the committed genus-attributes.json.
    const clue = clueFor("Q100196");
    expect(clue).not.toBeNull();
    expect(clue!.discoveryLocation).toBe("Germany");
    expect(clue!.ageLabel).toBe("Tithonian-Barremian");
  });
  it("returns null for an unknown id", () => {
    expect(clueFor("not-a-real-id")).toBeNull();
  });
});

describe("formatClueAge", () => {
  it("leads with the epoch and parenthesises stage + integer-rounded Ma", () => {
    expect(
      formatClueAge({ ageEpoch: "Late Cretaceous", ageLabel: "Campanian-Maastrichtian", ageStartMa: 83.6, ageEndMa: 66 }),
    ).toEqual({ lead: "Late Cretaceous", detail: "(Campanian-Maastrichtian, 84–66 mya)" });
  });

  it("collapses to a single mya value when the rounded bounds match", () => {
    expect(formatClueAge({ ageEpoch: "Late Cretaceous", ageLabel: "Maastrichtian", ageStartMa: 66.2, ageEndMa: 66 })).toEqual({
      lead: "Late Cretaceous",
      detail: "(Maastrichtian, 66 mya)",
    });
  });

  it("falls back to the stage label as the lead when no epoch, not repeating it", () => {
    expect(formatClueAge({ ageLabel: "Norian", ageStartMa: 227, ageEndMa: 208 })).toEqual({
      lead: "Norian",
      detail: "(227–208 mya)",
    });
  });

  it("returns null when there is no age at all", () => {
    expect(formatClueAge({ discoveryLocation: "United States" })).toBeNull();
  });
});

describe("formatClueLocation", () => {
  it("leads with the country and parenthesises state + formation (with 'Formation' appended)", () => {
    expect(
      formatClueLocation({ discoveryLocation: "United States", discoveryState: "Wyoming", discoveryFormation: "Morrison" }),
    ).toEqual({ lead: "United States", detail: "(Wyoming, Morrison Formation)" });
  });

  it("drops the missing state layer", () => {
    expect(formatClueLocation({ discoveryLocation: "United States", discoveryFormation: "Morrison" })).toEqual({
      lead: "United States",
      detail: "(Morrison Formation)",
    });
  });

  it("shows state alone when there is no formation", () => {
    expect(formatClueLocation({ discoveryLocation: "Mongolia", discoveryState: "Omnogov" })).toEqual({
      lead: "Mongolia",
      detail: "(Omnogov)",
    });
  });

  it("does not double a formation name that already carries a stratigraphic suffix", () => {
    expect(formatClueLocation({ discoveryLocation: "United Kingdom", discoveryFormation: "Weald Clay Formation" })?.detail).toBe(
      "(Weald Clay Formation)",
    );
    expect(formatClueLocation({ discoveryLocation: "Tanzania", discoveryFormation: "Tendaguru Group" })?.detail).toBe(
      "(Tendaguru Group)",
    );
  });

  it("gives an empty detail when only the country is known", () => {
    expect(formatClueLocation({ discoveryLocation: "United States" })).toEqual({ lead: "United States", detail: "" });
  });

  it("returns null when there is no country", () => {
    expect(formatClueLocation({ ageLabel: "Maastrichtian" })).toBeNull();
  });
});
