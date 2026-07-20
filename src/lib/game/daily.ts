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
