import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, pledges, pledgeRevocations, ScootFlags } from "../db/schema.js";
import { recordPledge } from "./ledger.js";
import { revokePledge, isPledgeRevoked } from "./revocation.js";
import { traceToRoot } from "./graph.js";

const SFX = `revoke-${Date.now()}`;
let scootId: number;
const userIds: number[] = [];
const pledgeIds: number[] = [];

async function mkUser(name: string): Promise<number> {
  const [u] = await db.insert(users).values({ username: `${name}-${SFX}` }).returning({ id: users.id });
  userIds.push(u.id);
  return u.id;
}
async function membership(userId: number): Promise<bigint> {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}

describe("revokePledge (Phase 4 continued)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledgeRevocations).where(inArray(pledgeRevocations.pledgeId, pledgeIds));
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  it("clears STAKED + tier bits (only those) and records the event", async () => {
    const staker = await mkUser("staker1");
    const stakee = await mkUser("stakee1");
    await db.insert(scootMembers).values([
      { scootId, userId: staker, userFlags: String(ScootFlags.STAKED) },
      { scootId, userId: stakee, userFlags: String(ScootFlags.STAKED | ScootFlags.OG | ScootFlags.BETA) },
    ]);
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/1.jpg", stakingCode: "11111" });
    pledgeIds.push(p.id);

    const result = await revokePledge(p.id, staker, "bogus", "wasn't actually real", scootId);
    assert.equal(result.ok, true);

    const flags = await membership(stakee);
    assert.equal((flags & ScootFlags.STAKED) !== 0n, false);
    assert.equal((flags & ScootFlags.OG) !== 0n, false);
    assert.equal((flags & ScootFlags.BETA) !== 0n, true); // untouched — not a staking bit

    assert.equal(await isPledgeRevoked(p.id), true);
    const [rev] = await db.select().from(pledgeRevocations).where(eq(pledgeRevocations.pledgeId, p.id));
    assert.equal(rev.reason, "bogus");
    assert.equal(rev.note, "wasn't actually real");
    assert.equal(rev.revokedBy, staker);
  });

  it("a second revoke on the same pledge is rejected (already-revoked)", async () => {
    const staker = await mkUser("staker2");
    const stakee = await mkUser("stakee2");
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/2.jpg", stakingCode: "22222" });
    pledgeIds.push(p.id);
    const r1 = await revokePledge(p.id, staker, "bogus", null, scootId);
    assert.equal(r1.ok, true);
    const r2 = await revokePledge(p.id, staker, "bogus", null, scootId);
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, "already-revoked");
  });

  it("revoking an unknown pledge id reports not-found", async () => {
    const r = await revokePledge(999999999, 1, "confirmed_human", "test", scootId);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-found");
  });

  it("a revoked pledge no longer counts as a trust-graph edge", async () => {
    const staker = await mkUser("staker3");
    const stakee = await mkUser("stakee3");
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/3.jpg", stakingCode: "33333" });
    pledgeIds.push(p.id);

    const before1 = await traceToRoot(stakee);
    assert.equal(before1.reached, false); // staker itself isn't traceable to root in this isolated test

    await revokePledge(p.id, staker, "confirmed_human", "bad actor", scootId);
    const after1 = await traceToRoot(stakee);
    assert.equal(after1.reason, "no-pledge-on-record"); // same as if the pledge never existed
  });
});
