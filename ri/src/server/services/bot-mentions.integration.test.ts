import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { bots, chatRooms, messages, roomMembers, users, UserFlags } from "../db/schema.js";
import { setProvider } from "../llm/provider.js";
import type { LLMProvider, ChatOptions } from "../llm/provider.js";
import { handleMentions } from "./bot-mentions.js";

class RecordingProvider implements LLMProvider {
  calls: { messages: { role: string; content: string }[]; options: ChatOptions }[] = [];
  nextReply = "Sure, here's my reply.";
  shouldThrow = false;
  async chat(messages: { role: string; content: string }[], options: ChatOptions = {}) {
    this.calls.push({ messages, options });
    if (this.shouldThrow) throw new Error("simulated provider failure");
    return this.nextReply;
  }
}

interface TestContext {
  roomId: number;
  humanUserId: number;
  botUserId: number;
  botUsername: string;
  cleanup: () => Promise<void>;
}

async function setupRoom(): Promise<TestContext> {
  // Use whichever bot is currently enabled (claude was retired; bigmo is the
  // active bot). findMentionedBot only matches enabled bots.
  const [bot] = await db
    .select({ id: users.id, flags: users.flags, username: users.username })
    .from(users)
    .innerJoin(bots, eq(bots.userId, users.id))
    .where(and(sql`(${users.flags} & ${UserFlags.BOT}) != 0`, eq(bots.enabled, true)))
    .limit(1);
  if (!bot) {
    throw new Error("no enabled bot seeded — run server once to seed bigmo");
  }

  const human = await db.query.users.findFirst({ where: sql`(${users.flags} & ${UserFlags.BOT}) = 0` });
  if (!human) throw new Error("no human user in DB — seed default user");

  const [room] = await db
    .insert(chatRooms)
    .values({ name: `test-bot-${Date.now()}`, createdBy: human.id })
    .returning();
  await db.insert(roomMembers).values([
    { roomId: room.id, userId: human.id },
    { roomId: room.id, userId: bot.id },
  ]);

  return {
    roomId: room.id,
    humanUserId: human.id,
    botUserId: bot.id,
    botUsername: bot.username,
    cleanup: async () => {
      await db.delete(messages).where(eq(messages.roomId, room.id));
      await db.delete(roomMembers).where(eq(roomMembers.roomId, room.id));
      await db.delete(chatRooms).where(eq(chatRooms.id, room.id));
    },
  };
}

describe("handleMentions integration", () => {
  let ctx: TestContext;
  let provider: RecordingProvider;
  let restoreProvider: () => void;

  before(async () => {
    ctx = await setupRoom();
    provider = new RecordingProvider();
    restoreProvider = setProvider(provider);
  });

  after(async () => {
    restoreProvider();
    await ctx.cleanup();
    await pool.end();
  });

  it("ignores messages from bot authors", async () => {
    const callsBefore = provider.calls.length;
    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.botUserId,
      authorIsBot: true,
      content: "@claude this should not trigger me",
    });
    assert.equal(provider.calls.length, callsBefore, "provider should not be called for bot-authored messages");
  });

  it("ignores messages with no mentions", async () => {
    const callsBefore = provider.calls.length;
    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.humanUserId,
      authorIsBot: false,
      content: "just talking, no mention here",
    });
    assert.equal(provider.calls.length, callsBefore);
  });

  it("ignores mentions of unknown bots", async () => {
    const callsBefore = provider.calls.length;
    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.humanUserId,
      authorIsBot: false,
      content: "@nonexistent_bot hello",
    });
    assert.equal(provider.calls.length, callsBefore);
  });

  it("dispatches reply when the bot is mentioned, inserts bot message", async () => {
    provider.nextReply = "Hello! How can I help?";

    // Seed an existing message so we have a history row to format
    await db.insert(messages).values({
      roomId: ctx.roomId,
      userId: ctx.humanUserId,
      content: `@${ctx.botUsername} what's up`,
    });

    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.humanUserId,
      authorIsBot: false,
      content: `@${ctx.botUsername} what's up`,
    });

    assert.equal(provider.calls.length >= 1, true, "provider should have been called");
    const lastCall = provider.calls[provider.calls.length - 1];
    assert.equal(lastCall.options.maxTokens, 500);
    assert.equal((lastCall.options.system ?? "").length > 0, true, "system prompt should be the bot's prompt");
    assert.equal(lastCall.messages.length > 0, true);

    const lastMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, ctx.roomId), eq(messages.userId, ctx.botUserId)))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    assert.equal(lastMessages.length, 1);
    assert.equal(lastMessages[0].content, "Hello! How can I help?");
  });

  it("posts a graceful error message when the provider throws", async () => {
    provider.shouldThrow = true;

    await db.insert(messages).values({
      roomId: ctx.roomId,
      userId: ctx.humanUserId,
      content: `@${ctx.botUsername} please fail`,
    });

    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.humanUserId,
      authorIsBot: false,
      content: `@${ctx.botUsername} please fail`,
    });

    const lastMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, ctx.roomId), eq(messages.userId, ctx.botUserId)))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    assert.equal(lastMessages.length, 1);
    assert.match(lastMessages[0].content, /trouble responding/i);

    provider.shouldThrow = false;
  });

  it("formats history with username prefix for users and plain content for the bot", async () => {
    provider.nextReply = "Got it.";
    provider.calls = [];

    await db.insert(messages).values([
      { roomId: ctx.roomId, userId: ctx.humanUserId, content: `@${ctx.botUsername} pretend I asked something` },
      { roomId: ctx.roomId, userId: ctx.botUserId, content: "I'm a previous bot turn." },
      { roomId: ctx.roomId, userId: ctx.humanUserId, content: `@${ctx.botUsername} follow up` },
    ]);

    await handleMentions({
      roomId: ctx.roomId,
      authorId: ctx.humanUserId,
      authorIsBot: false,
      content: `@${ctx.botUsername} follow up`,
    });

    assert.equal(provider.calls.length, 1);
    const msgs = provider.calls[0].messages;
    const botTurns = msgs.filter((m) => m.role === "assistant");
    const userTurns = msgs.filter((m) => m.role === "user");
    assert.equal(botTurns.length >= 1, true);
    assert.equal(botTurns.some((m) => m.content === "I'm a previous bot turn."), true, "bot content should be plain, no prefix");
    assert.equal(userTurns.every((m) => /^[a-zA-Z0-9_]+: /.test(m.content)), true, "all user turns should have username: prefix");
  });
});
