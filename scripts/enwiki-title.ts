// The enwiki article title from a canonical /wiki/<Title> URL (underscores -> spaces, decoded).
export function enwikiTitleFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/wiki\/(.+)$/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}
