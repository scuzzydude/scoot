import sgMail from "@sendgrid/mail";

const FROM = process.env.SENDGRID_FROM ?? "brandon@thedreamlaboratory.org";

sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? "");

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sgMail.send({
    to,
    from: FROM,
    subject: "Your Scoot verification code",
    text: `Your verification code is: ${code}\n\nIt expires in 15 minutes.`,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 15 minutes.</p>`,
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  await sgMail.send({
    to,
    from: FROM,
    subject: "Scoot email test",
    text: "SendGrid is working. Registration OTP emails will come from this address.",
    html: "<p>SendGrid is working. Registration OTP emails will come from this address.</p>",
  });
}
