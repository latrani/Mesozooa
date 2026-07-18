// A geologic timescale for turning PBDB age data into legible, layered clue labels.
//
// The game shows a genus's age as "{epoch} ({stage(s)}, {Ma range})" — coarse-to-fine, so it
// reads whether or not you can name your stages. This table is the one source for two jobs:
//   1. epochForStage(name) — coarse epoch for an existing PBDB stage string (the ~1,683 genera
//      that already carry an interval label).
//   2. stageAtMa(ma)       — derive a stage + epoch from raw Ma numbers, for the genera PBDB
//      hands numeric appearance ages but NO interval strings (the Morrison A-list, etc.).
//
// Boundaries are ICS-2023 (Ma). Coverage runs oldest→youngest through the Pliocene: dinosaurs
// are Mesozoic, but a handful of genera carry Cenozoic straggler ages that still need an epoch.

export interface Stage {
  stage: string;
  epoch: string;
  startMa: number; // older bound (larger)
  endMa: number; // younger bound (smaller)
}

// Ordered oldest → youngest. Each stage covers [endMa, startMa).
export const STAGES: Stage[] = [
  { stage: "Induan", epoch: "Early Triassic", startMa: 251.9, endMa: 251.2 },
  { stage: "Olenekian", epoch: "Early Triassic", startMa: 251.2, endMa: 247.2 },
  { stage: "Anisian", epoch: "Middle Triassic", startMa: 247.2, endMa: 242.0 },
  { stage: "Ladinian", epoch: "Middle Triassic", startMa: 242.0, endMa: 237.0 },
  { stage: "Carnian", epoch: "Late Triassic", startMa: 237.0, endMa: 227.0 },
  { stage: "Norian", epoch: "Late Triassic", startMa: 227.0, endMa: 208.5 },
  { stage: "Rhaetian", epoch: "Late Triassic", startMa: 208.5, endMa: 201.4 },
  { stage: "Hettangian", epoch: "Early Jurassic", startMa: 201.4, endMa: 199.5 },
  { stage: "Sinemurian", epoch: "Early Jurassic", startMa: 199.5, endMa: 192.9 },
  { stage: "Pliensbachian", epoch: "Early Jurassic", startMa: 192.9, endMa: 184.2 },
  { stage: "Toarcian", epoch: "Early Jurassic", startMa: 184.2, endMa: 174.7 },
  { stage: "Aalenian", epoch: "Middle Jurassic", startMa: 174.7, endMa: 170.9 },
  { stage: "Bajocian", epoch: "Middle Jurassic", startMa: 170.9, endMa: 168.2 },
  { stage: "Bathonian", epoch: "Middle Jurassic", startMa: 168.2, endMa: 165.3 },
  { stage: "Callovian", epoch: "Middle Jurassic", startMa: 165.3, endMa: 161.5 },
  { stage: "Oxfordian", epoch: "Late Jurassic", startMa: 161.5, endMa: 154.8 },
  { stage: "Kimmeridgian", epoch: "Late Jurassic", startMa: 154.8, endMa: 149.2 },
  { stage: "Tithonian", epoch: "Late Jurassic", startMa: 149.2, endMa: 143.1 },
  { stage: "Berriasian", epoch: "Early Cretaceous", startMa: 143.1, endMa: 137.7 },
  { stage: "Valanginian", epoch: "Early Cretaceous", startMa: 137.7, endMa: 132.6 },
  { stage: "Hauterivian", epoch: "Early Cretaceous", startMa: 132.6, endMa: 125.77 },
  { stage: "Barremian", epoch: "Early Cretaceous", startMa: 125.77, endMa: 121.4 },
  { stage: "Aptian", epoch: "Early Cretaceous", startMa: 121.4, endMa: 113.0 },
  { stage: "Albian", epoch: "Early Cretaceous", startMa: 113.0, endMa: 100.5 },
  { stage: "Cenomanian", epoch: "Late Cretaceous", startMa: 100.5, endMa: 93.9 },
  { stage: "Turonian", epoch: "Late Cretaceous", startMa: 93.9, endMa: 89.8 },
  { stage: "Coniacian", epoch: "Late Cretaceous", startMa: 89.8, endMa: 86.3 },
  { stage: "Santonian", epoch: "Late Cretaceous", startMa: 86.3, endMa: 83.6 },
  { stage: "Campanian", epoch: "Late Cretaceous", startMa: 83.6, endMa: 72.1 },
  { stage: "Maastrichtian", epoch: "Late Cretaceous", startMa: 72.1, endMa: 66.0 },
  { stage: "Danian", epoch: "Paleocene", startMa: 66.0, endMa: 61.6 },
  { stage: "Selandian", epoch: "Paleocene", startMa: 61.6, endMa: 59.2 },
  { stage: "Thanetian", epoch: "Paleocene", startMa: 59.2, endMa: 56.0 },
  { stage: "Ypresian", epoch: "Eocene", startMa: 56.0, endMa: 47.8 },
  { stage: "Lutetian", epoch: "Eocene", startMa: 47.8, endMa: 41.2 },
  { stage: "Bartonian", epoch: "Eocene", startMa: 41.2, endMa: 37.71 },
  { stage: "Priabonian", epoch: "Eocene", startMa: 37.71, endMa: 33.9 },
  { stage: "Rupelian", epoch: "Oligocene", startMa: 33.9, endMa: 27.82 },
  { stage: "Chattian", epoch: "Oligocene", startMa: 27.82, endMa: 23.03 },
  { stage: "Aquitanian", epoch: "Miocene", startMa: 23.03, endMa: 20.44 },
  { stage: "Burdigalian", epoch: "Miocene", startMa: 20.44, endMa: 15.97 },
  { stage: "Langhian", epoch: "Miocene", startMa: 15.97, endMa: 13.82 },
  { stage: "Serravallian", epoch: "Miocene", startMa: 13.82, endMa: 11.63 },
  { stage: "Tortonian", epoch: "Miocene", startMa: 11.63, endMa: 7.246 },
  { stage: "Messinian", epoch: "Miocene", startMa: 7.246, endMa: 5.333 },
  { stage: "Zanclean", epoch: "Pliocene", startMa: 5.333, endMa: 3.6 },
  { stage: "Piacenzian", epoch: "Pliocene", startMa: 3.6, endMa: 2.58 },
];

