// Global outbound-SMS kill switch. Hard-gated to ROOT_USER_ID's OWN phone
// number — not a ScootFlags permission, so it can never be delegated via a
// role grant (LEADER, GYMBOSS, etc. have no say here). While active, BigMo
// sends NO outbound SMS to anyone, for any reason — no LLM chat, no command
// acks, no fan-out, no disclaimers, nothing. Every inbound text is logged and
// queued instead (sms_shutdown_queue), so nothing is lost; only "resume" from
// the same hard-gated number lifts it.
//
// Checked FIRST, before anything else in the inbound pipeline (even before a
// brand-new prospect's "stake" request) — see bigmo.ts.
//
// The row id is parametrized (defaulting to the one real singleton row) SOLELY
// so tests can exercise this against a disposable row — this literally
// controls whether the live bot responds to real incoming texts, so a test
// must never be able to flip the real switch, even for a moment.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bigmoShutdown, smsShutdownQueue, users } from "../db/schema.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import { log } from "../log.js";

export const DEFAULT_SHUTDOWN_ROW_ID = 1;

export async function isShutdownActive(rowId: number = DEFAULT_SHUTDOWN_ROW_ID): Promise<boolean> {
  const [row] = await db.select({ active: bigmoShutdown.active }).from(bigmoShutdown).where(eq(bigmoShutdown.id, rowId));
  return row?.active ?? false;
}

// Only the phone number that resolves to ROOT_USER_ID may control shutdown —
// a hard, non-delegatable check (not a flag grant). Read-only, always safe.
async function shutdownAuthority(phone: string): Promise<{ id: number } | null> {
  const u = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  return u && u.id === ROOT_USER_ID ? { id: u.id } : null;
}

export async function queueShutdownMessage(fromPhone: string, body: string, mediaUrls: string[]): Promise<void> {
  await db.insert(smsShutdownQueue).values({ fromPhone, body, mediaUrls: mediaUrls.length ? mediaUrls : undefined });
  log.warn({ fromPhone }, "sms queued during shutdown");
}

// Returns the reply if this inbound turn was fully handled here (a control
// command, or silenced-and-queued while shutdown is active), or null if
// shutdown is inactive and the caller should proceed with normal processing.
export async function tryHandleShutdownGate(
  phone: string,
  trimmed: string,
  mediaUrls: string[],
  rowId: number = DEFAULT_SHUTDOWN_ROW_ID,
): Promise<string | null> {
  const active = await isShutdownActive(rowId);
  const norm = trimmed.trim().toLowerCase();

  if (!active) {
    if (norm !== "shutdown") return null;
    const authority = await shutdownAuthority(phone);
    if (!authority) return null; // not the control number — just a stray word, let normal handling see it
    await db.update(bigmoShutdown)
      .set({ active: true, activatedBy: authority.id, activatedAt: new Date() })
      .where(eq(bigmoShutdown.id, rowId));
    log.warn({ phone, rowId }, "BigMo SMS shutdown ACTIVATED");
    return `🛑 Shutdown active — BigMo will not send any texts to anyone until you reply "resume" from this number. Incoming texts are being logged and queued, not answered.`;
  }

  // Shutdown IS active.
  if (norm === "resume") {
    const authority = await shutdownAuthority(phone);
    if (authority) {
      await db.update(bigmoShutdown).set({ active: false }).where(eq(bigmoShutdown.id, rowId));
      const queued = await db.select({ id: smsShutdownQueue.id }).from(smsShutdownQueue);
      log.warn({ phone, rowId }, "BigMo SMS shutdown LIFTED");
      return `✓ Resumed — BigMo is texting again. ${queued.length} message${queued.length === 1 ? "" : "s"} came in while shut down (logged, not replied to).`;
    }
  }

  // Active, and not a valid resume from the control number — silence + queue.
  await queueShutdownMessage(phone, trimmed, mediaUrls);
  return "";
}
