// Shared per-user SMS "what are we in the middle of" state.
//
// SMS is stateless per-message, so any multi-turn exchange (routing confirm/undo, the
// staking ritual Q&A) parks its progress here between texts.
//
// TWO STORES, ONE TRUTH (RIM criterion 3.3, 2026-09-15):
//   sms_pending_events — append-only. THE TRUTH. One row per defer/advance/resume/displace.
//   sms_state.pending  — one slot per user. A derived snapshot, kept for the fast read.
//
// Why: the slot alone is upserted, so a second deferred flow for the same member silently
// destroyed the first, and nothing could answer "what was deferred and never resumed".
// RIM_architecture_v0.8 §3.3 names this column as its example of the disqualifier. Its own
// narrowing is equally clear that keeping the snapshot is right -- "a derived snapshot is
// required, not forbidden ... the disqualifier is about which one is THE TRUTH" -- so the
// slot stays and the log sits behind it.
//
// A displaced flow is a real loss of member intent. It is no longer silent: it is a row,
// and lostDeferrals() lists them.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { smsPendingEvents, smsState } from "../db/schema.js";

export type Pending =
  | { kind: "route_confirm"; body: string; candidates: { id: number; name: string }[] }
  | { kind: "posted"; messageId: number; roomId: number; roomName: string }
  | { kind: "stake_flow"; step: "awaiting_selfie" | "awaiting_tier"; stakingCodeId: number; stakeeId: number; stakeeName: string; selfieUrl?: string }
  | { kind: "revoke_flow"; pledgeId: number; stakeeName: string; mode: "bogus" | "confirmed_human" }
  | { kind: "self_stake_flow"; stakingCodeId: number };

export async function getPending(userId: number): Promise<Pending | null> {
  const [r] = await db.select({ p: smsState.pending }).from(smsState).where(eq(smsState.userId, userId));
  return (r?.p as Pending | undefined) ?? null;
}

// Set or clear the parked flow, recording what happened to the one that was already there.
// The log write and the snapshot write go in one transaction so the two can never disagree.
export async function setPending(userId: number, p: Pending | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ p: smsState.pending }).from(smsState).where(eq(smsState.userId, userId));
    const prior = (row?.p as Pending | undefined) ?? null;

    const events: { userId: number; event: string; kind: string | null; payload: unknown }[] = [];
    if (prior && !p) {
      events.push({ userId, event: "resume", kind: prior.kind, payload: prior });
    } else if (prior && p) {
      // Same flow moving to a later step is progress. A DIFFERENT flow overwriting it is
      // the loss this table exists to record.
      events.push(
        prior.kind === p.kind
          ? { userId, event: "advance", kind: p.kind, payload: p }
          : { userId, event: "displaced", kind: prior.kind, payload: prior },
      );
      if (prior.kind !== p.kind) events.push({ userId, event: "defer", kind: p.kind, payload: p });
    } else if (!prior && p) {
      events.push({ userId, event: "defer", kind: p.kind, payload: p });
    }
    if (events.length) await tx.insert(smsPendingEvents).values(events);

    await tx
      .insert(smsState)
      .values({ userId, pending: p })
      .onConflictDoUpdate({ target: smsState.userId, set: { pending: p, updatedAt: new Date() } });
  });
}

export interface DeferralRow {
  userId: number;
  event: string;
  kind: string | null;
  payload: unknown;
  createdAt: Date;
}

// "Deferred and never resumed" — the question a snapshot alone cannot answer. A flow is
// still parked when the newest event for that user is a defer or an advance.
export async function openDeferrals(): Promise<DeferralRow[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (user_id) user_id, event, kind, payload, created_at
    FROM sms_pending_events
    ORDER BY user_id, id DESC
  `);
  const rows = ((res as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])) as Record<string, unknown>[];
  return rows
    .map((r) => ({ userId: Number(r.user_id), event: String(r.event), kind: (r.kind as string | null) ?? null, payload: r.payload, createdAt: r.created_at as Date }))
    .filter((r) => r.event === "defer" || r.event === "advance");
}

// Flows a member parked that were destroyed by a different flow before they finished.
// Before migration 0024 these were lost with no record at all.
export async function lostDeferrals(limit = 50): Promise<DeferralRow[]> {
  const rows = await db
    .select({ userId: smsPendingEvents.userId, event: smsPendingEvents.event, kind: smsPendingEvents.kind, payload: smsPendingEvents.payload, createdAt: smsPendingEvents.createdAt })
    .from(smsPendingEvents)
    .where(eq(smsPendingEvents.event, "displaced"))
    .orderBy(desc(smsPendingEvents.id))
    .limit(limit);
  return rows as DeferralRow[];
}
