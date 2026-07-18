import type { RawTaxon } from "./types";
import { RANK_GENUS, RANK_FAMILY } from "./types";

const CLADE = "Q713623"; // "clade"

// Dinosauria
//  ├─ Theropoda
//  │   ├─ Tyrannosauridae (family)
//  │   │   ├─ Tyrannosaurus (genus, wiki)   -> playable
//  │   │   └─ Tarbosaurus (genus, wiki)     -> playable
//  │   └─ Loosey (genus, wiki, NO family)   -> NOT playable
//  ├─ Ornithischia
//  │   └─ Ceratopsidae (family)
//  │       └─ Triceratops (genus, wiki)     -> playable
//  └─ Neornithes (to be pruned)
//      └─ Passer (genus, wiki)              -> pruned away
export const FIXTURE_RAWS: RawTaxon[] = [
  { id: "Q430", name: "Dinosauria", rankId: CLADE, parentId: null },
  { id: "T", name: "Theropoda", rankId: CLADE, parentId: "Q430" },
  { id: "TF", name: "Tyrannosauridae", rankId: RANK_FAMILY, parentId: "T" },
  { id: "TR", name: "Tyrannosaurus", rankId: RANK_GENUS, parentId: "TF",
    imageUrl: "trex.jpg", wikipediaUrl: "https://en.wikipedia.org/wiki/Tyrannosaurus" },
  { id: "TB", name: "Tarbosaurus", rankId: RANK_GENUS, parentId: "TF",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tarbosaurus" },
  { id: "LO", name: "Loosey", rankId: RANK_GENUS, parentId: "T",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Loosey" },
  { id: "O", name: "Ornithischia", rankId: CLADE, parentId: "Q430" },
  { id: "CF", name: "Ceratopsidae", rankId: RANK_FAMILY, parentId: "O" },
  { id: "TC", name: "Triceratops", rankId: RANK_GENUS, parentId: "CF",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Triceratops" },
  { id: "Q19163", name: "Neornithes", rankId: CLADE, parentId: "Q430" },
  { id: "PA", name: "Passer", rankId: RANK_GENUS, parentId: "Q19163",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Passer" },
];

// A tree with a monotypic run (B1 → MA → MB) sitting ABOVE a non-root terminal clade (SA),
// which the primary fixture cannot express. Used to test skip-through hints. Counts:
// GA1=GA2=GB1=OT=1; SA=2, SB=1; MB=3, MA=3, B1=3; MR=4. terminalClade(GA1)=SA.
export const MONO_FIXTURE_RAWS: RawTaxon[] = [
  { id: "MR", name: "Rootosauria", rankId: CLADE, parentId: null },
  { id: "B1", name: "Branchia", rankId: CLADE, parentId: "MR" },
  { id: "MA", name: "Monoa", rankId: CLADE, parentId: "B1" },
  { id: "MB", name: "Monob", rankId: CLADE, parentId: "MA" },
  { id: "SA", name: "Subfamilia", rankId: RANK_FAMILY, parentId: "MB" },
  { id: "SB", name: "Subfamilib", rankId: RANK_FAMILY, parentId: "MB" },
  { id: "GA1", name: "Genusaa", rankId: RANK_GENUS, parentId: "SA",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusaa" },
  { id: "GA2", name: "Genusab", rankId: RANK_GENUS, parentId: "SA",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusab" },
  { id: "GB1", name: "Genusba", rankId: RANK_GENUS, parentId: "SB",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Genusba" },
  { id: "OT", name: "Otheria", rankId: RANK_GENUS, parentId: "MR",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Otheria" },
];
