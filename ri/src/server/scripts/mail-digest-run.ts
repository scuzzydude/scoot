// On-demand digest runner: summarize and extract critical info from archived email.
// Matches the pattern of mail-archive-by-year.ts and link-mail-account.ts —
// email arg, lookup account, process year folders, report summary.
// Gmail accounts only (Dreamlab/Zoho excluded, per [[scoot_currency_ledger]] design).
//
// Usage: npx tsx ri/src/server/scripts/mail-digest-run.ts <email> [--folder=FOLDER]
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailAccounts } from "../db/schema.js";
import { isDreamlabAddress } from "../mail/domain-policy.js";
import { runDigestPass, processFolder } from "../mail/digest.js";
import { initProvider } from "../llm/provider.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import { log } from "../log.js";

// Initialize LLM provider (Anthropic or OpenAI-compat, configured via env)
await initProvider();

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const folderArg = args.find((a) => a.startsWith("--folder="));
const folder = folderArg ? folderArg.split("=")[1] : null;

if (!email) {
  console.error("Usage: mail-digest-run.ts <email> [--folder=FOLDER]");
  console.error("  FOLDER: process only this specific folder (e.g. '2024')");
  process.exit(1);
}

// Restrict to Gmail accounts (Dreamlab/Zoho excluded per design)
if (!email.includes("@gmail.com")) {
  console.error("Digest is Gmail-only. Dreamlab/Zoho accounts excluded.");
  process.exit(1);
}

const [account] = await db.select().from(mailAccounts)
  .where(and(eq(mailAccounts.userId, ROOT_USER_ID), eq(mailAccounts.emailAddress, email)));
if (!account) {
  console.error(`No linked account found for ${email}`);
  process.exit(1);
}

if (folder) {
  console.log(`Starting digest for ${account.label} <${email}> — folder: ${folder}`);
} else {
  console.log(`Starting digest pass for ${account.label} <${email}>`);
}

try {
  if (folder) {
    const stats = await processFolder(account, folder);
    console.log(`${folder} complete: ${stats.marketing} marketing, ${stats.content} content, ${stats.critical} critical`);
  } else {
    await runDigestPass(account);
    console.log("Digest pass complete.");
  }
} catch (err) {
  log.error({ err, accountId: account.id }, "digest run failed");
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

process.exit(0);
