import bcrypt from "bcryptjs";
import { db } from "../server/db/index.js";
import { users } from "../server/db/schema.js";

const [username, password, email] = process.argv.slice(2);
if (!username || !password || !email) {
  process.stderr.write("Usage: tsx scripts/seed-user.ts <username> <password> <email>\n");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const [u] = await db.insert(users).values({ username, email, passwordHash: hash }).returning();
process.stdout.write(`Created user: id=${u.id} username=${u.username}\n`);
process.exit(0);
