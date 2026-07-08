import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, scoots, scootMembers, users, ScootFlags } from "../db/schema.js";
import { userIsLeader, getLeaderMessageFeed } from "./oversight.js";

const SFX = `oversight-${Date.now()}`;
let scootId: number;
let leaderId: number;
let memberId: number;
let roomA: number;
let roomB: number;
let msgIds: number[] = [];

describe("LEADER oversight (§8.7)", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `Test ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
    const [l] = await db.insert(users).values({ username: `leader-${SFX}`, displayName: "Boss Leader" }).returning({ id: users.id });
    const [m] = await db.insert(users).values({ username: `member-${SFX}`, displayName: "Reg Member" }).returning({ id: users.id });
    leaderId = l.id; memberId = m.id;
    await db.insert(scootMembers).values([
      { scootId, userId: leaderId, userFlags: String(ScootFlags.LEADER | ScootFlags.STAKED) }, // 12
      { scootId, userId: memberId, userFlags: String(ScootFlags.STAKED) },                     // 4
    ]);
    const [ra] = await db.insert(chatRooms).values({ name: `roomA-${SFX}`, accessMask: "255", createdBy: leaderId }).returning({ id: chatRooms.id });
    const [rb] = await db.insert(chatRooms).values({ name: `roomB-${SFX}`, accessMask: "255", createdBy: leaderId }).returning({ id: chatRooms.id });
    roomA = ra.id; roomB = rb.id;
    // three messages across the two rooms, ascending time
    for (const [room, who, content] of [[roomA, memberId, "first in A"], [roomB, leaderId, "second in B"], [roomA, memberId, "third in A"]] as const) {
      const [msg] = await db.insert(messages).values({ roomId: room, userId: who, content }).returning({ id: messages.id });
      msgIds.push(msg.id);
    }
  });

  after(async () => {
    await db.delete(messages).where(inArray(messages.id, msgIds));
    await db.delete(chatRooms).where(inArray(chatRooms.id, [roomA, roomB]));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await db.delete(users).where(inArray(users.id, [leaderId, memberId]));
    await pool.end();
  });

  it("userIsLeader is true for a LEADER, false for a plain member and a non-member", async () => {
    assert.equal(await userIsLeader(scootId, leaderId), true);
    assert.equal(await userIsLeader(scootId, memberId), false);
    assert.equal(await userIsLeader(scootId, 999999), false);
  });

  it("feed returns messages across ALL rooms, newest-first, with author + room", async () => {
    const feed = await getLeaderMessageFeed({ limit: 200 });
    const mine = feed.filter((f) => f.roomId === roomA || f.roomId === roomB);
    assert.equal(mine.length, 3);
    // newest-first: our inserted ids descending
    assert.deepEqual(mine.map((f) => f.id), [...msgIds].reverse());
    const third = mine.find((f) => f.content === "third in A")!;
    assert.equal(third.author, "Reg Member");
    assert.equal(third.roomName, `roomA-${SFX}`);
  });

  it("respects the limit", async () => {
    const feed = await getLeaderMessageFeed({ limit: 2 });
    assert.equal(feed.length <= 2, true);
  });

  it("beforeId pages to strictly older messages", async () => {
    const feed = await getLeaderMessageFeed({ beforeId: msgIds[1], limit: 200 });
    const mine = feed.filter((f) => f.roomId === roomA || f.roomId === roomB);
    assert.equal(mine.every((f) => f.id < msgIds[1]), true);
    assert.deepEqual(mine.map((f) => f.id), [msgIds[0]]); // only the first message is older
  });
});
