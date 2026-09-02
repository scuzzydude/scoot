// Per-user IMAP client wrapper — connects per request (no persistent pooling
// in v1), fetches folders/messages/attachments live. No local mail store:
// IMAP already is the store (see mail_accounts in schema.ts for why).
import { ImapFlow, type MailboxObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { MailAccount } from "../db/schema.js";
import { decryptSecret } from "../lib/crypto.js";
import { log } from "../log.js";

export interface FolderInfo {
  path: string;
  name: string;
  unread: number;
}

export interface MessageSummary {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: string | null;
  unread: boolean;
  hasAttachments: boolean;
  snippet: string;
}

export interface AttachmentMeta {
  partId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageDetail {
  uid: number;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: string | null;
  textBody: string;
  htmlBody: string | null;
  attachments: AttachmentMeta[];
}

// Thrown specifically when the stored app password can't be decrypted
// (ENCRYPTION_KEY rotated/lost) — distinct from a network/auth failure
// against the mail server itself, so routes can set needsReauth precisely
// rather than on every transient IMAP hiccup.
export class MailDecryptionError extends Error {}

function decryptOrThrow(account: MailAccount): string {
  try {
    return decryptSecret(account.encryptedPassword);
  } catch (err) {
    throw new MailDecryptionError(`could not decrypt stored password for account ${account.id}`);
  }
}

async function connect(account: MailAccount): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.imapUser, pass: decryptOrThrow(account) },
    logger: false,
  });
  // See mail/poller.ts's 2026-08-26 incident comment: ImapFlow emits 'error'
  // as a standalone EventEmitter event outside the promise chain — an
  // unhandled one crashes the whole process on a transient network failure.
  client.on("error", (err) => log.error({ err, accountId: account.id }, "mail client: error event"));
  await client.connect();
  return client;
}

// For mailparser's parsed output (getMessage/getAttachmentContent), whose
// address fields nest as AddressObject.value[].
function addressLabel(addr?: AddressObject | AddressObject[]): { name: string; address: string } {
  const first = Array.isArray(addr) ? addr[0] : addr;
  const val = first?.value?.[0];
  if (!val) return { name: "(unknown)", address: "" };
  return { name: val.name || val.address || "(unknown)", address: val.address || "" };
}

// For ImapFlow's own envelope shape (listMessages), which is a flat array of
// {name, address} -- NOT wrapped in .value like mailparser's AddressObject.
// Using addressLabel() here was the bug behind every sender showing
// "(unknown)": first?.value?.[0] is always undefined on this shape.
function envelopeAddressLabel(addr?: Array<{ name?: string; address?: string }>): { name: string; address: string } {
  const first = addr?.[0];
  if (!first) return { name: "(unknown)", address: "" };
  return { name: first.name || first.address || "(unknown)", address: first.address || "" };
}

export async function listFolders(account: MailAccount): Promise<FolderInfo[]> {
  const client = await connect(account);
  try {
    const list = await client.list();
    const out: FolderInfo[] = [];
    for (const box of list) {
      if (box.flags?.has("\\Noselect")) continue;
      let unread = 0;
      try {
        const status = await client.status(box.path, { unseen: true });
        unread = status.unseen ?? 0;
      } catch {
        // some providers reject STATUS on certain special folders — not fatal
      }
      out.push({ path: box.path, name: box.name, unread });
    }
    return out;
  } finally {
    await client.logout().catch(() => {});
  }
}

// name is a display name, not a full path -- ImapFlow's mailboxCreate takes
// either and resolves it under the account's root using its delimiter, so
// this works the same across Gmail (label, "/" delimiter) and Zoho ("."
// delimiter) without the caller needing to know which.
export async function createFolder(account: MailAccount, name: string): Promise<string> {
  const client = await connect(account);
  try {
    const result = await client.mailboxCreate(name);
    return result.path;
  } finally {
    await client.logout().catch(() => {});
  }
}

