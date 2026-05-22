import "dotenv/config";
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, chatRooms, roomMembers } from "../db/schema.js";

const { values } = parseArgs({
  options: {
    bot: { type: "string" },
    "room-id": { type: "string" },
    "room-name": { type: "string" },
  },
});

function usage(msg?: string): never {
  if (msg) process.stderr.write(`error: ${msg}\n\n`);
  process.stderr.write(
    "usage: npm run bot:invite -- --bot=<username> (--room-id=<id> | --room-name=<name>)\n"
  );
  process.exit(1);
}

const botUsername = values.bot;
if (!botUsername) usage("--bot is required");
if (!values["room-id"] && !values["room-name"]) usage("--room-id or --room-name required");

const bot = await db.query.users.findFirst({ where: eq(users.username, botUsername) });
if (!bot || !bot.isBot) {
  process.stderr.write(`bot '${botUsername}' not found\n`);
  process.exit(2);
}

const room = values["room-id"]
  ? await db.query.chatRooms.findFirst({ where: eq(chatRooms.id, parseInt(values["room-id"])) })
  : await db.query.chatRooms.findFirst({ where: eq(chatRooms.name, values["room-name"] as string) });

if (!room) {
  process.stderr.write(`room not found\n`);
  process.exit(2);
}

const existing = await db.query.roomMembers.findFirst({
  where: and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, bot.id)),
});

if (existing) {
  process.stdout.write(`Bot ${botUsername} already in room '${room.name}' (id=${room.id})\n`);
} else {
  await db.insert(roomMembers).values({ roomId: room.id, userId: bot.id });
  process.stdout.write(`Invited ${botUsername} to room '${room.name}' (id=${room.id})\n`);
}

await pool.end();
