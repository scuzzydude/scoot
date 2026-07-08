// GYMBOSS schedule-by-SMS — §8.6 of arch/sms-rooms.md.
//
// A GYMBOSS (ScootFlags.GYMBOSS) sets/clears the authoritative scoot_sessions
// over text so BigMo's read path (llm/schedule.ts) reports the truth. ALL time
// handling is deterministic here — the LLM is never in the loop for a date/time
// (the cardinal sin; see memory bigmo_no_llm_time_math).
//
// Command namespace — "gym <verb>" (avoids colliding with member "note:"/"follow"):
//   gym                     → status: what BigMo currently has for the next session
//   gym confirm [weekday]   → mark the next (or next-on-weekday) session confirmed
//   gym cancel  [weekday]   → mark it cancelled ("no ball")
//   gym time <h[:mm]am/pm>  → retime the next session (keeps its date + duration)
//   gym note: <text>        → set the session note (e.g. "no parking on Clay St")
//   gym clear               → clear the session note
//
// Verbs act only on the NEXT non-cancelled upcoming session (optionally filtered
// to a weekday). Mutations are GYMBOSS-gated; an unrecognized "gym ..." falls
// through (returns null) so a member asking "gym time?" still reaches BigMo.
import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { scootSessions, ScootFlags, type ScootSession } from "../db/schema.js";
import { TZ, centralWallToUtc, centralYMD } from "./tz.js";
import { escalateIfConflict } from "./escalation.js";
import { log } from "../log.js";

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

// Parse "5pm" / "5:30 pm" / "10am" / "17:00" → minutes since midnight, or null.
// am/pm is REQUIRED for hours ≤ 12 (a bare "5" is ambiguous → we refuse, never guess).
function parseClock(raw: string): { h: number; m: number } | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "pm" ? 12 : 0);
  } else {
    if (h > 23) return null;
    if (h <= 12) return null; // ambiguous without am/pm → refuse
  }
  return { h, m: min };
}

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(d);
}
function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
}
function fmtSession(s: ScootSession): string {
  const where = s.location ? ` at ${s.location}` : "";
  const note = s.note ? ` (${s.note})` : "";
  return `${fmtDay(s.startsAt)}, ${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}${where}${note}`;
}

// The next non-cancelled upcoming session (optionally the next one on `weekday`).
async function pickSession(scootId: number, weekday: number | null, now: Date): Promise<ScootSession | null> {
  const rows = await db.select().from(scootSessions).where(and(
    eq(scootSessions.scootId, scootId),
    ne(scootSessions.status, "cancelled"),
    gt(scootSessions.startsAt, now),
  )).orderBy(asc(scootSessions.startsAt));
  if (weekday == null) return rows[0] ?? null;
  return rows.find((r) => centralYMD(r.startsAt).dow === weekday) ?? null;
}

// A trailing weekday token ("gym cancel sat") → dow, plus the residual text.
function splitWeekday(rest: string): { weekday: number | null; head: string } {
  const parts = rest.trim().split(/\s+/);
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  if (last in WEEKDAYS && parts.length > 0) {
    return { weekday: WEEKDAYS[last], head: parts.slice(0, -1).join(" ") };
  }
  return { weekday: null, head: rest.trim() };
}

export interface GymbossResult { reply: string; sessionId?: number; }

