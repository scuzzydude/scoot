import "dotenv/config";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, smsDeliveries } from "../db/schema.js";
import { setProvider } from "./provider.js";
import type { SMSProvider, SendResult, InboundMessage } from "./provider.js";
import { isDisclaimerDue, ensureDisclaimer, DISCLAIMER_TEXT } from "./disclaimer.js";

class RecordingSmsProvider implements SMSProvider {
  sent: { to: string; body: string }[] = [];
  async send(to: string, body: string): Promise<SendResult> {
    this.sent.push({ to, body });
    return { sid: `FAKE${this.sent.length}`, status: "queued" };
  }
  validateInboundSignature(): boolean { return true; }
  parseInbound(): InboundMessage { throw new Error("not used"); }
}

const SFX = `disc-${Date.now()}`;
const NOW = new Date("2026-07-08T12:00:00Z");
let withPhone: number;
let noPhone: number;
let provider: RecordingSmsProvider;
let restore: () => void;

describe("privacy disclaimer (§8.7)", () => {
  before(async () => {
    process.env.SMS_SEND_GAP_MS = "0";
    provider = new RecordingSmsProvider();
    restore = setProvider(provider);
    const [a] = await db.insert(users).values({ username: `p-${SFX}`, phone: `+1555${(Date.now() % 10000000).toString().padStart(7, "0")}` }).returning({ id: users.id });
    const [b] = await db.insert(users).values({ username: `np-${SFX}` }).returning({ id: users.id });
    withPhone = a.id; noPhone = b.id;
  });

  beforeEach(async () => {
    provider.sent = [];
    await db.update(users).set({ privacyDisclaimerAt: null }).where(eq(users.id, withPhone));
    await db.delete(smsDeliveries).where(eq(smsDeliveries.userId, withPhone));
  });

  after(async () => {
    await db.delete(smsDeliveries).where(eq(smsDeliveries.userId, withPhone));
    await db.delete(users).where(eq(users.id, withPhone));
    await db.delete(users).where(eq(users.id, noPhone));
    restore();
    await pool.end();
  });

  it("isDisclaimerDue: never-sent → due; recent → not; ≥1yr → due", () => {
    assert.equal(isDisclaimerDue(null, NOW), true);
    assert.equal(isDisclaimerDue(new Date(NOW.getTime() - 30 * 86400000), NOW), false);
    assert.equal(isDisclaimerDue(new Date(NOW.getTime() - 400 * 86400000), NOW), true);
  });

  it("sends, stamps, and records a delivery when due", async () => {
    const sent = await ensureDisclaimer(await getUser(withPhone), NOW);
    assert.equal(sent, true);
    assert.equal(provider.sent.length, 1);
    assert.equal(provider.sent[0].body, DISCLAIMER_TEXT);
    const [u] = await db.select({ at: users.privacyDisclaimerAt }).from(users).where(eq(users.id, withPhone));
    assert.equal(u.at?.getTime(), NOW.getTime());
    const del = await db.select().from(smsDeliveries).where(eq(smsDeliveries.userId, withPhone));
    assert.equal(del.length, 1);
    assert.equal(del[0].direction, "out");
    assert.equal(del[0].roomId, null);
  });

  it("does not re-send within a year", async () => {
    await db.update(users).set({ privacyDisclaimerAt: new Date(NOW.getTime() - 100 * 86400000) }).where(eq(users.id, withPhone));
    const sent = await ensureDisclaimer(await getUser(withPhone), NOW);
    assert.equal(sent, false);
    assert.equal(provider.sent.length, 0);
  });

  it("no-ops for a user without a phone", async () => {
    const sent = await ensureDisclaimer(await getUser(noPhone), NOW);
    assert.equal(sent, false);
    assert.equal(provider.sent.length, 0);
  });
});

async function getUser(id: number) {
  const [u] = await db.select({ id: users.id, phone: users.phone, privacyDisclaimerAt: users.privacyDisclaimerAt }).from(users).where(eq(users.id, id));
  return u;
}
