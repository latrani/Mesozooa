import { TIERS, type Tier } from "../tree/tiers";

function qnum(id: string): number {
  const m = id.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

export function hashDate(s: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyAnswer(
  dateStr: string,
  pool: { id: string }[],
  calendar: Record<string, string> = {},
): string {
  // Special-day override (#44): use the scheduled id iff it's still in the playable pool. The
  // pool.some guard is defense-in-depth — the build only emits playable ids, but a committed-map /
  // pool drift (a genus later pruned) falls back cleanly rather than returning an unplayable answer.
  const override = calendar[dateStr];
  if (override && pool.some((p) => p.id === override)) return override;
  const sorted = [...pool].sort((a, b) => qnum(a.id) - qnum(b.id));
  return sorted[hashDate(dateStr) % sorted.length].id;
}

export function todayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * All three daily answers for a date, drawn together so no genus is the answer twice on one day.
 *
 * Why they have to be drawn together: the pools NEST (easy ⊆ medium ⊆ hard), so drawing each tier
 * independently would routinely land the same genus in two of them — and solving one tier would
 * hand you another for free.
 *
 * The calendar is authoritative for MEDIUM and is assigned first, so a scheduled day is never
 * evicted by distinctness; the other tiers move around it. (Per-tier scheduling needs a reshaped
 * calendar source and a pipeline run — see the slice 4 plan.)
 */
export function dailyAnswersByTier(
  dateStr: string,
  pools: Record<Tier, { id: string }[]>,
  calendar: Record<string, string> = {},
): Record<Tier, string> {
  const taken = new Set<string>();
  const answers = {} as Record<Tier, string>;

  const scheduled = calendar[dateStr];
  if (scheduled && pools.medium.some((p) => p.id === scheduled)) {
    answers.medium = scheduled;
    taken.add(scheduled);
  }

  for (const tier of TIERS) {
    if (answers[tier] !== undefined) continue;
    const remaining = pools[tier].filter((p) => !taken.has(p.id));
    // A pool emptied by exclusion falls back to its full pool: a real answer, even a repeated
    // one, beats no answer. Only reachable for degenerate pools.
    const id = dailyAnswer(dateStr, remaining.length > 0 ? remaining : pools[tier], calendar);
    answers[tier] = id;
    taken.add(id);
  }
  return answers;
}
