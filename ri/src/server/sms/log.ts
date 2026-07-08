// Per-user SMS log — §8.8 of arch/sms-rooms.md.
//
// Renders sms_deliveries as an SMS transcript: the truthful record of what
// actually went over the wire for one member — BigMo replies, room fan-out they
// received, their own posts, and system notices (disclaimer). Newest-first,
// keyset-paginated by delivery id.
import { desc, eq, lt, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, smsDeliveries, users } from "../db/schema.js";

export interface SmsLogItem {
  id: number;
  direction: "in" | "out";
  body: string;
  roomId: number | null;
  roomName: string | null;
  twilioSid: string | null;
  createdAt: Date;
}

export async function getUserSmsLog(
  userId: number,
  opts: { limit?: number; beforeId?: number } = {},
): Promise<SmsLogItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = await db
    .select({
      id: smsDeliveries.id,
      direction: smsDeliveries.direction,
      body: smsDeliveries.body,
      roomId: smsDeliveries.roomId,
      roomName: chatRooms.name,
      twilioSid: smsDeliveries.twilioSid,
      createdAt: smsDeliveries.createdAt,
    })
    .from(smsDeliveries)
    .leftJoin(chatRooms, eq(chatRooms.id, smsDeliveries.roomId))
    .where(
      opts.beforeId
        ? and(eq(smsDeliveries.userId, userId), lt(smsDeliveries.id, opts.beforeId))
        : eq(smsDeliveries.userId, userId),
    )
    .orderBy(desc(smsDeliveries.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    direction: r.direction as "in" | "out",
    body: r.body,
    roomId: r.roomId,
    roomName: r.roomName,
    twilioSid: r.twilioSid,
    createdAt: r.createdAt,
  }));
}

// Every user's SMS delivery, newest-first — the global sequential audit log
// (ScootFlags.TEXT_AUDIT gated). Each row carries whose text it is.
export interface AllSmsLogItem extends SmsLogItem {
  userId: number;
  who: string;
}

export async function getAllSmsLog(
  opts: { limit?: number; beforeId?: number } = {},
): Promise<AllSmsLogItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const rows = await db
    .select({
      id: smsDeliveries.id,
      direction: smsDeliveries.direction,
      body: smsDeliveries.body,
      roomId: smsDeliveries.roomId,
      roomName: chatRooms.name,
      twilioSid: smsDeliveries.twilioSid,
      createdAt: smsDeliveries.createdAt,
      userId: smsDeliveries.userId,
      displayName: users.displayName,
      username: users.username,
    })
    .from(smsDeliveries)
    .leftJoin(chatRooms, eq(chatRooms.id, smsDeliveries.roomId))
    .innerJoin(users, eq(users.id, smsDeliveries.userId))
    .where(opts.beforeId ? lt(smsDeliveries.id, opts.beforeId) : undefined)
    .orderBy(desc(smsDeliveries.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    direction: r.direction as "in" | "out",
    body: r.body,
    roomId: r.roomId,
    roomName: r.roomName,
    twilioSid: r.twilioSid,
    createdAt: r.createdAt,
    userId: r.userId,
    who: r.displayName ?? r.username ?? `user ${r.userId}`,
  }));
}
