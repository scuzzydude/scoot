import "dotenv/config";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray, desc } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, smsState, users } from "../db/schema.js";
import { routeInbound, setActiveRoom } from "./routing.js";

const SFX = `rv2-${Date.now()}`;
const NBA = `nba-${SFX}`;
const PRAYERS = `prayers-${SFX}`;

let userId: number;
let dmRoomId: number;
let nbaId: number;
let prayersId: number;
let roomIds: number[];

async function lastMessageRoom(content: string): Promise<number | undefined> {
  const [m] = await db.select({ roomId: messages.roomId }).from(messages)
    .where(eq(messages.content, content)).orderBy(desc(messages.id)).limit(1);
  return m?.roomId;
}

describe("routeInbound v2 (§4 scored routing + confirm + undo)", () => {
  before(async () => {
    process.env.SMS_SEND_GAP_MS = "0";
    const [u] = await db.insert(users).values({ username: `bro-${SFX}`, phone: `+1556${(Date.now() % 10000000).toString().padStart(7, "0")}` }).returning({ id: users.id });
    userId = u.id;
    const [dm] = await db.insert(chatRooms).values({ name: "BigMo", isDm: true, roomType: "dm", createdBy: userId }).returning({ id: chatRooms.id });
    const [nba] = await db.insert(chatRooms).values({ name: NBA, isDm: false, createdBy: userId }).returning({ id: chatRooms.id });
    const [pr] = await db.insert(chatRooms).values({ name: PRAYERS, isDm: false, createdBy: userId }).returning({ id: chatRooms.id });
    dmRoomId = dm.id; nbaId = nba.id; prayersId = pr.id;
    roomIds = [dmRoomId, nbaId, prayersId];
    await db.insert(roomMembers).values(roomIds.map((roomId) => ({ roomId, userId })));
  });

  beforeEach(async () => {
    // start each case in the nba group with no parked pending
    await setActiveRoom(userId, nbaId);
    await db.update(smsState).set({ pending: null }).where(eq(smsState.userId, userId));
  });

  after(async () => {
    await db.delete(messages).where(inArray(messages.roomId, roomIds));
    await db.delete(roomMembers).where(inArray(roomMembers.roomId, roomIds));
    await db.delete(smsState).where(eq(smsState.userId, userId));
    await db.delete(chatRooms).where(inArray(chatRooms.id, roomIds));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("a topical pull to another group makes it ambiguous → confirm, nothing posted", async () => {
    const r = await routeInbound(userId, dmRoomId, nbaId, "we should say some prayers tonight");
    assert.equal(r.handled, true);
    assert.match(r.reply ?? "", /reply the name/i);
    assert.match(r.reply ?? "", new RegExp(PRAYERS));
    // not yet posted anywhere
    assert.equal(await lastMessageRoom("we should say some prayers tonight"), undefined);
  });

  it("replying with the room name posts the parked message there", async () => {
    const body = "lift up prayers for John";
    await routeInbound(userId, dmRoomId, nbaId, body);       // → confirm parked
    const r = await routeInbound(userId, dmRoomId, nbaId, PRAYERS); // pick prayers
    assert.match(r.reply ?? "", /Posted/);
    assert.equal(await lastMessageRoom(body), prayersId);
  });

  it("'no' cancels a pending confirm without posting", async () => {
    const body = "maybe prayers maybe not";
    await routeInbound(userId, dmRoomId, nbaId, body);       // → confirm parked
    const r = await routeInbound(userId, dmRoomId, nbaId, "no");
    assert.match(r.reply ?? "", /didn't post/i);
    assert.equal(await lastMessageRoom(body), undefined);
  });

  it("a clear message posts to the active group (no false confirm)", async () => {
    const r = await routeInbound(userId, dmRoomId, nbaId, "LeBron dropped 40 last night");
    assert.match(r.reply ?? "", /Posted/);
    assert.equal(await lastMessageRoom("LeBron dropped 40 last night"), nbaId);
  });

  it("'no, that was for prayers' undoes the last post (moves it)", async () => {
    const body = "wrong crowd here";
    await routeInbound(userId, dmRoomId, nbaId, body);           // posts to nba
    assert.equal(await lastMessageRoom(body), nbaId);
    const r = await routeInbound(userId, dmRoomId, nbaId, `no that was for ${PRAYERS}`);
    assert.match(r.reply ?? "", /Moved to/);
    assert.equal(await lastMessageRoom(body), prayersId);
  });
});
