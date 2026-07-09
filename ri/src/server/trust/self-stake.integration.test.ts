import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, pledges, ScootFlags } from "../db/schema.js";
import { canSelfStake, selfStake } from "./self-stake.js";
import { ROOT_USER_ID } from "./graph.js";

const SFX = `selfstake-${Date.now()}`;
let scootId: number;
const pledgeIds: number[] = [];

async function flags(userId: number): Promise<bigint> {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}

describe("self-stake bootstrap (hard-cut gate)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
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
    await db.insert(scootMembers).values({ scootId, userId: engineer.id, userFlags: String(ScootFlags.ENGINEER) });
    assert.equal(await canSelfStake(engineer.id, scootId), false);
    const r = await selfStake(engineer.id, scootId, "https://x/eng.jpg");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-permitted");
    await db.delete(scootMembers).where(eq(scootMembers.userId, engineer.id));
    await db.delete(users).where(eq(users.id, engineer.id));
  });

  it("ROOT_USER_ID + ENGINEER CAN self-stake even with STAKED already set (the real prod case: bulk-seeded STAKED, no pledge/selfie behind it — self-stake must not block on the bit alone)", async () => {
    await db.update(scootMembers).set({ userFlags: String(ScootFlags.STAKED | ScootFlags.ENGINEER) })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, ROOT_USER_ID)));
    assert.equal(await canSelfStake(ROOT_USER_ID, scootId), true);

    const r = await selfStake(ROOT_USER_ID, scootId, "https://x/rootself.jpg");
    assert.equal(r.ok, true);
    assert.equal((await flags(ROOT_USER_ID)) & ScootFlags.STAKED, ScootFlags.STAKED);

    const [pledge] = await db.select().from(pledges)
      .where(and(eq(pledges.stakerId, ROOT_USER_ID), eq(pledges.stakeeId, ROOT_USER_ID)));
    assert.ok(pledge);
    pledgeIds.push(pledge.id);
    assert.equal(pledge.selfieUrl, "https://x/rootself.jpg");
  });

  it("self-staking again once a self-pledge already exists is rejected", async () => {
    const r = await selfStake(ROOT_USER_ID, scootId, "https://x/again.jpg");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "already-staked");
  });
});
