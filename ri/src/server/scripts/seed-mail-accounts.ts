// One-off (idempotent, safe to re-run): links Brandon's dreamlab mail
// accounts using credentials that already exist as env vars for the BigMo
// mail poller (mail/poller.ts) -- IMAP_* (Zoho) and GMAIL_IMAP_* (Gmail).
// Avoids re-typing app passwords BigMo already has into the new per-user
// mail-account-linking UI. Skips an account if its env vars aren't set, or
// if it's already linked for ROOT_USER_ID. Personal (non-dreamlab)
// accounts still go through the UI -- this script only covers addresses
// domain-policy.ts already treats as dreamlab.
// Usage: npx tsx ri/src/server/scripts/seed-mail-accounts.ts
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailAccounts } from "../db/schema.js";
import { encryptSecret, encryptionAvailable } from "../lib/crypto.js";
import { isDreamlabAddress } from "../mail/domain-policy.js";
import { ROOT_USER_ID } from "../trust/graph.js";

if (!encryptionAvailable()) {
  console.error("ENCRYPTION_KEY not set -- cannot link accounts.");
  process.exit(1);
}

interface Seed {
  label: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  password: string;
}

function collect(): Seed[] {
  const out: Seed[] = [];

  const zohoUser = process.env.IMAP_USER;
  const zohoPass = process.env.IMAP_PASSWORD;
  const zohoHost = process.env.IMAP_HOST;
  const smtpHost = process.env.SMTP_HOST;
  if (zohoUser && zohoPass && zohoHost && smtpHost) {
    out.push({
      label: "Dreamlab",
      emailAddress: zohoUser,
      imapHost: zohoHost,
      imapPort: Number(process.env.IMAP_PORT ?? 993),
      imapUser: zohoUser,
      smtpHost,
      smtpPort: Number(process.env.SMTP_PORT ?? 465),
      smtpUser: zohoUser,
      password: zohoPass,
    });
  } else {
    console.log("Skipping Zoho/dreamlab account -- IMAP_*/SMTP_HOST not fully set.");
  }

  const gmailUser = process.env.GMAIL_IMAP_USER;
  const gmailPass = process.env.GMAIL_IMAP_PASSWORD;
  const gmailHost = process.env.GMAIL_IMAP_HOST;
  if (gmailUser && gmailPass && gmailHost) {
    out.push({
      label: "Fonde Brotherhood (Gmail)",
      emailAddress: gmailUser,
      imapHost: gmailHost,
      imapPort: Number(process.env.GMAIL_IMAP_PORT ?? 993),
      imapUser: gmailUser,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpUser: gmailUser,
      password: gmailPass,
    });
  } else {
    console.log("Skipping Gmail account -- GMAIL_IMAP_* not fully set.");
  }

  return out;
}

for (const seed of collect()) {
  const isDreamlab = isDreamlabAddress(seed.emailAddress);
  if (!isDreamlab) {
    console.log(`Skipping ${seed.emailAddress} -- not a dreamlab address per domain-policy.ts, link it through the UI instead.`);
    continue;
  }

  const [existing] = await db.select({ id: mailAccounts.id })
    .from(mailAccounts)
    .where(and(eq(mailAccounts.userId, ROOT_USER_ID), eq(mailAccounts.emailAddress, seed.emailAddress)));
  if (existing) {
    console.log(`Already linked: ${seed.emailAddress} (id ${existing.id})`);
    continue;
  }

  const [row] = await db.insert(mailAccounts).values({
    userId: ROOT_USER_ID,
    label: seed.label,
    emailAddress: seed.emailAddress,
    imapHost: seed.imapHost,
    imapPort: seed.imapPort,
    imapUser: seed.imapUser,
    smtpHost: seed.smtpHost,
    smtpPort: seed.smtpPort,
    smtpUser: seed.smtpUser,
    encryptedPassword: encryptSecret(seed.password),
    isDreamlab: true,
  }).returning({ id: mailAccounts.id });
  console.log(`Linked: ${seed.label} <${seed.emailAddress}> (id ${row.id})`);
}

process.exit(0);
