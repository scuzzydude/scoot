import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Phase 1: stub responses — real implementation in Phase 2 via C bridge

router.get("/balance", (_req, res) => {
  res.json({ ok: true, data: { balance: 1000, address: "SCT1stub000000000000" } });
});

router.get("/transactions", (_req, res) => {
  res.json({
    ok: true,
    data: [
      { id: 1, type: "receive", amount: 500, from: "SCT1genesis", to: "SCT1stub000000000000", createdAt: new Date().toISOString() },
      { id: 2, type: "receive", amount: 500, from: "SCT1genesis", to: "SCT1stub000000000000", createdAt: new Date().toISOString() },
    ],
  });
});

router.post("/send", (_req, res) => {
  res.status(501).json({ ok: false, error: "Blockchain not yet connected — Phase 2" });
});

router.get("/address", (_req, res) => {
  res.json({ ok: true, data: { address: "SCT1stub000000000000" } });
});

router.get("/receive", (_req, res) => {
  res.json({ ok: true, data: { address: "SCT1stub000000000000", qr: null } });
});

export default router;
