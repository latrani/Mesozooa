export interface GenusAttribute {
  ageLabel?: string;
  ageEpoch?: string;
  ageStartMa?: number;
  ageEndMa?: number;
  discoveryLocation?: string; // country (the coarse layer; also the clue-eligibility gate)
  discoveryState?: string; // state / province within that country
  discoveryFormation?: string; // geologic formation (bare name, e.g. "Morrison")
}

export type GenusAttributes = Record<string, GenusAttribute>;

export function hasClue(a: GenusAttribute | undefined): boolean {
  return !!a && !!a.ageLabel && !!a.discoveryLocation;
}
