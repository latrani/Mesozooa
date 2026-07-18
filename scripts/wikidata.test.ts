import { describe, it, expect } from "vitest";
import { qid } from "./wikidata";

describe("qid", () => {
  it("strips the entity prefix", () => {
    expect(qid("http://www.wikidata.org/entity/Q430")).toBe("Q430");
  });
  it("passes through a bare id", () => {
    expect(qid("Q430")).toBe("Q430");
  });
});
