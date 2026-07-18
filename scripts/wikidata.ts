const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Mesozooa/0.1 (https://github.com/; dinosaur cladistics game)";

export function qid(uri: string): string {
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : uri;
}

export async function sparql(
  query: string,
): Promise<Record<string, string | undefined>[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": UA,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`SPARQL ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.results.bindings.map((row: Record<string, { value: string }>) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) out[k] = v.value;
      return out;
    });
  }
  throw new Error("SPARQL retries exhausted");
}
