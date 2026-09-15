// RIM criterion 3.3 — a deferred item must survive being displaced.
//
// Before migration 0024 `sms_state.pending` was one upserted slot, so a second flow for the
// same member destroyed the first with no record, and "deferred and never resumed" was
// unanswerable. These tests pin the four transitions and the two queries that answer it.
//
// Fixtures carry a unique suffix and are deleted in `after` — the host's DATABASE_URL
// points at the production database (see .claude/memory/infra_prod_db_migrations.md), and a
// test that skipped this once leaked two tenants into prod.
import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { smsPendingEvents, smsState, users } from "../db/schema.js";
import { getPending, setPending, openDeferrals, lostDeferrals } from "./pending.js";

const SFX = `pend-${Date.now()}`;
let userId: number;

const events = async () =>
  (await db.select({ event: smsPendingEvents.event, kind: smsPendingEvents.kind })
    .from(smsPendingEvents).where(eq(smsPendingEvents.userId, userId))
    .orderBy(smsPendingEvents.id)).map((r) => `${r.event}:${r.kind}`);

describe("sms pending — append-only history behind the slot (RIM 3.3)", () => {
  before(async () => {
    const [u] = await db.insert(users)
      .values({ username: `bro-${SFX}`, displayName: "Pending Bro", phone: `+1555${String(Date.now()).slice(-7)}` })
      .returning({ id: users.id });
    userId = u.id;
  });

  after(async () => {
    await db.delete(smsPendingEvents).where(eq(smsPendingEvents.userId, userId));
    await db.delete(smsState).where(eq(smsState.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("records a defer, and the snapshot still reads back", async () => {
    await setPending(userId, { kind: "self_stake_flow", stakingCodeId: 1 });
    assert.deepEqual(await events(), ["defer:self_stake_flow"]);
    assert.equal((await getPending(userId))?.kind, "self_stake_flow");
  });

  it("calls a same-kind step change an advance, not a loss", async () => {
    await setPending(userId, { kind: "stake_flow", step: "awaiting_selfie", stakingCodeId: 2, stakeeId: 3, stakeeName: "X" });
    await setPending(userId, { kind: "stake_flow", step: "awaiting_tier", stakingCodeId: 2, stakeeId: 3, stakeeName: "X", selfieUrl: "u" });
    const e = await events();
    assert.equal(e.at(-1), "advance:stake_flow");
    assert.equal(e.filter((x) => x.startsWith("displaced")).length, 1, "only the first cross-kind switch was a loss");
  });

  it("records the displaced flow — the loss that used to be silent", async () => {
    const before = (await lostDeferrals()).filter((r) => r.userId === userId).length;
    await setPending(userId, { kind: "revoke_flow", pledgeId: 9, stakeeName: "Y", mode: "bogus" });
    const lost = (await lostDeferrals()).filter((r) => r.userId === userId);
    assert.equal(lost.length, before + 1);
    assert.equal(lost[0].kind, "stake_flow", "the stake flow is what got destroyed");
    assert.equal((lost[0].payload as { step?: string }).step, "awaiting_tier", "and its progress is recoverable");
  });

  it("lists it as deferred and never resumed until it is cleared", async () => {
    const open = (await openDeferrals()).filter((r) => r.userId === userId);
    assert.equal(open.length, 1);
    assert.equal(open[0].kind, "revoke_flow");

    await setPending(userId, null);
    assert.equal((await events()).at(-1), "resume:revoke_flow");
    assert.equal((await openDeferrals()).filter((r) => r.userId === userId).length, 0);
    assert.equal(await getPending(userId), null);
  });
});
