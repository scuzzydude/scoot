// Per-user SMS log — §8.8 of arch/sms-rooms.md.
//
// Renders sms_deliveries as an SMS transcript: the truthful record of what
// actually went over the wire for one member — BigMo replies, room fan-out they
// received, their own posts, and system notices (disclaimer). Newest-first,
// keyset-paginated by delivery id.
import { desc, eq, lt, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, smsDeliveries } from "../db/schema.js";

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