const EPOCH_BY_STAGE = new Map(STAGES.map((s) => [s.stage, s.epoch]));

/** The epoch a named stage belongs to, or undefined if the name isn't a known stage. */
export function epochForStage(stage: string): string | undefined {
  return EPOCH_BY_STAGE.get(stage.trim());
}

/**
 * The stage (and its epoch) containing a given age in Ma. Each stage covers [endMa, startMa);
 * ages beyond the table clamp to the oldest / youngest stage so the lookup is total.
 */
export function stageAtMa(ma: number): { stage: string; epoch: string } {
  const s =
    STAGES.find((x) => ma < x.startMa && ma >= x.endMa) ??
    (ma >= STAGES[0].startMa ? STAGES[0] : STAGES[STAGES.length - 1]);
  return { stage: s.stage, epoch: s.epoch };
}

// Older stage → younger stage: hyphen, matching the existing PBDB interval labels
// ("Tithonian-Barremian"). Epoch ranges use an en dash to read as one visual unit.
function range(older: string, younger: string, sep: string): string {
  return older === younger ? older : `${older}${sep}${younger}`;
}

/** The Cretaceous–Paleogene boundary (Ma): the end of the Mesozoic, and the game's back wall. */
export const MESOZOIC_END_MA = 66;

/**
 * Did this genus live in the Mesozoic? Tests the OLDER bound, so a genus that originated before
 * the K–Pg boundary counts even if it survived past it — it did live in the Mesozoic, which is
 * the question. Only a genus that first appears entirely after the boundary is out.
 *
 * Undated genera pass: ~57% of the reference pool has no PBDB data at all, and dropping them
 * would gut Explore's long tail to punish a handful of Cenozoic birds. This filter removes what
 * we can prove is too young, not everything we can't prove is old enough.
 */
export function isMesozoic(age: { ageStartMa?: number; ageEndMa?: number }): boolean {
  return age.ageStartMa == null || age.ageStartMa >= MESOZOIC_END_MA;
}

export interface EnrichedAge {
  ageLabel: string;
  ageEpoch?: string;
  ageStartMa?: number;
  ageEndMa?: number;
}

/**
 * Layer an age for display. Given whatever PBDB yielded — an interval label, raw Ma, or both —
 * produce a stage `ageLabel` and a coarse `ageEpoch`. When no interval string is present, the
 * label is derived from the Ma numbers (this is what rescues the genera PBDB gives numbers-only).
 * Returns undefined when there is nothing to work with.
 */
export function enrichAge(input: {
  ageLabel?: string;
  ageStartMa?: number;
  ageEndMa?: number;
}): EnrichedAge | undefined {
  const { ageStartMa, ageEndMa } = input;
  let ageLabel = input.ageLabel;
  let older: string | undefined;
  let younger: string | undefined;

  if (ageLabel) {
    const parts = ageLabel.split("-").map((p) => p.trim());
    older = parts[0];
    younger = parts[parts.length - 1];
  } else if (ageStartMa != null && ageEndMa != null) {
    older = stageAtMa(ageStartMa).stage;
    younger = stageAtMa(ageEndMa).stage;
    ageLabel = range(older, younger, "-");
  } else {
    return undefined;
  }

  const epochOlder = epochForStage(older);
  const epochYounger = epochForStage(younger);
  const ageEpoch =
    epochOlder && epochYounger ? range(epochOlder, epochYounger, "–") : undefined;

  return { ageLabel, ageEpoch, ageStartMa, ageEndMa };
}
