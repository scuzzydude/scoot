import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { scoots, scootMembers, pledges, ScootFlags, smsState } from "../db/schema.js";
import { tryHandleSelfStakeCommand } from "./self-stake-commands.js";
import { ROOT_USER_ID } from "../trust/graph.js";

const SFX = `sscmd-${Date.now()}`;
let scootId: number;
const pledgeIds: number[] = [];

async function flags(userId: number): Promise<bigint> {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}

// NOTE: self-pledges are GLOBAL per user (pledges has no scootId — see
// arch/staking.md), so once ROOT_USER_ID successfully self-stakes ANYWHERE in
// this test run, every subsequent attempt reports "already self-staked". Tests
// below are ordered deliberately: cancel (doesn't complete) must run BEFORE the
// one test that actually finishes the flow.
describe("tryHandleSelfStakeCommand (SMS)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(smsState).where(eq(smsState.userId, ROOT_USER_ID));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  it("non-matching text returns null (falls through)", async () => {
    assert.equal(await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "hello", false, undefined), null);
  });

  it("without ENGINEER flag, 'self stake' is denied", async () => {
    await db.insert(scootMembers).values({ scootId, userId: ROOT_USER_ID, userFlags: "0" });
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "self stake", false, undefined);
    assert.match(r ?? "", /Only the root engineer/i);
  });

  it("cancel mid-flow abandons without self-staking", async () => {
    await db.update(scootMembers).set({ userFlags: String(ScootFlags.STAKED | ScootFlags.ENGINEER) })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, ROOT_USER_ID)));
    const r1 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "self stake", false, undefined);
    assert.match(r1 ?? "", /self-stake code is \d{5}/);
    const r2 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "cancel", false, undefined);
    assert.match(r2 ?? "", /cancelled/i);
    // still not staked
    assert.equal((await flags(ROOT_USER_ID)) & ScootFlags.STAKED, ScootFlags.STAKED); // bit was already set above, unrelated to self-stake
    const [pledge] = await db.select().from(pledges)
      .where(and(eq(pledges.stakerId, ROOT_USER_ID), eq(pledges.stakeeId, ROOT_USER_ID)));
    assert.equal(pledge, undefined); // no self-pledge recorded
  });

  it("a text-only reply mid-flow (no photo) re-prompts, doesn't finalize", async () => {
    await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "self stake", false, undefined);
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "here", false, undefined);
    assert.match(r ?? "", /Send a photo/i);
    await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "cancel", false, undefined); // clean up the pending state
  });

  it("full flow: 'self stake' issues a code, a bare photo completes it", async () => {
    const r1 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "self stake", false, undefined);
    assert.match(r1 ?? "", /self-stake code is \d{5}/);

    const r2 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "", true, "https://x/root-sms.jpg");
    assert.match(r2 ?? "", /now self-staked/i);

    assert.equal((await flags(ROOT_USER_ID)) & ScootFlags.STAKED, ScootFlags.STAKED);
    const [pledge] = await db.select().from(pledges)
      .where(and(eq(pledges.stakerId, ROOT_USER_ID), eq(pledges.stakeeId, ROOT_USER_ID)));
    assert.ok(pledge);
    pledgeIds.push(pledge.id);
    assert.equal(pledge.selfieUrl, "https://x/root-sms.jpg");
  });

  it("'self stake' again reports already done, no new code issued", async () => {
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "selfstake", false, undefined);
    assert.match(r ?? "", /already self-staked/i);
  });
});
