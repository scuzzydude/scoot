import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, smsDeliveries, users, UserFlags } from "../db/schema.js";
import { setProvider } from "./provider.js";
import type { SMSProvider, SendResult, InboundMessage } from "./provider.js";
import { fanOutToSms } from "./fanout.js";

// Records sends instead of hitting Twilio — NO real texts go out.
class RecordingSmsProvider implements SMSProvider {
  sent: { to: string; body: string }[] = [];
  async send(to: string, body: string): Promise<SendResult> {
    this.sent.push({ to, body });
    return { sid: `FAKE${this.sent.length}`, status: "queued" };
  }
  validateInboundSignature(): boolean {
    return true;
  }
  parseInbound(): InboundMessage {
    throw new Error("not used in fan-out test");
  }
}

const SFX = `fanout-${Date.now()}`;

interface Ctx {
  mirrorRoomId: number;
  plainRoomId: number;
  authorId: number;
  r1: number; // opted-in, has phone  → receives
  r2: number; // opted-in, has phone  → receives
  optedOut: number; // member, no sms_enabled → excluded
  noPhone: number; // opted-in, no phone → excluded
  botId: number; // opted-in w/ phone but BOT flag → excluded
  userIds: number[];
  cleanup: () => Promise<void>;
}

async function mkUser(name: string, phone: string | null, flags = 0): Promise<number> {
  const [u] = await db
    .insert(users)
    .values({ username: `${name}-${SFX}`, displayName: name, phone, flags })
    .returning({ id: users.id });
  return u.id;
}

async function setup(): Promise<Ctx> {
  const authorId = await mkUser("Author", "+15550000001");
  const r1 = await mkUser("Brother One", "+15550000002");
  const r2 = await mkUser("Brother Two", "+15550000003");
  const optedOut = await mkUser("Quiet", "+15550000004");
  const noPhone = await mkUser("NoPhone", null);
  const botId = await mkUser("TestBot", "+15550000005", UserFlags.BOT);
  const userIds = [authorId, r1, r2, optedOut, noPhone, botId];

  const [mirror] = await db
    .insert(chatRooms)
    .values({ name: `nba-${SFX}`, smsMirror: true, createdBy: authorId })
    .returning({ id: chatRooms.id });
  const [plain] = await db
    .insert(chatRooms)
    .values({ name: `app-only-${SFX}`, smsMirror: false, createdBy: authorId })
    .returning({ id: chatRooms.id });

  const member = (roomId: number, userId: number, smsEnabled: boolean) => ({ roomId, userId, smsEnabled });
  await db.insert(roomMembers).values([
    member(mirror.id, authorId, true), // author opted-in but must be excluded as author
    member(mirror.id, r1, true),
    member(mirror.id, r2, true),
    member(mirror.id, optedOut, false),
    member(mirror.id, noPhone, true),
    member(mirror.id, botId, true),
    // plain room: everyone opted-in, but room isn't a mirror → no sends
    member(plain.id, authorId, true),
    member(plain.id, r1, true),
  ]);

  return {
    mirrorRoomId: mirror.id,
    plainRoomId: plain.id,
    authorId,
    r1,
    r2,
    optedOut,
    noPhone,
    botId,
    userIds,
    cleanup: async () => {
      await db.delete(smsDeliveries).where(inArray(smsDeliveries.userId, userIds));
      await db.delete(messages).where(inArray(messages.roomId, [mirror.id, plain.id]));
      await db.delete(roomMembers).where(inArray(roomMembers.roomId, [mirror.id, plain.id]));
      await db.delete(chatRooms).where(inArray(chatRooms.id, [mirror.id, plain.id]));
      await db.delete(users).where(inArray(users.id, userIds));
    },
  };
}

describe("fanOutToSms integration", () => {
  let ctx: Ctx;
  let provider: RecordingSmsProvider;
  let restore: () => void;
  let prevGap: string | undefined;

  before(async () => {
    prevGap = process.env.SMS_SEND_GAP_MS;
    process.env.SMS_SEND_GAP_MS = "0"; // no throttle delay in tests
    ctx = await setup();
    provider = new RecordingSmsProvider();
    restore = setProvider(provider);
  });

  after(async () => {
    restore();
    if (prevGap === undefined) delete process.env.SMS_SEND_GAP_MS;
    else process.env.SMS_SEND_GAP_MS = prevGap;
    await ctx.cleanup();
    await pool.end();
  });

  it("texts only opted-in, phone-having, non-bot members (excluding the author)", async () => {
    provider.sent = [];
    await fanOutToSms({
      messageId: null,
      roomId: ctx.mirrorRoomId,
      authorId: ctx.authorId,
      authorName: "Author",
      content: "LeBron traded?!",
    });
    const tos = provider.sent.map((s) => s.to).sort();
    assert.deepEqual(tos, ["+15550000002", "+15550000003"], "only r1 and r2 should be texted");
  });

  it("prefixes the body with [room] author: and the content", async () => {
    provider.sent = [];
    await fanOutToSms({
      messageId: null,
      roomId: ctx.mirrorRoomId,
      authorId: ctx.authorId,
      authorName: "Author",
      content: "game at 5",
    });
    assert.ok(provider.sent.length > 0);
    assert.equal(provider.sent[0].body, `[nba-${SFX}] Author: game at 5`);
  });

  it("logs an 'out' delivery row per recipient with the twilio sid", async () => {
    provider.sent = [];
    await fanOutToSms({
      messageId: null,
      roomId: ctx.mirrorRoomId,
      authorId: ctx.authorId,
      authorName: "Author",
      content: "delivery-log-check",
    });
    const rows = await db
      .select({ userId: smsDeliveries.userId, direction: smsDeliveries.direction, sid: smsDeliveries.twilioSid })
      .from(smsDeliveries)
      .where(inArray(smsDeliveries.userId, [ctx.r1, ctx.r2]));
    const forThis = rows.filter((r) => r.direction === "out" && r.sid?.startsWith("FAKE"));
    assert.equal(forThis.length >= 2, true, "expected an out-delivery row for each recipient");
  });

  it("does NOT send for a non-mirror room", async () => {
    provider.sent = [];
    await fanOutToSms({
      messageId: null,
      roomId: ctx.plainRoomId,
      authorId: ctx.authorId,
      authorName: "Author",
      content: "should stay app-only",
    });
    assert.equal(provider.sent.length, 0, "non-mirror room must not fan out");
  });
});
