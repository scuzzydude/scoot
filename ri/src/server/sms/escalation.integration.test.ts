import "dotenv/config";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { scoots, scootSessions, scootMembers, scheduleVerifications, users, ScootFlags, type ScootSession } from "../db/schema.js";
import { setProvider } from "./provider.js";
import type { SMSProvider, SendResult, InboundMessage } from "./provider.js";
import { isConflict, escalateIfConflict, tryResolveVerification } from "./escalation.js";

class RecordingSmsProvider implements SMSProvider {
  sent: { to: string; body: string }[] = [];
  async send(to: string, body: string): Promise<SendResult> { this.sent.push({ to, body }); return { sid: `F${this.sent.length}`, status: "queued" }; }
  validateInboundSignature(): boolean { return true; }
  parseInbound(): InboundMessage { throw new Error("nope"); }
}

const SFX = `esc-${Date.now()}`;
const NOW = new Date("2026-07-08T18:00:00Z");
const RECENT = new Date(NOW.getTime() - 60 * 60 * 1000); // 1h ago
const GYM: bigint = ScootFlags.GYMBOSS | ScootFlags.STAKED;
const MEMBER: bigint = ScootFlags.STAKED;

let scootId: number, aId: number, bId: number, sessionId: number;
let provider: RecordingSmsProvider, restore: () => void;

async function reloadSession(): Promise<ScootSession> {
  const [s] = await db.select().from(scootSessions).where(eq(scootSessions.id, sessionId));
  return s!;
}

describe("GYMBOSS conflict escalation (§6)", () => {
  before(async () => {
    process.env.SMS_SEND_GAP_MS = "0";
    provider = new RecordingSmsProvider();
    restore = setProvider(provider);
    const [a] = await db.insert(users).values({ username: `a-${SFX}`, displayName: "Anthony", phone: `+1557${(Date.now() % 10000000).toString().padStart(7, "0")}` }).returning({ id: users.id });
    const [b] = await db.insert(users).values({ username: `b-${SFX}`, displayName: "Karen", phone: `+1558${(Date.now() % 10000000).toString().padStart(7, "0")}` }).returning({ id: users.id });
    aId = a.id; bId = b.id;
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
    await db.insert(scootMembers).values([
      { scootId, userId: aId, userFlags: String(GYM) },
      { scootId, userId: bId, userFlags: String(GYM) },
    ]);
    const [s] = await db.insert(scootSessions).values({ scootId, startsAt: new Date("2026-07-14T20:30:00Z"), endsAt: new Date("2026-07-14T23:00:00Z"), status: "confirmed", updatedBy: bId, updatedAt: RECENT }).returning({ id: scootSessions.id });
    sessionId = s.id;
  });

  beforeEach(async () => {
    // reset: session confirmed by B recently, no open polls
    await db.delete(scheduleVerifications).where(eq(scheduleVerifications.scootId, scootId));
    await db.update(scootSessions).set({ status: "confirmed", updatedBy: bId, updatedAt: RECENT }).where(eq(scootSessions.id, sessionId));
    provider.sent = [];
  });

  after(async () => {
    await db.delete(scheduleVerifications).where(eq(scheduleVerifications.scootId, scootId));
    await db.delete(scootSessions).where(eq(scootSessions.id, sessionId));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await db.delete(users).where(inArray(users.id, [aId, bId]));
    restore();
    await pool.end();
  });

  it("isConflict: reversing another gymboss's recent opposite change is a conflict", async () => {
    const s = await reloadSession(); // confirmed by B
    assert.equal(isConflict(s, "cancel", aId, NOW.getTime()), true);   // A cancels B's confirm
    assert.equal(isConflict(s, "confirm", aId, NOW.getTime()), false); // re-affirm, no conflict
    assert.equal(isConflict(s, "cancel", bId, NOW.getTime()), false);  // B reversing own change
    assert.equal(isConflict(s, "cancel", aId, NOW.getTime() + 7 * 3600_000), false); // stale (>6h)
  });

  it("a conflicting cancel opens a poll and texts the other gymboss (does NOT apply yet)", async () => {
    const s = await reloadSession();
    const reply = await escalateIfConflict(scootId, s, "cancel", aId, "Tuesday", NOW);
    assert.match(reply ?? "", /asked the other GYMBOSSes/i);
    const [poll] = await db.select().from(scheduleVerifications).where(eq(scheduleVerifications.scootId, scootId));
    assert.equal(poll.status, "open");
    assert.equal(poll.action, "cancel");
    assert.equal(provider.sent.length, 1);              // B was texted
    assert.equal((await reloadSession()).status, "confirmed"); // unchanged until resolved
  });

  it("no conflict → escalate returns null (caller applies normally)", async () => {
    const s = await reloadSession();
    assert.equal(await escalateIfConflict(scootId, s, "confirm", aId, "Tuesday", NOW), null);
  });

  it("a gymboss 'yes' approves the poll and applies the change", async () => {
    const s = await reloadSession();
    await escalateIfConflict(scootId, s, "cancel", aId, "Tuesday", NOW);
    const ack = await tryResolveVerification(bId, scootId, "yes", GYM, NOW);
    assert.match(ack ?? "", /Approved/i);
    assert.equal((await reloadSession()).status, "cancelled");
  });

  it("a gymboss 'no' rejects the poll and leaves the schedule unchanged", async () => {
    const s = await reloadSession();
    await escalateIfConflict(scootId, s, "cancel", aId, "Tuesday", NOW);
    const ack = await tryResolveVerification(bId, scootId, "no", GYM, NOW);
    assert.match(ack ?? "", /rejected/i);
    assert.equal((await reloadSession()).status, "confirmed");
  });

  it("a non-gymboss Y/N and a Y/N with no open poll both fall through (null)", async () => {
    assert.equal(await tryResolveVerification(aId, scootId, "yes", MEMBER, NOW), null); // not gymboss
    assert.equal(await tryResolveVerification(bId, scootId, "yes", GYM, NOW), null);    // no open poll
  });
});
