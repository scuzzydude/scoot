// BigMo's periodic mailbox check — polls one or more IMAP mailboxes for mail
// newer than the last check and texts ROOT_USER_ID (Brandon) a summary.
// Optional feature: disabled unless at least one account is configured, same
// pattern as MEMORY_VAULT_URL. State survives restarts via mail_check_state.lastUid,
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

const MAX_SUBJECTS_IN_TEXT = 3;

interface MailAccount {
  stateKey: string; // unique key in mail_check_state.mailbox
  label: string; // shown in the SMS summary — the account's own address
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
}

// Zoho account keeps its original state key ("INBOX" by default) so this
// refactor doesn't reset its baseline. A second account gets a distinct
// "gmail:<folder>" key so both rows coexist in mail_check_state.
function getAccounts(): MailAccount[] {
  const accounts: MailAccount[] = [];

  const zohoHost = process.env.IMAP_HOST;
  const zohoUser = process.env.IMAP_USER;
  const zohoPass = process.env.IMAP_PASSWORD;
  const zohoMailbox = process.env.IMAP_MAILBOX ?? "INBOX";
  if (zohoHost && zohoUser && zohoPass) {
    accounts.push({
      stateKey: zohoMailbox,
      label: zohoUser,
      host: zohoHost,
      port: Number(process.env.IMAP_PORT ?? 993),
      user: zohoUser,
      pass: zohoPass,
      mailbox: zohoMailbox,
    });
  }

  const gmailHost = process.env.GMAIL_IMAP_HOST;
  const gmailUser = process.env.GMAIL_IMAP_USER;
  const gmailPass = process.env.GMAIL_IMAP_PASSWORD;
  const gmailMailbox = process.env.GMAIL_IMAP_MAILBOX ?? "INBOX";
  if (gmailHost && gmailUser && gmailPass) {
    accounts.push({
      stateKey: `gmail:${gmailMailbox}`,
      label: gmailUser,
      host: gmailHost,
      port: Number(process.env.GMAIL_IMAP_PORT ?? 993),
      user: gmailUser,
      pass: gmailPass,
      mailbox: gmailMailbox,
    });
  }

  return accounts;
}

function summarize(label: string, messages: { from: string; subject: string }[]): string {
  const shown = messages.slice(0, MAX_SUBJECTS_IN_TEXT);
  const lines = shown.map((m) => `• ${m.from}: ${m.subject || "(no subject)"}`);
  const more = messages.length - shown.length;
  const header = `📧 ${messages.length} new email${messages.length === 1 ? "" : "s"} (${label})`;
  return [header, ...lines, more > 0 ? `…and ${more} more` : null].filter(Boolean).join("\n");
}

// Runs one check against one account. Never throws — every failure mode
// degrades to "try again next tick" so a transient IMAP/network hiccup on
// one account can't take down the poller (or block the other account).
async function checkAccountOnce(account: MailAccount): Promise<void> {
  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow({
      host: account.host,
      port: account.port,
      secure: true,
      auth: { user: account.user, pass: account.pass },
      logger: false,
    });
    // ImapFlow emits 'error' as a standalone EventEmitter event (e.g. a
    // socket EPIPE after a connection already dropped), separate from the
    // promise chain below -- with no listener, Node's default behavior is
    // to throw and crash the whole process, bypassing this try/catch
    // entirely. A real incident: a transient DNS failure against the IMAP
    // host took down the entire app this way, 2026-08-26.
    client.on("error", (err) => log.error({ err, mailbox: account.stateKey }, "mail poller: client error event"));
    await client.connect();
    const box = await client.mailboxOpen(account.mailbox, { readOnly: true });

    const [state] = await db.select().from(mailCheckState).where(eq(mailCheckState.mailbox, account.stateKey));
    const lastUid = state?.lastUid ?? null;
    const currentMaxUid = box.uidNext - 1;

    if (lastUid === null) {
      // First run for this mailbox: record the current high-water mark
      // without notifying, so we don't text every message already sitting
      // in the inbox the moment this feature goes live.
      await db
        .insert(mailCheckState)
        .values({ mailbox: account.stateKey, lastUid: currentMaxUid, lastCheckedAt: new Date() })
        .onConflictDoUpdate({
          target: mailCheckState.mailbox,
          set: { lastUid: currentMaxUid, lastCheckedAt: new Date() },
        });
      log.info({ mailbox: account.stateKey, currentMaxUid }, "mail poller: baseline set, no notification");
      return;
    }

    if (currentMaxUid <= lastUid) {
      await db
        .update(mailCheckState)
        .set({ lastCheckedAt: new Date() })
        .where(eq(mailCheckState.mailbox, account.stateKey));
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
      .where(eq(mailCheckState.mailbox, account.stateKey));

    if (found.length === 0) return;

    if (await isShutdownActive()) {
      log.warn({ mailbox: account.stateKey, count: found.length }, "mail poller: new mail found but SMS shutdown active, not notifying");
      return;
    }

    const [root] = await db.select().from(users).where(eq(users.id, ROOT_USER_ID));
    if (!root?.phone) {
      log.warn("mail poller: ROOT_USER_ID has no phone on file, cannot notify");
      return;
    }

    const body = summarize(account.label, found);
    const sid = await throttledSend(root.phone, body);
    await db.insert(smsDeliveries).values({
      userId: ROOT_USER_ID,
      messageId: null,
      roomId: null,
      direction: "out",
      body,
      twilioSid: sid,
    });
    log.info({ mailbox: account.stateKey, count: found.length, sid }, "mail poller: notified");
  } catch (err) {
    log.error({ err, mailbox: account.stateKey }, "mail poller: check failed");
  } finally {
    try {
      await client?.logout();
    } catch {
      // already disconnected; nothing to do
    }
  }
}

// Checks every configured account, one after another. Never throws — each
// account's failures are already contained in checkAccountOnce.
export async function checkMailOnce(): Promise<void> {
  for (const account of getAccounts()) {
    await checkAccountOnce(account);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

// Starts the periodic poll if at least one account is configured; no-op
// otherwise. Fires once immediately (so a restart doesn't wait a full
// interval before the first check) then on the configured interval.
export function startMailPoller(): void {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    log.info("mail poller: no mailboxes configured, mailbox checking disabled");
    return;
  }
  const intervalMs = Number(process.env.MAIL_CHECK_INTERVAL_MS ?? 300_000);
  void checkMailOnce();
  timer = setInterval(() => void checkMailOnce(), intervalMs);
  log.info({ accounts: accounts.map((a) => a.label), intervalMs }, "mail poller: started");
}

export function stopMailPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
