import { readFile, writeFile } from "node:fs/promises";
import { pbdbAges, pbdbLocations } from "./pbdb";
import type { RawTaxon } from "../src/lib/tree/types";
import { RANK_GENUS } from "../src/lib/tree/types";
import { resolveName } from "../src/lib/tree/names";
import { NAME_DECISIONS } from "../src/lib/tree/name-decisions";
import type { GenusAttribute } from "../src/lib/attributes";

async function main() {
  const raws: RawTaxon[] = JSON.parse(await readFile("data/raw-taxa.json", "utf8"));
  // Query PBDB by the RESOLVED name (en → enwiki → P225), matching the names carried by tree
  // nodes — build-tree joins these attributes back by `node.name`. Using raw `r.name` would
  // query label-less genera (Troodon etc.) under their Q-id placeholder and silently drop them.
  const names = [...new Set(raws.filter((r) => r.rankId === RANK_GENUS).map((r) => resolveName(r, NAME_DECISIONS)))];
  console.log(`fetching PBDB attributes for ${names.length} genera...`);

  const ages = await pbdbAges(names);
  const locs = await pbdbLocations(names);

  const out: Record<string, GenusAttribute> = {};
  let withAge = 0, withLoc = 0, withEither = 0;
  for (const name of names) {
    const age = ages[name];
    const loc = locs[name];
    const attr: GenusAttribute = {};
    // Keep whatever PBDB gave — an interval label AND/OR raw Ma. Some genera (the Morrison
    // A-list) come back with numeric appearance ages but NO interval strings; storing the Ma
    // lets build-tree derive a stage label from geologic-time. (Epoch is derived there too.)
    if (age?.ageLabel) attr.ageLabel = age.ageLabel;
    if (age?.ageStartMa != null) attr.ageStartMa = age.ageStartMa;
    if (age?.ageEndMa != null) attr.ageEndMa = age.ageEndMa;
    if (attr.ageLabel || attr.ageStartMa != null) withAge++;
    if (loc?.country) {
      attr.discoveryLocation = loc.country; // country stays the clue-eligibility gate
      if (loc.state) attr.discoveryState = loc.state;
      if (loc.formation) attr.discoveryFormation = loc.formation;
      withLoc++;
    }
    if (attr.ageLabel || attr.ageStartMa != null || attr.discoveryLocation) { out[name] = attr; withEither++; }
  }

  await writeFile("data/raw-pbdb.json", JSON.stringify(out, null, 0));
  console.log(`=== PBDB attributes ===`);
  console.log(`  genera:        ${names.length}`);
  console.log(`  with age:      ${withAge}`);
  console.log(`  with location: ${withLoc}`);
  console.log(`  with a clue:   ${withEither} (${((100 * withEither) / names.length).toFixed(0)}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
