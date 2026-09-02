import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users, loginOtps, UserFlags } from "../db/schema.js";
import { eq, and, gt, ne, sql, asc } from "drizzle-orm";
import { getProvider as getSms } from "../sms/provider.js";
import { registerSchema, loginRequestSchema, loginVerifySchema } from "../../shared/schema.js";
import { log } from "../log.js";
import { isRoot, realUser, logImpersonation } from "../auth/impersonation.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import type { Request } from "express";

const router = Router();

type UserRow = typeof users.$inferSelect;

// The shape /me and login return. `impersonating` is set only while Root is
// viewing as someone else; `canImpersonate` is true for the real Root user
// whether or not a view-as is active.
function userPayload(u: UserRow, req: Request) {
  const actor = req.actor;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    isBot: (u.flags & UserFlags.BOT) !== 0,
    isStaked: (u.flags & UserFlags.STAKED) !== 0,
    impersonating: actor
      ? { actorId: actor.id, actorUsername: actor.username, actorDisplayName: actor.displayName }
      : null,
    canImpersonate: isRoot(realUser(req)),
  };
}

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

  res.json({ ok: true, data: userPayload(user, req) });
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
  res.json({ ok: true, data: userPayload(req.user as UserRow, req) });
});

// ---- Root-only, read-only "view as another user" -------------------------
// See auth/impersonation.ts for the model. Every start/stop is audited.

function requireRealRoot(req: Request, res: import("express").Response): boolean {
  if (!req.isAuthenticated() || !isRoot(realUser(req))) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return false;
  }
  return true;
}

// GET /api/v1/auth/impersonate/targets — humans Root can view as
router.get("/impersonate/targets", async (req, res) => {
  if (!requireRealRoot(req, res)) return;
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(ne(users.id, ROOT_USER_ID), sql`(${users.flags} & ${UserFlags.BOT}) = 0`))
    .orderBy(asc(users.username));
  res.json({ ok: true, data: rows });
});

// POST /api/v1/auth/impersonate { userId }
router.post("/impersonate", async (req, res) => {
  if (!requireRealRoot(req, res)) return;
  const targetId = Number(req.body?.userId);
  if (!Number.isInteger(targetId) || targetId <= 0 || targetId === ROOT_USER_ID) {
    res.status(400).json({ ok: false, error: "Bad userId" });
    return;
  }
  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!target || (target.flags & UserFlags.BOT) !== 0) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }
  const actor = realUser(req)!;
  req.session.impersonateUserId = target.id;
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
  await logImpersonation(actor.id, target.id, "start");
  log.info({ actorId: actor.id, targetId: target.id }, "impersonation started");
  res.json({ ok: true, data: { id: target.id, username: target.username, displayName: target.displayName } });
});

// POST /api/v1/auth/impersonate/stop
router.post("/impersonate/stop", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  const targetId = req.session.impersonateUserId;
  const actor = realUser(req);
  if (targetId && actor) {
    delete req.session.impersonateUserId;
    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
    await logImpersonation(actor.id, targetId, "stop");
    log.info({ actorId: actor.id, targetId }, "impersonation stopped");
  }
  res.json({ ok: true, data: null });
});

export default router;
