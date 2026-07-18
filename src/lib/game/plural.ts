// "1 genus" / "N genera" — the count label used by clade cards and specimen readouts.
export function pluralGenera(n: number): string {
  return `${n} ${n === 1 ? "genus" : "genera"}`;
}
