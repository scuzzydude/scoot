import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, smsState, users } from "../db/schema.js";
import { routeInbound, setActiveRoom } from "./routing.js";

const SFX = `route-${Date.now()}`;

let userId: number;
let dmRoomId: number;
let nbaId: number;
let prayersId: number;
let roomIds: number[];

async function lastMessage(roomId: number): Promise<{ userId: number; content: string } | undefined> {
  const [m] = await db
    .select({ userId: messages.userId, content: messages.content })
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.id);
  return m;
}

describe("routeInbound (§8.5 hard-switch routing)", () => {
  before(async () => {
    process.env.SMS_SEND_GAP_MS = "0";
    const [u] = await db.insert(users).values({ username: `bro-${SFX}`, displayName: "Bro", phone: "+15559990000" }).returning({ id: users.id });
    userId = u.id;
    const [dm] = await db.insert(chatRooms).values({ name: "BigMo", isDm: true, roomType: "dm", createdBy: userId }).returning({ id: chatRooms.id });
    const [nba] = await db.insert(chatRooms).values({ name: `nba-${SFX}`, isDm: false, createdBy: userId }).returning({ id: chatRooms.id });
    const [pr] = await db.insert(chatRooms).values({ name: `prayers-${SFX}`, isDm: false, createdBy: userId }).returning({ id: chatRooms.id });
    dmRoomId = dm.id;
    nbaId = nba.id;
    prayersId = pr.id;
    roomIds = [dmRoomId, nbaId, prayersId];
    await db.insert(roomMembers).values(roomIds.map((roomId) => ({ roomId, userId })));
    await setActiveRoom(userId, dmRoomId);
  });

  after(async () => {
    await db.delete(messages).where(inArray(messages.roomId, roomIds));
    await db.delete(roomMembers).where(inArray(roomMembers.roomId, roomIds));
    await db.delete(smsState).where(eq(smsState.userId, userId));
    await db.delete(chatRooms).where(inArray(chatRooms.id, roomIds));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("a plain message with BigMo active falls through to conversation (handled:false)", async () => {
    const r = await routeInbound(userId, dmRoomId, dmRoomId, "what time is the game?");
    assert.equal(r.handled, false);
  });

  it("'@nba-<sfx>' switches the sticky active room", async () => {
    const r = await routeInbound(userId, dmRoomId, dmRoomId, `@nba-${SFX}`);
    assert.equal(r.handled, true);
    assert.equal(r.newActiveRoomId, nbaId);
    assert.match(r.reply ?? "", /You're in/i);
  });

  it("plain text while a GROUP is active auto-posts to that group", async () => {
    const r = await routeInbound(userId, dmRoomId, nbaId, "LeBron traded?!");
    assert.equal(r.handled, true);
    assert.match(r.reply ?? "", /Posted/i);
    const m = await lastMessage(nbaId);
    assert.equal(m?.content, "LeBron traded?!");
    assert.equal(m?.userId, userId);
  });

  it("'@prayers-<sfx> please pray' switches AND posts the trailing text", async () => {
    const r = await routeInbound(userId, dmRoomId, nbaId, `@prayers-${SFX} please pray for John`);
    assert.equal(r.handled, true);
    assert.equal(r.newActiveRoomId, prayersId);
    const m = await lastMessage(prayersId);
    assert.equal(m?.content, "please pray for John");
  });

  it("'home' switches back to the BigMo DM", async () => {
    const r = await routeInbound(userId, dmRoomId, nbaId, "home");
    assert.equal(r.handled, true);
    assert.equal(r.newActiveRoomId, dmRoomId);
    assert.match(r.reply ?? "", /BigMo/);
  });

  it("'@nope' (unknown, explicit) reports not found", async () => {
    const r = await routeInbound(userId, dmRoomId, dmRoomId, "@nope");
    assert.equal(r.handled, true);
    assert.match(r.reply ?? "", /don't see a group/i);
  });

  it("'go team!' (unknown, natural) is NOT hijacked — falls through", async () => {
    const r = await routeInbound(userId, dmRoomId, dmRoomId, "go team");
    assert.equal(r.handled, false);
  });

  it("'rooms' lists the user's groups", async () => {
    const r = await routeInbound(userId, dmRoomId, dmRoomId, "rooms");
    assert.equal(r.handled, true);
    assert.match(r.reply ?? "", new RegExp(`nba-${SFX}`));
    assert.match(r.reply ?? "", new RegExp(`prayers-${SFX}`));
  });
});
