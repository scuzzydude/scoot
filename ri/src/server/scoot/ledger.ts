// Scoot currency ledger — Phase 5a, DB-first (see asimov_v2.13 Scoot Primer,
// arch/spec.md "C Core Protocol"). Postgres directly via Drizzle; no C bridge,
// no scootd wiring yet — that's Phase 5b, once these transaction semantics are
// proven against real use.
//
// Two transaction types, mirroring the book's domains:
//   mint — trustee-only, unilateral, effective immediately. Creates new
//          supply directly in the trustee's own balance.
//   send — bilateral ("responsibility domain": both parties validate).
//          Proposing a send never moves balance; only an accepted response
//          does. Trustee -> member "distribution" is just a send — there's
//          no separate distribute primitive.
//
// Append-only, same contract as trust/ledger.ts: nothing here is ever
// UPDATEd or DELETEd. A send's outcome is a SEPARATE row in
// scoot_transaction_responses, never a mutation of the transaction row, so
// scootd can later replay scoot_transactions as clean chain history.
//
// Always create rows through this module — mintScoot / proposeSend /
// respondToSend — never a raw db.insert(scootTransactions).
import { createHash } from "crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  scoots,
  scootBalances,
  scootTransactions,
  scootTransactionResponses,
  type ScootTransaction,
  type ScootTransactionResponse,
} from "../db/schema.js";

export type ScootTxDecision = "accepted" | "rejected" | "cancelled";

export interface MintResult {
  ok: boolean;
  reason?: "not-found" | "not-trustee" | "invalid-amount";
  transaction?: ScootTransaction;
}

export interface ProposeSendResult {
  ok: boolean;
  reason?: "invalid-amount" | "self-send";
  transaction?: ScootTransaction;
}

export interface RespondResult {
  ok: boolean;
  reason?: "not-found" | "not-a-send" | "already-responded" | "wrong-party" | "insufficient-funds";
  response?: ScootTransactionResponse;
}

function contentHash(fields: {
  scootId: number;
  type: string;
  fromUserId: number | null;
  toUserId: number;
  amount: number;
  initiatedBy: number;
  createdAt: Date;
}): string {
  const canonical = JSON.stringify({
    scootId: fields.scootId,
    type: fields.type,
    fromUserId: fields.fromUserId,
    toUserId: fields.toUserId,
    amount: fields.amount,
    initiatedBy: fields.initiatedBy,
    createdAt: fields.createdAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// The ONLY sanctioned way to create new supply — trustee-only, immediate.
export async function mintScoot(
  scootId: number,
  trusteeId: number,
  amount: number,
  note: string | null = null,
  now: Date = new Date()
): Promise<MintResult> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "invalid-amount" };

  const [scoot] = await db.select({ trusteeId: scoots.trusteeId }).from(scoots).where(eq(scoots.id, scootId));
  if (!scoot) return { ok: false, reason: "not-found" };
  if (scoot.trusteeId !== trusteeId) return { ok: false, reason: "not-trustee" };

  const hash = contentHash({ scootId, type: "mint", fromUserId: null, toUserId: trusteeId, amount, initiatedBy: trusteeId, createdAt: now });

  const transaction = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scootTransactions)
      .values({ scootId, type: "mint", fromUserId: null, toUserId: trusteeId, amount, note, initiatedBy: trusteeId, createdAt: now, contentHash: hash })
      .returning();

    await tx
      .insert(scootBalances)
      .values({ scootId, userId: trusteeId, balance: amount, updatedAt: now })
      .onConflictDoUpdate({
        target: [scootBalances.scootId, scootBalances.userId],
        set: { balance: sqlBalancePlus(amount), updatedAt: now },
      });

    return row;
  });

  return { ok: true, transaction };
}

