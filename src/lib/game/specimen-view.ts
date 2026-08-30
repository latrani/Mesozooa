import type { TreeNode } from "../tree/types";
import type { GenusAttribute } from "../attributes";
import type { CreditDisplay } from "../image-credits";
import { formatCredit } from "../image-credits";
import { clueFor, formatClueAge, formatClueLocation } from "./clue";
import { displayName } from "./displayName";
import { pluralGenera } from "./plural";
import type { GameState } from "./types";
import type { TreeStore } from "./treeStore";
import { specimenState, warmestSharedNodeId, leafHintActive } from "./engine-core";

export type SpecimenMount =
  | { kind: "photo"; url: string; alt: string; credit: CreditDisplay | null }
  | { kind: "slip"; text: string; tilt: number };

export interface SpecimenField {
  label: string;
  value: string | null; // null renders as "? ? ?"
  detail?: string;
}

/**
 * The warmest shared clade and how many of its pool members are still in the running — shown on
 * the ANSWER card only, and only once warmth has pinned at the anchor and the warm trail has
 * stopped carrying information.
 *
 * Deliberately counts CANDIDATES, not genera. This card describes the state of your hunt, not a
 * taxon; a taxonomic word here would read as a claim about the clade's size and collide with the
 * reference cards, which legitimately report the true count for the same node. See
 * docs/superpowers/specs/2026-08-29-difficulty-modes-design.md § Counts: two surfaces.
 */
export interface SpecimenAnchor {
  cladeId: string;
  cladeName: string;
  candidates: number;
}

export interface SpecimenView {
  title: string | null; // null renders as the "? ? ?" heading
  mount: SpecimenMount;
  fields: SpecimenField[];
  note: string | null;
  /** present only at the anchor, on the in-play answer card */
  anchor: SpecimenAnchor | null;
  link: { href: string; label: string } | null;
}

const MISSING_SLIP: SpecimenMount = { kind: "slip", text: "Specimen missing", tilt: 3.5 };

// Map a genus clue to Lived / Found in rows, omitting a layer that is absent. A present
// row's `value` is the coarse lead; `detail` is the parenthesised finer layer (or undefined).
export function clueFieldsFrom(clue: GenusAttribute | null): SpecimenField[] {
  if (!clue) return [];
  const fields: SpecimenField[] = [];
  const age = formatClueAge(clue);
  if (age) fields.push({ label: "Lived", value: age.lead, detail: age.detail || undefined });
  const place = formatClueLocation(clue);
  if (place) fields.push({ label: "Found in", value: place.lead, detail: place.detail || undefined });
  return fields;
}

// A fully identified taxon (genus or clade). Used by Explore and game-solved.
export function nodeView(node: TreeNode): SpecimenView {
  const mount: SpecimenMount = node.imageUrl
    ? {
        kind: "photo",
        url: node.imageUrl,
        alt: displayName(node.name),
        credit: formatCredit({
          author: node.imageAuthor,
          licenseShort: node.imageLicense,
          licenseUrl: node.imageLicenseUrl,
        }),
      }
    : MISSING_SLIP;
  return {
    title: displayName(node.name),
    mount,
    fields: node.isGenus ? clueFieldsFrom(clueFor(node.id)) : [],
    note: node.isGenus ? null : `${pluralGenera(node.descendantGenusCount)} in this clade`,
    // A reference card never carries the anchor note: it describes a taxon, not your hunt.
    anchor: null,
    link: node.wikipediaUrl ? { href: node.wikipediaUrl, label: "Wikipedia ↗" } : null,
  };
}

const COMING_SLIP: SpecimenMount = { kind: "slip", text: "New exhibit coming soon!", tilt: -4 };

// The two "? ? ?" clue rows shown before the specimen is identified.
function placeholderFields(): SpecimenField[] {
  return [
    { label: "Lived", value: null },
    { label: "Found in", value: null },
  ];
}

// The game's specimen across its states. Unidentified states share one placeholder view; the
// terminal state reveals the real clue once the leaf hint has been taken (same gating as before).
/**
 * How many pool members of the warmest shared clade are still in the running.
 *
 * Subtracts only genera you have actually GUESSED inside that clade. That understates your
 * progress — a guess inside a sub-branch eliminates the whole branch, not just the one genus —
 * but a number claiming less narrowing than really happened is the safe direction, and computing
 * true elimination would mean running a deduction engine over the guess history.
 */
function anchorFor(state: GameState, store: TreeStore): SpecimenAnchor | null {
  if (!leafHintActive(state, store)) return null;
  const cladeId = warmestSharedNodeId(state, store);
  if (cladeId === null) return null;
  const clade = store.getNode(cladeId);
  if (!clade) return null;

  const eliminated = state.guesses.filter(
    (g) => g.kind === "guess" && store.pathToRoot(g.guessId).includes(cladeId),
  ).length;
  return {
    cladeId,
    cladeName: displayName(clade.name),
    candidates: Math.max(0, store.poolCount(cladeId) - eliminated),
  };
}

export function specimenView(state: GameState, store: TreeStore): SpecimenView {
  const s = specimenState(state, store);
  if (s.kind === "solved") return nodeView(store.getNode(s.targetId)!);
  const clueRevealed = state.guesses.some((g) => g.kind === "leafHint");
  const fields =
    s.kind === "terminal" && clueRevealed ? clueFieldsFrom(clueFor(state.target)) : placeholderFields();
  return { title: null, mount: COMING_SLIP, fields, note: null, anchor: anchorFor(state, store), link: null };
}
