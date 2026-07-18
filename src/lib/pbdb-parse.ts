export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", CN: "China", MN: "Mongolia", AR: "Argentina",
  GB: "United Kingdom", DE: "Germany", AU: "Australia", ZA: "South Africa", BR: "Brazil",
  ES: "Spain", FR: "France", RU: "Russia", IN: "India", MA: "Morocco", EG: "Egypt",
  NE: "Niger", TZ: "Tanzania", MG: "Madagascar", KZ: "Kazakhstan", UZ: "Uzbekistan",
  RO: "Romania", PT: "Portugal", MX: "Mexico", CL: "Chile", UY: "Uruguay", JP: "Japan",
  KR: "South Korea", TH: "Thailand", LA: "Laos", IT: "Italy", BE: "Belgium", PL: "Poland",
  // PBDB uses the historical code "UK" (not ISO "GB").
  UK: "United Kingdom", PK: "Pakistan", AQ: "Antarctica", LS: "Lesotho", HU: "Hungary",
  ZW: "Zimbabwe", KG: "Kyrgyzstan", DZ: "Algeria", CH: "Switzerland", MM: "Myanmar",
  CO: "Colombia", MW: "Malawi", VE: "Venezuela", TJ: "Tajikistan", GL: "Greenland",
  CZ: "Czech Republic", AO: "Angola", TN: "Tunisia", LB: "Lebanon", DK: "Denmark",
  UA: "Ukraine", HR: "Croatia", KP: "North Korea", NZ: "New Zealand", EC: "Ecuador",
};

export interface AgeRecord {
  early_interval?: string;
  late_interval?: string;
  firstapp_max_ma?: number;
  lastapp_min_ma?: number;
}

export function parseAge(rec: AgeRecord): { ageLabel?: string; ageStartMa?: number; ageEndMa?: number } {
  const early = rec.early_interval;
  const late = rec.late_interval;
  let ageLabel: string | undefined;
  if (early && late && early !== late) ageLabel = `${early}-${late}`;
  else ageLabel = early ?? late ?? undefined;
  return {
    ageLabel,
    ageStartMa: rec.firstapp_max_ma,
    ageEndMa: rec.lastapp_min_ma,
  };
}

// The most-common value of one field across rows (ties broken alphabetically for determinism),
// or undefined if no row carries it.
function modalOf<T>(rows: T[], field: (r: T) => string | undefined): string | undefined {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = field(r);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

export function modalLocation(rows: { cc?: string }[]): string | undefined {
  const cc = modalOf(rows, (r) => r.cc);
  return cc ? (COUNTRY_NAMES[cc] ?? cc) : undefined;
}

export interface LocalityRow {
  cc?: string;
  state?: string;
  formation?: string;
}
export interface Locality {
  country?: string;
  state?: string;
  formation?: string;
}

/**
 * A coherent modal locale from a genus's occurrences: modal country, then the modal state WITHIN
 * that country, then the modal formation within that (country, state). Drilling — rather than
 * taking each field's modal independently — keeps the layers from a single dominant place, so we
 * never report a state from one country beside a formation from another. Formation still surfaces
 * when no state is recorded (it then drills within the country alone).
 */
export function modalLocality(rows: LocalityRow[]): Locality {
  const cc = modalOf(rows, (r) => r.cc);
  if (!cc) return {};
  const inCountry = rows.filter((r) => r.cc === cc);
  const state = modalOf(inCountry, (r) => r.state);
  const inState = state ? inCountry.filter((r) => r.state === state) : inCountry;
  const formation = modalOf(inState, (r) => r.formation);
  const loc: Locality = { country: COUNTRY_NAMES[cc] ?? cc };
  if (state) loc.state = state;
  if (formation) loc.formation = formation;
  return loc;
}
