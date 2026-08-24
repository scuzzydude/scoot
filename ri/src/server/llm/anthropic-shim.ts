// Minimal OpenAI-compatible chat/completions endpoint backed directly by
// Anthropic's Messages API, using the same LLM_API_KEY the AnthropicProvider
// already trusts. Exists solely so scoot-pmp's synthesis step (which expects
// an OpenAI-compatible endpoint) can run against Scoot's own Anthropic key
// without a second API account. Never expose the real Anthropic key to
// scoot-pmp — it authenticates with PMP_SHIM_SECRET instead, checked here.
//
// Runs as its own HTTP listener (not mounted on the public app) so a stray
// route change elsewhere can't accidentally expose it. Docker publishes its
// port to 127.0.0.1 only (see ri/physical/docker-compose.yml) — host-only,
// same-box callers (scoot-pmp) exclusively, never internet-facing.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "../log.js";

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
}

export function startAnthropicShim(): void {
  const secret = process.env.PMP_SHIM_SECRET;
  if (!secret) {
    log.info("anthropic shim: PMP_SHIM_SECRET not set, disabled");
    return;
  }

  const client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
  const defaultModel = process.env.LLM_MODEL ?? "claude-sonnet-4-5";
  const port = parseInt(process.env.PMP_SHIM_PORT ?? "4001", 10);

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.post("/v1/chat/completions", async (req, res) => {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: "invalid bearer token" });
      return;
    }

    const body = req.body as OpenAIChatRequest;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: "messages is required" });
      return;
    }

    try {
      const system = body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") || undefined;
      const messages = body.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam);

      const response = await client.messages.create({
        model: body.model || defaultModel,
        max_tokens: body.max_tokens ?? 1024,
        system,
        messages,
      });
      const block = response.content[0];
      const content = block?.type === "text" ? block.text : "";

      res.json({
        id: response.id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: response.stop_reason === "max_tokens" ? "length" : "stop",
          },
        ],
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      });
    } catch (err) {
      log.error({ err }, "anthropic shim: request failed");
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.listen(port, () => {
    log.info({ port }, "anthropic shim: listening (OpenAI-compat -> Anthropic)");
  });
}
