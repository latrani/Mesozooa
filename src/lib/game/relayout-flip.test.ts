import { describe, it, expect } from "vitest";
import { layoutDiff } from "./relayout-flip";
import type { Pos } from "./relayout-flip";

const P = (x: number, y: number): Pos => ({ x, y });

describe("layoutDiff", () => {
  const parentOf = (id: string) => ({ b: "a", c: "a", d: "a", e: "a" } as Record<string, string>)[id] ?? null;

  it("classifies persisting / entering / leaving by id", () => {
    const prev = new Map([["a", P(0, 0)], ["b", P(1, 1)], ["c", P(1, 2)]]);
    const next = new Map([["a", P(0, 0)], ["c", P(1, 1)], ["d", P(1, 2)]]);
    const d = layoutDiff(prev, next, parentOf);
    expect(d.persisting.map((p) => p.id).sort()).toEqual(["a", "c"]);
    expect(d.entering.map((e) => e.id)).toEqual(["d"]);
    expect(d.leaving.map((l) => l.id)).toEqual(["b"]);
  });

  it("persisting carries from (prev) and to (next)", () => {
    const prev = new Map([["c", P(1, 2)]]);
    const next = new Map([["c", P(3, 4)]]);
    expect(layoutDiff(prev, next, parentOf).persisting[0]).toEqual({ id: "c", from: P(1, 2), to: P(3, 4) });
  });

  it("entering carries to + parent from/to (scope-C groundwork)", () => {
    const prev = new Map([["a", P(0, 0)]]);
    const next = new Map([["a", P(0, 1)], ["b", P(1, 2)]]);
    expect(layoutDiff(prev, next, parentOf).entering[0]).toEqual({
      id: "b", to: P(1, 2), parentFrom: P(0, 0), parentTo: P(0, 1),
    });
  });

  it("leaving carries lastPos + parent from/to", () => {
    const prev = new Map([["a", P(0, 0)], ["b", P(1, 2)]]);
    const next = new Map([["a", P(0, 1)]]);
    expect(layoutDiff(prev, next, parentOf).leaving[0]).toEqual({
      id: "b", lastPos: P(1, 2), parentFrom: P(0, 0), parentTo: P(0, 1),
    });
  });

  it("null parent (root or absent) yields null parent positions", () => {
    const prev = new Map<string, Pos>();
    const next = new Map([["a", P(0, 0)]]); // a has no parent
    expect(layoutDiff(prev, next, parentOf).entering[0]).toEqual({
      id: "a", to: P(0, 0), parentFrom: null, parentTo: null,
    });
  });

  it("empty prev (first layout) → everything enters, nothing persists/leaves", () => {
    const next = new Map([["a", P(0, 0)], ["b", P(1, 1)]]);
    const d = layoutDiff(new Map(), next, parentOf);
    expect(d.persisting).toEqual([]);
    expect(d.leaving).toEqual([]);
    expect(d.entering.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});
