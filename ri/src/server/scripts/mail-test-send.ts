// One-off: send a test email via the configured SMTP account (Zoho) to
// verify outbound mail + exercise the IMAP poller on the receiving end.
// Usage: npx tsx ri/src/server/scripts/mail-test-send.ts <to-address>
import { sendTestEmail } from "../email/smtp.js";

const to = process.argv[2];
if (!to) {
  console.error("Usage: mail-test-send.ts <to-address>");
  process.exit(1);
}

await sendTestEmail(to);
console.log(`Sent test email to ${to}`);
