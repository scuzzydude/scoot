// Links one mail account for Brandon (ROOT_USER_ID) without going through
// the browser UI -- same effect as the Link Account dialog, useful when he
// hands an app password over chat instead of typing it into the form
// himself. The password is taken as a CLI arg only (never written to disk
// in this file) and immediately encrypted before it touches the DB.
//
// Usage: npx tsx ri/src/server/scripts/link-mail-account.ts <email> <appPassword> [label] [provider] [userId]
//   provider: gmail (default) | outlook | zoho | dreamlab
//   userId:   defaults to ROOT_USER_ID (Brandon); pass another id to link a mailbox for someone else
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailAccounts } from "../db/schema.js";
import { encryptSecret, encryptionAvailable } from "../lib/crypto.js";
import { isDreamlabAddress } from "../mail/domain-policy.js";
import { userIsLeaderAnywhere } from "../mail/permissions.js";
import { listFolders } from "../mail/client.js";
import { ROOT_USER_ID } from "../trust/graph.js";

const PROVIDER_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465 },
  outlook: { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  zoho: { imapHost: "imappro.zoho.com", imapPort: 993, smtpHost: "smtppro.zoho.com", smtpPort: 465 },
  // Self-hosted Dovecot/Postfix on this VM. The hostname resolves to the docker
  // host-gateway inside the app container (see ri/physical/docker-compose.yml).
  dreamlab: { imapHost: "thedreamlaboratory.org", imapPort: 993, smtpHost: "thedreamlaboratory.org", smtpPort: 587 },
};

const [, , email, rawPassword, labelArg, providerArg, userIdArg] = process.argv;
if (!email || !rawPassword) {
  console.error("Usage: link-mail-account.ts <email> <appPassword> [label] [provider=gmail|outlook|zoho|dreamlab] [userId]");
  process.exit(1);
}
const password = rawPassword.replace(/\s+/g, ""); // Google/Microsoft display app passwords with spaces for readability only
const provider = providerArg ?? "gmail";
const preset = PROVIDER_PRESETS[provider];
if (!preset) {
  console.error(`Unknown provider "${provider}" -- expected gmail, outlook, zoho, or dreamlab.`);
  process.exit(1);
}
const label = labelArg ?? email;
const targetUserId = userIdArg ? Number(userIdArg) : ROOT_USER_ID;
if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
  console.error(`Bad userId "${userIdArg}"`);
  process.exit(1);
}

if (!encryptionAvailable()) {
  console.error("ENCRYPTION_KEY not set -- cannot link accounts.");
  process.exit(1);
}

const isDreamlab = isDreamlabAddress(email);
if (!isDreamlab && !(await userIsLeaderAnywhere(targetUserId))) {
  console.error(`${email} is not a dreamlab address and user ${targetUserId} lacks Leader -- refusing (same rule the UI enforces).`);
  process.exit(1);
}

const [existing] = await db.select({ id: mailAccounts.id })
  .from(mailAccounts)
  .where(and(eq(mailAccounts.userId, targetUserId), eq(mailAccounts.emailAddress, email)));
if (existing) {
  console.log(`Already linked: ${email} (id ${existing.id})`);
  process.exit(0);
}

const [row] = await db.insert(mailAccounts).values({
  userId: targetUserId,
  label,
  emailAddress: email,
  imapHost: preset.imapHost,
  imapPort: preset.imapPort,
  imapUser: email,
  smtpHost: preset.smtpHost,
  smtpPort: preset.smtpPort,
  smtpUser: email,
  encryptedPassword: encryptSecret(password),
  isDreamlab,
}).returning();
console.log(`Linked: ${label} <${email}> (id ${row.id}), isDreamlab=${isDreamlab}`);

console.log("Verifying against the real IMAP server...");
const folders = await listFolders(row);
console.log(`Verified live: ${folders.length} folders — ${folders.map((f) => `${f.name}(${f.unread})`).join(", ")}`);

process.exit(0);
