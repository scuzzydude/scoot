import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { bots, messages, roomMembers, users } from "../db/schema.js";
import { getProvider } from "../llm/provider.js";
import { broadcast } from "../ws/chat-ws.js";
import { log } from "../log.js";

export const MENTION_REGEX = /(?:^|\s)@([a-zA-Z0-9_]+)/g;
const HISTORY_WINDOW = parseInt(process.env.BOT_HISTORY_WINDOW ?? "20");
const MAX_REPLY_TOKENS = parseInt(process.env.BOT_MAX_REPLY_TOKENS ?? "500");
const BOT_ENABLED = (process.env.BOT_ENABLED ?? "true") !== "false";

const inFlight = new Set<string>();
const flightKey = (roomId: number, userId: number) => `${roomId}:${userId}`;

export function extractMentions(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of content.matchAll(MENTION_REGEX)) {
    const name = match[1].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

interface BotMember {
  userId: number;
  username: string;
  displayName: string | null;
  systemPrompt: string;
  enabled: boolean;
  searchEnabled: boolean;
}

export async function findMentionedBot(
  roomId: number,
  mentionLower: string[]
): Promise<BotMember | null> {
  if (mentionLower.length === 0) return null;

  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      systemPrompt: bots.systemPrompt,
      enabled: bots.enabled,
      searchEnabled: bots.searchEnabled,
    })
    .from(users)
    .innerJoin(bots, eq(bots.userId, users.id))
    .innerJoin(roomMembers, eq(roomMembers.userId, users.id))
    .where(
      and(eq(roomMembers.roomId, roomId), eq(users.isBot, true), inArray(users.username, mentionLower))
    );

  if (rows.length === 0) return null;

  for (const name of mentionLower) {
    const found = rows.find((r) => r.username.toLowerCase() === name);
    if (found && found.enabled) return found;
  }
  return null;
}

interface HistoryRow {
  userId: number;
  username: string;
  content: string;
}

export function buildProviderMessages(
  history: HistoryRow[],
  botUserId: number
): { role: string; content: string }[] {
  return history.map((m) =>
    m.userId === botUserId
      ? { role: "assistant", content: m.content }
      : { role: "user", content: `${m.username}: ${m.content}` }
  );
}

async function loadHistory(roomId: number): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      userId: messages.userId,
      username: users.username,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_WINDOW);

  return rows.reverse().map((r) => ({
    userId: r.userId,
    username: r.username,
    content: r.content,
  }));
}

async function postBotMessage(
  roomId: number,
  bot: BotMember,
  content: string
): Promise<void> {
  const [msg] = await db
    .insert(messages)
    .values({ roomId, userId: bot.userId, content })
    .returning();

  broadcast(roomId, {
    type: "message",
    roomId,
    message: {
      id: msg.id,
      roomId,
      userId: bot.userId,
      username: bot.username,
      displayName: bot.displayName,
      isBot: true,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}

interface MentionContext {
  roomId: number;
  authorId: number;
  authorIsBot: boolean;
  content: string;
}

export async function handleMentions(ctx: MentionContext): Promise<void> {
  if (!BOT_ENABLED) return;
  if (ctx.authorIsBot) return;

  const mentions = extractMentions(ctx.content);
  if (mentions.length === 0) return;

  const bot = await findMentionedBot(ctx.roomId, mentions);
  if (!bot) {
    log.debug({ roomId: ctx.roomId, mentions }, "mention found no matching bot in room");
    return;
  }

  const key = flightKey(ctx.roomId, ctx.authorId);
  if (inFlight.has(key)) {
    log.info({ roomId: ctx.roomId, userId: ctx.authorId }, "bot call already in flight for user, dropping");
    return;
  }
  inFlight.add(key);

  log.info(
    { roomId: ctx.roomId, authorId: ctx.authorId, botUserId: bot.userId, botUsername: bot.username },
    "bot mention triggered"
  );

  broadcast(ctx.roomId, {
    type: "typing",
    roomId: ctx.roomId,
    userId: bot.userId,
    username: bot.username,
    displayName: bot.displayName,
  });

  const startedAt = Date.now();
  try {
    const history = await loadHistory(ctx.roomId);
    const providerMessages = buildProviderMessages(history, bot.userId);
    const provider = getProvider();

    const reply = await provider.chat(providerMessages, {
      system: bot.systemPrompt,
      maxTokens: MAX_REPLY_TOKENS,
      searchEnabled: bot.searchEnabled,
    });
    const trimmed = (reply ?? "").trim();
    log.info(
      { roomId: ctx.roomId, botUserId: bot.userId, ms: Date.now() - startedAt, length: trimmed.length },
      "bot reply received"
    );
    if (trimmed.length > 0) {
      await postBotMessage(ctx.roomId, bot, trimmed);
    } else {
      log.warn({ roomId: ctx.roomId, botUserId: bot.userId }, "bot returned empty reply");
      await postBotMessage(ctx.roomId, bot, "(no response)");
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : "";
    log.error(
      { roomId: ctx.roomId, botUserId: bot.userId, ms: Date.now() - startedAt, errMsg, errStack },
      "bot dispatch failed"
    );
    try {
      await postBotMessage(
        ctx.roomId,
        bot,
        "I'm having trouble responding right now. Try again in a moment."
      );
    } catch (postErr) {
      const postErrMsg = postErr instanceof Error ? postErr.message : String(postErr);
      const postErrStack = postErr instanceof Error ? postErr.stack : "";
      log.error({ errMsg: postErrMsg, errStack: postErrStack }, "failed to post bot error message");
    }
  } finally {
    inFlight.delete(key);
    broadcast(ctx.roomId, {
      type: "typing_stop",
      roomId: ctx.roomId,
      userId: bot.userId,
    });
  }
}
