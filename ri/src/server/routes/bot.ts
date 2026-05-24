import { Router } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../llm/provider.js";
import { botMessageSchema } from "../../shared/schema.js";

const router = Router();
router.use(requireAuth);

const BIGMO_SYSTEM = readFileSync(
  resolve(process.cwd(), "ri/personalities/bigmo/personality.md"),
  "utf8"
);

// In-memory history per session — Phase 4 will persist this
const sessionHistory = new Map<string, { role: string; content: string }[]>();

router.post("/message", async (req, res) => {
  const parsed = botMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }

  const sessionId = req.sessionID;
  const history = sessionHistory.get(sessionId) ?? [];
  history.push({ role: "user", content: parsed.data.content });

  try {
    const provider = getProvider();
    const reply = await provider.chat(history, { system: BIGMO_SYSTEM });
    history.push({ role: "assistant", content: reply });
    sessionHistory.set(sessionId, history);
    res.json({ ok: true, data: { reply } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    res.status(503).json({ ok: false, error: msg });
  }
});

router.get("/history", (req, res) => {
  const history = sessionHistory.get(req.sessionID) ?? [];
  res.json({ ok: true, data: history });
});

router.post("/reset", (req, res) => {
  sessionHistory.delete(req.sessionID);
  res.json({ ok: true, data: null });
});

export default router;
