import { Router } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { registerSchema } from "../../shared/schema.js";

const router = Router();

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }

  const { username, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (existing) {
    res.status(409).json({ ok: false, error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();

  req.login(user, (err) => {
    if (err) {
      res.status(500).json({ ok: false, error: "Login after register failed" });
      return;
    }
    res.status(201).json({ ok: true, data: { id: user.id, username: user.username, email: user.email } });
  });
});

router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: unknown, user: Express.User | false) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ ok: false, error: "Invalid username or password" });
      return;
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      const u = user as { id: number; username: string; email: string };
      res.json({ ok: true, data: { id: u.id, username: u.username, email: u.email } });
    });
  })(req, res, next);
});

router.post("/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true, data: null });
  });
});

router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  const u = req.user as { id: number; username: string; email: string };
  res.json({ ok: true, data: { id: u.id, username: u.username, email: u.email } });
});

export default router;
