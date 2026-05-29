import "dotenv/config";
import { db, pool } from "../db/index.js";
import { scoots, scootMembers, scootPages, scootPageBlocks, users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const SCOOT = {
  slug: "dream-laboratory",
  name: "The Dream Laboratory",
  description: "Scoot(34) — Fonde Brotherhood",
  labelMap: {
    trustee: "Starter",
    scootage: "Fonde Brotherhood",
    pledge: "pledge",
    asimov: "asimov",
  },
  featureFlags: { wallet: true, bot: true },
  navItems: [{ label: "About", href: "/page/about" }],
};

const ABOUT_PAGE = {
  slug: "about",
  title: "About The Dream Laboratory",
  navLabel: "About",
  navOrder: 0,
  published: true,
};

const ABOUT_BLOCKS = [
  {
    blockType: "markdown",
    blockOrder: 0,
    content: {
      text: `# The Dream Laboratory

Welcome to **Scoot(34)** — The Dream Laboratory, home of the Fonde Brotherhood.

This is a space built on trust, built in person. Members here have pledged to one another — each stake a record of a real encounter, a real commitment.

## What is a Scoot?

A Scoot is a community with its own identity, its own terms, and its own social graph. The platform is the framework; the people are the content.

## Getting Started

- Say hello in **#general**
- Read the charter when it's posted
- Stake someone you know in person to grow the trust graph
`,
    },
  },
];

let [existing] = await db.select({ id: scoots.id }).from(scoots).where(eq(scoots.slug, SCOOT.slug));

let scootId: number;
if (existing) {
  process.stdout.write(`Scoot(34) already exists (id=${existing.id}), updating config...\n`);
  await db.update(scoots).set({
    name: SCOOT.name,
    description: SCOOT.description,
    labelMap: SCOOT.labelMap,
    featureFlags: SCOOT.featureFlags,
    navItems: SCOOT.navItems,
  }).where(eq(scoots.id, existing.id));
  scootId = existing.id;
} else {
  const [inserted] = await db.insert(scoots).values(SCOOT).returning({ id: scoots.id });
  scootId = inserted.id;
  process.stdout.write(`Created Scoot(34) id=${scootId}\n`);
}

// Upsert About page
let [existingPage] = await db.select({ id: scootPages.id })
  .from(scootPages)
  .where(and(eq(scootPages.scootId, scootId), eq(scootPages.slug, ABOUT_PAGE.slug)));

let pageId: number;
if (existingPage) {
  pageId = existingPage.id;
  process.stdout.write(`About page already exists (id=${pageId}), skipping blocks\n`);
} else {
  const [insertedPage] = await db.insert(scootPages)
    .values({ ...ABOUT_PAGE, scootId })
    .returning({ id: scootPages.id });
  pageId = insertedPage.id;
  await db.insert(scootPageBlocks).values(
    ABOUT_BLOCKS.map((b) => ({ ...b, pageId }))
  );
  process.stdout.write(`Created About page id=${pageId} with ${ABOUT_BLOCKS.length} block(s)\n`);
}

// Add all existing users as members (skip bots and existing members)
const allUsers = await db.select({ id: users.id, username: users.username, isBot: users.isBot })
  .from(users)
  .where(eq(users.isBot, false));

let added = 0;
let skipped = 0;
for (const u of allUsers) {
  const [existing] = await db.select()
    .from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, u.id)));
  if (existing) { skipped++; continue; }
  await db.insert(scootMembers).values({ scootId, userId: u.id });
  added++;
}
process.stdout.write(`Members: ${added} added, ${skipped} already present\n`);

await pool.end();
process.stdout.write("Done.\n");
