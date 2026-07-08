// Trust-graph SMS commands — read-only views onto the Phase 4 pledge ledger
// (see arch/staking.md, trust/graph.ts). Explicit-keyword-only, matching the
// rest of the SMS command surface (§8.3): a whole-message match, so normal
// chatter about "my pledge to get better at free throws" isn't hijacked.
import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { traceToRoot, listStakedByMe } from "../trust/graph.js";
import { log } from "../log.js";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

// "my pledges" — a staker's own recall list: who they've staked, and when.
// The direct point of the whole ritual (arch/staking.md): when someone reappears
// after years, this is how the staker jogs their memory.
async function myPledges(userId: number): Promise<string> {
  const staked = await listStakedByMe(userId);
  if (!staked.length) return "You haven't staked anyone yet.";
  const lines = staked.map((s) => `- ${s.stakeeName} (${fmtDate(s.createdAt)})`).join("\n");
  return `You've staked ${staked.length} Brother${staked.length === 1 ? "" : "s"}:\n${lines}`;
}

// "my chain" — trace this member's pledge chain back to the root of trust.
async function myChain(userId: number): Promise<string> {
  const r = await traceToRoot(userId);
  if (r.reason === "root") return "You're the root of trust — every chain traces back to you.";
  if (r.reason === "no-pledge-on-record") {
    return "You're staked, but I don't have a pledge on record connecting you to root — likely an early or manually-added member.";
  }
  if (!r.reached) return "I couldn't trace your trust chain right now.";

  const rows = await db.select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users).where(inArray(users.id, r.chain));
  const nameOf = new Map(rows.map((u) => [u.id, u.displayName ?? u.username ?? `user ${u.id}`]));
  const hops = r.chain.length - 1;
  const path = r.chain.map((id) => nameOf.get(id) ?? `user ${id}`).join(" → ");
  return `Your trust chain (${hops} hop${hops === 1 ? "" : "s"} from root): ${path}.`;
}

// Returns the reply, or null if this text isn't a trust-graph query.
export async function tryHandleTrustQuery(userId: number, trimmed: string): Promise<string | null> {
  const norm = trimmed.trim().toLowerCase();
  if (norm === "my pledges" || norm === "mypledges") {
    log.info({ userId }, "sms trust query: my pledges");
    return myPledges(userId);
  }
  if (norm === "my chain" || norm === "trace me") {
    log.info({ userId }, "sms trust query: my chain");
    return myChain(userId);
  }
  return null;
}
