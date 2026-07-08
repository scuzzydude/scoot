// Append-only pledge ledger — Phase 4 trust graph (see arch/staking.md).
//
// Pledges are immutable events: nothing may ever UPDATE or DELETE a pledge's
// core fields once inserted. Any future correction (revocation, etc.) must be a
// NEW event that references this one — never a mutation — so this table stays a
// clean, ordered log that Phase 5's scootd can later ingest as a chain genesis.
//
// Each pledge carries a contentHash: a canonical fingerprint of its immutable
// fields, computed once at insert time with an explicit (never DB-default)
// timestamp, so there's no ambiguity about exactly what got hashed. This is NOT
// a self-referential hash chain (no linking between records) — that's real
// chain-building work for scootd to do once, correctly, in C; duplicating it
// here in Postgres for a feature nobody consumes yet would be pure waste.
import { createHash } from "crypto";
import { db } from "../db/index.js";
import { pledges, type Pledge } from "../db/schema.js";

export interface PledgeInput {
  stakerId: number;
  stakeeId: number;
  selfieUrl: string;
  stakingCode: string;
}

export function pledgeContentHash(input: PledgeInput & { createdAt: Date }): string {
  const canonical = JSON.stringify({
    stakerId: input.stakerId,
    stakeeId: input.stakeeId,
    selfieUrl: input.selfieUrl,
    stakingCode: input.stakingCode,
    createdAt: input.createdAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// The ONLY sanctioned way to create a pledge — always through here, never a raw
// db.insert(pledges), so contentHash is always a trustworthy fingerprint.
export async function recordPledge(input: PledgeInput, now: Date = new Date()): Promise<Pledge> {
  const contentHash = pledgeContentHash({ ...input, createdAt: now });
  const [row] = await db.insert(pledges).values({ ...input, createdAt: now, contentHash }).returning();
  return row;
}
