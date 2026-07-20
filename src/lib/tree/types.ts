export const DINOSAURIA = "Q430";
export const NEORNITHES = "Q19163";
/** The only clade under Dinosauria that survives the K–Pg — so the only place undated genera
    can silently be Cenozoic. Everything else in the tree is Mesozoic by construction. */
export const AVES = "Q5113";
export const RANK_GENUS = "Q34740";
export const RANK_FAMILY = "Q35409";
export const RANK_SPECIES = "Q7432";

export interface RawTaxon {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  imageUrl?: string;
  wikipediaUrl?: string;
  sitelinks?: number;
  taxonName?: string;      // Wikidata P225 (taxon name); may differ from the en label
  enwikiTitle?: string;    // enwiki article title (independent name signal)
  redirectTarget?: string; // if the enwiki article redirects, its target title (advisory only)
  resolvedFrom?: string;   // species Q-id whose article/sitelinks/image were folded onto this genus
}

export interface TreeNode {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  childrenIds: string[];
  depth: number;
  branchDepth: number; // narrowing edges from root (monotypic runs collapsed); warmth ruler
  descendantGenusCount: number;
  isGenus: boolean;
  playable: boolean;
  sitelinks: number;
  imageUrl?: string;         // local path "/images/<Qid>.webp" after build:data
  imageAuthor?: string;      // sanitized author (from Commons Artist)
  imageLicense?: string;     // license short name, e.g. "CC BY-SA 4.0"
  imageLicenseUrl?: string;  // license deed URL
  wikipediaUrl?: string;
}

export interface TreeData {
  dataVersion: string;
  rootId: string;
  nodes: Record<string, TreeNode>;
}
