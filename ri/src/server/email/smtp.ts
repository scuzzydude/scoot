// Outbound email via SMTP on the same Zoho mailbox already used for IMAP
// (see ri/src/server/mail/poller.ts). Replaces the earlier SendGrid
// integration, which sat on a free plan with 0 allotted credits.
import nodemailer from "nodemailer";

const FROM = process.env.SMTP_FROM ?? process.env.IMAP_USER ?? "brandon@thedreamlaboratory.org";

function transport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  // 465 = implicit TLS; 587 (our own Postfix submission port) = STARTTLS,
  // required rather than opportunistic so creds never go out in plaintext.
  const implicitTls = port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const t = transport();
  if (!t) throw new Error("SMTP_HOST/IMAP_USER/IMAP_PASSWORD not configured");
  await t.sendMail({
    to,
    from: FROM,
    subject: "Your Scoot verification code",
    text: `Your verification code is: ${code}\n\nIt expires in 15 minutes.`,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 15 minutes.</p>`,
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  const t = transport();
  if (!t) throw new Error("SMTP_HOST/IMAP_USER/IMAP_PASSWORD not configured");
  await t.sendMail({
    to,
    from: FROM,
    subject: "Scoot email test",
    text: "SMTP is working. Registration OTP emails will come from this address.",
    html: "<p>SMTP is working. Registration OTP emails will come from this address.</p>",
  });
}
