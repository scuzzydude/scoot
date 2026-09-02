// Archive pass: group a folder's messages by the year they were sent, create
// a year folder per year found (e.g. "2024"), and move messages into it.
// Defaults to a DRY RUN (report only, no folders created, nothing moved) --
// pass --execute to actually do it. Real IMAP MOVE against real accounts is
// not something to run blind.
//
// Usage: npx tsx ri/src/server/scripts/mail-archive-by-year.ts <email> [--execute] [--folder=INBOX] [--include-current]
//   --include-current: also move this year's messages into "<year>" (a full inbox sweep).
//                      Without it the current year stays put, since that's live mail.
import { eq, and } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { db } from "../db/index.js";
import { mailAccounts } from "../db/schema.js";
import { decryptSecret } from "../lib/crypto.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import { log } from "../log.js";

const CHUNK_SIZE = 300; // keep IMAP UID-set command lines a sane length

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const execute = args.includes("--execute");
const includeCurrent = args.includes("--include-current");
const folderArg = args.find((a) => a.startsWith("--folder="));
const folder = folderArg ? folderArg.split("=")[1] : "INBOX";

if (!email) {
  console.error("Usage: mail-archive-by-year.ts <email> [--execute] [--folder=INBOX]");
  process.exit(1);
}

const [account] = await db.select().from(mailAccounts)
  .where(and(eq(mailAccounts.userId, ROOT_USER_ID), eq(mailAccounts.emailAddress, email)));
if (!account) {
  console.error(`No linked account found for ${email}`);
  process.exit(1);
}

const client = new ImapFlow({
  host: account.imapHost,
  port: account.imapPort,
  secure: true,
  auth: { user: account.imapUser, pass: decryptSecret(account.encryptedPassword) },
  logger: false,
});
client.on("error", (err) => log.error({ err, accountId: account.id }, "mail-archive-by-year: client error event"));
await client.connect();

const currentYear = new Date().getFullYear();

try {
  const box = await client.mailboxOpen(folder, { readOnly: !execute });
  console.log(`${account.label} <${email}> / ${folder}: ${box.exists} messages total. ${execute ? "EXECUTING" : "DRY RUN"}.`);
  if (box.exists === 0) process.exit(0);

  const byYear = new Map<number, number[]>(); // year -> uids
  for await (const msg of client.fetch("1:*", { envelope: true, internalDate: true, uid: true })) {
    const rawDate = msg.envelope?.date ?? msg.internalDate;
    const date = rawDate ? new Date(rawDate) : undefined;
    const year = date ? date.getFullYear() : currentYear;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(msg.uid);
  }

  const years = [...byYear.keys()].sort();
  console.log("Breakdown by year:");
  for (const year of years) {
    console.log(`  ${year}: ${byYear.get(year)!.length}`);
  }

  if (!execute) {
    console.log("\nDry run only -- nothing created or moved. Re-run with --execute to actually do this.");
    process.exit(0);
  }

  // By default don't archive the current year -- that's this year's live mail,
  // not history. --include-current overrides for a deliberate clean-inbox sweep.
  for (const year of years) {
    if (year === currentYear && !includeCurrent) {
      console.log(`Skipping ${year} (current year, staying in ${folder}).`);
      continue;
    }
    const uids = byYear.get(year)!;
    const folderName = String(year);
    try {
      await client.mailboxCreate(folderName);
      console.log(`Created folder: ${folderName}`);
    } catch (err: any) {
      if (!/already exists|ALREADYEXISTS/i.test(String(err?.message ?? err))) throw err;
      console.log(`Folder already exists: ${folderName}`);
    }

    let moved = 0;
    for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
      const chunk = uids.slice(i, i + CHUNK_SIZE);
      await client.messageMove(chunk.join(","), folderName, { uid: true });
      moved += chunk.length;
      console.log(`  ${folderName}: moved ${moved}/${uids.length}`);
    }
  }

  console.log("\nDone.");
} finally {
  await client.logout().catch(() => {});
}
process.exit(0);
