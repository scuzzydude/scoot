import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { scoots, scootMembers, stakingCodes, ScootFlags } from "../db/schema.js";
import { tryHandleSelfStakeCommand } from "./self-stake-commands.js";
import { setPending } from "./pending.js";
import { ROOT_USER_ID } from "../trust/graph.js";

// IMPORTANT — DATA SAFETY: self-pledges are GLOBAL per user (pledges has no
// scootId — see arch/staking.md), and ROOT_USER_ID (1) is Brandon's REAL
// production identity, who has ALREADY completed a real self-stake over SMS.
// This suite must NEVER query-and-revoke "whatever active self-pledge exists"
// for ROOT_USER_ID — that would be indistinguishable from destroying real
// production data. It also means the "start fresh and complete successfully"
// path can no longer be exercised for the real root (it's permanently done —
// see trust/self-stake.integration.test.ts for why that's fine and what it
// still verifies safely via a synthetic user).
//
// This file instead verifies the SMS-layer mechanics by DIRECTLY constructing
// pending state (setPending) rather than relying on the "self stake" trigger
// to grant a fresh flow — that never touches pledges/pledgeRevocations, so
// it's safe regardless of the real root's permanent staked status.
const SFX = `sscmd-${Date.now()}`;
let scootId: number;
const codeIds: number[] = [];

async function seedPendingFlow(): Promise<void> {
  const [row] = await db.insert(stakingCodes).values({
    userId: ROOT_USER_ID, code: String(10000 + codeIds.length), expiresAt: new Date(Date.now() + 3600_000),
  }).returning({ id: stakingCodes.id });
  codeIds.push(row.id);
  await setPending(ROOT_USER_ID, { kind: "self_stake_flow", stakingCodeId: row.id });
}

describe("tryHandleSelfStakeCommand (SMS)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    // Only delete the specific codes THIS file created — never a blanket
    // query for "any staking code belonging to ROOT_USER_ID" (real data risk).
    for (const id of codeIds) await db.delete(stakingCodes).where(eq(stakingCodes.id, id));
    await setPending(ROOT_USER_ID, null); // never leave a dangling pending state behind
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

  it("'self stake' against the real (permanently already-staked) root reports so, without mutating anything", async () => {
    await db.update(scootMembers).set({ userFlags: String(ScootFlags.STAKED | ScootFlags.ENGINEER) })
      .where(eq(scootMembers.scootId, scootId));
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "self stake", false, undefined);
    assert.match(r ?? "", /already self-staked/i);
  });

  // The three tests below construct pending state DIRECTLY (bypassing the
  // "start" trigger's hasSelfStaked gate entirely), so they exercise the Q&A
  // mechanics without depending on — or touching — the real root's pledge.
  it("mid-flow: cancel abandons cleanly", async () => {
    await seedPendingFlow();
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "cancel", false, undefined);
    assert.match(r ?? "", /cancelled/i);
  });

  it("mid-flow: a text-only reply (no photo) re-prompts for a photo", async () => {
    await seedPendingFlow();
    const r = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "here", false, undefined);
    assert.match(r ?? "", /Send a photo/i);
    await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "cancel", false, undefined); // clean up
  });

  it("mid-flow: a bare photo calls through to selfStake and clears pending either way", async () => {
    await seedPendingFlow();
    const r1 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "", true, "https://x/mid-flow-test.jpg");
    // The real root is permanently already-staked, so this correctly resolves
    // to the already-staked relay — still proves the photo path calls through
    // to selfStake() and produces a coherent reply.
    assert.match(r1 ?? "", /already self-staked|now self-staked/i);
    // pending must be cleared regardless of outcome
    const r2 = await tryHandleSelfStakeCommand(ROOT_USER_ID, scootId, "", true, "https://x/should-not-reopen.jpg");
    assert.equal(r2, null);
  });
});
