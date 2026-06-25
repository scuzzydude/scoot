// Verified schedule facts for BigMo, read from the authoritative scoot_sessions
// table (NOT computed). The LLM only phrases these; it never does date/time math
// and never asserts a time it wasn't given — that's what keeps a wrong time off
// a 55+ Brother's phone. Status drives voice:
//   confirmed → assert    tentative → hedge    cancelled → excluded
// See arch/sms-rooms.md and memory bigmo_no_llm_time_math.
import { and, asc, eq, gt, lte, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { scootSessions, type ScootSession } from "../db/schema.js";

const TZ = "America/Chicago";

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric",
  }).format(d);
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit",
  }).format(d);
}

// Central calendar day key (YYYY-MM-DD) for relative today/tomorrow phrasing.
function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function relativeHint(start: Date, now: Date): string {
  const k = dayKey(start);
  if (k === dayKey(now)) return " (today)";
  const tomorrow = new Date(now.getTime() + 86400000);
  if (k === dayKey(tomorrow)) return " (tomorrow)";
  return "";
}

function sessionLine(s: ScootSession): string {
  const where = s.location ? ` at ${s.location}` : "";
  const moved = s.note ? ` (${s.note})` : "";
  return `${fmtDay(s.startsAt)}, ${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)}${where}${moved}`;
}

// Reads the authoritative schedule for a Scoot and returns verified facts text.
export async function scheduleFactsForScoot(scootId: number, now: Date = new Date()): Promise<string> {
  const today = `It is currently ${fmtDay(now)} (Central time).`;

  // Session in progress right now (not cancelled).
  const [live] = await db.select().from(scootSessions).where(and(
    eq(scootSessions.scootId, scootId),
    ne(scootSessions.status, "cancelled"),
    lte(scootSessions.startsAt, now),
    gt(scootSessions.endsAt, now),
  )).orderBy(asc(scootSessions.startsAt)).limit(1);

  if (live) {
    return `${today} A session is running RIGHT NOW — ${sessionLine(live)}. It ends at ${fmtTime(live.endsAt)}.`;
  }

  // Next upcoming non-cancelled session.
  const [next] = await db.select().from(scootSessions).where(and(
    eq(scootSessions.scootId, scootId),
    ne(scootSessions.status, "cancelled"),
    gt(scootSessions.startsAt, now),
  )).orderBy(asc(scootSessions.startsAt)).limit(1);

  if (!next) {
    return `${today} There are no upcoming sessions on the schedule right now — tell the Brother you don't have the next date in front of you.`;
  }

  const line = sessionLine(next) + relativeHint(next.startsAt, now);
  if (next.status === "confirmed") {
    return `${today} Next session (CONFIRMED): ${line}.`;
  }
  // tentative → hedge: this is the standing time but nobody has confirmed the gym.
  return `${today} Next session is normally ${line}, but it has NOT been confirmed for that day yet — tell the Brother that's the standing time and to check before he drives out.`;
}

// Append verified schedule facts to a system prompt. On any DB error, inject a
// safe "unavailable" fact so BigMo hedges rather than inventing a time.
export async function withScheduleContext(systemPrompt: string, scootId: number): Promise<string> {
  let facts: string;
  try {
    facts = await scheduleFactsForScoot(scootId);
  } catch {
    facts = "Schedule data is unavailable right now — tell the Brother you can't pull up the schedule at the moment, don't guess a time.";
  }
  return `${systemPrompt}\n\n## Verified Schedule (use these facts exactly — do NOT compute dates or times yourself)\n${facts}`;
}
