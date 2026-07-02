import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../db/index.js";
import { users, scoots, scootMembers, ScootFlags } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getProvider } from "../llm/provider.js";
import { scheduleFactsSafe } from "../llm/schedule.js";
import { getActiveRoom, getBigmoDmRoom, getBigmoId, loadHistory, appendTurn } from "./conversation.js";
import { tryHandleCommand } from "./commands.js";
import { routeInbound } from "./routing.js";
import { recall, remember } from "./memory.js";
import { log } from "../log.js";

const SYSTEM_PROMPT = readFileSync(
  resolve(process.cwd(), "ri/personalities/bigmo/cotb.md"),
  "utf8"
);

// BigMo serves Scoot(34). Reference it by slug, never a hardcoded number.
const SCOOT_SLUG = "dream-laboratory";
// Per-Scoot Memory Vault namespace for BigMo's long-term member memory (kept
// separate from the dev-project `scoot` space). Structured per-Scoot so a second
// Scoot gets its own memory, not Fonde's.
const MEMORY_SPACE = `bigmo-${SCOOT_SLUG}`;
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

// Conversation window — short so SMS stays crisp. Known users get DB-backed,
// room-scoped history (see conversation.ts); strangers (no user row, can't write
// to messages) fall back to this ephemeral in-memory map.
const HISTORY_CAP = 10;
const strangerHistory = new Map<string, { role: string; content: string }[]>();

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

  // Sender identity is stable per user → it belongs in the system prompt, not
  // smuggled into every message (which would pollute the persisted app view).
  let systemPrompt = SYSTEM_PROMPT;
  let who: string;
  if (!sender) {
    who = "an unknown prospect who is not registered yet";
  } else if (!isStaked) {
    who = `${sender.displayName ?? sender.username}, registered but not yet staked into the Brotherhood`;
  } else {
    const name = sender.displayName ?? sender.username;
    who = isGymboss
      ? `${name}, a staked Fonde Brotherhood member who is a GYMBOSS (schedule authority)`
      : `${name}, a staked Fonde Brotherhood member`;
    systemPrompt = `${SYSTEM_PROMPT}\n\n## Current Brotherhood Roster\n${await getMemberRoster(scootId)}`;
  }
  systemPrompt = `${systemPrompt}\n\n## Who you're texting with\nYou are texting with ${who}.`;

  // Load PRIOR history (room-scoped + persisted for known users; ephemeral for
  // strangers). The current inbound is added transiently below and only persisted
  // on a successful reply, so a failed LLM call leaves no orphaned turn.
  const strangerKey = forceStranger ? `${phone}:dev-stranger` : phone;
  let roomId: number | null = null;
  let bigmoId: number | null = null;
  let priorHist: { role: string; content: string }[];
  if (sender) {
    roomId = await getActiveRoom(sender.id);
    bigmoId = await getBigmoId();
    // Explicit member-write commands (note:/post:/follow/mute) are handled
    // directly and short-circuit before any LLM work — see arch/sms-rooms.md §8.3.
    const cmd = await tryHandleCommand(sender.id, roomId, trimmed, stake);
    if (cmd != null) {
      log.info({ phone, sender: sender.username, roomId, cmd }, "bigmo sms command handled");
      return cmd;
    }

    // §8.5 inbound routing: hard-switch the sticky active room, or auto-post to
    // the active GROUP. Only a plain message with the BigMo DM active falls
    // through (handled:false) to the conversational path below.
    const dmRoomId = await getBigmoDmRoom(sender.id);
    const route = await routeInbound(sender.id, dmRoomId, roomId, trimmed);
    if (route.newActiveRoomId != null) roomId = route.newActiveRoomId;
    if (route.handled) {
      log.info({ phone, sender: sender.username, roomId }, "bigmo sms routed");
      return route.reply ?? "";
    }

    priorHist = await loadHistory(roomId, HISTORY_CAP);
    // Long-term semantic recall across all past Brotherhood texts (degrades to
    // nothing if the vault is unset/down — see memory.ts). Surfaced as BACKGROUND
    // in the system prompt; the Verified Schedule on the inbound still wins for
    // any date/time so this can never reintroduce a wrong time (cardinal sin).
    const memories = await recall(trimmed, MEMORY_SPACE);
    if (memories.length) {
      const lines = memories
        .map((m) => `- ${m.speaker ? `${m.speaker}: ` : ""}${m.content.slice(0, 240)}`)
        .join("\n");
      systemPrompt += `\n\n## What you remember from past texts (background only — may be OUTDATED; NEVER use this for dates, days, or times — only the Verified Schedule is authoritative)\n${lines}`;
    }
  } else {
    priorHist = [...(strangerHistory.get(strangerKey) ?? [])];
  }

  // The current inbound carries the live verified schedule (transient — never
  // persisted with the facts). Riding on the freshest turn with an explicit
  // override beats any stale schedule answer earlier in the history.
  const facts = await scheduleFactsSafe(scootId);
  const llmMessages = [
    ...priorHist,
    {
      role: "user",
      content: `${trimmed}\n\n## Verified Schedule — current as of THIS message; it OVERRIDES any day/time you stated earlier in this conversation. Use it exactly; do NOT compute or recall times.\n${facts}`,
    },
  ];

  try {
    const reply = await getProvider().chat(llmMessages, { system: systemPrompt, maxTokens: 160 });
    // Persist both turns (plain text) only now that we have a good reply.
    if (sender && roomId != null && bigmoId != null) {
      await appendTurn(roomId, sender.id, trimmed);
      await appendTurn(roomId, bigmoId, reply);
    } else {
      const h = strangerHistory.get(strangerKey) ?? [];
      h.push({ role: "user", content: trimmed }, { role: "assistant", content: reply });
      strangerHistory.set(strangerKey, h.slice(-HISTORY_CAP));
    }
    // Persist a durable, attributable memory of substantive member messages
    // (skip strangers and one-word acks). Fire-and-forget — a memory write must
    // never block or fail the reply that's already in hand.
    if (sender && trimmed.length >= 12) {
      void remember(trimmed, MEMORY_SPACE, sender.displayName ?? sender.username);
    }
    log.info({ phone, sender: sender?.username ?? "unknown", roomId, reply }, "bigmo sms reply sent");
    return reply;
  } catch (err) {
    log.error({ err, phone }, "bigmo sms: LLM error");
    return "I'm havin' a technical moment. Try again in a minute.";
  }
}
