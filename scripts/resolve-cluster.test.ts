import { describe, it, expect } from "vitest";
import { resolveCluster } from "./resolve-cluster";
import type { RawTaxon } from "../src/lib/tree/types";

const genus = (over: Partial<RawTaxon> = {}): RawTaxon => ({
  id: "Qg", name: "Genusname", rankId: "Q34740", parentId: "Qp", ...over,
});
const species = (id: string, over: Partial<RawTaxon> = {}): RawTaxon => ({
  id, name: "Genusname species", rankId: "Q7432", parentId: "Qg", ...over,
});

describe("resolveCluster", () => {
  it("prefers a more-notable articled species over the genus (Cryolophosaurus case)", () => {
    const g = genus({ id: "Q18511006", sitelinks: 0, imageUrl: "commons://cryo.jpg" });
    const sp = [species("Q131166", {
      wikipediaUrl: "https://en.wikipedia.org/wiki/Cryolophosaurus",
      enwikiTitle: "Cryolophosaurus", sitelinks: 36,
    })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Cryolophosaurus");
    expect(r.enwikiTitle).toBe("Cryolophosaurus");
    expect(r.sitelinks).toBe(36);
    expect(r.resolvedFrom).toBe("Q131166");
    expect(r.imageUrl).toBe("commons://cryo.jpg"); // genus's own image kept
  });

  it("keeps the genus's own article when the genus is the most notable", () => {
    const g = genus({
      wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname",
      enwikiTitle: "Genusname", sitelinks: 40,
    });
    const sp = [species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_foo", enwikiTitle: "Genusname foo", sitelinks: 5 })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Genusname");
    expect(r.sitelinks).toBe(40);
    expect(r.resolvedFrom).toBeUndefined(); // genus won — no provenance marker
  });

  it("reads sitelinks from the articled representative, not the cluster max", () => {
    // An articleless species has MORE sitelinks; it must NOT set the notability number.
    const g = genus({ sitelinks: 1 });
    const sp = [
      species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_bar", enwikiTitle: "Genusname bar", sitelinks: 10 }),
      species("Qs2", { sitelinks: 99 }), // no article
    ];
    const r = resolveCluster(g, sp);
    expect(r.sitelinks).toBe(10);       // from the articled species, not 99
    expect(r.resolvedFrom).toBe("Qs1");
  });

  it("returns the genus's own values when no entity has an article", () => {
    const g = genus({ sitelinks: 0 });
    const sp = [species("Qs1", { sitelinks: 3 }), species("Qs2", { sitelinks: 7 })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBeUndefined();
    expect(r.enwikiTitle).toBeUndefined();
    expect(r.sitelinks).toBe(0);        // genus's own; NOT the articleless species' 7
    expect(r.resolvedFrom).toBeUndefined();
  });

  it("breaks sitelinks ties by ascending id among articled entities", () => {
    const g = genus({ sitelinks: 0 });
    const sp = [
      species("Qs9", { wikipediaUrl: "https://en.wikipedia.org/wiki/B", enwikiTitle: "B", sitelinks: 5 }),
      species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/A", enwikiTitle: "A", sitelinks: 5 }),
    ];
    const r = resolveCluster(g, sp);
    expect(r.resolvedFrom).toBe("Qs1"); // ascending id wins the tie
  });

  it("falls back to a species image when the genus has none", () => {
    const g = genus({ sitelinks: 0 }); // no imageUrl
    const sp = [species("Qs1", {
      wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_baz", enwikiTitle: "Genusname baz",
      sitelinks: 8, imageUrl: "commons://sp.jpg",
    })];
    const r = resolveCluster(g, sp);
    expect(r.imageUrl).toBe("commons://sp.jpg");
  });

  it("handles a genus with no species (monotypic-less / leaf)", () => {
    const g = genus({ wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname", enwikiTitle: "Genusname", sitelinks: 12, imageUrl: "commons://g.jpg" });
    const r = resolveCluster(g, []);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Genusname");
    expect(r.sitelinks).toBe(12);
    expect(r.imageUrl).toBe("commons://g.jpg");
    expect(r.resolvedFrom).toBeUndefined();
  });
});
