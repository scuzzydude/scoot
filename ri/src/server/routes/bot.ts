import { Router } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../llm/provider.js";
import { withTimeContext } from "../llm/time-context.js";
import { botMessageSchema } from "../../shared/schema.js";

const router = Router();
router.use(requireAuth);

const SYSTEM_PROMPTS = {
  full: readFileSync(resolve(process.cwd(), "ri/personalities/bigmo/personality.md"), "utf8"),
  cotb: readFileSync(resolve(process.cwd(), "ri/personalities/bigmo/cotb.md"), "utf8"),
};

// History is keyed by sessionId + mode so switching modes starts a fresh context
const sessionHistory = new Map<string, { role: string; content: string }[]>();

router.post("/message", async (req, res) => {
  const parsed = botMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }

  const { content, mode } = parsed.data;
  const historyKey = `${req.sessionID}:${mode}`;
  const history = sessionHistory.get(historyKey) ?? [];
  history.push({ role: "user", content });

  try {
    const provider = getProvider();
    const reply = await provider.chat(history, { system: withTimeContext(SYSTEM_PROMPTS[mode]) });
    history.push({ role: "assistant", content: reply });
    sessionHistory.set(historyKey, history);
    res.json({ ok: true, data: { reply, mode } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    res.status(503).json({ ok: false, error: msg });
  }
});

router.get("/history", (req, res) => {
  const mode = (req.query.mode as string) === "cotb" ? "cotb" : "full";
  const history = sessionHistory.get(`${req.sessionID}:${mode}`) ?? [];
  res.json({ ok: true, data: history });
});

router.post("/reset", (req, res) => {
  sessionHistory.delete(`${req.sessionID}:full`);
  sessionHistory.delete(`${req.sessionID}:cotb`);
  res.json({ ok: true, data: null });
});

export default router;
