import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, smsDeliveries, users } from "../db/schema.js";
import { getUserSmsLog } from "./log.js";

const SFX = `smslog-${Date.now()}`;
let userId: number;
let otherId: number;
let roomId: number;
let delIds: number[] = [];

describe("per-user SMS log (§8.8)", () => {
  before(async () => {
    const [u] = await db.insert(users).values({ username: `u-${SFX}` }).returning({ id: users.id });
    const [o] = await db.insert(users).values({ username: `o-${SFX}` }).returning({ id: users.id });
    userId = u.id; otherId = o.id;
    const [r] = await db.insert(chatRooms).values({ name: `nba-${SFX}`, createdBy: userId }).returning({ id: chatRooms.id });
    roomId = r.id;
    // three for our user (in room, out room, out system/no-room) + one for another user
    const rows = await db.insert(smsDeliveries).values([
      { userId, roomId, direction: "in", body: "what time is the game?" },
      { userId, roomId, direction: "out", body: "[nba] Posted." },
      { userId, roomId: null, direction: "out", body: "no-privacy disclaimer" },
      { userId: otherId, roomId, direction: "out", body: "not mine" },
    ]).returning({ id: smsDeliveries.id });
    delIds = rows.map((r) => r.id);
  });

  after(async () => {
    await db.delete(smsDeliveries).where(inArray(smsDeliveries.id, delIds));
    await db.delete(chatRooms).where(eq(chatRooms.id, roomId));
    await db.delete(users).where(inArray(users.id, [userId, otherId]));
    await pool.end();
  });

  it("returns only the caller's deliveries, newest-first, with room name resolved", async () => {
    const log = await getUserSmsLog(userId, { limit: 100 });
    const mine = log.filter((l) => delIds.includes(l.id));
    assert.equal(mine.length, 3); // the other user's row is excluded
    assert.deepEqual(mine.map((l) => l.id), [delIds[2], delIds[1], delIds[0]]); // desc
    const posted = mine.find((l) => l.body === "[nba] Posted.")!;
    assert.equal(posted.direction, "out");
    assert.equal(posted.roomName, `nba-${SFX}`);
  });

  it("handles a system delivery with no room (null roomName)", async () => {
    const log = await getUserSmsLog(userId, { limit: 100 });
    const sys = log.find((l) => l.id === delIds[2])!;
    assert.equal(sys.roomId, null);
    assert.equal(sys.roomName, null);
  });

  it("paginates with beforeId", async () => {
    const log = await getUserSmsLog(userId, { beforeId: delIds[1], limit: 100 });
    const mine = log.filter((l) => delIds.includes(l.id));
    assert.deepEqual(mine.map((l) => l.id), [delIds[0]]); // only the oldest is < delIds[1]
  });
});
