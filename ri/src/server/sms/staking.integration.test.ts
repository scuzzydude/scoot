import "dotenv/config";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, stakingCodes, pledges, ScootFlags, type User } from "../db/schema.js";
import { tryHandleStakeRequest, tryHandleStakerFlow } from "./staking.js";

const SFX = `stake-${Date.now()}`;
let scootId: number;
let stakerId: number;
let staker2Id: number; // a second, unstaked user for negative tests

async function membership(userId: number) {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}
async function getUser(id: number): Promise<User> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u!;
}
function newPhone(): string {
  return `+1559${(Date.now() + Math.floor(Math.random() * 10000)).toString().slice(-7)}`;
}

const createdProspectIds: number[] = [];

describe("Phase 4 staking ritual (SMS Q&A)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
    const [s] = await db.insert(users).values({ username: `staker-${SFX}`, phone: newPhone() }).returning({ id: users.id });
    stakerId = s.id;
    await db.insert(scootMembers).values({ scootId, userId: stakerId, userFlags: String(ScootFlags.STAKED) });
    const [s2] = await db.insert(users).values({ username: `unstaked-${SFX}` }).returning({ id: users.id });
    staker2Id = s2.id; // deliberately no scoot_members row → not staked
  });

  after(async () => {
    const allIds = [stakerId, staker2Id, ...createdProspectIds];
    // pledges has no cascade from users — must clear explicitly before deleting users
    await db.delete(pledges).where(inArray(pledges.stakerId, allIds));
    // deleting users cascades scoot_members / staking_codes / sms_state (all onDelete: cascade)
    await db.delete(users).where(inArray(users.id, allIds));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  async function requestCode(): Promise<{ phone: string; code: string; userId: number }> {
    const phone = newPhone();
    const reply = await tryHandleStakeRequest(phone, scootId, "stake");
    const code = reply!.match(/code is (\d{5})/)![1];
    const prospect = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    createdProspectIds.push(prospect!.id);
    return { phone, code, userId: prospect!.id };
  }

  it("tryHandleStakeRequest: 'stake' from a brand-new phone creates a placeholder user + issues a code", async () => {
    const phone = newPhone();
    const reply = await tryHandleStakeRequest(phone, scootId, "stake");
    assert.match(reply ?? "", /staking code is \d{5}/);
    const prospect = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    assert.ok(prospect);
    createdProspectIds.push(prospect!.id);
    const [code] = await db.select().from(stakingCodes).where(eq(stakingCodes.userId, prospect!.id));
    assert.equal(code.used, false);
  });

  it("tryHandleStakeRequest: non-matching text returns null (falls through)", async () => {
    assert.equal(await tryHandleStakeRequest(newPhone(), scootId, "hello there"), null);
  });

  it("tryHandleStakeRequest: an already-staked user is told so, no new code issued", async () => {
    const staker = await getUser(stakerId);
    const reply = await tryHandleStakeRequest(staker.phone!, scootId, "stake me");
    assert.match(reply ?? "", /already staked/i);
  });

  it("tryHandleStakerFlow: an unstaked sender cannot start a stake", async () => {
    const { code } = await requestCode();
    const unstaked = await getUser(staker2Id);
    const reply = await tryHandleStakerFlow(unstaked, scootId, `stake ${code}`, false, undefined);
    assert.match(reply ?? "", /need to be staked yourself/i);
  });

  it("tryHandleStakerFlow: an invalid/unknown code is rejected", async () => {
    const staker = await getUser(stakerId);
    const reply = await tryHandleStakerFlow(staker, scootId, "stake 00000", false, undefined);
    assert.match(reply ?? "", /invalid or expired/i);
  });

  it("full happy path: start -> photo -> tier -> staked with correct flags + pledge recorded", async () => {
    const { code, userId: stakeeId } = await requestCode();
    const staker = await getUser(stakerId);

    const r1 = await tryHandleStakerFlow(staker, scootId, `stake ${code}`, false, undefined);
    assert.match(r1 ?? "", /send me a photo/i);

    // a bare re-ask while awaiting the photo
    const r2 = await tryHandleStakerFlow(staker, scootId, "", false, undefined);
    assert.match(r2 ?? "", /Almost there/i);

    const r3 = await tryHandleStakerFlow(staker, scootId, "", true, "https://example.com/selfie.jpg");
    assert.match(r3 ?? "", /senior.*og.*member/i);

    // unrecognized tier word re-asks without finalizing
    const r4 = await tryHandleStakerFlow(staker, scootId, "banana", false, undefined);
    assert.match(r4 ?? "", /didn't catch that/i);
    assert.equal(await membership(stakeeId), 0n); // still not staked

    const r5 = await tryHandleStakerFlow(staker, scootId, "og", false, undefined);
    assert.match(r5 ?? "", /now staked as an OG/i);

    const flags = await membership(stakeeId);
    assert.equal((flags & ScootFlags.STAKED) !== 0n, true);
    assert.equal((flags & ScootFlags.OG) !== 0n, true);

    const [code_] = await db.select().from(stakingCodes).where(eq(stakingCodes.code, code));
    assert.equal(code_.used, true);

    const [pledge] = await db.select().from(pledges).where(and(eq(pledges.stakerId, stakerId), eq(pledges.stakeeId, stakeeId)));
    assert.equal(pledge.selfieUrl, "https://example.com/selfie.jpg");
    assert.equal(pledge.stakingCode, code);
  });

  it("'senior' tier sets SENIOR without OG", async () => {
    const { code, userId: stakeeId } = await requestCode();
    const staker = await getUser(stakerId);
    await tryHandleStakerFlow(staker, scootId, `stake ${code}`, false, undefined);
    await tryHandleStakerFlow(staker, scootId, "", true, "https://example.com/s.jpg");
    const reply = await tryHandleStakerFlow(staker, scootId, "senior", false, undefined);
    assert.match(reply ?? "", /Senior/);
    const flags = await membership(stakeeId);
    assert.equal((flags & ScootFlags.SENIOR) !== 0n, true);
    assert.equal((flags & ScootFlags.OG) !== 0n, false);
  });

  it("'member' (or any regular synonym) sets STAKED with no age tier bit", async () => {
    const { code, userId: stakeeId } = await requestCode();
    const staker = await getUser(stakerId);
    await tryHandleStakerFlow(staker, scootId, `stake ${code}`, false, undefined);
    await tryHandleStakerFlow(staker, scootId, "", true, "https://example.com/s.jpg");
    const reply = await tryHandleStakerFlow(staker, scootId, "member", false, undefined);
    assert.match(reply ?? "", /regular member/i);
    const flags = await membership(stakeeId);
    assert.equal((flags & ScootFlags.STAKED) !== 0n, true);
    assert.equal((flags & (ScootFlags.SENIOR | ScootFlags.OG)) !== 0n, false);
  });

  it("'cancel' mid-flow abandons it without staking anyone", async () => {
    const { code, userId: stakeeId } = await requestCode();
    const staker = await getUser(stakerId);
    await tryHandleStakerFlow(staker, scootId, `stake ${code}`, false, undefined);
    const reply = await tryHandleStakerFlow(staker, scootId, "cancel", false, undefined);
    assert.match(reply ?? "", /cancelled/i);
    assert.equal(await membership(stakeeId), 0n);
    // the code is still usable (untouched) after a cancel
    const [row] = await db.select().from(stakingCodes).where(eq(stakingCodes.code, code));
    assert.equal(row.used, false);
  });

  it("an already-staked stakee's code is rejected at start", async () => {
    const { code, userId: stakeeId } = await requestCode();
    const staker = await getUser(stakerId);
    await tryHandleStakerFlow(staker, scootId, `stake ${code}`, false, undefined);
    await tryHandleStakerFlow(staker, scootId, "", true, "https://example.com/s.jpg");
    await tryHandleStakerFlow(staker, scootId, "member", false, undefined); // now staked
    void stakeeId;
    // request ANOTHER code for the same (now-staked) prospect and try again
    const prospect = await getUser(stakeeId);
    const reply1 = await tryHandleStakeRequest(prospect.phone!, scootId, "stake");
    assert.match(reply1 ?? "", /already staked/i);
  });

  it("a message with no active flow and no 'stake <code>' returns null", async () => {
    const staker = await getUser(stakerId);
    assert.equal(await tryHandleStakerFlow(staker, scootId, "hey what's up", false, undefined), null);
  });
});
