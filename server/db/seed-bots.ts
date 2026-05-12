import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "./index.js";
import { users, bots, chatRooms, roomMembers } from "./schema.js";

const DEFAULT_CLAUDE_PROMPT = `You are Claude, the assistant bot in Scoot, a small member-only chat community that meets in person at a city rec center. Members know each other by handle, not necessarily legal name — treat pseudonymity as the default.

You're a participant in a multi-user chat room, not a 1-on-1 assistant. Messages from human users are prefixed with their handle, like "alice: hey claude what's up". When you reply, do NOT prefix your message with a name — the system handles that. Just write your response directly.

Other bots may exist in this room with their own personalities (e.g. Kobe, Moses). Don't try to speak for them or impersonate them.

You're addressed as @claude. Reply when called on; don't jump in otherwise. Keep replies short and conversational by default — these are chat bubbles, not essays. Use longer form only if someone clearly asks for detail.

You cannot take actions outside this chat — no file access, no web browsing, no sending messages on behalf of users, no real-world operations. If asked, say so plainly.

Be helpful, direct, and a little dry. Skip filler ("Great question!", "Sure thing!"). Match the room's energy.`;

interface BotSeedSpec {
  username: string;
  displayName: string;
  email: string;
  systemPrompt: string;
  autoJoinNewRooms: boolean;
}

const DEFAULT_BOTS: BotSeedSpec[] = [
  {
    username: "claude",
    displayName: "Claude",
    email: "claude@bots.scoot.local",
    systemPrompt: DEFAULT_CLAUDE_PROMPT,
    autoJoinNewRooms: true,
  },
];

async function ensureBot(spec: BotSeedSpec): Promise<number> {
  const existing = await db.query.users.findFirst({
    where: eq(users.username, spec.username),
  });

  let userId: number;
  if (existing) {
    userId = existing.id;
    if (!existing.isBot) {
      await db
        .update(users)
        .set({ isBot: true, displayName: spec.displayName })
        .where(eq(users.id, userId));
    }
  } else {
    const passwordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
    const [u] = await db
      .insert(users)
      .values({
        username: spec.username,
        email: spec.email,
        passwordHash,
        displayName: spec.displayName,
        isBot: true,
      })
      .returning({ id: users.id });
    userId = u.id;
  }

  const existingBot = await db.query.bots.findFirst({ where: eq(bots.userId, userId) });
  if (!existingBot) {
    await db.insert(bots).values({
      userId,
      systemPrompt: spec.systemPrompt,
      autoJoinNewRooms: spec.autoJoinNewRooms,
      enabled: true,
    });
  }

  return userId;
}

async function backfillRoomMembership(botUserId: number, autoJoin: boolean): Promise<void> {
  if (!autoJoin) return;

  const allRooms = await db.select({ id: chatRooms.id }).from(chatRooms);
  if (allRooms.length === 0) return;

  const roomIds = allRooms.map((r) => r.id);
  const existingMemberships = await db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(and(eq(roomMembers.userId, botUserId), inArray(roomMembers.roomId, roomIds)));

  const alreadyIn = new Set(existingMemberships.map((m) => m.roomId));
  const missing = roomIds.filter((id) => !alreadyIn.has(id));
  if (missing.length === 0) return;

  await db
    .insert(roomMembers)
    .values(missing.map((roomId) => ({ roomId, userId: botUserId })));
  process.stdout.write(`Bot ${botUserId} backfilled into ${missing.length} room(s)\n`);
}

export async function seedBots(): Promise<void> {
  for (const spec of DEFAULT_BOTS) {
    const userId = await ensureBot(spec);
    await backfillRoomMembership(userId, spec.autoJoinNewRooms);
    process.stdout.write(`Bot ready: ${spec.username} (id=${userId})\n`);
  }
}
