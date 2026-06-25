import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../db/index.js";
import { users, scoots, scootMembers, ScootFlags } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getProvider } from "../llm/provider.js";
import { withScheduleContext } from "../llm/schedule.js";
import { log } from "../log.js";

const SYSTEM_PROMPT = readFileSync(
  resolve(process.cwd(), "ri/personalities/bigmo/cotb.md"),
  "utf8"
);

// BigMo serves Scoot(34). Reference it by slug, never a hardcoded number.
const SCOOT_SLUG = "dream-laboratory";
let scootIdCache: number | null = null;
async function getScootId(): Promise<number> {
  if (scootIdCache != null) return scootIdCache;
  const [s] = await db.select({ id: scoots.id }).from(scoots).where(eq(scoots.slug, SCOOT_SLUG));
  if (!s) throw new Error(`Scoot '${SCOOT_SLUG}' not found — run seed-scoot34.ts`);
  scootIdCache = s.id;
  return scootIdCache;
}

// The sender's per-Scoot role mask (null = not staked into this Scoot at all).
async function getStake(scootId: number, userId: number): Promise<bigint | null> {
  const [m] = await db.select({ userFlags: scootMembers.userFlags })
    .from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.userFlags) : null;
}

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

async function getMemberRoster(scootId: number): Promise<string> {
  const rows = await db.select({
    displayName: users.displayName,
    username: users.username,
    userFlags: scootMembers.userFlags,
  })
    .from(scootMembers)
    .innerJoin(users, eq(users.id, scootMembers.userId))
    .where(eq(scootMembers.scootId, scootId));
  const staked = rows.filter((r) => (BigInt(r.userFlags) & ScootFlags.STAKED) !== 0n);
  if (!staked.length) return "No staked members yet.";
  return staked.map((m) => m.displayName ?? m.username).join(", ");
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

  const scootId = await getScootId();

  // Identify sender (global Foundation identity) + their stake in this Scoot
  const sender = forceStranger
    ? null
    : await db.query.users.findFirst({ where: eq(users.phone, phone) });
  const stake = sender ? await getStake(scootId, sender.id) : null;
  const isStaked = stake !== null && (stake & ScootFlags.STAKED) !== 0n;
  const isGymboss = stake !== null && (stake & ScootFlags.GYMBOSS) !== 0n;

  let contextPrefix: string;
  let systemPrompt = SYSTEM_PROMPT;

  if (!sender) {
    contextPrefix = "[Unknown prospect | not registered]";
  } else if (!isStaked) {
    const name = sender.displayName ?? sender.username;
    contextPrefix = `[${name} | registered but not yet staked into the Brotherhood]`;
  } else {
    const name = sender.displayName ?? sender.username;
    const role = isGymboss ? "staked Fonde Brotherhood member, GYMBOSS" : "staked Fonde Brotherhood member";
    const roster = await getMemberRoster(scootId);
    contextPrefix = `[${name} | ${role}]`;
    systemPrompt = `${SYSTEM_PROMPT}\n\n## Current Brotherhood Roster\n${roster}`;
  }

  const userMessage = `${contextPrefix}: ${trimmed}`;
  const histKey = forceStranger ? `${phone}:dev-stranger` : phone;
  const hist = getHistory(histKey);
  pushHistory(histKey, "user", userMessage);

  try {
    const reply = await getProvider().chat([...hist], { system: await withScheduleContext(systemPrompt, scootId), maxTokens: 160 });
    pushHistory(histKey, "assistant", reply);
    log.info({ phone, sender: sender?.username ?? "unknown", reply }, "bigmo sms reply sent");
    return reply;
  } catch (err) {
    log.error({ err, phone }, "bigmo sms: LLM error");
    // Remove the failed user message so it doesn't pollute history
    getHistory(histKey).pop();
    return "I'm havin' a technical moment. Try again in a minute.";
  }
}
