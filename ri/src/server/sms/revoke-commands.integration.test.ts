import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, pledges, pledgeRevocations, ScootFlags } from "../db/schema.js";
import { recordPledge } from "../trust/ledger.js";
import { tryHandleRevokeCommand } from "./revoke-commands.js";
import { smsState } from "../db/schema.js";

const SFX = `revcmd-${Date.now()}`;
let scootId: number;
const userIds: number[] = [];
const pledgeIds: number[] = [];

async function mkUser(name: string): Promise<number> {
  const [u] = await db.insert(users).values({ username: `${name}-${SFX}`, displayName: name }).returning({ id: users.id });
  userIds.push(u.id);
  return u.id;
}
async function stakeFlags(userId: number): Promise<bigint> {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}

describe("tryHandleRevokeCommand (SMS Q&A)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledgeRevocations).where(inArray(pledgeRevocations.pledgeId, pledgeIds));
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(smsState).where(inArray(smsState.userId, userIds));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  it("non-matching text returns null (falls through)", async () => {
    const u = await mkUser("nope1");
    assert.equal(await tryHandleRevokeCommand(u, scootId, "hello", false), null);
  });

  it("staker can self-revoke their own pledge (bogus) without being a LEADER", async () => {
    const staker = await mkUser("staker1");
    const stakee = await mkUser("Stakee1");
    await db.insert(scootMembers).values({ scootId, userId: stakee, userFlags: String(ScootFlags.STAKED) });
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/a.jpg", stakingCode: "11111" });
    pledgeIds.push(p.id);

    const r1 = await tryHandleRevokeCommand(staker, scootId, "revoke Stakee1", false);
    assert.match(r1 ?? "", /Why\?/);
    assert.match(r1 ?? "", /bogus pledge/);

    const r2 = await tryHandleRevokeCommand(staker, scootId, "turned out to be someone else", false);
    assert.match(r2 ?? "", /has been revoked/i);
    assert.equal((await stakeFlags(stakee)) & ScootFlags.STAKED, 0n);

    const [rev] = await db.select().from(pledgeRevocations).where(eq(pledgeRevocations.pledgeId, p.id));
    assert.equal(rev.note, "turned out to be someone else");
  });

  it("'skip' as the reason records a null note", async () => {
    const staker = await mkUser("staker2");
    const stakee = await mkUser("Stakee2");
    await db.insert(scootMembers).values({ scootId, userId: stakee, userFlags: String(ScootFlags.STAKED) });
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/b.jpg", stakingCode: "22222" });
    pledgeIds.push(p.id);
    await tryHandleRevokeCommand(staker, scootId, "revoke Stakee2", false);
    await tryHandleRevokeCommand(staker, scootId, "skip", false);
    const [rev] = await db.select().from(pledgeRevocations).where(eq(pledgeRevocations.pledgeId, p.id));
    assert.equal(rev.note, null);
  });

  it("'cancel' mid-flow abandons without revoking", async () => {
    const staker = await mkUser("staker3");
    const stakee = await mkUser("Stakee3");
    await db.insert(scootMembers).values({ scootId, userId: stakee, userFlags: String(ScootFlags.STAKED) });
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/c.jpg", stakingCode: "33333" });
    pledgeIds.push(p.id);
    await tryHandleRevokeCommand(staker, scootId, "revoke Stakee3", false);
    const r = await tryHandleRevokeCommand(staker, scootId, "cancel", false);
    assert.match(r ?? "", /cancelled/i);
    assert.equal((await stakeFlags(stakee)) & ScootFlags.STAKED, ScootFlags.STAKED); // unchanged
  });

  it("a non-staker, non-LEADER cannot revoke someone else's pledge", async () => {
    const staker = await mkUser("staker4");
    const stakee = await mkUser("Stakee4");
    const bystander = await mkUser("bystander1");
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/d.jpg", stakingCode: "44444" });
    pledgeIds.push(p.id);
    const r = await tryHandleRevokeCommand(bystander, scootId, "revoke Stakee4", false);
    assert.match(r ?? "", /don't see anyone matching/i);
  });

  it("a LEADER CAN revoke someone else's pledge (confirmed_human path)", async () => {
    const staker = await mkUser("staker5");
    const stakee = await mkUser("Stakee5");
    const leader = await mkUser("leaderA");
    await db.insert(scootMembers).values({ scootId, userId: stakee, userFlags: String(ScootFlags.STAKED) });
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/e.jpg", stakingCode: "55555" });
    pledgeIds.push(p.id);

    const r1 = await tryHandleRevokeCommand(leader, scootId, "revoke Stakee5", true);
    assert.match(r1 ?? "", /confirmed-human admin action/);
    const r2 = await tryHandleRevokeCommand(leader, scootId, "reported as a scammer", true);
    assert.match(r2 ?? "", /has been revoked/i);
    assert.equal((await stakeFlags(stakee)) & ScootFlags.STAKED, 0n);
    const [rev] = await db.select().from(pledgeRevocations).where(eq(pledgeRevocations.pledgeId, p.id));
    assert.equal(rev.reason, "confirmed_human");
    assert.equal(rev.revokedBy, leader);
  });

  it("revoking an already-revoked pledge (via the flow) reports it cleanly", async () => {
    const staker = await mkUser("staker6");
    const stakee = await mkUser("Stakee6");
    const leader = await mkUser("leaderB");
    await db.insert(scootMembers).values({ scootId, userId: stakee, userFlags: String(ScootFlags.STAKED) });
    const p = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/f.jpg", stakingCode: "66666" });
    pledgeIds.push(p.id);
    await tryHandleRevokeCommand(staker, scootId, "revoke Stakee6", false);
    await tryHandleRevokeCommand(staker, scootId, "skip", false); // revoked now

    // leader tries the SAME pledge via findActivePledgeForStakeeName — should no longer match (already revoked)
    const r = await tryHandleRevokeCommand(leader, scootId, "revoke Stakee6", true);
    assert.match(r ?? "", /don't see anyone matching/i);
  });
});
