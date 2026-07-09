// Self-stake bootstrap — Phase 4 continued (see arch/staking.md).
//
// The pledge ritual needs a starting point: the root of trust (ROOT_USER_ID)
// has nobody to stake them, since they're the base case every chain traces
// back to. Self-stake is that one-time bootstrap, HARD-GATED to a narrow
// two-factor check: you must be BOTH ROOT_USER_ID (hardcoded in trust/graph.ts)
// AND hold ScootFlags.ENGINEER. Either alone is insufficient — a future
// engineer granted ENGINEER for legitimate dev-access reasons still cannot
// self-stake unless they're also the hardcoded root; they go through the
// normal pledge ritual like anyone else.
//
// Recorded as a self-referencing pledge (stakerId === stakeeId === root) via
// the same ledger-safe recordPledge(), so it reuses the exact same
// infrastructure the normal ritual uses — no parallel bootstrap data model.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { scootMembers, ScootFlags, pledges, pledgeRevocations } from "../db/schema.js";
import { recordPledge } from "./ledger.js";
import { ROOT_USER_ID } from "./graph.js";

export async function canSelfStake(userId: number, scootId: number): Promise<boolean> {
  if (userId !== ROOT_USER_ID) return false;
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return !!m && (BigInt(m.f) & ScootFlags.ENGINEER) !== 0n;
}

export interface SelfStakeResult {
  ok: boolean;
  reason?: "not-permitted" | "already-staked";
}

// "Already done" means a self-pledge already exists — NOT whether the STAKED
// bit happens to be set. Root's bit may already be set from historical bulk
// seeding with no pledge/selfie behind it; that's exactly the gap self-stake
// exists to fill, so it must not block on the bit alone.
export async function hasSelfStaked(userId: number): Promise<boolean> {
  const [row] = await db.select({ id: pledges.id }).from(pledges)
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .where(and(eq(pledges.stakerId, userId), eq(pledges.stakeeId, userId), isNull(pledgeRevocations.id)));
  return !!row;
}

export async function selfStake(userId: number, scootId: number, selfieUrl: string, now: Date = new Date()): Promise<SelfStakeResult> {
  if (!(await canSelfStake(userId, scootId))) return { ok: false, reason: "not-permitted" };
  if (await hasSelfStaked(userId)) return { ok: false, reason: "already-staked" };

  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  const current = m ? BigInt(m.f) : 0n;
  const finalFlags = current | ScootFlags.STAKED;
  if (m) {
    await db.update(scootMembers).set({ userFlags: finalFlags.toString() })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  } else {
    await db.insert(scootMembers).values({ scootId, userId, userFlags: finalFlags.toString() });
  }

  await recordPledge({ stakerId: userId, stakeeId: userId, selfieUrl, stakingCode: "SELF" }, now);
  return { ok: true };
}
