// Single source of truth for the Fonde Brotherhood standing schedule.
//
// The LLM must NEVER compute dates or times itself — this module does the
// arithmetic deterministically against the Azure NTP clock (in Central time)
// and emits verified facts. The model only phrases them warmly. This is what
// keeps a wrong time of day off a 55+ Brother's phone.

const TZ = "America/Chicago";

interface Session {
  dow: number; // 0 = Sun .. 6 = Sat
  start: number; // minutes from midnight, Central
  end: number; // minutes from midnight, Central
  label: string; // human start label, e.g. "3:30 PM"
  endLabel: string; // human end label
}

// Standing schedule — change here and both the helper and the facts update.
const SESSIONS: Session[] = [
  { dow: 2, start: 15 * 60 + 30, end: 18 * 60, label: "3:30 PM", endLabel: "6:00 PM" },
  { dow: 6, start: 10 * 60, end: 12 * 60, label: "10:00 AM", endLabel: "12:00 PM (noon)" },
];

const LOCATION = "Fonde Recreation Center, Houston";

const DOW_NAME = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTH = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Read "now" as Central wall-clock components off the (NTP-synced) system clock.
function centralNow(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    wd: wdMap[parts.weekday as string],
    mins: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// Calendar label for a date `addDays` from the given Central y/m/d.
// Noon-UTC anchor avoids DST / midnight rollover; we only read date fields.
function calendarLabel(y: number, m: number, d: number, addDays: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d + addDays, 12));
  return `${DOW_NAME[dt.getUTCDay()]}, ${MONTH[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

// Verified, pre-computed schedule facts for the LLM to phrase — never compute.
export function scheduleFacts(now: Date = new Date()): string {
  const { y, m, d, wd, mins } = centralNow(now);
  const today = `It is currently ${calendarLabel(y, m, d, 0)} (Central time).`;

  // Is a session running right now?
  const live = SESSIONS.find((s) => s.dow === wd && mins >= s.start && mins < s.end);
  if (live) {
    return `${today} A session is running RIGHT NOW — ${DOW_NAME[live.dow]} ${live.label} to ${live.endLabel} at ${LOCATION}. It ends at ${live.endLabel}.`;
  }

  // Otherwise find the next upcoming session within the next 7 days.
  for (let offset = 0; offset <= 7; offset++) {
    const dow = (wd + offset) % 7;
    const cand = SESSIONS.filter(
      (s) => s.dow === dow && (offset > 0 || s.start > mins)
    ).sort((a, b) => a.start - b.start)[0];
    if (cand) {
      const dateLabel = calendarLabel(y, m, d, offset);
      const rel = offset === 0 ? " (later today)" : offset === 1 ? " (tomorrow)" : "";
      return `${today} Next session: ${dateLabel}, ${cand.label} to ${cand.endLabel} at ${LOCATION}${rel}.`;
    }
  }
  return today;
}

export function withScheduleContext(systemPrompt: string): string {
  return `${systemPrompt}\n\n## Verified Schedule (use these facts exactly — do NOT compute dates or times yourself)\n${scheduleFacts()}`;
}
