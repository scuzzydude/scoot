import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../sms/provider.js";
import { log } from "../log.js";
import type { InboundMessage } from "../sms/provider.js";
import { db } from "../db/index.js";
import { users, stakingCodes, pledges } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";

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

  // Staking: staked member texts a 5-digit code + selfie to stake a new member.
  // BigMo identifies the staker by their registered phone number.
  const codeMatch = msg.body.trim().match(/\b(\d{5})\b/);
  if (codeMatch && msg.mediaUrls.length > 0) {
    const twimlReply = await handleStaking(msg, codeMatch[1]);
    res.type("text/xml").send(`<Response><Message>${twimlReply}</Message></Response>`);
    return;
  }

  // Optional echo reply for end-to-end test
  if (process.env.SMS_AUTOREPLY === "true") {
    const safe = msg.body.replace(/[<&>]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c]!));
    res.type("text/xml").send(`<Response><Message>echo: ${safe}</Message></Response>`);
    return;
  }

  res.type("text/xml").send("<Response></Response>");
});

async function handleStaking(msg: InboundMessage, code: string): Promise<string> {
  // Strip country code — Twilio sends +1XXXXXXXXXX, store as 10 digits
  const rawPhone = msg.from.replace(/^\+1/, "").replace(/\D/g, "");

  const staker = await db.query.users.findFirst({ where: eq(users.phone, rawPhone) });
  if (!staker) {
    log.warn({ from: msg.from }, "staking attempt from unknown phone");
    return "I don&apos;t recognize your number. Are you registered on Scoot?";
  }
  if (!staker.isStaked) {
    log.warn({ stakerId: staker.id }, "unstaked user attempted to stake");
    return "You need to be staked yourself before you can stake others.";
  }

  const stakingCode = await db.query.stakingCodes.findFirst({
    where: and(
      eq(stakingCodes.code, code),
      eq(stakingCodes.used, false),
      gt(stakingCodes.expiresAt, new Date()),
    ),
  });
  if (!stakingCode) {
    log.warn({ from: msg.from, code }, "staking: invalid or expired code");
    return "That code is invalid or expired. Ask your buddy to request a new one in the app.";
  }

  const stakee = await db.query.users.findFirst({ where: eq(users.id, stakingCode.userId) });
  if (!stakee) {
    return "Something went wrong — user not found.";
  }
  if (stakee.isStaked) {
    return `${stakee.displayName ?? stakee.username} is already staked!`;
  }

  const selfieUrl = msg.mediaUrls[0];

  await db.update(stakingCodes).set({ used: true }).where(eq(stakingCodes.id, stakingCode.id));
  await db.update(users).set({ isStaked: true }).where(eq(users.id, stakee.id));
  await db.insert(pledges).values({
    stakerId: staker.id,
    stakeeId: stakee.id,
    selfieUrl,
    stakingCode: code,
  });

  log.info({ stakerId: staker.id, stakeeId: stakee.id, code }, "user staked successfully");
  return `${stakee.displayName ?? stakee.username} is now staked! Welcome to the Fonde Brotherhood.`;
}

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

export default router;
