import "dotenv/config";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { scoots, scootSessions, users, ScootFlags } from "../db/schema.js";
import { tryHandleGymbossCommand } from "./schedule-commands.js";

const SFX = `gym-${Date.now()}`;
const NOW = new Date("2026-07-01T12:00:00Z");                    // a Wednesday
const TUE = { s: new Date("2026-07-07T20:30:00Z"), e: new Date("2026-07-07T23:00:00Z") }; // Tue 3:30–6 CDT
const SAT = { s: new Date("2026-07-11T15:00:00Z"), e: new Date("2026-07-11T17:00:00Z") }; // Sat 10–12 CDT
const GYM: bigint = ScootFlags.GYMBOSS | ScootFlags.STAKED;     // 20
const MEMBER: bigint = ScootFlags.STAKED;                       // 4

let scootId: number;
let userId: number;
let tueId: number;
let satId: number;

async function statusOf(id: number): Promise<string> {
  const [r] = await db.select({ s: scootSessions.status }).from(scootSessions).where(eq(scootSessions.id, id));
  return r!.s;
}
async function startOf(id: number): Promise<string> {
  const [r] = await db.select({ s: scootSessions.startsAt }).from(scootSessions).where(eq(scootSessions.id, id));
  return r!.s.toISOString();
}

describe("tryHandleGymbossCommand (§8.6 GYMBOSS schedule-by-SMS)", () => {
  before(async () => {
    const [u] = await db.insert(users).values({ username: `bro-${SFX}`, displayName: "Boss" }).returning({ id: users.id });
    userId = u.id;
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `Test ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
    const [t] = await db.insert(scootSessions).values({ scootId, startsAt: TUE.s, endsAt: TUE.e, location: "Fonde", status: "tentative" }).returning({ id: scootSessions.id });
    const [s] = await db.insert(scootSessions).values({ scootId, startsAt: SAT.s, endsAt: SAT.e, location: "Fonde", status: "tentative" }).returning({ id: scootSessions.id });
    tueId = t.id; satId = s.id;
  });

  beforeEach(async () => {
    // reset both sessions to their standing tentative state before each case
    await db.update(scootSessions).set({ startsAt: TUE.s, endsAt: TUE.e, status: "tentative", note: null }).where(eq(scootSessions.id, tueId));
    await db.update(scootSessions).set({ startsAt: SAT.s, endsAt: SAT.e, status: "tentative", note: null }).where(eq(scootSessions.id, satId));
  });

  after(async () => {
    await db.delete(scootSessions).where(inArray(scootSessions.id, [tueId, satId]));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("'gym' shows the next session status to a GYMBOSS", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym", GYM, NOW);
    assert.match(r ?? "", /Next:/);
    assert.match(r ?? "", /TENTATIVE/);
  });

  it("'gym confirm' confirms the next session", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym confirm", GYM, NOW);
    assert.match(r ?? "", /CONFIRMED/);
    assert.equal(await statusOf(tueId), "confirmed");
  });

  it("'gym cancel' cancels the next non-cancelled session (Tue)", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym cancel", GYM, NOW);
    assert.match(r ?? "", /CANCELLED/);
    assert.equal(await statusOf(tueId), "cancelled");
    assert.equal(await statusOf(satId), "tentative");
  });

  it("'gym cancel sat' targets the Saturday session by weekday", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym cancel sat", GYM, NOW);
    assert.match(r ?? "", /CANCELLED/);
    assert.equal(await statusOf(satId), "cancelled");
    assert.equal(await statusOf(tueId), "tentative");
  });

  it("'gym time 5pm' retimes the next session, keeping its date + duration", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym time 5pm", GYM, NOW);
    assert.match(r ?? "", /Moved to/);
    assert.equal(await startOf(tueId), "2026-07-07T22:00:00.000Z");       // 5:00pm CDT
    const [row] = await db.select({ e: scootSessions.endsAt }).from(scootSessions).where(eq(scootSessions.id, tueId));
    assert.equal(row!.e.toISOString(), "2026-07-08T00:30:00.000Z");       // +2.5h duration preserved
  });

  it("'gym time 5' (no am/pm) refuses to guess and changes nothing", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym time 5", GYM, NOW);
    assert.match(r ?? "", /won't guess|clear time/i);
    assert.equal(await startOf(tueId), TUE.s.toISOString());
  });

  it("'gym note: no parking' sets the session note", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym note: no parking on Clay St", GYM, NOW);
    assert.match(r ?? "", /Note on/);
    const [row] = await db.select({ n: scootSessions.note }).from(scootSessions).where(eq(scootSessions.id, tueId));
    assert.equal(row!.n, "no parking on Clay St");
  });

  it("a non-GYMBOSS 'gym cancel' is denied and changes nothing", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym cancel", MEMBER, NOW);
    assert.match(r ?? "", /Only a GYMBOSS/i);
    assert.equal(await statusOf(tueId), "tentative");
  });

  it("an unrecognized 'gym what time?' falls through (null) so BigMo answers", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym what time?", GYM, NOW);
    assert.equal(r, null);
  });

  it("a non-GYMBOSS plain 'gym' falls through (null)", async () => {
    const r = await tryHandleGymbossCommand(userId, scootId, "gym", MEMBER, NOW);
    assert.equal(r, null);
  });
});
