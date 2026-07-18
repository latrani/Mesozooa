# Generated data

Do not edit by hand. Regenerate with:

    npm run fetch:wikidata   # -> data/raw-taxa.json (gitignored; incl. sitelinks)
    npm run fetch:pbdb       # -> data/raw-pbdb.json (gitignored; age + location)
    npm run build:data       # -> src/data/tree.json, genera-index.json, genus-attributes.json

`tree.json` is the full Mesozoic cladogram (reference pool); genera carry `sitelinks`.
`genera-index.json` is the notability-pruned playable pool (≤ CAP=7 per terminal set).
`genus-attributes.json` holds the paleo clue (age + discovery location) for each playable
genus. See docs/superpowers/specs for design.
