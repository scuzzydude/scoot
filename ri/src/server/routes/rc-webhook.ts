import { Router } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, scootMembers, scoots } from "../db/schema.js";
import { getProvider } from "../llm/provider.js";
import { log } from "../log.js";

const router = Router();

const BIGMO_COTB_PROMPT = readFileSync(
  resolve(process.cwd(), "ri/personalities/bigmo/cotb.md"),
  "utf8"
);

// Body RC sends for outgoing webhooks
interface RCWebhookBody {
  token?: string;
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  user_name?: string;
  user_full_name?: string;
  text?: string;
  trigger_word?: string;
  bot?: boolean;
  message_id?: string;
}

router.post("/webhook", async (req, res) => {
  const body = req.body as RCWebhookBody;

  // Verify webhook token
  const expectedToken = process.env.RC_WEBHOOK_TOKEN;
  if (expectedToken && body.token !== expectedToken) {
    log.warn("RC webhook: invalid token");
    res.status(401).json({ ok: false });
    return;
  }

  // Ignore bot messages to prevent reply loops
  if (body.bot) {
    res.json({});
    return;
  }

  const rcUsername = body.user_name ?? "";
  const triggerWord = body.trigger_word ?? "@BigMo";
  const rawText = body.text ?? "";

  // Strip the trigger word and clean up the message
  const userMessage = rawText.replace(new RegExp(triggerWord, "gi"), "").trim();
  if (!userMessage) {
    res.json({ text: "Hey! What can I do for you?" });
    return;
  }

  try {
    // Look up Scoot member context by matching RC username to Scoot username
    const user = await db.query.users.findFirst({
      where: eq(users.username, rcUsername),
    });

    const systemParts: string[] = [BIGMO_COTB_PROMPT];

    if (user) {
      const membership = await db
        .select({ scootName: scoots.name, userFlags: scootMembers.userFlags })
        .from(scootMembers)
        .innerJoin(scoots, eq(scoots.id, scootMembers.scootId))
        .where(eq(scootMembers.userId, user.id));

      const name = user.displayName ?? user.username;
      systemParts.push(`\nYou are speaking with ${name}.`);

      if (membership.length > 0) {
        const m = membership[0];
        // userFlags is a 64-bit permission bitmask (text). Bits 1|2 = engineer roles.
        const roleName = (BigInt(m.userFlags) & 3n) !== 0n ? "an engineer" : "a member";
        systemParts.push(`They are ${roleName} of ${m.scootName}.`);
      }
    } else {
      systemParts.push(`\nYou are speaking with ${rcUsername}. They don't have a Scoot account yet.`);
    }

    const provider = getProvider();
    const reply = await provider.chat(
      [{ role: "user", content: userMessage }],
      { system: systemParts.join(" ") }
    );

    res.json({ text: reply });
  } catch (err) {
    log.error({ err }, "RC webhook: LLM error");
    res.json({ text: "Sorry, I'm having trouble right now. Try again in a moment." });
  }
});

export default router;
