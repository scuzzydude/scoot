import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../llm/provider.js";
import { botMessageSchema } from "../../shared/schema.js";

const router = Router();
router.use(requireAuth);

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
    const reply = await provider.chat(history, {
      system: `You are BigMo, the AI member of The Fonde Brotherhood — a 55+ basketball community in Houston, Texas. You know about Scoot(34), the Brotherhood's token economy and community platform. You're warm, direct, and community-focused. You know basketball. You care about the Brothers. Keep replies short and conversational. Be helpful but skip filler.`,
    });
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
