// Trust graph — Phase 4 (see arch/staking.md, social_graph_staking design memory).
// `pledges` IS the directed graph (stakerId -> stakeeId edges). Single global
// root: rocketman (user id 1) — one root staker for the whole platform, not
// per-Scoot. Traversal is cycle-safe ("often tree-like, but cycles possible" per
// the design memory) and tolerant of members who are STAKED but have no pledge
// on record — early/manually-seeded members predate this ritual; they're
// reported as untraceable, not crashed on.
import { and, desc, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import { pledges, pledgeRevocations, users, scootMembers, ScootFlags } from "../db/schema.js";

const stakerUsers = alias(users, "staker_users");
const stakeeUsers = alias(users, "stakee_users");

export const ROOT_USER_ID = 1; // rocketman — see arch/staking.md

export type TraceReason = "root" | "no-pledge-on-record" | "cycle-detected" | "max-depth-exceeded" | null;

export interface TraceResult {
  chain: number[]; // [queriedUserId, ..., root] when reached; partial otherwise
  reached: boolean;
  reason: TraceReason;
}

// Walk a user's pledge chain back toward ROOT_USER_ID via the most recent
// pledge on each hop. Returns the full chain (queried user first) and whether
// it successfully reached root.
export async function traceToRoot(userId: number, maxDepth = 64): Promise<TraceResult> {
  if (userId === ROOT_USER_ID) return { chain: [ROOT_USER_ID], reached: true, reason: "root" };

  const chain = [userId];
  const visited = new Set(chain);
  let current = userId;

  while (current !== ROOT_USER_ID) {
    // A revoked pledge no longer counts as a valid trust edge — same as if it
    // never happened.
    const [edge] = await db.select({ stakerId: pledges.stakerId }).from(pledges)
      .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
      .where(and(eq(pledges.stakeeId, current), isNull(pledgeRevocations.id)))
      .orderBy(desc(pledges.id)).limit(1);
    if (!edge) return { chain, reached: false, reason: "no-pledge-on-record" };
    if (visited.has(edge.stakerId)) return { chain, reached: false, reason: "cycle-detected" };
    chain.push(edge.stakerId);
    visited.add(edge.stakerId);
    current = edge.stakerId;
    if (chain.length > maxDepth) return { chain, reached: false, reason: "max-depth-exceeded" };
  }
  return { chain, reached: true, reason: null };
}

// Depth from root (0 = root itself), or null if the chain doesn't reach root.
export async function depthFromRoot(userId: number): Promise<number | null> {
  const r = await traceToRoot(userId);
  return r.reached ? r.chain.length - 1 : null;
}

export interface StakedPledge {
  pledgeId: number;
  stakeeId: number;
  stakeeName: string;
  selfieUrl: string;
  createdAt: Date;
  revoked: boolean;
}

// A staker's own "who have I staked" recall list — the design's central use
// case: when someone returns after years, the staker recognizes them via this.
// Includes revoked pledges (flagged) — still worth remembering for the staker's
// own recall, even if the stake no longer stands.
export async function listStakedByMe(stakerId: number): Promise<StakedPledge[]> {
  const rows = await db
    .select({
      pledgeId: pledges.id,
      stakeeId: pledges.stakeeId,
      displayName: users.displayName,
      username: users.username,
      selfieUrl: pledges.selfieUrl,
      createdAt: pledges.createdAt,
      revokedId: pledgeRevocations.id,
    })
    .from(pledges)
    .innerJoin(users, eq(users.id, pledges.stakeeId))
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .where(eq(pledges.stakerId, stakerId))
    .orderBy(desc(pledges.createdAt));

  return rows.map((r) => ({
    pledgeId: r.pledgeId,
    stakeeId: r.stakeeId,
    stakeeName: r.displayName ?? r.username ?? `user ${r.stakeeId}`,
    selfieUrl: r.selfieUrl,
    createdAt: r.createdAt,
    revoked: r.revokedId != null,
  }));
}

export interface PledgeMatch {
  pledgeId: number;
  stakerId: number;
  stakeeId: number;
  stakeeName: string;
}

// Find a non-revoked pledge whose stakee's name matches (case-insensitive),
// regardless of who staked them — used for the LEADER-only confirmed_human
// revoke path. Most-recent match wins if the name is ambiguous.
export async function findActivePledgeForStakeeName(name: string): Promise<PledgeMatch | null> {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const [row] = await db
    .select({
      pledgeId: pledges.id,
      stakerId: pledges.stakerId,
      stakeeId: pledges.stakeeId,
      displayName: users.displayName,
      username: users.username,
    })
    .from(pledges)
    .innerJoin(users, eq(users.id, pledges.stakeeId))
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .where(and(
      isNull(pledgeRevocations.id),
      sql`(lower(${users.displayName}) = ${needle} OR lower(${users.username}) = ${needle})`,
    ))
    .orderBy(desc(pledges.id))
    .limit(1);
  if (!row) return null;
  return { pledgeId: row.pledgeId, stakerId: row.stakerId, stakeeId: row.stakeeId, stakeeName: row.displayName ?? row.username ?? `user ${row.stakeeId}` };
}

// --- staking catalog (Phase 4 continued) -----------------------------------
// Brotherhood-public-but-restricted view of who's staked, by whom, with their
// selfie (see arch/staking.md) — "public info, but restricted" to STAKED
// members of the Scoot (gated at the route, not here).

export type Tier = "member" | "senior" | "og";

function tierFromFlags(flags: bigint): Tier {
  if ((flags & ScootFlags.OG) !== 0n) return "og";
  if ((flags & ScootFlags.SENIOR) !== 0n) return "senior";
  return "member";
}

export interface CatalogEdge {
  pledgeId: number;
  stakerId: number;
  stakerName: string;
  stakeeId: number;
  stakeeName: string;
  selfieUrl: string;
  tier: Tier;
  createdAt: Date;
}

export interface CatalogLegacyMember {
  userId: number;
  name: string;
  tier: Tier;
}

export interface TrustCatalog {
  root: { userId: number; name: string; selfieUrl: string | null };
  edges: CatalogEdge[]; // non-revoked, non-self pledges — the hierarchy proper
  legacyMembers: CatalogLegacyMember[]; // staked, no pledge on record (pre-ritual), not root
}

// Full catalog for a Scoot: the root (+ their self-stake selfie if any), every
// live (non-revoked) staking pledge with the stakee's current tier, and staked
// members who predate the ritual and have no traceable pledge at all.
export async function getTrustCatalog(scootId: number): Promise<TrustCatalog> {
  const [rootUser] = await db.select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users).where(eq(users.id, ROOT_USER_ID));
  const [rootSelfPledge] = await db.select({ selfieUrl: pledges.selfieUrl }).from(pledges)
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .where(and(eq(pledges.stakerId, ROOT_USER_ID), eq(pledges.stakeeId, ROOT_USER_ID), isNull(pledgeRevocations.id)))
    .orderBy(desc(pledges.id)).limit(1);

  const edgeRows = await db.select({
    pledgeId: pledges.id,
    stakerId: pledges.stakerId,
    stakerDisplayName: stakerUsers.displayName,
    stakerUsername: stakerUsers.username,
    stakeeId: pledges.stakeeId,
    stakeeDisplayName: stakeeUsers.displayName,
    stakeeUsername: stakeeUsers.username,
    selfieUrl: pledges.selfieUrl,
    createdAt: pledges.createdAt,
    stakeeFlags: scootMembers.userFlags,
  })
    .from(pledges)
    .innerJoin(stakerUsers, eq(stakerUsers.id, pledges.stakerId))
    .innerJoin(stakeeUsers, eq(stakeeUsers.id, pledges.stakeeId))
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .leftJoin(scootMembers, and(eq(scootMembers.userId, pledges.stakeeId), eq(scootMembers.scootId, scootId)))
    .where(and(isNull(pledgeRevocations.id), ne(pledges.stakerId, pledges.stakeeId)))
    .orderBy(pledges.id);

  const edges: CatalogEdge[] = edgeRows.map((r) => ({
    pledgeId: r.pledgeId,
    stakerId: r.stakerId,
    stakerName: r.stakerDisplayName ?? r.stakerUsername ?? `user ${r.stakerId}`,
    stakeeId: r.stakeeId,
    stakeeName: r.stakeeDisplayName ?? r.stakeeUsername ?? `user ${r.stakeeId}`,
    selfieUrl: r.selfieUrl,
    tier: tierFromFlags(r.stakeeFlags ? BigInt(r.stakeeFlags) : 0n),
    createdAt: r.createdAt,
  }));

  // staked members with no non-revoked pledge naming them as stakee, excluding root
  const tracedStakeeIds = await db.select({ stakeeId: pledges.stakeeId }).from(pledges)
    .leftJoin(pledgeRevocations, eq(pledgeRevocations.pledgeId, pledges.id))
    .where(and(isNull(pledgeRevocations.id), ne(pledges.stakerId, pledges.stakeeId)));
  const tracedIds = tracedStakeeIds.map((r) => r.stakeeId);

  const legacyRows = await db.select({
    userId: users.id, displayName: users.displayName, username: users.username, flags: scootMembers.userFlags,
  })
    .from(scootMembers)
    .innerJoin(users, eq(users.id, scootMembers.userId))
    .where(and(
      eq(scootMembers.scootId, scootId),
      sql`(${scootMembers.userFlags}::bigint & ${Number(ScootFlags.STAKED)}) != 0`,
      ne(scootMembers.userId, ROOT_USER_ID),
      tracedIds.length ? notInArray(scootMembers.userId, tracedIds) : sql`true`,
    ));

  const legacyMembers: CatalogLegacyMember[] = legacyRows.map((r) => ({
    userId: r.userId,
    name: r.displayName ?? r.username ?? `user ${r.userId}`,
    tier: tierFromFlags(BigInt(r.flags)),
  }));

  return {
    root: {
      userId: ROOT_USER_ID,
      name: rootUser?.displayName ?? rootUser?.username ?? `user ${ROOT_USER_ID}`,
      selfieUrl: rootSelfPledge?.selfieUrl ?? null,
    },
    edges,
    legacyMembers,
  };
}
