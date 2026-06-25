// Persisted, room-scoped SMS conversation for BigMo. SMS turns are stored as
// `messages` rows (the same table the app chat uses — "two transports, one
// table"), so a Brother's BigMo thread survives restarts and is visible in the
// app. A known user's conversation lives in their active room, which defaults to
// a DM-with-BigMo room until inbound routing can switch it. See arch/sms-rooms.md.
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, dmPairs, messages, roomMembers, smsState, users } from "../db/schema.js";

let bigmoIdCache: number | null = null;
export async function getBigmoId(): Promise<number> {
  if (bigmoIdCache != null) return bigmoIdCache;
  const [b] = await db.select({ id: users.id }).from(users).where(eq(users.username, "bigmo"));
  if (!b) throw new Error("bigmo bot user not found");
  bigmoIdCache = b.id;
  return bigmoIdCache;
}

// Get-or-create the DM room between a user and BigMo (mirrors chat.ts dm logic,
// incl. the concurrent-create race recovery).
async function getBigmoDmRoom(userId: number): Promise<number> {
  const bigmoId = await getBigmoId();
  const lo = Math.min(userId, bigmoId);
  const hi = Math.max(userId, bigmoId);
  const existing = await db.query.dmPairs.findFirst({
    where: and(eq(dmPairs.userLo, lo), eq(dmPairs.userHi, hi)),
  });
  if (existing) return existing.roomId;

  const [room] = await db.insert(chatRooms)
    .values({ name: "BigMo", isDm: true, roomType: "dm", createdBy: userId })
    .returning({ id: chatRooms.id });
  const roomId = room.id;
  try {
    await db.insert(dmPairs).values({ userLo: lo, userHi: hi, roomId });
  } catch {
    await db.delete(chatRooms).where(eq(chatRooms.id, roomId));
    const winner = await db.query.dmPairs.findFirst({
      where: and(eq(dmPairs.userLo, lo), eq(dmPairs.userHi, hi)),
    });
    if (!winner) throw new Error("BigMo DM room creation failed");
    return winner.roomId;
  }
  await db.insert(roomMembers).values([{ roomId, userId }, { roomId, userId: bigmoId }]);
  return roomId;
}

// The user's active SMS room — where their inbound texts land. Defaults to the
// BigMo DM room; persisted in sms_state so routing can switch it later.
export async function getActiveRoom(userId: number): Promise<number> {
  const [st] = await db.select({ roomId: smsState.activeRoomId })
    .from(smsState).where(eq(smsState.userId, userId));
  if (st?.roomId != null) return st.roomId;
  const roomId = await getBigmoDmRoom(userId);
  await db.insert(smsState).values({ userId, activeRoomId: roomId })
    .onConflictDoUpdate({ target: smsState.userId, set: { activeRoomId: roomId, updatedAt: new Date() } });
  return roomId;
}

// Last `cap` turns in a room, oldest→newest, mapped to chat roles. BigMo's own
// messages become "assistant"; everyone else is "user".
export async function loadHistory(roomId: number, cap: number): Promise<{ role: string; content: string }[]> {
  const bigmoId = await getBigmoId();
  const rows = await db.select({ userId: messages.userId, content: messages.content })
    .from(messages).where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.id)).limit(cap);
  return rows.reverse().map((r) => ({
    role: r.userId === bigmoId ? "assistant" : "user",
    content: r.content,
  }));
}

// Append a turn. Direct insert (not via the chat route) so it doesn't re-trigger
// websocket broadcast or @mention bot dispatch — BigMo already authored the reply.
export async function appendTurn(roomId: number, userId: number, content: string): Promise<number> {
  const [row] = await db.insert(messages).values({ roomId, userId, content }).returning({ id: messages.id });
  return row.id;
}
