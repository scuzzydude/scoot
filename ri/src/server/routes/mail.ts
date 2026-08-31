import { Router } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { mailAccounts } from "../db/schema.js";
import { encryptSecret, encryptionAvailable } from "../lib/crypto.js";
import { isDreamlabAddress } from "../mail/domain-policy.js";
import { userIsLeaderAnywhere } from "../mail/permissions.js";
import {
  listFolders,
  listMessages,
  getMessage,
  getAttachmentContent,
  MailDecryptionError,
} from "../mail/client.js";
import { sendFromAccount } from "../mail/smtp-send.js";
import { getCached, setCached } from "../mail/attachment-cache.js";
import { log } from "../log.js";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function currentUserId(req: import("express").Request): number {
  return (req.user as { id: number }).id;
}

async function loadOwnedAccount(userId: number, accountId: number) {
  const [account] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, accountId), eq(mailAccounts.userId, userId)));
  return account ?? null;
}

router.get("/permissions", async (req, res) => {
  const canLinkNonDreamlab = await userIsLeaderAnywhere(currentUserId(req));
  res.json({ ok: true, data: { canLinkNonDreamlab } });
});

router.get("/accounts", async (req, res) => {
  const rows = await db
    .select({
      id: mailAccounts.id,
      label: mailAccounts.label,
      emailAddress: mailAccounts.emailAddress,
      isDreamlab: mailAccounts.isDreamlab,
      needsReauth: mailAccounts.needsReauth,
      createdAt: mailAccounts.createdAt,
    })
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, currentUserId(req)));
  res.json({ ok: true, data: rows });
});

router.post("/accounts", async (req, res) => {
  if (!encryptionAvailable()) {
    res.status(503).json({ ok: false, error: "Mail feature not configured on this server" });
    return;
  }
  const { label, emailAddress, imapHost, imapPort, imapUser, smtpHost, smtpPort, smtpUser, password } = req.body ?? {};
  if (!label || !emailAddress || !imapHost || !imapUser || !smtpHost || !smtpUser || !password) {
    res.status(400).json({ ok: false, error: "Missing required fields" });
    return;
  }

  const isDreamlab = isDreamlabAddress(emailAddress);
  if (!isDreamlab && !(await userIsLeaderAnywhere(currentUserId(req)))) {
    res.status(403).json({ ok: false, error: "Linking a non-dreamlab address requires Leader access" });
    return;
  }

  try {
    const [account] = await db
      .insert(mailAccounts)
      .values({
        userId: currentUserId(req),
        label,
        emailAddress,
        imapHost,
        imapPort: imapPort ? Number(imapPort) : undefined,
        imapUser,
        smtpHost,
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        smtpUser,
        encryptedPassword: encryptSecret(password),
        isDreamlab,
      })
      .returning({ id: mailAccounts.id });
    res.status(201).json({ ok: true, data: { id: account.id } });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ ok: false, error: "This address is already linked" });
      return;
    }
    log.error({ err }, "mail: failed to link account");
    res.status(500).json({ ok: false, error: "Failed to link account" });
  }
});

// Re-enter the app password for an account flagged needsReauth (e.g. after
// an ENCRYPTION_KEY rotation) without re-entering every other field.
router.post("/accounts/:id/reauth", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  const { password } = req.body ?? {};
  if (!password) { res.status(400).json({ ok: false, error: "Missing password" }); return; }
  await db.update(mailAccounts)
    .set({ encryptedPassword: encryptSecret(password), needsReauth: false })
    .where(eq(mailAccounts.id, account.id));
  res.json({ ok: true });
});

router.delete("/accounts/:id", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  await db.delete(mailAccounts).where(eq(mailAccounts.id, account.id));
  res.json({ ok: true });
});

// Marks needsReauth on a decryption failure and replies with a message the
// client can use to prompt reconnection, rather than a generic 500.
function handleMailError(res: import("express").Response, err: unknown, accountId: number) {
  if (err instanceof MailDecryptionError) {
    void db.update(mailAccounts).set({ needsReauth: true }).where(eq(mailAccounts.id, accountId));
    res.status(409).json({ ok: false, error: "This account needs to be reconnected", needsReauth: true });
    return;
  }
  log.error({ err, accountId }, "mail: request failed");
  res.status(502).json({ ok: false, error: "Couldn't reach this mailbox" });
}

router.get("/accounts/:id/folders", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  try {
    const folders = await listFolders(account);
    res.json({ ok: true, data: folders });
  } catch (err) {
    handleMailError(res, err, account.id);
  }
});

router.get("/accounts/:id/messages", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  const folder = typeof req.query.folder === "string" ? req.query.folder : "INBOX";
  try {
    const messages = await listMessages(account, folder);
    res.json({ ok: true, data: messages });
  } catch (err) {
    handleMailError(res, err, account.id);
  }
});

router.get("/accounts/:id/messages/:uid", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  const folder = typeof req.query.folder === "string" ? req.query.folder : "INBOX";
  const uid = Number(req.params.uid);
  try {
    const message = await getMessage(account, folder, uid);
    res.json({ ok: true, data: message });
  } catch (err) {
    handleMailError(res, err, account.id);
  }
});

const INLINE_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

router.get("/accounts/:id/messages/:uid/attachments/:partId", async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  const folder = typeof req.query.folder === "string" ? req.query.folder : "INBOX";
  const uid = Number(req.params.uid);
  const partId = req.params.partId;

  try {
    let att = getCached(account.id, folder, uid, partId);
    if (!att) {
      const fetched = await getAttachmentContent(account, folder, uid, partId);
      if (!fetched) { res.status(404).json({ ok: false, error: "Attachment not found" }); return; }
      setCached(account.id, folder, uid, partId, fetched);
      att = fetched;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", att.contentType);
    const disposition = att.contentType.startsWith("image/") || INLINE_ATTACHMENT_TYPES.has(att.contentType) ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${att.filename.replace(/"/g, "")}"`);
    res.send(att.content);
  } catch (err) {
    handleMailError(res, err, account.id);
  }
});

router.post("/accounts/:id/send", upload.array("attachments", 10), async (req, res) => {
  const account = await loadOwnedAccount(currentUserId(req), Number(req.params.id));
  if (!account) { res.status(404).json({ ok: false, error: "Not found" }); return; }
  const { to, subject, text, inReplyTo } = req.body ?? {};
  if (!to || !subject || !text) {
    res.status(400).json({ ok: false, error: "Missing to/subject/text" });
    return;
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    await sendFromAccount(account, {
      to,
      subject,
      text,
      inReplyTo: inReplyTo || undefined,
      attachments: files.map((f) => ({ filename: f.originalname, contentType: f.mimetype, content: f.buffer })),
    });
    res.json({ ok: true });
  } catch (err) {
    handleMailError(res, err, account.id);
  }
});

export default router;
