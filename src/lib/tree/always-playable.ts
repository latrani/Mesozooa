// Genera guaranteed into the playable pool past the notability cap. By NAME (resolved to Q-ids at
// build time). A name that doesn't resolve to a clued, non-degenerate genus is WARNED and skipped —
// never force a broken game. Cap-only override; see
// docs/superpowers/specs/2026-07-20-always-playable-list-design.md.
export const ALWAYS_PLAYABLE: string[] = [
  "Tawa", // Ghost Ranch coelophysoid; camp week. Bumped from Theropoda-direct cap by Eodromaeus (#43).
];
