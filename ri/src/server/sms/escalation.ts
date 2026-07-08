// GYMBOSS schedule-conflict escalation — §6 of arch/sms-rooms.md.
//
// "Hazards & conflicts never auto-clear." When a GYMBOSS confirm/cancel would
// REVERSE another GYMBOSS's recent opposite change to the same session, BigMo
// does NOT silently flip it. It opens a poll: texts every GYMBOSS a Y/N and only
// applies the change on the first decisive reply. State lives in
// schedule_verifications (scoot-level), not sms_state (per-user).
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { scootSessions, scootMembers, scheduleVerifications, users, ScootFlags, type ScootSession } from "../db/schema.js";
import { throttledSend } from "./send.js";
import { log } from "../log.js";

const CONFLICT_WINDOW_MS = 6 * 60 * 60 * 1000; // "recent" opposite change

export type SchedAction = "confirm" | "cancel";
const statusFor = (a: SchedAction) => (a === "cancel" ? "cancelled" : "confirmed");

// A conflict = the requested action reverses a DIFFERENT gymboss's opposite
// change made within the window. (Re-affirming your own / a stale change is fine.)
export function isConflict(session: ScootSession, action: SchedAction, userId: number, now: number): boolean {
  if (!session.updatedBy || session.updatedBy === userId || !session.updatedAt) return false;
  if (now - session.updatedAt.getTime() > CONFLICT_WINDOW_MS) return false;
  const opposite = action === "cancel" ? "confirmed" : "cancelled";
  return session.status === opposite;
}

// GYMBOSS members of a Scoot with a phone (optionally excluding one user).
async function gymbossPhones(scootId: number, excludeUserId?: number) {
  const rows = await db
    .select({ userId: scootMembers.userId, phone: users.phone, name: users.displayName, username: users.username, flags: scootMembers.userFlags })
    .from(scootMembers)
    .innerJoin(users, eq(users.id, scootMembers.userId))
    .where(and(eq(scootMembers.scootId, scootId), excludeUserId != null ? ne(scootMembers.userId, excludeUserId) : undefined));
  return rows.filter((r) => r.phone && (BigInt(r.flags) & ScootFlags.GYMBOSS) !== 0n);
}

// Is this sender a GYMBOSS?
export function isGymboss(stake: bigint | null): boolean {
  return stake !== null && (stake & ScootFlags.GYMBOSS) !== 0n;
}

// If applying `action` to `session` conflicts, open a verification + poll the
// other GYMBOSSes and return the requester's ack. Returns null when there's no
// conflict (caller applies the change normally). `now` injectable for tests.
export async function escalateIfConflict(
  scootId: number,
  session: ScootSession,
  action: SchedAction,
  requesterId: number,
  describe: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!isConflict(session, action, requesterId, now.getTime())) return null;

  const [requester] = await db.select({ name: users.displayName, username: users.username })
    .from(users).where(eq(users.id, requesterId));
  const requesterName = requester?.name ?? requester?.username ?? `user ${requesterId}`;

  // don't stack polls for the same session
  const [open] = await db.select({ id: scheduleVerifications.id }).from(scheduleVerifications)
    .where(and(eq(scheduleVerifications.sessionId, session.id), eq(scheduleVerifications.status, "open")));
  const question = `⚠️ ${requesterName} wants to ${action.toUpperCase()} ${describe}, which reverses a recent change. Reply YES to approve or NO to reject.`;
  if (!open) {
    await db.insert(scheduleVerifications).values({ scootId, sessionId: session.id, requestedBy: requesterId, action, question });
    const recipients = await gymbossPhones(scootId, requesterId);
    for (const r of recipients) void throttledSend(r.phone!, question);
    log.info({ scootId, sessionId: session.id, action, polled: recipients.length }, "gymboss conflict → poll opened");
  }
  return `That conflicts with another GYMBOSS's recent change. I've asked the other GYMBOSSes to confirm — I'll apply it as soon as one replies YES.`;
}

// A gymboss's inbound "yes"/"no" resolves the oldest open poll for their Scoot.
// Returns the ack when it resolved a poll, or null (not a verify reply / none open).
export async function tryResolveVerification(
  userId: number,
  scootId: number,
  body: string,
  stake: bigint | null,
  now: Date = new Date(),
): Promise<string | null> {
  if (!isGymboss(stake)) return null;
  const m = body.trim().toLowerCase();
  const yes = /^(y|yes|yeah|yep|approve|ok|okay)$/.test(m);
  const no = /^(n|no|nope|reject|deny)$/.test(m);
  if (!yes && !no) return null;

  const [poll] = await db.select().from(scheduleVerifications)
    .where(and(eq(scheduleVerifications.scootId, scootId), eq(scheduleVerifications.status, "open")))
    .orderBy(asc(scheduleVerifications.id)).limit(1);
  if (!poll) return null; // nothing open → let this fall through to normal handling

  await db.update(scheduleVerifications)
    .set({ status: yes ? "approved" : "rejected", resolvedBy: userId, resolvedAt: now })
    .where(eq(scheduleVerifications.id, poll.id));

  if (!yes) {
    log.info({ scootId, verificationId: poll.id, by: userId }, "gymboss poll rejected");
    return `Got it — rejected. The schedule is unchanged.`;
  }
  // approved → apply the parked action
  await db.update(scootSessions)
    .set({ status: statusFor(poll.action as SchedAction), updatedBy: userId, updatedAt: now })
    .where(eq(scootSessions.id, poll.sessionId));
  log.info({ scootId, verificationId: poll.id, by: userId, action: poll.action }, "gymboss poll approved → applied");
  return `Approved — ${poll.action === "cancel" ? "CANCELLED" : "CONFIRMED"}. The change is live now.`;
}
