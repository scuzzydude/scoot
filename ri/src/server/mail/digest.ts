// Email digest processor: summarize archived mail, extract critical info.
// Iterates over year folders in a mailbox (e.g. 2020-2025 on mdcon), classifies
// each message as marketing or content (via RFC 2369 List-Unsubscribe), fetches
// full bodies for non-marketing, calls the LLM (Haiku by default) with a
// truncated body to ask for a summary + critical-info flag. Stores everything
// in mailDigestEntries with an idempotency constraint so re-runs are safe.
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailAccounts, mailDigestEntries, type MailAccount } from "../db/schema.js";
import { getProvider } from "../llm/provider.js";
import { isLikelyMarketing, getMessage, createFolder } from "./client.js";
import { log } from "../log.js";

const MAIL_DIGEST_MODEL = process.env.MAIL_DIGEST_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_BODY_CHARS = 3000; // Truncate huge emails before LLM to control cost/latency
const LLM_MAX_TOKENS = 200;

interface DigestResult {
  summary?: string;
  isCritical: boolean;
  criticalInfo?: string;
}

// Parse the LLM's labeled plain-text response (no JSON mode available in provider interface).
// Format: "SUMMARY: ... CRITICAL: yes|no CRITICAL_INFO: ..."
function parseDigestResponse(text: string): DigestResult {
  const result: DigestResult = { isCritical: false };

  // Split by CRITICAL: to cleanly separate summary from the rest
  const parts = text.split(/CRITICAL:\s*/i);
  if (parts.length > 0) {
    // Everything before "CRITICAL:" is the summary (strip "SUMMARY:" prefix)
    const summaryText = parts[0].replace(/^SUMMARY:\s*/i, "").trim();
    result.summary = summaryText || undefined;
  }

  // Extract critical flag from the second part (after first CRITICAL:)
  if (parts.length > 1) {
    const criticalMatch = parts[1].match(/^(yes|no)/i);
    if (criticalMatch) {
      result.isCritical = criticalMatch[1].toLowerCase() === "yes";
    }

    // Extract critical info (everything after "CRITICAL_INFO:" in the rest)
    if (result.isCritical) {
      const infoMatch = parts[1].match(/CRITICAL_INFO:\s*(.+?)$/is);
      if (infoMatch) {
        result.criticalInfo = infoMatch[1].trim();
      }
    }
  }

  return result;
}

export async function processFolder(
  account: MailAccount,
  folder: string
): Promise<{ marketing: number; content: number; critical: number }> {
  const stats = { marketing: 0, content: 0, critical: 0 };

  // Fetch all UIDs in this folder
  const { ImapFlow } = await import("imapflow");
  const { decryptSecret } = await import("../lib/crypto.js");
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.imapUser, pass: decryptSecret(account.encryptedPassword) },
    logger: false,
  });
  client.on("error", (err) => log.error({ err, accountId: account.id }, "digest: client error"));
  await client.connect();

  try {
    const box = await client.mailboxOpen(folder, { readOnly: true });
    if (box.exists === 0) return stats;

    const uids: number[] = [];
    for await (const msg of client.fetch("1:*", { uid: true })) {
      uids.push(msg.uid);
    }

    for (const uid of uids) {
      // Skip if already processed
      const [existing] = await db.select({ id: mailDigestEntries.id })
        .from(mailDigestEntries)
        .where(and(
          eq(mailDigestEntries.mailAccountId, account.id),
          eq(mailDigestEntries.folder, folder),
          eq(mailDigestEntries.uid, uid)
        ));
      if (existing) continue;

      // Check if likely marketing (header-only, cheap)
      const isMarketing = await isLikelyMarketing(account, folder, uid);
      if (isMarketing) {
        // Record as marketing, no LLM call
        const msg = await getMessage(account, folder, uid);
        await db.insert(mailDigestEntries).values({
          mailAccountId: account.id,
          folder,
          uid,
          subject: msg.subject,
          fromAddress: msg.fromAddress,
          date: msg.date ? new Date(msg.date) : undefined,
          category: "marketing",
          summary: null,
          isCritical: false,
        }).onConflictDoNothing(); // idempotency
        stats.marketing++;
        continue;
      }

      // Non-marketing: fetch full message and summarize
      const msg = await getMessage(account, folder, uid);
      const body = (msg.textBody || msg.htmlBody || "").slice(0, MAX_BODY_CHARS);
      const prompt = `You are summarizing an archived email. Write a 1-2 sentence summary describing what the email is about. Then, decide if it contains critical information like account numbers, confirmation codes, security alerts, or payment details. Always respond in exactly this format (DO NOT use brackets or placeholder text):

SUMMARY: <actual summary here, 1-2 sentences>
CRITICAL: yes
CRITICAL_INFO: <account number 12345, confirmation code ABC>

OR

SUMMARY: <actual summary here, 1-2 sentences>
CRITICAL: no
CRITICAL_INFO:

Email content:
${body}`;

      const response = await getProvider().chat(
        [{ role: "user", content: prompt }],
        { maxTokens: LLM_MAX_TOKENS, model: MAIL_DIGEST_MODEL }
      );

      const parsed = parseDigestResponse(response);
      await db.insert(mailDigestEntries).values({
        mailAccountId: account.id,
        folder,
        uid,
        subject: msg.subject,
        fromAddress: msg.fromAddress,
        date: msg.date ? new Date(msg.date) : undefined,
        category: "content",
        summary: parsed.summary,
        isCritical: parsed.isCritical,
        criticalInfo: parsed.criticalInfo,
      }).onConflictDoNothing();

      stats.content++;
      if (parsed.isCritical) stats.critical++;
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return stats;
}

export async function runDigestPass(account: MailAccount): Promise<void> {
  const { ImapFlow } = await import("imapflow");
  const { decryptSecret } = await import("../lib/crypto.js");
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.imapUser, pass: decryptSecret(account.encryptedPassword) },
    logger: false,
  });
  client.on("error", (err) => log.error({ err, accountId: account.id }, "digest: client error"));
  await client.connect();

  try {
    const list = await client.list();
    const yearFolders = list
      .filter((box) => /^\d{4}$/.test(box.name) && !box.flags?.has("\\Noselect"))
      .map((box) => box.path)
      .sort();

    log.info({ account: account.emailAddress, folders: yearFolders.length }, "digest: processing year folders");

    for (const folder of yearFolders) {
      const stats = await processFolder(account, folder);
      log.info(
        { folder, ...stats },
        `digest: ${folder} complete`
      );
    }

    log.info({ account: account.emailAddress }, "digest: pass complete");
  } finally {
    await client.logout().catch(() => {});
  }
}
