import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getProvider } from "../llm/provider.js";
import { log } from "../log.js";

const SYSTEM_PROMPT = readFileSync(
  resolve(process.cwd(), "ri/personalities/bigmo/cotb.md"),
  "utf8"
);

// Per-phone conversation history — short window so SMS stays crisp
const HISTORY_CAP = 10;
const history = new Map<string, { role: string; content: string }[]>();

function getHistory(phone: string) {
  if (!history.has(phone)) history.set(phone, []);
  return history.get(phone)!;
}

function pushHistory(phone: string, role: string, content: string) {
  const h = getHistory(phone);
  h.push({ role, content });
  if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP);
}

async function getMemberRoster(): Promise<string> {
  const members = await db.query.users.findMany({
    where: eq(users.isStaked, true),
    columns: { displayName: true, username: true },
  });
  if (!members.length) return "No staked members yet.";
  return members
    .map((m) => m.displayName ?? m.username)
    .join(", ");
}

// Normalize Twilio +1XXXXXXXXXX → 10-digit string
function normalizePhone(from: string): string {
  return from.replace(/^\+1/, "").replace(/\D/g, "");
}

const DEV_PHONE = process.env.DEV_PHONE ?? "7133055620";

export async function handleSmsMessage(from: string, body: string): Promise<string> {
  const phone = normalizePhone(from);
  let trimmed = body.trim();
  if (!trimmed) return "";

  // Dev mode: $ prefix from DEV_PHONE simulates an unknown stranger texting in
  let forceStranger = false;
  if (phone === DEV_PHONE && trimmed.startsWith("$")) {
    trimmed = trimmed.slice(1).trimStart();
    forceStranger = true;
  }

  // Identify sender
  const sender = forceStranger
    ? null
    : await db.query.users.findFirst({ where: eq(users.phone, phone) });

  let contextPrefix: string;
  let systemPrompt = SYSTEM_PROMPT;

  if (!sender) {
    contextPrefix = "[Unknown prospect | not registered]";
  } else if (!sender.isStaked) {
    const name = sender.displayName ?? sender.username;
    contextPrefix = `[${name} | registered but not yet staked]`;
  } else {
    const name = sender.displayName ?? sender.username;
    const roster = await getMemberRoster();
    contextPrefix = `[${name} | staked Fonde Brotherhood member]`;
    systemPrompt = `${SYSTEM_PROMPT}\n\n## Current Brotherhood Roster\n${roster}`;
  }

  const userMessage = `${contextPrefix}: ${trimmed}`;
  const histKey = forceStranger ? `${phone}:dev-stranger` : phone;
  const hist = getHistory(histKey);
  pushHistory(histKey, "user", userMessage);

  try {
    const reply = await getProvider().chat([...hist], { system: systemPrompt, maxTokens: 160 });
    pushHistory(histKey, "assistant", reply);
    log.info({ phone, sender: sender?.username ?? "unknown" }, "bigmo sms reply sent");
    return reply;
  } catch (err) {
    log.error({ err, phone }, "bigmo sms: LLM error");
    // Remove the failed user message so it doesn't pollute history
    getHistory(histKey).pop();
    return "I'm havin' a technical moment. Try again in a minute.";
  }
}
