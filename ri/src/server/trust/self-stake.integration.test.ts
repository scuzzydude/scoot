import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, pledges, ScootFlags } from "../db/schema.js";
import { canSelfStake, selfStake, hasSelfStaked } from "./self-stake.js";
import { recordPledge } from "./ledger.js";
import { ROOT_USER_ID } from "./graph.js";

// DATA SAFETY NOTE: ROOT_USER_ID (1) is Brandon's real production identity,
// and he has ALREADY completed a real self-stake over SMS — permanently (self-
// pledges are global per user; there's no scoot-scoped test isolation for
// this). So `selfStake(ROOT_USER_ID, ...)` will now ALWAYS report
// already-staked, forever, on this shared database. This suite must never
// query-and-revoke "whatever active self-pledge exists" for ROOT_USER_ID —
// that would be indistinguishable from destroying real data — so it doesn't
// attempt to re-exercise "a fresh completion succeeds" against the real root.
// The specific regression that guards against (self-stake must not block on
// the STAKED bit alone — only an existing self-pledge should) is instead
// verified via hasSelfStaked() directly against a SYNTHETIC, disposable user,
// which is exactly as rigorous and touches no real identity.
const SFX = `selfstake-${Date.now()}`;
let scootId: number;
const pledgeIds: number[] = [];
const userIds: number[] = [];

describe("self-stake bootstrap (hard-cut gate)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  it("ROOT_USER_ID without ENGINEER flag cannot self-stake", async () => {
    await db.insert(scootMembers).values({ scootId, userId: ROOT_USER_ID, userFlags: "0" });
    assert.equal(await canSelfStake(ROOT_USER_ID, scootId), false);
    const r = await selfStake(ROOT_USER_ID, scootId, "https://x/root.jpg");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-permitted");
  });

  it("ENGINEER flag WITHOUT being root cannot self-stake (hard cut)", async () => {
    const [engineer] = await db.insert(users).values({ username: `eng-${SFX}` }).returning({ id: users.id });
    userIds.push(engineer.id);
    await db.insert(scootMembers).values({ scootId, userId: engineer.id, userFlags: String(ScootFlags.ENGINEER) });
    assert.equal(await canSelfStake(engineer.id, scootId), false);
    const r = await selfStake(engineer.id, scootId, "https://x/eng.jpg");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-permitted");
  });

  it("ROOT_USER_ID + ENGINEER passes the gate", async () => {
    await db.update(scootMembers).set({ userFlags: String(ScootFlags.ENGINEER) })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, ROOT_USER_ID)));
    assert.equal(await canSelfStake(ROOT_USER_ID, scootId), true);
  });

  it("selfStake correctly (and permanently) reports already-staked for the real root, without mutating anything", async () => {
    assert.equal(await hasSelfStaked(ROOT_USER_ID), true);
    const r = await selfStake(ROOT_USER_ID, scootId, "https://x/should-not-be-recorded.jpg");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "already-staked");
  });

  it("hasSelfStaked is keyed off an existing self-pledge, NOT the STAKED bit (the actual regression this gate protects — verified on a synthetic, disposable user)", async () => {
    const [synthetic] = await db.insert(users).values({ username: `synthroot-${SFX}` }).returning({ id: users.id });
    userIds.push(synthetic.id);
    // STAKED bit set (simulating legacy bulk seeding), but no self-pledge yet.
    await db.insert(scootMembers).values({ scootId, userId: synthetic.id, userFlags: String(ScootFlags.STAKED) });
    assert.equal(await hasSelfStaked(synthetic.id), false);

    const p = await recordPledge({ stakerId: synthetic.id, stakeeId: synthetic.id, selfieUrl: "https://x/synth.jpg", stakingCode: "SELF" });
    pledgeIds.push(p.id);
    assert.equal(await hasSelfStaked(synthetic.id), true);
  });
});
