import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "./index.js";
import { users, bots, chatRooms, roomMembers } from "./schema.js";

function loadPersonality(username: string): string {
  const p = resolve(process.cwd(), `ri/personalities/${username}/personality.md`);
  return readFileSync(p, "utf8");
}

interface BotSeedSpec {
  username: string;
  displayName: string;
  email: string;
  autoJoinNewRooms: boolean;
}

const DEFAULT_BOTS: BotSeedSpec[] = [
  {
    username: "claude",
    displayName: "Claude",
    email: "claude@bots.scoot.local",
    autoJoinNewRooms: true,
  },
  {
    username: "bigmo",
    displayName: "BigMo",
    email: "bigmo@bots.scoot.local",
    autoJoinNewRooms: true,
  },
];

async function ensureBot(spec: BotSeedSpec, systemPrompt: string): Promise<number> {
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
  if (existingBot) {
    // Sync personality on every restart so edits to .md take effect immediately
    if (existingBot.systemPrompt !== systemPrompt) {
      await db
        .update(bots)
        .set({ systemPrompt })
        .where(eq(bots.userId, userId));
      process.stdout.write(`Bot updated: ${spec.username} (personality synced)\n`);
    }
  } else {
    await db.insert(bots).values({
      userId,
      systemPrompt,
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
    const systemPrompt = loadPersonality(spec.username);
    const userId = await ensureBot(spec, systemPrompt);
    await backfillRoomMembership(userId, spec.autoJoinNewRooms);
    process.stdout.write(`Bot ready: ${spec.username} (id=${userId})\n`);
  }
}
