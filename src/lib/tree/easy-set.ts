// The Easy tier: ~100 dinosaurs most people can name, resolved to Q-ids by NAME at runtime
// (see tiers.ts). A name that resolves is PINNED — it bypasses every gate the other tiers apply
// (clue, image, degenerate clade, notability cap), which is what makes this list authoritative
// rather than advisory. A name that resolves to nothing is reported in `unresolved` and skipped;
// easy-set.test.ts fails the build on that, so a typo can never silently shrink the tier.
//
// CURATION RULE — pick famous dinosaurs IN COMPANY, not just famous ones. An Easy member's
// endgame is its induced terminal clade: the other Easy members nearest it. A member with no
// close relative in the set is a target the warm trail cannot narrow, so it can only be found by
// brute force or by reading the clue. Adding a relative fixes the neighbour too, so this list
// wants to be edited in pairs.
//
// Two members are knowingly marooned (Dilophosaurus, Eoraptor). Both hang directly off a giant
// clade in Wikidata with no intermediate family, so NO addition can shrink their terminal clade —
// that is a resolution gap in the source topology (#13), not a curation mistake. They are kept
// because both are too famous to cut and both are uniquely identified by their paleo clue, which
// is what makes marooned survivable in a 100-name pool.
//
// See docs/superpowers/specs/2026-08-29-difficulty-modes-design.md § Curation.
export const EASY_SET: readonly string[] = [
  "Tyrannosaurus", "Archaeopteryx", "Triceratops", "Spinosaurus",
  "Stegosaurus", "Velociraptor", "Diplodocus", "Brachiosaurus",
  "Apatosaurus", "Allosaurus", "Iguanodon", "Ankylosaurus",
  "Ceratosaurus", "Parasaurolophus", "Carnotaurus", "Argentinosaurus",
  "Compsognathus", "Albertosaurus", "Edmontosaurus",
  "Eoraptor", // marooned, kept: unique clue (see easy-set.test.ts)
  "Dilophosaurus", // marooned, kept: unique clue (see easy-set.test.ts)
  "Deinonychus", "Giganotosaurus", "Pachycephalosaurus", "Carcharodontosaurus",
  "Baryonyx", "Acrocanthosaurus", "Massospondylus", "Coelophysis",
  "Plateosaurus", "Oviraptor", "Tarbosaurus", "Abelisaurus",
  "Styracosaurus", "Megalosaurus", "Microraptor", "Troodon",
  "Gallimimus", "Herrerasaurus", "Corythosaurus", "Protoceratops",
  "Euoplocephalus", "Kentrosaurus", "Psittacosaurus", "Mamenchisaurus",
  "Barosaurus", "Ornithomimus", "Brontosaurus", "Gorgosaurus",
  "Lambeosaurus", "Maiasaura", "Camptosaurus", "Camarasaurus",
  "Supersaurus", "Torosaurus", "Avimimus", "Daspletosaurus",
  "Amphicoelias", "Torvosaurus", "Alamosaurus", "Therizinosaurus",
  "Pachyrhinosaurus", "Sauroposeidon", "Amargasaurus", "Struthiomimus",
  "Hesperornis", "Saurolophus", "Hypsilophodon", "Ouranosaurus",
  "Deinocheirus", "Edmontonia", "Dromaeosaurus", "Tuojiangosaurus",
  "Heterodontosaurus", "Suchomimus", "Achillobator", "Staurikosaurus",
  "Shantungosaurus", "Centrosaurus", "Utahraptor", "Irritator",
  "Gigantoraptor", "Giraffatitan", "Scelidosaurus", "Dilong",
  "Sinornithosaurus", "Sinosauropteryx", "Barapasaurus", "Huayangosaurus",
  "Afrovenator", "Confuciusornis", "Majungasaurus", "Chasmosaurus",
  "Saltasaurus", "Alioramus", "Mapusaurus", "Mononykus",
  "Yutyrannus",
  "Procompsognathus", // added: gives Coelophysis a neighbour (Coelophysidae), 49 -> 2
  "Shuvuuia", // added: gives Mononykus a neighbour (Mononykini), 30 -> 2
];