// Propose a transfer. Balance does NOT move until the recipient accepts via
// respondToSend — this is the book's bilateral "responsibility domain" rule.
export async function proposeSend(
  scootId: number,
  fromUserId: number,
  toUserId: number,
  amount: number,
  note: string | null = null,
  now: Date = new Date()
): Promise<ProposeSendResult> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "invalid-amount" };
  if (fromUserId === toUserId) return { ok: false, reason: "self-send" };

  const hash = contentHash({ scootId, type: "send", fromUserId, toUserId, amount, initiatedBy: fromUserId, createdAt: now });

  const [transaction] = await db
    .insert(scootTransactions)
    .values({ scootId, type: "send", fromUserId, toUserId, amount, note, initiatedBy: fromUserId, createdAt: now, contentHash: hash })
    .returning();

  return { ok: true, transaction };
}

// Accept, reject, or cancel a pending send. Only an 'accepted' decision moves
// balance — and only if the sender still has the funds at the moment of
// acceptance (funds aren't reserved at proposal time; see ledger.ts header).
export async function respondToSend(
  scootId: number,
  transactionId: number,
  respondedBy: number,
  decision: ScootTxDecision,
  now: Date = new Date()
): Promise<RespondResult> {
  return db.transaction(async (tx) => {
    const [transaction] = await tx.select().from(scootTransactions).where(eq(scootTransactions.id, transactionId));
    if (!transaction || transaction.scootId !== scootId) return { ok: false, reason: "not-found" };
    if (transaction.type !== "send" || transaction.fromUserId === null) return { ok: false, reason: "not-a-send" };

    const [existing] = await tx
      .select({ id: scootTransactionResponses.id })
      .from(scootTransactionResponses)
      .where(eq(scootTransactionResponses.transactionId, transactionId));
    if (existing) return { ok: false, reason: "already-responded" };

    if (decision === "accepted" || decision === "rejected") {
      if (respondedBy !== transaction.toUserId) return { ok: false, reason: "wrong-party" };
    } else if (decision === "cancelled") {
      if (respondedBy !== transaction.fromUserId) return { ok: false, reason: "wrong-party" };
    }

    if (decision === "accepted") {
      const [senderBalance] = await tx
        .select({ balance: scootBalances.balance })
        .from(scootBalances)
        .where(and(eq(scootBalances.scootId, transaction.scootId), eq(scootBalances.userId, transaction.fromUserId)))
        .for("update");

      if (!senderBalance || senderBalance.balance < transaction.amount) {
        return { ok: false, reason: "insufficient-funds" };
      }

      await tx
        .update(scootBalances)
        .set({ balance: sqlBalancePlus(-transaction.amount), updatedAt: now })
        .where(and(eq(scootBalances.scootId, transaction.scootId), eq(scootBalances.userId, transaction.fromUserId)));

      await tx
        .insert(scootBalances)
        .values({ scootId: transaction.scootId, userId: transaction.toUserId, balance: transaction.amount, updatedAt: now })
        .onConflictDoUpdate({
          target: [scootBalances.scootId, scootBalances.userId],
          set: { balance: sqlBalancePlus(transaction.amount), updatedAt: now },
        });
    }

    const [response] = await tx
      .insert(scootTransactionResponses)
      .values({ transactionId, decision, respondedBy, createdAt: now })
      .returning();

    return { ok: true, response };
  });
}

export async function getBalance(scootId: number, userId: number): Promise<number> {
  const [row] = await db
    .select({ balance: scootBalances.balance })
    .from(scootBalances)
    .where(and(eq(scootBalances.scootId, scootId), eq(scootBalances.userId, userId)));
  return row?.balance ?? 0;
}

export async function listTransactions(scootId: number, userId: number): Promise<ScootTransaction[]> {
  return db
    .select()
    .from(scootTransactions)
    .where(and(eq(scootTransactions.scootId, scootId), or(eq(scootTransactions.fromUserId, userId), eq(scootTransactions.toUserId, userId))));
}

function sqlBalancePlus(delta: number) {
  return sql`${scootBalances.balance} + ${delta}`;
}
