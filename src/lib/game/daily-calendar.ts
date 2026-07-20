// Special-day daily overrides, by exact LOCAL date (YYYY-MM-DD) → genus NAME. Every name must be
// PLAYABLE (naturally or via an ALWAYS_PLAYABLE pin, #46); the build warns + omits otherwise, and
// that date falls back to the deterministic pick. The calendar never auto-pins — scheduling and
// pinning are separate deliberate acts. See docs/superpowers/specs/2026-07-20-daily-calendar-design.md.
export const DAILY_CALENDAR: Record<string, string> = {
  "2026-07-27": "Coelophysis",
  "2026-07-28": "Tawa",
  "2026-07-29": "Pentaceratops",
  "2026-07-30": "Suskityrannus",
  "2026-07-31": "Zuniceratops",
};
