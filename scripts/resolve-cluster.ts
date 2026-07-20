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
 *
 * enwikiTitle is a NAME CANDIDATE (the name-disagreement gate consumes it), distinct from
 * wikipediaUrl (the link). When the representative is a species, its title is usually a binomial
 * ("Afrovenator abakensis") — folding that raw manufactures a false name conflict with the genus's
 * own label. So donate the species' enwikiTitle ONLY when its first token equals the genus name
 * (the binomial merely confirms membership → drop it, keep the link). If the first token differs
 * (a quoted dubious taxon, or a mis-resolved article), keep it so the gate flags it for a human.
 */
export function resolveCluster(genus: RawTaxon, species: RawTaxon[]): ClusterResolution {
  const cluster = [genus, ...species];
  const articled = cluster.filter((t) => !!t.wikipediaUrl);

  // Representative: max sitelinks among articled entities, ties by ascending id.
  articled.sort((a, b) => sl(b) - sl(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rep = articled[0];

  // Image: prefer the genus's own, else the representative's, else any species with one — picking
  // the lowest-id imaged species so the choice is deterministic across harvests (fetchClusterSpecies
  // has no ORDER BY; matches the ascending-id tiebreak used for the representative).
  const imagedSpecies = species
    .filter((s) => s.imageUrl)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  const imageUrl = genus.imageUrl ?? rep?.imageUrl ?? imagedSpecies?.imageUrl;

  if (!rep) {
    // No article anywhere — keep the genus's own identity untouched.
    return { sitelinks: sl(genus), imageUrl };
  }

  // Only suppress the enwikiTitle name-candidate for a SPECIES rep whose BINOMIAL starts with the
  // genus name ("Afrovenator abakensis"); a genus rep keeps its own title, a title that IS the bare
  // genus name ("Cryolophosaurus") is kept (it confirms, no false conflict), and a non-matching
  // species title ('"Coelosaurus" antiquus') is kept for the gate to flag.
  const repIsSpecies = rep.id !== genus.id;
  const titleParts = rep.enwikiTitle?.split(" ") ?? [];
  const titleIsConfirmingBinomial = titleParts.length > 1 && titleParts[0] === genus.name;
  const enwikiTitle = repIsSpecies && titleIsConfirmingBinomial ? undefined : rep.enwikiTitle;

  return {
    wikipediaUrl: rep.wikipediaUrl,
    enwikiTitle,
    sitelinks: sl(rep),
    imageUrl,
    resolvedFrom: rep.id === genus.id ? undefined : rep.id,
  };
}
