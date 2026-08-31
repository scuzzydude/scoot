// Mail-account-linking permission gate: dreamlab-domain addresses are
// linkable by any member; anything else requires Scoot LEADER. Reuses the
// exact userHasScootFlag pattern from sms/oversight.ts rather than inventing
// a new permission style.
//
// NOTE: single-Scoot deployment (same caveat as oversight.ts) — account
// linking isn't scoped to one Scoot page, so this checks LEADER in ANY Scoot
// the user belongs to, not "in this Scoot".
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { scootMembers, ScootFlags } from "../db/schema.js";

export async function userIsLeaderAnywhere(userId: number): Promise<boolean> {
  const rows = await db
    .select({ f: scootMembers.userFlags })
    .from(scootMembers)
    .where(eq(scootMembers.userId, userId));
  return rows.some((r) => (BigInt(r.f) & ScootFlags.LEADER) !== 0n);
}
