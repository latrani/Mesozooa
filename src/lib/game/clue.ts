import type { GenusAttribute, GenusAttributes } from "../attributes";
import attrsJson from "../../data/genus-attributes.json";

const attrs = attrsJson as GenusAttributes;

// The paleo-data for a genus id, or null if none was harvested. Emitted for every genus that has
// it (not just playable ones — Explore shows it as reference content), so many non-playable genera
// have paleo-data too; the reverse still holds (every playable genus has it). Callers handle null.
export function clueFor(id: string): GenusAttribute | null {
  return attrs[id] ?? null;
}

/**
 * Compose a clue's age for display as two layers: `lead` (the coarse epoch) and `detail` (the
 * precise stage + integer-rounded Ma range, parenthesised, for its own line below). Falls back
 * to the stage label as the lead when no epoch was derived — and then never repeats it in the
 * detail. Returns null when there is no age. Shared by every component that renders a clue, so
 * the game specimen and the Explore card can never drift apart again.
 */
export function formatClueAge(clue: GenusAttribute): { lead: string; detail: string } | null {
  if (!clue.ageLabel && clue.ageEpoch == null) return null;
  const lead = clue.ageEpoch ?? clue.ageLabel!;
  const detail: string[] = [];
  if (clue.ageEpoch && clue.ageLabel) detail.push(clue.ageLabel);
  if (clue.ageStartMa != null && clue.ageEndMa != null) {
    const s = Math.round(clue.ageStartMa), e = Math.round(clue.ageEndMa);
    detail.push(s === e ? `${s} mya` : `${s}–${e} mya`);
  }
  return { lead, detail: detail.length ? `(${detail.join(", ")})` : "" };
}

// PBDB gives bare formation names ("Morrison"); append "Formation" unless the name already
// carries a stratigraphic rank word (some entries are Groups or Members, or already suffixed).
function formationDisplay(name: string): string {
  return /\b(Formation|Group|Member|Beds|Sandstone|Clay|Sands|Limestone|Shale|Marl)\b/i.test(name)
    ? name
    : `${name} Formation`;
}

/**
 * Compose a clue's discovery place as two layers: `lead` (the country) and `detail` (the finer
 * state + formation, parenthesised, for its own line below). Mirrors {@link formatClueAge}. The
 * finer layers plug the disambiguation hole the coarse age range leaves: siblings sharing an age
 * often split on state or formation. Returns null when no country is known.
 */
export function formatClueLocation(clue: GenusAttribute): { lead: string; detail: string } | null {
  if (!clue.discoveryLocation) return null;
  const detail: string[] = [];
  if (clue.discoveryState) detail.push(clue.discoveryState);
  if (clue.discoveryFormation) detail.push(formationDisplay(clue.discoveryFormation));
  return { lead: clue.discoveryLocation, detail: detail.length ? `(${detail.join(", ")})` : "" };
}
