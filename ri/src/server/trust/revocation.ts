// Pledge revocation — Phase 4 continued (see arch/staking.md).
//
// A revocation is a correction EVENT, never a mutation of the original pledge
// (the ledger's append-only contract holds — see trust/ledger.ts). At most one
// revocation per pledge (enforced by a unique constraint).
//
// Governance (Brandon's call — the design memory left this genuinely open):
//   - 'bogus'           — the staker was tricked, the prospect wasn't real/
//                          unique, or the ritual rules were broken. Freely
//                          self-service by the ORIGINAL STAKER. No gate.
//   - 'confirmed_human' — the person WAS real but the community un-vouches
//                          anyway (e.g. a later-discovered bad actor).
//                          LEADER-only — deliberately admin-only, not a
//                          multi-party consensus.
//
// Effect is scoped narrowly: clears ONLY the bits staking added (STAKED,
// SENIOR, OG) from the stakee's scoot_members row in the given Scoot. Other
// flags (BETA, GYMBOSS, LEADER, ...) are untouched. Downstream impact on the
// stakee's OWN pledges (people they in turn staked) is a deliberately deferred
// open question (per the design memory) — not touched here.
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { pledges, pledgeRevocations, scootMembers, ScootFlags } from "../db/schema.js";

export type RevokeReason = "bogus" | "confirmed_human";

export interface RevokeResult {
  ok: boolean;
  reason?: "not-found" | "already-revoked";
}

export async function isPledgeRevoked(pledgeId: number): Promise<boolean> {
  const [r] = await db.select({ id: pledgeRevocations.id }).from(pledgeRevocations).where(eq(pledgeRevocations.pledgeId, pledgeId));
  return !!r;
}

export async function revokePledge(
  pledgeId: number,
  revokedBy: number,
  reason: RevokeReason,
  note: string | null,
  scootId: number,
  now: Date = new Date(),
): Promise<RevokeResult> {
  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, pledgeId));
  if (!pledge) return { ok: false, reason: "not-found" };
  if (await isPledgeRevoked(pledgeId)) return { ok: false, reason: "already-revoked" };

  await db.insert(pledgeRevocations).values({ pledgeId, revokedBy, reason, note, createdAt: now });

  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, pledge.stakeeId)));
  if (m) {
    const cleared = BigInt(m.f) & ~(ScootFlags.STAKED | ScootFlags.SENIOR | ScootFlags.OG);
    await db.update(scootMembers).set({ userFlags: cleared.toString() })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, pledge.stakeeId)));
  }
  return { ok: true };
}
