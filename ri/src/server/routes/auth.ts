import { Router } from "express";
import passport from "passport";

const router = Router();

router.post("/register", (_req, res) => {
  res.status(403).json({ ok: false, error: "Registration is not open" });
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
      const u = user as { id: number; username: string; email: string; displayName: string | null; isBot: boolean };
      res.json({ ok: true, data: { id: u.id, username: u.username, email: u.email, displayName: u.displayName, isBot: u.isBot } });
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
  const u = req.user as { id: number; username: string; email: string; displayName: string | null; isBot: boolean };
  res.json({ ok: true, data: { id: u.id, username: u.username, email: u.email, displayName: u.displayName, isBot: u.isBot } });
});

export default router;
