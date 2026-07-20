import { writeFile, mkdir } from "node:fs/promises";
import { sparql, qid } from "./wikidata";
import { pruneSubtree, assembleTree } from "../src/lib/tree/assemble";
import type { RawTaxon } from "../src/lib/tree/types";
import { DINOSAURIA, NEORNITHES, RANK_SPECIES, RANK_GENUS } from "../src/lib/tree/types";
import { enwikiTitleFromUrl } from "./enwiki-title";
import { resolveCluster } from "./resolve-cluster";
import { RANK_OVERRIDES } from "../src/lib/tree/rank-overrides";

const PAGE = 10000;

async function fetchStructure(): Promise<RawTaxon[]> {
  const raws: RawTaxon[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sparql(`
      SELECT ?taxon ?parent ?rank WHERE {
        ?taxon wdt:P171 ?parent .
        ?taxon wdt:P171* wd:${DINOSAURIA} .
        OPTIONAL { ?taxon wdt:P105 ?rank }
      } ORDER BY ?taxon LIMIT ${PAGE} OFFSET ${offset}`);
    for (const r of rows) {
      const id = qid(r.taxon!);
      raws.push({
        id,
        name: id, // filled in Phase 2
        // A curated rank override (#43) corrects genus items Wikidata mis-tags P105=species; it wins
        // over the raw P105 so assembleTree keeps the lineage. Only rankId is affected.
        rankId: RANK_OVERRIDES[id] ?? (r.rank ? qid(r.rank) : null),
        parentId: qid(r.parent!),
      });
    }
    console.log(`structure: ${raws.length} rows (offset ${offset})`);
    if (rows.length < PAGE) break;
  }
  // The root itself has parents outside Dinosauria; ensure it exists with no parent.
  if (!raws.some((r) => r.id === DINOSAURIA)) {
    raws.push({ id: DINOSAURIA, name: DINOSAURIA, rankId: null, parentId: null });
  }
  return raws;
}

// Child species of the in-scope genera, for cluster resolution. VALUES-bound to OUR genus
// ids (not all Dinosauria species) so orphan/hybrid junk — which has no valid genus parent —
// can never attach. Returns bare records; enrich() fills article/sitelinks/image just like genera.
async function fetchClusterSpecies(genusIds: string[]): Promise<RawTaxon[]> {
  const BATCH = 400;
  const out: RawTaxon[] = [];
  for (let i = 0; i < genusIds.length; i += BATCH) {
    const values = genusIds.slice(i, i + BATCH).map((id) => `wd:${id}`).join(" ");
    const rows = await sparql(`
      SELECT ?sp ?genus WHERE {
        VALUES ?genus { ${values} }
        ?sp wdt:P171 ?genus .
        ?sp wdt:P105 wd:${RANK_SPECIES} .
      }`);
    for (const r of rows) {
      out.push({ id: qid(r.sp!), name: qid(r.sp!), rankId: RANK_SPECIES, parentId: qid(r.genus!) });
    }
    console.log(`cluster species: ${out.length} (genus batch ${Math.min(i + BATCH, genusIds.length)}/${genusIds.length})`);
  }
  return out;
}

