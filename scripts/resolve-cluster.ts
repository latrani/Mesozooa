import type { RawTaxon } from "../src/lib/tree/types";

export interface ClusterResolution {
  wikipediaUrl?: string;
  enwikiTitle?: string;
  sitelinks: number;
  imageUrl?: string;
  resolvedFrom?: string; // set only when the article came from a species, not the genus
}

const sl = (t: RawTaxon): number => t.sitelinks ?? 0;

/**
 * Resolve a genus's Wikipedia identity across its entity cluster {genus} ∪ species.
 * Representative = the entity WITH an enwiki article that has the most sitelinks
 * (ties by ascending id, matching playable.ts). Article + sitelinks come from that
 * representative; image resolves independently (genus's own → representative's → any
 * species'). If no entity has an article, the genus keeps its own values.
 */
export function resolveCluster(genus: RawTaxon, species: RawTaxon[]): ClusterResolution {
  const cluster = [genus, ...species];
  const articled = cluster.filter((t) => !!t.wikipediaUrl);

  // Representative: max sitelinks among articled entities, ties by ascending id.
  articled.sort((a, b) => sl(b) - sl(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rep = articled[0];

  // Image: prefer the genus's own, else the representative's, else any species with one.
  const imageUrl =
    genus.imageUrl ?? rep?.imageUrl ?? species.find((s) => s.imageUrl)?.imageUrl;

  if (!rep) {
    // No article anywhere — keep the genus's own identity untouched.
    return { sitelinks: sl(genus), imageUrl };
  }

  return {
    wikipediaUrl: rep.wikipediaUrl,
    enwikiTitle: rep.enwikiTitle,
    sitelinks: sl(rep),
    imageUrl,
    resolvedFrom: rep.id === genus.id ? undefined : rep.id,
  };
}
