import bcrypt from "bcryptjs";
import { db } from "./index.js";
import { users } from "./schema.js";

export async function seedDefaultUser(): Promise<void> {
  const username = process.env.DEFAULT_USERNAME;
  const password = process.env.DEFAULT_PASSWORD;
  const email = process.env.DEFAULT_EMAIL;

  if (!username || !password || !email) return;

  const existing = await db.query.users.findFirst();
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ username, email, passwordHash });
  process.stdout.write(`Seeded default user: ${username}\n`);
}
