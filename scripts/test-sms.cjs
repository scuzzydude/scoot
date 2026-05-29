#!/usr/bin/env node
/*
 * test-sms.cjs — end-to-end Twilio outbound integration test.
 *
 * Sends one SMS via the same env the server uses, then POLLS the message
 * status until it leaves "queued"/"sending". This is the point: a bare send
 * ALWAYS looks like success (status: queued). Delivery is only confirmed by
 * polling — and unregistered US long codes flip to undelivered + errorCode
 * 30034 (A2P 10DLC registration gap), which only shows up on the poll.
 *
 * Usage:
 *   node scripts/test-sms.cjs +1XXXXXXXXXX ["custom message"]
 *   node scripts/test-sms.cjs +1XXXXXXXXXX --status <messageSid>   # poll an existing message only
 *
 * Reads TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER from .env.
 */
require("dotenv").config();
const twilio = require("twilio");

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

if (!sid || !token || !from) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in .env");
  process.exit(1);
}

const args = process.argv.slice(2);
const to = args[0];
if (!to || !to.startsWith("+")) {
  console.error("Usage: node scripts/test-sms.cjs +1XXXXXXXXXX [\"message\"]");
  console.error("       (destination must be E.164, e.g. +13614232253)");
  process.exit(1);
}

const client = twilio(sid, token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function explain(status, errorCode) {
  if (status === "delivered") return "✅ Delivered — carrier confirmed receipt.";
  if (errorCode === 30034)
    return "❌ 30034 = A2P 10DLC registration gap. Code/creds are FINE. Check Twilio Console → Messaging → Regulatory Compliance for brand+campaign approval.";
  if (status === "undelivered" || status === "failed")
    return `❌ ${status}${errorCode ? ` (errorCode ${errorCode})` : ""} — carrier rejected.`;
  return `⏳ ${status} — not terminal yet.`;
}

async function pollStatus(messageSid) {
  // Poll up to ~30s; delivery receipts usually land within a few seconds.
  for (let i = 0; i < 10; i++) {
    const m = await client.messages(messageSid).fetch();
    console.log(`  [poll ${i + 1}] status=${m.status}` + (m.errorCode ? ` errorCode=${m.errorCode}` : ""));
    if (["delivered", "undelivered", "failed", "received"].includes(m.status)) {
      console.log("\n" + explain(m.status, m.errorCode));
      return m;
    }
    await sleep(3000);
  }
  console.log("\n⏳ Still not terminal after 30s. Re-run with --status " + messageSid + " to keep polling.");
}

(async () => {
  // --status mode: just poll an existing SID
  if (args[1] === "--status" && args[2]) {
    console.log(`Polling existing message ${args[2]} ...`);
    await pollStatus(args[2]);
    return;
  }

  const body = args[1] || `Scoot SMS test ${new Date().toISOString()}`;
  console.log(`Sending from ${from} → ${to}\n  body: ${body}`);
  const msg = await client.messages.create({ from, to, body });
  console.log(`  sent: sid=${msg.sid} status=${msg.status}\n`);
  console.log("Polling delivery status (a 'queued' send is NOT proof of delivery):");
  await pollStatus(msg.sid);
})().catch((err) => {
  console.error("\nSEND FAILED:", err.message);
  if (err.code) console.error("  Twilio error code:", err.code, "→ https://www.twilio.com/docs/api/errors/" + err.code);
  process.exit(1);
});
