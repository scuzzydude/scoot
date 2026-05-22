import "dotenv/config";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, bots } from "../db/schema.js";

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    "display-name": { type: "string" },
    "prompt-file": { type: "string" },
    prompt: { type: "string" },
    "auto-join": { type: "string" },
    enable: { type: "boolean" },
    disable: { type: "boolean" },
  },
});

function usage(msg?: string): never {
  if (msg) process.stderr.write(`error: ${msg}\n\n`);
  process.stderr.write(
    "usage: npm run bot:edit -- --username=<name> [options]\n" +
      "  --display-name=<name>     change display name\n" +
      "  --prompt-file=<path>      replace system prompt from file\n" +
      "  --prompt=\"...\"            replace system prompt inline\n" +
      "  --auto-join=true|false    toggle auto-join new rooms\n" +
      "  --enable | --disable      flip enabled flag\n"
  );
  process.exit(1);
}

const username = values.username;
if (!username) usage("--username is required");

const user = await db.query.users.findFirst({ where: eq(users.username, username) });
if (!user || !user.isBot) {
  process.stderr.write(`bot '${username}' not found\n`);
  process.exit(2);
}

const userUpdates: Partial<typeof users.$inferInsert> = {};
if (values["display-name"]) userUpdates.displayName = values["display-name"];

const botUpdates: Partial<typeof bots.$inferInsert> = {};
if (values["prompt-file"]) {
  botUpdates.systemPrompt = readFileSync(values["prompt-file"], "utf8").trim();
} else if (values.prompt) {
  botUpdates.systemPrompt = values.prompt.trim();
}
if (values["auto-join"] !== undefined) {
  botUpdates.autoJoinNewRooms = values["auto-join"] === "true";
}
if (values.enable) botUpdates.enabled = true;
if (values.disable) botUpdates.enabled = false;

if (Object.keys(userUpdates).length === 0 && Object.keys(botUpdates).length === 0) {
  usage("nothing to update — pass at least one option");
}

if (Object.keys(userUpdates).length > 0) {
  await db.update(users).set(userUpdates).where(eq(users.id, user.id));
}
if (Object.keys(botUpdates).length > 0) {
  await db.update(bots).set(botUpdates).where(eq(bots.userId, user.id));
}

process.stdout.write(`Updated bot ${username} (id=${user.id})\n`);
await pool.end();
