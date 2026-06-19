import "dotenv/config";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, bots, UserFlags } from "../db/schema.js";

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    "display-name": { type: "string" },
    email: { type: "string" },
    "prompt-file": { type: "string" },
    prompt: { type: "string" },
    "auto-join": { type: "boolean", default: false },
    disabled: { type: "boolean", default: false },
  },
});

function usage(msg?: string): never {
  if (msg) process.stderr.write(`error: ${msg}\n\n`);
  process.stderr.write(
    "usage: npm run bot:create -- --username=<name> --display-name=<name> --prompt-file=<path>\n" +
      "                          [--email=<addr>] [--auto-join] [--disabled]\n" +
      "  --prompt can be passed inline instead of --prompt-file\n"
  );
  process.exit(1);
}

const username = values.username;
const displayName = values["display-name"] ?? username;
const email = values.email ?? `${values.username}@bots.scoot.local`;
const promptFile = values["prompt-file"];
const inlinePrompt = values.prompt;
const autoJoin = values["auto-join"];
const enabled = !values.disabled;

if (!username) usage("--username is required");
if (!promptFile && !inlinePrompt) usage("--prompt-file or --prompt is required");

const systemPrompt = promptFile ? readFileSync(promptFile, "utf8").trim() : (inlinePrompt as string).trim();
if (!systemPrompt) usage("prompt is empty");

const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
if (existing) {
  process.stderr.write(`user '${username}' already exists (id=${existing.id})\n`);
  process.exit(2);
}

const passwordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
const [u] = await db
  .insert(users)
  .values({ username, email, passwordHash, displayName, flags: UserFlags.BOT })
  .returning({ id: users.id });

await db.insert(bots).values({
  userId: u.id,
  systemPrompt,
  autoJoinNewRooms: autoJoin ?? false,
  enabled,
});

process.stdout.write(`Created bot ${username} (id=${u.id}, auto_join=${autoJoin}, enabled=${enabled})\n`);
await pool.end();
