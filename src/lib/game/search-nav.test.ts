import { describe, it, expect } from "vitest";
import { nextActiveIndex, clampActiveIndex, NONE } from "./search-nav";

describe("nextActiveIndex", () => {
  it("ArrowDown from none highlights the first option", () => {
    expect(nextActiveIndex(NONE, 3, 1)).toBe(0);
  });
  it("ArrowDown steps through options", () => {
    expect(nextActiveIndex(0, 3, 1)).toBe(1);
    expect(nextActiveIndex(1, 3, 1)).toBe(2);
  });
  it("ArrowDown past the last option wraps back to the input (none)", () => {
    expect(nextActiveIndex(2, 3, 1)).toBe(NONE);
  });
  it("ArrowUp from none highlights the last option", () => {
    expect(nextActiveIndex(NONE, 3, -1)).toBe(2);
  });
  it("ArrowUp off the first option returns to the input (none)", () => {
    expect(nextActiveIndex(0, 3, -1)).toBe(NONE);
  });
  it("ArrowUp steps backward through options", () => {
    expect(nextActiveIndex(2, 3, -1)).toBe(1);
  });
  it("stays at none when there are no results", () => {
    expect(nextActiveIndex(NONE, 0, 1)).toBe(NONE);
    expect(nextActiveIndex(NONE, 0, -1)).toBe(NONE);
  });
});

describe("clampActiveIndex", () => {
  it("keeps a valid index", () => {
    expect(clampActiveIndex(2, 5)).toBe(2);
  });
  it("resets to none when the index falls off the shrunken list", () => {
    expect(clampActiveIndex(4, 2)).toBe(NONE);
  });
  it("resets to none when the list empties", () => {
    expect(clampActiveIndex(0, 0)).toBe(NONE);
  });
  it("passes none through", () => {
    expect(clampActiveIndex(NONE, 3)).toBe(NONE);
  });
});