// Handle an inbound as a GYMBOSS "gym ..." command. Returns the ack string when
// claimed, or null when it isn't a recognized gym command (→ caller falls through
// to routing/BigMo). now is injectable for tests.
export async function tryHandleGymbossCommand(
  userId: number,
  scootId: number,
  body: string,
  stake: bigint | null,
  now: Date = new Date(),
): Promise<string | null> {
  const m = body.trim().match(/^gym\b\s*([\s\S]*)$/i);
  if (!m) return null;
  const rest = m[1].trim();
  const isGymboss = stake !== null && (stake & ScootFlags.GYMBOSS) !== 0n;

  // Classify the verb first, so an unrecognized "gym ..." can fall through to BigMo
  // (a member's "gym time?" isn't hijacked) BEFORE we ever gate on the flag.
  const noteM = rest.match(/^note\b\s*:?\s*([\s\S]*)$/i);
  const timeM = rest.match(/^(?:time|move|at)\s+([\s\S]+)$/i);
  let verb: "status" | "confirm" | "cancel" | "clear" | "note" | "time" | null = null;
  if (rest === "" || /^status$/i.test(rest)) verb = "status";
  else if (/^confirm\b/i.test(rest)) verb = "confirm";
  else if (/^cancel\b/i.test(rest)) verb = "cancel";
  else if (/^clear\b/i.test(rest)) verb = "clear";
  else if (noteM) verb = "note";
  else if (timeM) verb = "time";
  if (verb === null) return null; // not a gym command → BigMo handles it

  // status is a read; a non-GYMBOSS asking "gym" just talks to BigMo instead.
  if (verb === "status" && !isGymboss) return null;
  if (!isGymboss) {
    return `Only a GYMBOSS can set the schedule. (To post to your group, text "note: <message>".)`;
  }

  const { weekday } = splitWeekday(verb === "confirm" || verb === "cancel" ? rest.replace(/^\w+\s*/, "") : "");
  const target = await pickSession(scootId, weekday, now);

  if (verb === "status") {
    return target
      ? `Next: ${fmtSession(target)} — status ${target.status.toUpperCase()}. Text "gym confirm" / "gym cancel" / "gym time 5pm" / "gym note: ...".`
      : `No upcoming session on the schedule. (The seeder fills the standing pattern; nothing to confirm right now.)`;
  }

  if (!target) {
    const wd = weekday != null ? " on that day" : "";
    return `I don't see an upcoming session${wd} to change. Text "gym" to see what's on the schedule.`;
  }

  const stamp = { updatedBy: userId, updatedAt: now };

  switch (verb) {
    case "confirm": {
      const escalated = await escalateIfConflict(scootId, target, "confirm", userId, fmtDay(target.startsAt), now);
      if (escalated) return escalated;
      await db.update(scootSessions).set({ status: "confirmed", ...stamp }).where(eq(scootSessions.id, target.id));
      log.info({ userId, scootId, sessionId: target.id }, "gymboss confirm");
      return `✓ CONFIRMED: ${fmtSession(target)}. Brothers who ask will now hear it's ON.`;
    }
    case "cancel": {
      const escalated = await escalateIfConflict(scootId, target, "cancel", userId, fmtDay(target.startsAt), now);
      if (escalated) return escalated;
      await db.update(scootSessions).set({ status: "cancelled", ...stamp }).where(eq(scootSessions.id, target.id));
      log.info({ userId, scootId, sessionId: target.id }, "gymboss cancel");
      return `✓ CANCELLED: ${fmtSession(target)}. Brothers who ask will now hear there's no ball then.`;
    }
    case "note": {
      const text = (noteM?.[1] ?? "").trim();
      if (!text) return `What's the note? Text "gym note: no parking on Clay St".`;
      await db.update(scootSessions).set({ note: text, ...stamp }).where(eq(scootSessions.id, target.id));
      log.info({ userId, scootId, sessionId: target.id }, "gymboss note set");
      return `✓ Note on ${fmtDay(target.startsAt)}: "${text}". Brothers asking about that session will hear it.`;
    }
    case "clear": {
      await db.update(scootSessions).set({ note: null, ...stamp }).where(eq(scootSessions.id, target.id));
      log.info({ userId, scootId, sessionId: target.id }, "gymboss note clear");
      return `✓ Cleared the note on ${fmtDay(target.startsAt)}.`;
    }
    case "time": {
      const clock = parseClock(timeM?.[1] ?? "");
      if (!clock) {
        return `I need a clear time like "gym time 5pm" or "gym time 5:30pm" (include am/pm). I won't guess a time.`;
      }
      // Keep the session's Central calendar date + duration; move only the clock.
      const { y, mo, day } = centralYMD(target.startsAt);
      const durationMs = target.endsAt.getTime() - target.startsAt.getTime();
      const newStart = centralWallToUtc(y, mo, day, clock.h, clock.m);
      const newEnd = new Date(newStart.getTime() + durationMs);
      await db.update(scootSessions)
        .set({ startsAt: newStart, endsAt: newEnd, ...stamp })
        .where(eq(scootSessions.id, target.id));
      log.info({ userId, scootId, sessionId: target.id, newStart: newStart.toISOString() }, "gymboss retime");
      const updated = { ...target, startsAt: newStart, endsAt: newEnd } as ScootSession;
      return `✓ Moved to ${fmtTime(newStart)}: ${fmtSession(updated)}. (Still ${target.status === "confirmed" ? "CONFIRMED" : "tentative — text \"gym confirm\" to lock it in"}.)`;
    }
  }
  return null;
}
