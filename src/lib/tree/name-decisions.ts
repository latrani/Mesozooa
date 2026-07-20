// Curated resolutions for node-name disagreements (en label vs P225 vs enwiki title). A Q-id
// here short-circuits conflict detection — the decision IS the resolution. `note` is provenance
// (never rendered). See docs/superpowers/specs/2026-07-16-name-disagreement-resolution-design.md.
//
// Rules applied (from the audit + the live build report):
//   • enwiki adds a disambiguator ("(dinosaur)"/"(genus)") or is a binomial → use the bare genus.
//   • one field is a case-only typo (lowercase initial) → use the capitalized form.
//   • a genuine misspelling corroborated by ≥2 sources → use the correct spelling.
//   • vernacular vs scientific (bird/Aves) → scientific clade name.
//   • genus synonym-sinks (Wikipedia redirects genus→another genus) keep their OWN name for now;
//     actually MERGING them is deferred to a separate spec (needs a forced-merge-target mechanism —
//     dedupe's sitelinks-wins rule would merge some backwards, e.g. Teyuwasu/Othnielosaurus).
export const NAME_DECISIONS: Record<string, { name: string; note: string }> = {
  // ── en label typo; P225 + enwiki agree ─────────────────────────────────────────────────
  Q18510948: { name: "Carnotaurus", note: "en typo 'Carnottaurus'" },
  Q132857:   { name: "Mussaurus", note: "en typo 'Mussaurdes'" },
  Q188438:   { name: "Theropoda", note: "en 'Тheropoda' has a Cyrillic Т; P225+enwiki correct" },

  // ── P225 typo; keep en (en + enwiki agree) ──────────────────────────────────────────────
  Q134190:   { name: "Iguanodontia", note: "P225 typo 'Iguaonodontia'" },
  Q77853179: { name: "Colossosauria", note: "P225 typo 'Colososauria'" },
  Q3349337:  { name: "Odontornithes", note: "P225 typo 'Odonthornithes'" },
  Q3079242:  { name: "Rhadinosaurus", note: "P225 typo 'Rhadinososaurus'" },

  // ── case-only typo in one field → use the capitalized form ──────────────────────────────
  Q124359365: { name: "Abelisauridae", note: "en 'abelisauridae' lowercase; P225 capitalized" },
  Q124394504: { name: "Psittacosauridae", note: "P225 lowercase" },
  Q124394524: { name: "Ceratopsidae", note: "P225 lowercase" },
  Q124394526: { name: "Ornithopoda", note: "P225 lowercase" },
  Q124747590: { name: "Staurikosaurus", note: "P225 lowercase" },
  Q124748581: { name: "Ekrixinatosaurus", note: "P225 lowercase" },
  Q124748584: { name: "Elemgasem", note: "P225 lowercase" },
  Q124757234: { name: "Brachylophosaurini", note: "P225 lowercase" },
  Q124759397: { name: "Yandusaurus", note: "P225 lowercase" },
  Q124769504: { name: "Chasmosaurinae", note: "P225 lowercase" },
  Q124771737: { name: "Navajoceratops", note: "P225 lowercase" },
  Q124775780: { name: "Psittacosaurus", note: "P225 lowercase" },

  // ── enwiki has a real misspelling, en+P225 agree → use en ───────────────────────────────
  Q110923449: { name: "Euceratopsia", note: "en 'Euceratopia' typo; enwiki 'Euceratopsia' correct" },
  Q124657792: { name: "Heyuanninae", note: "en 'Heyuanniinae' double-i typo; enwiki correct" },
  Q15723432:  { name: "Hypsirophus", note: "en 'Hypsirhophus'; enwiki 'Hypsirophus' is the live article" },
  Q2154760:   { name: "Galvesaurus", note: "en 'Galveosaurus'; enwiki 'Galvesaurus' is the live article" },
  Q40752:     { name: "Gorgosaurus", note: "en 'Gordosaurus' typo; P225+enwiki 'Gorgosaurus'" },

  // ── enwiki adds a Wikipedia disambiguator → use the bare genus (en = P225) ───────────────
  Q107155305: { name: "Beg", note: "enwiki 'Beg (dinosaur)' disambiguator" },
  Q117037494: { name: "Shri", note: "enwiki 'Shri (genus)' disambiguator" },
  Q11878382:  { name: "Leptorhynchos", note: "enwiki 'Leptorhynchos (dinosaur)' disambiguator" },
  Q123012247: { name: "Qianlong", note: "enwiki 'Qianlong (genus)' disambiguator" },
  Q123478349: { name: "Gremlin", note: "enwiki 'Gremlin (genus)' disambiguator" },
  Q125925010: { name: "Tiamat", note: "enwiki 'Tiamat (dinosaur)' disambiguator" },
  Q132386:    { name: "Mei", note: "enwiki 'Mei (dinosaur)' disambiguator" },
  Q134170:    { name: "Gastonia", note: "enwiki 'Gastonia (dinosaur)' disambiguator" },
  Q140067630: { name: "Jian", note: "enwiki 'Jian (dinosaur)' disambiguator" },
  Q15966623:  { name: "Anzu", note: "enwiki 'Anzu (dinosaur)' disambiguator" },
  Q16930745:  { name: "Sankofa", note: "enwiki 'Sankofa (oogenus)' disambiguator" },
  Q192413:    { name: "Kuru", note: "enwiki 'Kuru (dinosaur)' disambiguator" },
  Q19842095:  { name: "Yi", note: "enwiki 'Yi (dinosaur)' disambiguator" },
  Q921551:    { name: "Kol", note: "enwiki 'Kol (dinosaur)' disambiguator" },
  Q28219834:  { name: "Oksoko", note: "enwiki 'Oksoko (dinosaur)' disambiguator (genus's own article)" },

  // ── enwiki is a binomial, en = P225 the genus → use the genus (no-space preference) ──────
  Q108418977: { name: "Kurupi", note: "enwiki binomial 'Kurupi itaata'" },
  Q133007:    { name: "Minmi", note: "enwiki binomial 'Minmi paravertebra'" },
  Q133109:    { name: "Miragaia", note: "enwiki binomial 'Miragaia longicollum'" },
  Q133246:    { name: "Talos", note: "enwiki binomial 'Talos sampsoni'" },
  Q134166:    { name: "Mahakala", note: "enwiki binomial 'Mahakala omnogovae'" },
  Q1439895:   { name: "Proa", note: "enwiki binomial 'Proa valdearinnoensis'" },
  Q1655422:   { name: "Haya", note: "enwiki binomial 'Haya griva'" },
  Q27439:     { name: "Dilong", note: "enwiki binomial 'Dilong paradoxus'" },
  Q61043282:  { name: "Shangyang", note: "enwiki binomial 'Shangyang graciles'" },
  Q6752264:   { name: "Manu", note: "enwiki binomial 'Manu antiquus'" },
  Q878443:    { name: "Saturnalia", note: "enwiki binomial 'Saturnalia tupiniquim'" },

  // ── enwiki is a sibling clade name that ALREADY EXISTS as its own node → keep en+P225 (renaming
  //    to the enwiki name would collide and trigger a dedupe MERGE, which is deferred) ──────────
  Q132824:   { name: "Hesperornithiformes", note: "en+P225 agree; enwiki 'Hesperornithes' is a distinct node (Q21446301) — merge deferred" },
  Q134186:   { name: "Herrerasauridae", note: "en+P225 agree; enwiki 'Herrerasauria' is a distinct node (Q10522674) — merge deferred" },

  // ── vernacular → scientific clade name ──────────────────────────────────────────────────
  Q5113:     { name: "Aves", note: "en/enwiki vernacular 'bird'; scientific clade name" },
  Q430:      { name: "Dinosauria", note: "en/enwiki vernacular 'dinosaur'; scientific root name (retires displayName hardcode)" },

  // ── P225 packs two names in one statement; keep clean en ────────────────────────────────
  Q62397920: { name: "Eutyrannosauria", note: "P225 'Eutyrannosauria, Albertosauria'; keep en" },

  // ── binomial/string → genus (from the original audit) ───────────────────────────────────
  Q131236:   { name: "Prosauropoda", note: "en 'Prosauropod'; proper clade form" },
  Q134751:   { name: "Drinker", note: "en binomial 'Drinker nisti'; use genus" },
  Q593763:   { name: "Zanabazar", note: "en binomial 'Zanabazar junior'; use genus" },
  Q6126872:  { name: "Shanshanosaurus", note: "en binomial; use genus" },
  Q5028563:  { name: "Camptodontus", note: "en is a disambiguation string; use genus" },

  // ── taxonomy calls: resolve toward the accepted taxon (label only; no merge) ─────────────
  Q131161:   { name: "Pachycephalosaurus spinifer", note: "P225 'Stygimoloch' sunk into Pachycephalosaurus" },
  Q16975532: { name: "Camarasaurus lewisi", note: "P225 'Cathetosaurus'; enwiki 'Camarasaurus lewisi'" },
  Q134591:   { name: "Becklespinax", note: "en binomial 'Altispinax dunkeri'; P225+enwiki 'Becklespinax'" },
  Q988566:   { name: "Dornraptor", note: "P225+enwiki 'Dornraptor' (Merosaurus reassigned)" },

  // ── genus synonym-sinks: keep OWN name; MERGE deferred to a separate spec ────────────────
  Q21006710: { name: "Ugrunaaluk", note: "enwiki sinks into Edmontosaurus kuukpikensis; keep own name, merge deferred" },
  Q5404650:  { name: "Proornis", note: "enwiki '\"Proornis\"' (dubious); keep own name" },
  Q1106617:  { name: "Coelosaurus", note: "species-resolved enwiki '\"Coelosaurus\" antiquus' (quoted dubious); keep bare genus" },
};
