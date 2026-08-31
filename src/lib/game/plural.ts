// "1 genus" / "N genera" — the count label used by clade cards and specimen readouts.
export function pluralGenera(n: number): string {
  return `${n} ${n === 1 ? "genus" : "genera"}`;
}

/** "1 candidate specimen" / "N candidate specimens" — the in-progress answer card's title.
    Candidates, not genera: the card describes the state of the hunt, not a taxon. */
export function pluralCandidates(n: number): string {
  return `${n} candidate specimen${n === 1 ? "" : "s"}`;
}
