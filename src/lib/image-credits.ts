export interface ImageCredit {
  author?: string;
  licenseShort?: string;
  licenseUrl?: string;
  licenseCategory?: string;
  sourceFileUrl?: string;
}
export type ImageCredits = Record<string, ImageCredit>;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&nbsp;": " ",
};

export function sanitizeArtist(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, "")                                  // strip tags
    .replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? m)             // decode known entities
    .replace(/\s+/g, " ")                                     // collapse whitespace
    .trim();
  return text.length ? text : undefined;
}

export interface CreditDisplay {
  author: string | null;
  licenseShort: string | null;
  licenseUrl: string | null;
}

export function formatCredit(credit: ImageCredit | undefined): CreditDisplay {
  const author = credit?.author?.trim() || null;
  const licenseShort = credit?.licenseShort?.trim() || null;
  const licenseUrl = licenseShort && credit?.licenseUrl?.trim() ? credit.licenseUrl.trim() : null;
  return { author, licenseShort, licenseUrl };
}
