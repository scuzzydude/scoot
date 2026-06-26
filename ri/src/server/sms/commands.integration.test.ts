import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, roomMembers, messages, smsDeliveries, users, ScootFlags } from "../db/schema.js";
import { tryHandleCommand } from "./commands.js";

const SFX = `cmd-${Date.now()}`;

let roomId: number;
let userId: number;
let userIds: number[];

async function roomMirror(id: number): Promise<boolean> {
  const [r] = await db.select({ smsMirror: chatRooms.smsMirror }).from(chatRooms).where(eq(chatRooms.id, id));
  return r.smsMirror;
}

describe("tryHandleCommand: LEADER mirror control", () => {
  before(async () => {
    const [u] = await db.insert(users).values({ username: `leader-${SFX}`, displayName: "Boss", phone: "+15551230000" }).returning({ id: users.id });
    userId = u.id;
    userIds = [userId];
    const [room] = await db.insert(chatRooms).values({ name: `nba-${SFX}`, smsMirror: false, createdBy: userId }).returning({ id: chatRooms.id });
    roomId = room.id;
    await db.insert(roomMembers).values({ roomId, userId, smsEnabled: false });
  });

  after(async () => {
    await db.delete(smsDeliveries).where(inArray(smsDeliveries.userId, userIds));
    await db.delete(messages).where(eq(messages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
    await db.delete(chatRooms).where(eq(chatRooms.id, roomId));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("denies 'mirror on' for a non-LEADER and leaves the flag off", async () => {
    const reply = await tryHandleCommand(userId, roomId, "mirror on", 0n);
    assert.match(reply ?? "", /Only a group leader/i);
    assert.equal(await roomMirror(roomId), false);
  });

  it("lets a LEADER turn mirroring on", async () => {
    const reply = await tryHandleCommand(userId, roomId, "mirror on", ScootFlags.LEADER);
    assert.match(reply ?? "", /SMS mirror ON/i);
    assert.equal(await roomMirror(roomId), true);
  });

  it("lets a LEADER turn mirroring off", async () => {
    const reply = await tryHandleCommand(userId, roomId, "mirror off", ScootFlags.LEADER);
    assert.match(reply ?? "", /SMS mirror OFF/i);
    assert.equal(await roomMirror(roomId), false);
  });

  it("returns null for non-commands (falls through to BigMo)", async () => {
    const reply = await tryHandleCommand(userId, roomId, "what time is the game?", ScootFlags.LEADER);
    assert.equal(reply, null);
  });

  it("toggles the member's sms_enabled on 'follow'", async () => {
    const reply = await tryHandleCommand(userId, roomId, "follow", 0n);
    assert.match(reply ?? "", /by text/i);
    const [m] = await db.select({ smsEnabled: roomMembers.smsEnabled }).from(roomMembers).where(eq(roomMembers.roomId, roomId));
    assert.equal(m.smsEnabled, true);
  });
});
