// Wikidata genus items MIS-TAGGED P105=species on the genus item itself, so assembleTree's
// RANK_GENUS filter drops them. Override each to genus (Q34740) at harvest so they're kept.
// Verified by WDQS sweep 2026-07-20 (single-word en label, real clade parent, has en label, has a
// PBDB clue). See docs/superpowers/specs/2026-07-20-rank-override-design.md. Keyed by Q-id (exact,
// no homonym risk), mirroring NAME_DECISIONS.
export const RANK_OVERRIDES: Record<string, string> = {
  Q122069485: "Q34740", // Eodromaeus — parent Theropoda; basal theropod, Carnian, Argentina (Ischigualasto)
  Q95715804:  "Q34740", // Overoraptor — parent Saurischia; Cenomanian–Turonian, Argentina
  Q72914385:  "Q34740", // Nemegtonykus — parent Parvicursorinae; alvarezsaurid, Maastrichtian, Mongolia
};
