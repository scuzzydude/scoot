import { Router } from "express";
import { db } from "../db/index.js";
import { stakingCodes, users } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { log } from "../log.js";

const router = Router();
router.use(requireAuth);

function generateCode(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

// POST /api/v1/staking/request-code
// Unstaked user calls this to get a 5-digit code to hand to a staker in person.
router.post("/request-code", async (req, res) => {
  const u = req.user as typeof users.$inferSelect;
  if (u.isStaked) {
    res.status(400).json({ ok: false, error: "Already staked" });
    return;
  }

  // Invalidate any existing unused codes for this user
  await db.update(stakingCodes)
    .set({ used: true })
    .where(and(eq(stakingCodes.userId, u.id), eq(stakingCodes.used, false)));

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(stakingCodes).values({ userId: u.id, code, expiresAt });

  log.info({ userId: u.id, username: u.username }, "staking code issued");
  res.json({ ok: true, data: { code, expiresAt } });
});

// GET /api/v1/staking/status
router.get("/status", (req, res) => {
  const u = req.user as typeof users.$inferSelect;
  res.json({ ok: true, data: { isStaked: u.isStaked } });
});

export default router;
