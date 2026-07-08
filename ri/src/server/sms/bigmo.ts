import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../db/index.js";
import { users, scoots, scootMembers, smsDeliveries, ScootFlags } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getProvider } from "../llm/provider.js";
import { scheduleFactsSafe } from "../llm/schedule.js";
import { getActiveRoom, getBigmoDmRoom, getBigmoId, loadHistory, appendTurn } from "./conversation.js";
import { tryHandleCommand } from "./commands.js";
import { tryHandleGymbossCommand } from "./schedule-commands.js";
import { tryResolveVerification } from "./escalation.js";
import { routeInbound } from "./routing.js";
import { recall, remember } from "./memory.js";
import { ensureDisclaimer } from "./disclaimer.js";
import { tryHandleStakeRequest, tryHandleStakerFlow } from "./staking.js";
import { tryHandleTrustQuery } from "./trust-commands.js";
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

export async function handleSmsMessage(from: string, body: string, mediaUrls: string[] = []): Promise<string> {
  const phone = normalizePhone(from);
  const hasPhoto = mediaUrls.length > 0;
  let trimmed = body.trim();
  if (!trimmed && !hasPhoto) return "";

  // Dev mode: $ prefix from DEV_PHONE simulates an unknown stranger texting in
  let forceStranger = false;
  if (phone === DEV_PHONE && trimmed.startsWith("$")) {
    trimmed = trimmed.slice(1).trimStart();
    forceStranger = true;
  }

  const scootId = await getScootId();

  // Phase 4 staking, prospect side: "stake"/"stake me" works for a total
  // stranger — this IS how a brand-new prospect gets an account. Checked before
  // sender resolution since it must work with no user row at all.
  const stakeReq = await tryHandleStakeRequest(phone, scootId, trimmed);
  if (stakeReq != null) {
    log.info({ phone }, "bigmo sms stake request");
    return stakeReq;
  }

  // Identify sender (global Foundation identity) + their stake in this Scoot
  const sender = forceStranger
    ? null
    : await db.query.users.findFirst({ where: eq(users.phone, phone) });
  const stake = sender ? await getStake(scootId, sender.id) : null;
  const isStaked = stake !== null && (stake & ScootFlags.STAKED) !== 0n;
  const isGymboss = stake !== null && (stake & ScootFlags.GYMBOSS) !== 0n;

  // §8.7: mandatory no-privacy disclaimer, at most once/year (LEADER can read all
  // messages). Fire-and-forget — it sends its own SMS and must never delay or
  // break the reply we're about to build.
  if (sender) void ensureDisclaimer(sender);

  // §8.8: truthful wire transcript. Every exit routes its reply through finish(),
  // which records the inbound + the reply to sms_deliveries (one exit fires per
  // call, so each pair is logged once). Strangers have no user row → skipped.
  // Best-effort: a transcript-log failure must never break the reply.
  const finish = async (reply: string, rid: number | null): Promise<string> => {
    if (sender && reply) {
      try {
        await db.insert(smsDeliveries).values([
          { userId: sender.id, roomId: rid, direction: "in", body: trimmed, messageId: null, twilioSid: null },
          { userId: sender.id, roomId: rid, direction: "out", body: reply, messageId: null, twilioSid: null },
        ]);
      } catch (err) {
        log.error({ err, userId: sender.id }, "sms_deliveries transcript log failed");
      }
    }
    return reply;
  };

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
    const tier = stake! & ScootFlags.OG ? " (an OG)" : stake! & ScootFlags.SENIOR ? " (a Senior)" : "";
    who = isGymboss
      ? `${name}${tier}, a staked Fonde Brotherhood member who is a GYMBOSS (schedule authority)`
      : `${name}${tier}, a staked Fonde Brotherhood member`;
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

    // Phase 4 staking, staker side: "stake 12345" starts a Q&A (photo, then age
    // tier) that spans several turns — checked first so a bare photo or a bare
    // "senior"/"og"/"member" reply mid-flow isn't misrouted to another command.
    const stakeFlow = await tryHandleStakerFlow(sender, scootId, trimmed, hasPhoto, mediaUrls[0]);
    if (stakeFlow != null) {
      log.info({ phone, sender: sender.username }, "bigmo sms staking flow");
      return finish(stakeFlow, roomId);
    }
    if (!trimmed) return finish("", roomId); // a bare photo with no active flow — nothing to do

    // Trust-graph read queries: "my pledges" (recall list) / "my chain" (trace
    // to root). Read-only, no state, so priority relative to other commands
    // doesn't matter much — placed here since it's staking-adjacent.
    const trustReply = await tryHandleTrustQuery(sender.id, trimmed);
    if (trustReply != null) {
      log.info({ phone, sender: sender.username }, "bigmo sms trust query");
      return finish(trustReply, roomId);
    }

    // Explicit member-write commands (note:/post:/follow/mute) are handled
    // directly and short-circuit before any LLM work — see arch/sms-rooms.md §8.3.
    const cmd = await tryHandleCommand(sender.id, roomId, trimmed, stake);
    if (cmd != null) {
      log.info({ phone, sender: sender.username, roomId, cmd }, "bigmo sms command handled");
      return finish(cmd, roomId);
    }

    // §6 escalation: a GYMBOSS "yes"/"no" resolves an open schedule-conflict poll
    // (must run before the gym-command + routing paths so a bare Y/N isn't posted).
    const verdict = await tryResolveVerification(sender.id, scootId, trimmed, stake);
    if (verdict != null) {
      log.info({ phone, sender: sender.username, scootId }, "bigmo sms verify reply");
      return finish(verdict, roomId);
    }

    // §8.6 GYMBOSS schedule control: "gym confirm/cancel/time/note" edits the
    // authoritative scoot_sessions (flag-gated, deterministic time math). An
    // unrecognized "gym ..." returns null and falls through to BigMo below.
    const gym = await tryHandleGymbossCommand(sender.id, scootId, trimmed, stake);
    if (gym != null) {
      log.info({ phone, sender: sender.username, scootId }, "bigmo sms gymboss command");
      return finish(gym, roomId);
    }

    // §8.5 inbound routing: hard-switch the sticky active room, or auto-post to
    // the active GROUP. Only a plain message with the BigMo DM active falls
    // through (handled:false) to the conversational path below.
    const dmRoomId = await getBigmoDmRoom(sender.id);
    const route = await routeInbound(sender.id, dmRoomId, roomId, trimmed);
    if (route.newActiveRoomId != null) roomId = route.newActiveRoomId;
    if (route.handled) {
      log.info({ phone, sender: sender.username, roomId }, "bigmo sms routed");
      return finish(route.reply ?? "", roomId);
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
    if (!trimmed) return ""; // a stranger's bare photo — nothing to do
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
    return finish(reply, roomId);
  } catch (err) {
    log.error({ err, phone }, "bigmo sms: LLM error");
    return finish("I'm havin' a technical moment. Try again in a minute.", roomId);
  }
}
