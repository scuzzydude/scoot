import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../sms/provider.js";
import { log } from "../log.js";
import type { InboundMessage } from "../sms/provider.js";
import { handleSmsMessage } from "../sms/bigmo.js";
import { getUserSmsLog } from "../sms/log.js";

const router = Router();

// In-memory ring buffer of recent inbound messages (for the test harness).
const INBOX_CAP = 50;
const inbox: InboundMessage[] = [];

function pushInbox(msg: InboundMessage) {
  inbox.push(msg);
  if (inbox.length > INBOX_CAP) inbox.shift();
}

// POST /api/v1/sms/inbound — Twilio webhook target (NOT auth-protected; signature-validated)
// Mounted before requireAuth so Twilio can reach it without a session cookie.
router.post("/inbound", async (req, res) => {
  const signature = req.header("X-Twilio-Signature") ?? "";
  const params = req.body as Record<string, string>;

  // Twilio signs the *exact* URL it POSTed to. Behind a reverse proxy, req.protocol/host
  // can lie, so let the operator override with SMS_INBOUND_URL.
  const url =
    process.env.SMS_INBOUND_URL ??
    `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  const provider = getProvider();
  const ok = provider.validateInboundSignature(signature, url, params);
  if (!ok) {
    log.warn({ url, from: params.From }, "sms inbound: invalid Twilio signature");
    res.status(403).type("text/xml").send("<Response></Response>");
    return;
  }

  const msg = provider.parseInbound(params);
  pushInbox(msg);
  log.info({
    from: msg.from, body: msg.body, sid: msg.messageSid,
    fromCity: msg.fromCity, fromState: msg.fromState,
    numMedia: msg.numMedia, numSegments: msg.numSegments,
  }, "sms inbound");

  // BigMo responds to all plain text AND bare-photo messages (Phase 4 staking's
  // Q&A steps include a photo-only turn with no caption).
  if (msg.body.trim() || msg.mediaUrls.length > 0) {
    const reply = await handleSmsMessage(msg.from, msg.body, msg.mediaUrls);
    if (reply) {
      const safe = reply.replace(/[<&>'"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[c]!));
      res.type("text/xml").send(`<Response><Message>${safe}</Message></Response>`);
      return;
    }
  }

  res.type("text/xml").send("<Response></Response>");
});

// All endpoints below require auth.
router.use(requireAuth);

// POST /api/v1/sms/send  — body: { to, body }
router.post("/send", async (req, res) => {
  const { to, body } = req.body as { to?: string; body?: string };
  if (!to || !body) {
    res.status(400).json({ ok: false, error: "to and body required" });
    return;
  }
  try {
    const result = await getProvider().send(to, body);
    res.json({ ok: true, data: result });
  } catch (err) {
    log.error({ err, to }, "sms send failed");
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

// GET /api/v1/sms/inbox — recent inbound messages (newest last)
router.get("/inbox", (_req, res) => {
  res.json({ ok: true, data: inbox });
});

// GET /api/v1/sms/log — the caller's own SMS transcript (§8.8), newest-first.
// Keyset pagination via ?beforeId, ?limit.
router.get("/log", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string) : undefined;
  const data = await getUserSmsLog(userId, {
    limit: Number.isNaN(limit as number) ? undefined : limit,
    beforeId: Number.isNaN(beforeId as number) ? undefined : beforeId,
  });
  res.json({ ok: true, data });
});

export default router;
