import "dotenv/config";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users } from "../db/schema.js";

if (process.env.NODE_ENV === "production") {
  process.stderr.write("refusing to seed fake users in NODE_ENV=production\n");
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    password: { type: "string" },
  },
});

const password = values.password ?? "test1234";

const FAKES: { username: string; displayName: string }[] = [
  { username: "alice", displayName: "Alice" },
  { username: "bob", displayName: "Bob" },
  { username: "carol", displayName: "Carol" },
  { username: "dave", displayName: "Dave" },
  { username: "eve", displayName: "Eve" },
  { username: "frank", displayName: "Frank" },
  { username: "grace", displayName: "Grace" },
  { username: "henry", displayName: "Henry" },
];

const passwordHash = await bcrypt.hash(password, 12);
let created = 0;
let skipped = 0;

for (const f of FAKES) {
  const existing = await db.query.users.findFirst({ where: eq(users.username, f.username) });
  if (existing) {
    skipped++;
    continue;
  }
  await db.insert(users).values({
    username: f.username,
    email: `${f.username}@fakes.scoot.local`,
    passwordHash,
    displayName: f.displayName,
  });
  created++;
}

process.stdout.write(
  `Seeded fake users: ${created} created, ${skipped} already existed.\n` +
    `Password for all fakes: ${password}\n` +
    `Usernames: ${FAKES.map((f) => f.username).join(", ")}\n`
);

await pool.end();