async function enrich(ids: string[], byId: Map<string, RawTaxon>): Promise<void> {
  const BATCH = 400;
  for (let i = 0; i < ids.length; i += BATCH) {
    const values = ids.slice(i, i + BATCH).map((id) => `wd:${id}`).join(" ");
    const rows = await sparql(`
      SELECT ?taxon ?taxonLabel ?taxonName ?img ?article ?sitelinks WHERE {
        VALUES ?taxon { ${values} }
        OPTIONAL { ?taxon wdt:P225 ?taxonName }
        OPTIONAL { ?taxon wdt:P18 ?img }
        OPTIONAL { ?article schema:about ?taxon ; schema:isPartOf <https://en.wikipedia.org/> }
        OPTIONAL { ?taxon wikibase:sitelinks ?sitelinks }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`);
    for (const r of rows) {
      const node = byId.get(qid(r.taxon!));
      if (!node) continue;
      if (r.taxonLabel) node.name = r.taxonLabel;
      if (r.taxonName) node.taxonName = r.taxonName;
      if (r.img) node.imageUrl = r.img;
      if (r.article) { node.wikipediaUrl = r.article; node.enwikiTitle = enwikiTitleFromUrl(r.article); }
      if (r.sitelinks) node.sitelinks = Number(r.sitelinks);
    }
    console.log(`enriched ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
}

async function resolveRedirects(taxa: RawTaxon[]): Promise<void> {
  const withTitle = taxa.filter((t) => t.enwikiTitle);
  const BATCH = 50;
  for (let i = 0; i < withTitle.length; i += BATCH) {
    const batch = withTitle.slice(i, i + BATCH);
    const titles = batch.map((t) => t.enwikiTitle!).join("|");
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&redirects=1&format=json&titles=" +
      encodeURIComponent(titles);
    // Advisory pass: a network/parse failure here must NEVER abort the harvest (enrich already
    // ran; the file isn't written yet). Swallow errors and move on — redirectTarget is optional.
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mesozooa/0.1 (dinosaur cladistics game)" } });
      if (!res.ok) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      const json = await res.json();
      const rmap = new Map<string, string>();
      for (const rd of json.query?.redirects ?? []) rmap.set(rd.from, rd.to);
      const norm = new Map<string, string>();
      for (const nz of json.query?.normalized ?? []) norm.set(nz.from, nz.to);
      for (const t of batch) {
        const key = norm.get(t.enwikiTitle!) ?? t.enwikiTitle!;
        const target = rmap.get(key);
        if (target && target !== t.enwikiTitle) t.redirectTarget = target;
      }
    } catch (e) {
      console.warn(`redirect batch ${i} failed (advisory, skipping):`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 600)); // be polite to the API
    console.log(`redirects ${Math.min(i + BATCH, withTitle.length)}/${withTitle.length}`);
  }
}

async function main() {
  const structure = await fetchStructure();
  const pruned = pruneSubtree(structure, NEORNITHES);
  // Reduce to in-scope nodes (root -> genus paths) before enrichment.
  const scoped = assembleTree(pruned, DINOSAURIA, "structural");
  const scopedIds = Object.keys(scoped.nodes);
  const byId = new Map(pruned.map((r) => [r.id, r]));
  const inScope = scopedIds.map((id) => byId.get(id)!).filter(Boolean);

  // Genus ids among the in-scope nodes drive the species fetch.
  const genusIds = inScope.filter((r) => r.rankId === RANK_GENUS).map((r) => r.id);
  const species = await fetchClusterSpecies(genusIds);

  // Enrich genera AND their child species in one pass (same query), then resolve each
  // genus's representative across its cluster and fold article/sitelinks/image onto the genus.
  const enrichable = [...inScope, ...species];
  const enrichMap = new Map(enrichable.map((r) => [r.id, r]));
  await enrich([...scopedIds, ...species.map((s) => s.id)], enrichMap);

  const speciesByGenus = new Map<string, RawTaxon[]>();
  for (const s of species) {
    const g = s.parentId;
    if (!g) continue;
    const list = speciesByGenus.get(g);
    if (list) list.push(enrichMap.get(s.id)!);
    else speciesByGenus.set(g, [enrichMap.get(s.id)!]);
  }

  let resolvedCount = 0;
  for (const r of inScope) {
    if (r.rankId !== RANK_GENUS) continue;
    const res = resolveCluster(enrichMap.get(r.id)!, speciesByGenus.get(r.id) ?? []);
    r.wikipediaUrl = res.wikipediaUrl;
    r.enwikiTitle = res.enwikiTitle;
    r.sitelinks = res.sitelinks;
    r.imageUrl = res.imageUrl;
    if (res.resolvedFrom) { r.resolvedFrom = res.resolvedFrom; resolvedCount++; }
  }

  await resolveRedirects(inScope);

  await mkdir("data", { recursive: true });
  await writeFile("data/raw-taxa.json", JSON.stringify(inScope, null, 0));
  console.log(`wrote data/raw-taxa.json (${inScope.length} taxa)`);
  console.log(`resolved via species: ${resolvedCount} genera`);
}

main().catch((e) => { console.error(e); process.exit(1); });
