export interface SearchEntry {
  id: string;
  name: string;
}

function normalize(s: string): string {
  // NFD splits accents into combining marks (U+0300–U+036F); strip them for accent-insensitivity.
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function createSearch(genera: SearchEntry[]): (query: string, limit?: number) => SearchEntry[] {
  const entries = genera.map((g) => ({ id: g.id, name: g.name, norm: normalize(g.name) }));
  const byName = (a: SearchEntry, b: SearchEntry) => a.name.localeCompare(b.name);

  return function search(query: string, limit = 10): SearchEntry[] {
    const q = normalize(query.trim());
    if (!q) return [];
    const prefix: SearchEntry[] = [];
    const substr: SearchEntry[] = [];
    for (const e of entries) {
      const idx = e.norm.indexOf(q);
      if (idx === 0) prefix.push({ id: e.id, name: e.name });
      else if (idx > 0) substr.push({ id: e.id, name: e.name });
    }
    prefix.sort(byName);
    substr.sort(byName);
    return [...prefix, ...substr].slice(0, limit);
  };
}
