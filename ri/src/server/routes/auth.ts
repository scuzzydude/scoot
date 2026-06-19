import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users, loginOtps, UserFlags } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import { getProvider as getSms } from "../sms/provider.js";
import { registerSchema, loginRequestSchema, loginVerifySchema } from "../../shared/schema.js";
import { log } from "../log.js";

const router = Router();

function generateCode(digits: number): string {
  return String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, "0");
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

// POST /api/v1/auth/register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const { username, displayName, email, phone } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (existing) {
    res.status(409).json({ ok: false, error: "Username already taken" });
    return;
  }
  const existingPhone = await db.query.users.findFirst({
    where: eq(users.phone, phone),
  });
  if (existingPhone) {
    res.status(409).json({ ok: false, error: "Phone number already registered" });
    return;
  }

  const [user] = await db.insert(users).values({
    username,
    displayName,
    email,
    phone,
    passwordHash: null,
  }).returning();

  log.info({ userId: user.id, username }, "new user registered");
  res.json({ ok: true, data: { id: user.id, username: user.username } });
});

// POST /api/v1/auth/login/request — send SMS OTP
router.post("/login/request", async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);

  const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  // Always respond ok to prevent phone enumeration
  if (!user) {
    res.json({ ok: true, data: null });
    return;
  }

  const code = generateCode(5);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await db.insert(loginOtps).values({ phone, code, expiresAt });

  try {
    await getSms().send(`+1${phone}`, `Your Scoot code: ${code}`);
  } catch (err) {
    log.error({ err, phone }, "failed to send login OTP");
    res.status(500).json({ ok: false, error: "Failed to send SMS" });
    return;
  }

  res.json({ ok: true, data: null });
});

// POST /api/v1/auth/login/verify — check OTP, create session
router.post("/login/verify", async (req, res) => {
  const parsed = loginVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  const { code } = parsed.data;

  const otp = await db.query.loginOtps.findFirst({
    where: and(
      eq(loginOtps.phone, phone),
      eq(loginOtps.code, code),
      eq(loginOtps.used, false),
      gt(loginOtps.expiresAt, new Date()),
    ),
  });
  if (!otp) {
    res.status(401).json({ ok: false, error: "Invalid or expired code" });
    return;
  }

  await db.update(loginOtps).set({ used: true }).where(eq(loginOtps.id, otp.id));

  const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (!user) {
    res.status(401).json({ ok: false, error: "User not found" });
    return;
  }

  await new Promise<void>((resolve, reject) =>
    req.login(user, (err) => (err ? reject(err) : resolve()))
  );

  res.json({
    ok: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      isBot: (user.flags & UserFlags.BOT) !== 0,
      isStaked: (user.flags & UserFlags.STAKED) !== 0,
    },
  });
});

// POST /api/v1/auth/logout
router.post("/logout", (req, res) => {
  req.logout(() => res.json({ ok: true, data: null }));
});

// GET /api/v1/auth/me
router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  const u = req.user as typeof users.$inferSelect;
  res.json({
    ok: true,
    data: {
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      isBot: (u.flags & UserFlags.BOT) !== 0,
      isStaked: (u.flags & UserFlags.STAKED) !== 0,
    },
  });
});

export default router;
