// Central-time helpers for deterministic schedule math (NEVER LLM — see
// memory bigmo_no_llm_time_math). Mirrors the logic in scripts/seed-sessions.ts.
// scoot_sessions stores UTC instants; the Brotherhood thinks in Central wall-clock.
export const TZ = "America/Chicago";

// Offset (local − UTC) in minutes at a given instant, per America/Chicago.
function chicagoOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour12: false, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// The UTC instant whose America/Chicago wall-clock is (y,mo,d,h,mi). DST-correct
// (two-pass fixed point around the offset).
export function centralWallToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const off = chicagoOffsetMinutes(new Date(guess));
    guess = Date.UTC(y, mo - 1, d, h, mi) - off * 60000;
  }
  return new Date(guess);
}

// Central calendar fields for a UTC instant. dow: 0=Sun..6=Sat.
export function centralYMD(d: Date): { y: number; mo: number; day: number; dow: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +parts.year, mo: +parts.month, day: +parts.day, dow: wd[parts.weekday as string] };
}
