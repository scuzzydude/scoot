import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, bigmoShutdown, smsShutdownQueue } from "../db/schema.js";
import { tryHandleShutdownGate, isShutdownActive, queueShutdownMessage } from "./shutdown.js";
import { ROOT_USER_ID } from "../trust/graph.js";

// DATA SAFETY: this literally controls whether the LIVE bot responds to real
// incoming texts. Every test below uses a disposable, isolated row id (TEST_ROW)
// — NEVER the real singleton (id=1) — so nothing here can ever flip the real
// production switch, even for a moment. The authority check itself is read-only
// (looks up a phone, compares to ROOT_USER_ID) and is safe to exercise against
// the real root's actual phone.
const TEST_ROW = Date.now() % 1000000; // disposable, collision-unlikely row id
const queueIds: number[] = [];
let rootPhone: string;
let otherId: number;
let otherPhone: string;

describe("shutdown gate (isolated test row — never touches the real singleton)", () => {
  before(async () => {
    const root = await db.query.users.findFirst({ where: eq(users.id, ROOT_USER_ID) });
    rootPhone = root!.phone!;
    const [o] = await db.insert(users).values({ username: `notroot-${Date.now()}`, phone: `+1555${Date.now().toString().slice(-7)}` }).returning({ id: users.id, phone: users.phone });
    otherId = o.id;
    otherPhone = o.phone!;
    await db.insert(bigmoShutdown).values({ id: TEST_ROW, active: false });
  });

  after(async () => {
    await db.delete(smsShutdownQueue).where(inArray(smsShutdownQueue.id, queueIds));
    await db.delete(bigmoShutdown).where(eq(bigmoShutdown.id, TEST_ROW));
    await db.delete(users).where(eq(users.id, otherId));
    await pool.end();
  });

  it("inactive: a non-root phone saying 'shutdown' is ignored (falls through, null)", async () => {
    assert.equal(await isShutdownActive(TEST_ROW), false);
    const r = await tryHandleShutdownGate(otherPhone, "shutdown", [], TEST_ROW);
    assert.equal(r, null);
    assert.equal(await isShutdownActive(TEST_ROW), false); // did NOT activate
  });

  it("inactive: ordinary text returns null regardless of sender", async () => {
    assert.equal(await tryHandleShutdownGate(rootPhone, "hey what's the schedule", [], TEST_ROW), null);
  });

  it("the root phone activates shutdown; non-root cannot", async () => {
    const r = await tryHandleShutdownGate(rootPhone, "shutdown", [], TEST_ROW);
    assert.match(r ?? "", /Shutdown active/i);
    assert.equal(await isShutdownActive(TEST_ROW), true);
  });

  it("while active: anyone's message (including root talking about something else) is silenced + queued", async () => {
    const r1 = await tryHandleShutdownGate(otherPhone, "is the game still on?", [], TEST_ROW);
    assert.equal(r1, ""); // silent — no reply at all
    const r2 = await tryHandleShutdownGate(rootPhone, "hey", [], TEST_ROW);
    assert.equal(r2, "");

    const otherRows = await db.select().from(smsShutdownQueue).where(eq(smsShutdownQueue.fromPhone, otherPhone));
    assert.equal(otherRows.length, 1);
    assert.equal(otherRows[0].body, "is the game still on?");
    const rootRows = await db.select().from(smsShutdownQueue).where(eq(smsShutdownQueue.fromPhone, rootPhone));
    assert.equal(rootRows.some((r) => r.body === "hey"), true);
    queueIds.push(...otherRows.map((r) => r.id), ...rootRows.filter((r) => r.body === "hey").map((r) => r.id));
  });

  it("while active: a non-root phone saying 'resume' does NOT lift it (still silenced + queued)", async () => {
    const r = await tryHandleShutdownGate(otherPhone, "resume", [], TEST_ROW);
    assert.equal(r, "");
    assert.equal(await isShutdownActive(TEST_ROW), true); // still active
    const rows = await db.select({ id: smsShutdownQueue.id }).from(smsShutdownQueue).where(eq(smsShutdownQueue.fromPhone, otherPhone));
    queueIds.push(...rows.map((r) => r.id));
  });

  it("only the root phone saying 'resume' lifts it, reporting the queued count", async () => {
    const r = await tryHandleShutdownGate(rootPhone, "resume", [], TEST_ROW);
    assert.match(r ?? "", /Resumed/i);
    assert.match(r ?? "", /\d+ messages? came in/i);
    assert.equal(await isShutdownActive(TEST_ROW), false);
  });

  it("after resume, normal messages fall through again (null)", async () => {
    assert.equal(await tryHandleShutdownGate(otherPhone, "hello again", [], TEST_ROW), null);
  });

  it("queueShutdownMessage stores mediaUrls when present", async () => {
    await queueShutdownMessage(otherPhone, "check this out", ["https://example.com/a.jpg"]);
    const [row] = await db.select().from(smsShutdownQueue)
      .where(eq(smsShutdownQueue.body, "check this out"));
    queueIds.push(row.id);
    assert.deepEqual(row.mediaUrls, ["https://example.com/a.jpg"]);
  });
});
