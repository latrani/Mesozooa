import { parseAge, modalLocality } from "../src/lib/pbdb-parse";
import type { AgeRecord, Locality, LocalityRow } from "../src/lib/pbdb-parse";

const BASE = "https://paleobiodb.org/data1.2";
const UA = "Mesozooa/0.1 (https://github.com/; dinosaur cladistics game)";
const BATCH = 80;

async function getJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`PBDB ${res.status}: ${url}`);
    return res.json();
  }
  throw new Error(`PBDB retries exhausted: ${url}`);
}

const genusOf = (name: string) => name.split(" ")[0];

export async function pbdbAges(names: string[]): Promise<Record<string, ReturnType<typeof parseAge>>> {
  const out: Record<string, ReturnType<typeof parseAge>> = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const url = `${BASE}/taxa/list.json?vocab=pbdb&show=app&taxon_name=${encodeURIComponent(batch.join(","))}`;
    const j = await getJSON(url);
    for (const rec of j.records ?? []) {
      const g = genusOf(rec.taxon_name ?? rec.accepted_name ?? "");
      if (batch.includes(g) && !out[g]) out[g] = parseAge(rec as AgeRecord);
    }
    console.log(`pbdb ages: ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  return out;
}

export async function pbdbLocations(names: string[]): Promise<Record<string, Locality>> {
  const out: Record<string, Locality> = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    // base_name (not taxon_name) so species-level occurrences under each genus are included.
    // show=loc,strat carries country (cc), state/province, and the geologic formation.
    const url = `${BASE}/occs/list.json?vocab=pbdb&show=loc,strat&base_name=${encodeURIComponent(batch.join(","))}`;
    const j = await getJSON(url);
    const rowsByGenus = new Map<string, LocalityRow[]>();
    for (const occ of j.records ?? []) {
      const g = genusOf(occ.accepted_name ?? occ.identified_name ?? "");
      if (!batch.includes(g)) continue;
      const row: LocalityRow = { cc: occ.cc, state: occ.state, formation: occ.formation };
      const list = rowsByGenus.get(g);
      if (list) list.push(row);
      else rowsByGenus.set(g, [row]);
    }
    for (const [g, rows] of rowsByGenus) out[g] = modalLocality(rows);
    console.log(`pbdb locations: ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  return out;
}
