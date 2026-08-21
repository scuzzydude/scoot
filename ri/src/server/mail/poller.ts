// BigMo's periodic mailbox check — polls one IMAP mailbox/folder for mail
// newer than the last check and texts ROOT_USER_ID (Brandon) a summary.
// Optional feature: disabled unless IMAP_HOST is set, same pattern as
// MEMORY_VAULT_URL. State survives restarts via mail_check_state.lastUid,
// which is a monotonic per-folder counter — unaffected by read/unread state
// on Brandon's own mail client, unlike an "unseen" search would be.
import { ImapFlow } from "imapflow";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailCheckState, smsDeliveries, users } from "../db/schema.js";
import { throttledSend } from "../sms/send.js";
import { isShutdownActive } from "../sms/shutdown.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import { log } from "../log.js";

const MAILBOX = process.env.IMAP_MAILBOX ?? "INBOX";
const MAX_SUBJECTS_IN_TEXT = 3;

function imapConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user, pass },
    logger: false as const,
  };
}

function summarize(messages: { from: string; subject: string }[]): string {
  const shown = messages.slice(0, MAX_SUBJECTS_IN_TEXT);
  const lines = shown.map((m) => `• ${m.from}: ${m.subject || "(no subject)"}`);
  const more = messages.length - shown.length;
  const header = `📧 ${messages.length} new email${messages.length === 1 ? "" : "s"} (${MAILBOX})`;
  return [header, ...lines, more > 0 ? `…and ${more} more` : null].filter(Boolean).join("\n");
}

// Runs one check. Never throws — every failure mode degrades to "try again
// next tick" so a transient IMAP/network hiccup can't take down the poller.
export async function checkMailOnce(): Promise<void> {
  const config = imapConfig();
  if (!config) return;

  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow(config);
    await client.connect();
    const box = await client.mailboxOpen(MAILBOX, { readOnly: true });

    const [state] = await db.select().from(mailCheckState).where(eq(mailCheckState.mailbox, MAILBOX));
    const lastUid = state?.lastUid ?? null;
    const currentMaxUid = box.uidNext - 1;

    if (lastUid === null) {
      // First run for this mailbox: record the current high-water mark
      // without notifying, so we don't text every message already sitting
      // in the inbox the moment this feature goes live.
      await db
        .insert(mailCheckState)
        .values({ mailbox: MAILBOX, lastUid: currentMaxUid, lastCheckedAt: new Date() })
        .onConflictDoUpdate({
          target: mailCheckState.mailbox,
          set: { lastUid: currentMaxUid, lastCheckedAt: new Date() },
        });
      log.info({ mailbox: MAILBOX, currentMaxUid }, "mail poller: baseline set, no notification");
      return;
    }

    if (currentMaxUid <= lastUid) {
      await db
        .update(mailCheckState)
        .set({ lastCheckedAt: new Date() })
        .where(eq(mailCheckState.mailbox, MAILBOX));
      return;
    }

    const found: { from: string; subject: string }[] = [];
    for await (const msg of client.fetch(
      { uid: `${lastUid + 1}:*` },
      { envelope: true },
      { uid: true },
    )) {
      if (msg.uid <= lastUid) continue; // "*" in a UID range can include the last existing UID
      const from = msg.envelope?.from?.[0];
      const fromLabel = from?.name || from?.address || "unknown sender";
      found.push({ from: fromLabel, subject: msg.envelope?.subject ?? "" });
    }

    await db
      .update(mailCheckState)
      .set({ lastUid: currentMaxUid, lastCheckedAt: new Date() })
      .where(eq(mailCheckState.mailbox, MAILBOX));

    if (found.length === 0) return;

    if (await isShutdownActive()) {
      log.warn({ mailbox: MAILBOX, count: found.length }, "mail poller: new mail found but SMS shutdown active, not notifying");
      return;
    }

    const [root] = await db.select().from(users).where(eq(users.id, ROOT_USER_ID));
    if (!root?.phone) {
      log.warn("mail poller: ROOT_USER_ID has no phone on file, cannot notify");
      return;
    }

    const body = summarize(found);
    const sid = await throttledSend(root.phone, body);
    await db.insert(smsDeliveries).values({
      userId: ROOT_USER_ID,
      messageId: null,
      roomId: null,
      direction: "out",
      body,
      twilioSid: sid,
    });
    log.info({ mailbox: MAILBOX, count: found.length, sid }, "mail poller: notified");
  } catch (err) {
    log.error({ err, mailbox: MAILBOX }, "mail poller: check failed");
  } finally {
    try {
      await client?.logout();
    } catch {
      // already disconnected; nothing to do
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

// Starts the periodic poll if IMAP_HOST is configured; no-op otherwise. Fires
// once immediately (so a restart doesn't wait a full interval before the
// first check) then on the configured interval.
export function startMailPoller(): void {
  if (!imapConfig()) {
    log.info("mail poller: IMAP_HOST not set, mailbox checking disabled");
    return;
  }
  const intervalMs = Number(process.env.MAIL_CHECK_INTERVAL_MS ?? 300_000);
  void checkMailOnce();
  timer = setInterval(() => void checkMailOnce(), intervalMs);
  log.info({ mailbox: MAILBOX, intervalMs }, "mail poller: started");
}

export function stopMailPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
