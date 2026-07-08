// Shared per-user SMS "what are we in the middle of" state — sms_state.pending.
// SMS is stateless per-message, so any multi-turn exchange (routing confirm/undo,
// the staking ritual Q&A) parks its progress here between texts. One column, one
// discriminated union, so unrelated flows can't silently stomp each other.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { smsState } from "../db/schema.js";

export type Pending =
  | { kind: "route_confirm"; body: string; candidates: { id: number; name: string }[] }
  | { kind: "posted"; messageId: number; roomId: number; roomName: string }
  | { kind: "stake_flow"; step: "awaiting_selfie" | "awaiting_tier"; stakingCodeId: number; stakeeId: number; stakeeName: string; selfieUrl?: string };

export async function getPending(userId: number): Promise<Pending | null> {
  const [r] = await db.select({ p: smsState.pending }).from(smsState).where(eq(smsState.userId, userId));
  return (r?.p as Pending | undefined) ?? null;
}

export async function setPending(userId: number, p: Pending | null): Promise<void> {
  await db
    .insert(smsState)
    .values({ userId, pending: p })
    .onConflictDoUpdate({ target: smsState.userId, set: { pending: p, updatedAt: new Date() } });
}