// Check if a message is likely marketing/bulk based on RFC 2369 List-Unsubscribe header.
// Cheap classification — header-only fetch, no body download. Returns true if the
// header is present (indicates a mailing list or bulk sender); false otherwise.
export async function isLikelyMarketing(
  account: MailAccount,
  folder: string,
  uid: number
): Promise<boolean> {
  const client = await connect(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    const msg = await client.fetchOne(String(uid), { headers: ["list-unsubscribe"] }, { uid: true });
    if (!msg) return false;
    // ImapFlow hands back the requested header block as a raw Buffer (RFC 5322
    // text), not a parsed Map -- an earlier version checked `instanceof Map`
    // and therefore never flagged anything (0 marketing across 3,000+ digest
    // entries). Match the header name at line start, case-insensitively.
    const raw = msg.headers;
    if (!raw) return false;
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    return /^list-unsubscribe:/im.test(text);
  } finally {
    await client.logout().catch(() => {});
  }
}

const LIST_PAGE_SIZE = 30;

export async function listMessages(account: MailAccount, folder: string): Promise<MessageSummary[]> {
  const client = await connect(account);
  try {
    const box: MailboxObject = await client.mailboxOpen(folder, { readOnly: true });
    if (box.exists === 0) return [];
    const start = Math.max(1, box.exists - LIST_PAGE_SIZE + 1);
    const range = `${start}:*`;
    const out: MessageSummary[] = [];
    for await (const msg of client.fetch(range, { envelope: true, flags: true, bodyStructure: true })) {
      const from = envelopeAddressLabel(msg.envelope?.from);
      const hasAttachments = hasAttachmentParts(msg.bodyStructure);
      out.push({
        uid: msg.uid,
        from: from.name,
        fromAddress: from.address,
        subject: msg.envelope?.subject ?? "(no subject)",
        date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
        unread: !msg.flags?.has("\\Seen"),
        hasAttachments,
        snippet: "",
      });
    }
    out.reverse(); // newest first
    return out;
  } finally {
    await client.logout().catch(() => {});
  }
}

// bodyStructure is a recursive tree; a node with a disposition or a filename
// on a non-text/non-multipart part is an attachment.
function hasAttachmentParts(node: any): boolean {
  if (!node) return false;
  if (node.disposition === "attachment" || (node.parameters?.name && node.type !== "multipart")) return true;
  if (Array.isArray(node.childNodes)) return node.childNodes.some(hasAttachmentParts);
  return false;
}

export async function getMessage(account: MailAccount, folder: string, uid: number): Promise<MessageDetail> {
  const client = await connect(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    const dl = await client.download(String(uid), undefined, { uid: true });
    const parsed = await simpleParser(dl.content);
    await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true }).catch(() => {});
    const from = addressLabel(parsed.from);
    const to = Array.isArray(parsed.to) ? parsed.to.map((t) => addressLabel(t).address).join(", ") : addressLabel(parsed.to).address;
    return {
      uid,
      from: from.name,
      fromAddress: from.address,
      to,
      subject: parsed.subject ?? "(no subject)",
      date: parsed.date ? parsed.date.toISOString() : null,
      textBody: parsed.text ?? "",
      htmlBody: parsed.html || null,
      attachments: parsed.attachments.map((a, i) => ({
        partId: String(i),
        filename: a.filename ?? `attachment-${i}`,
        contentType: a.contentType,
        size: a.size,
      })),
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function moveMessage(account: MailAccount, folder: string, uid: number, toFolder: string): Promise<void> {
  const client = await connect(account);
  try {
    await client.mailboxOpen(folder);
    await client.messageMove(String(uid), toFolder, { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getAttachmentContent(
  account: MailAccount,
  folder: string,
  uid: number,
  partId: string
): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
  const client = await connect(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    const dl = await client.download(String(uid), undefined, { uid: true });
    const parsed = await simpleParser(dl.content);
    const idx = Number(partId);
    const att = parsed.attachments[idx];
    if (!att) return null;
    return { filename: att.filename ?? `attachment-${idx}`, contentType: att.contentType, content: att.content };
  } finally {
    await client.logout().catch(() => {});
  }
}
