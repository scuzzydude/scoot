// Per-account outbound send + Sent-folder append. Separate from and does not
// touch email/smtp.ts, which stays the system OTP/test-mail sender (a
// different concern, different sender identity, single hardcoded mailbox).
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ImapFlow } from "imapflow";
import type { MailAccount } from "../db/schema.js";
import { decryptSecret } from "../lib/crypto.js";
import { MailDecryptionError } from "./client.js";
import { log } from "../log.js";

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  attachments?: OutgoingAttachment[];
}

export async function sendFromAccount(account: MailAccount, input: SendMailInput): Promise<void> {
  let pass: string;
  try {
    pass = decryptSecret(account.encryptedPassword);
  } catch {
    throw new MailDecryptionError(`could not decrypt stored password for account ${account.id}`);
  }
  const implicitTls = account.smtpPort === 465;
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: implicitTls,
    // Port 587 (Outlook/Office365, and most other providers) starts in
    // plaintext and upgrades via STARTTLS -- require it rather than leaving
    // it opportunistic, so a misconfigured server can't silently downgrade
    // an app password to plaintext.
    requireTLS: !implicitTls,
    auth: { user: account.smtpUser, pass },
  });

  // Build the raw MIME message once so the exact same bytes that go out over
  // SMTP are also what gets appended into Sent below (rather than composing
  // twice and risking drift).
  const composer = new MailComposer({
    from: account.emailAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    inReplyTo: input.inReplyTo,
    attachments: input.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
  });
  const raw: Buffer = await new Promise((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)));
  });

  await transport.sendMail({ envelope: { from: account.emailAddress, to: input.to }, raw });

  // Best-effort: append the sent message into the account's own Sent folder
  // so Sent stays consistent with whatever other client this account is also
  // used from. A failure here doesn't fail the send -- the mail already went out.
  try {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: true,
      auth: { user: account.imapUser, pass },
      logger: false,
    });
    client.on("error", (err) => log.error({ err, accountId: account.id }, "mail smtp-send: append client error event"));
    await client.connect();
    try {
      const sentFolder = await findSentFolder(client);
      if (sentFolder) {
        await client.append(sentFolder, raw, ["\\Seen"]);
      }
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (err) {
    log.warn({ err, accountId: account.id }, "mail smtp-send: failed to append to Sent (mail was still sent)");
  }
}

async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const list = await client.list();
  const byFlag = list.find((b) => b.flags?.has("\\Sent"));
  if (byFlag) return byFlag.path;
  const byName = list.find((b) => /^sent/i.test(b.name));
  return byName?.path ?? null;
}
