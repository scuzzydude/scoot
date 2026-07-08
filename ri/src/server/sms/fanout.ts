// SMS outbound fan-out — §8.4 of arch/sms-rooms.md.
//
// When a message lands in an `sms_mirror` room, text every member who opted that
// room onto their phone (`room_members.sms_enabled`), prefixed `[room] author:
// body`, and log each send to `sms_deliveries`. This is the outbound half of
// "rooms are the backbone, app + SMS are two transports": one message, two paths.
//
// Two safety properties:
//  - GATED. Only rooms with `sms_mirror = true` fan out at all (a LEADER flips
//    that on per arch/sms-rooms.md §5), so a chatty app-only room can't blow the
//    A2P 10DLC long-code limits.
//  - THROTTLED. A single process-wide serialized queue spaces every outbound
//    text ~1/sec regardless of how many rooms fan out at once, staying under the
//    long-code ceiling. Fire-and-forget at the call site; never blocks the post.
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, roomMembers, smsDeliveries, users, UserFlags } from "../db/schema.js";
import { throttledSend } from "./send.js";
import { log } from "../log.js";

export interface FanOutInput {
  messageId: number | null;
  roomId: number;
  authorId: number;
  content: string;
  authorName?: string; // resolved from the DB if omitted
}

// Fan a freshly-posted room message out to SMS. No-op unless the room is an
// sms_mirror room with opted-in members other than the author.
export async function fanOutToSms(input: FanOutInput): Promise<void> {
  const { messageId, roomId, authorId, content } = input;
  if (!content.trim()) return;

  // Gate on the room's mirror flag before doing any other work.
  const [room] = await db
    .select({ name: chatRooms.name, smsMirror: chatRooms.smsMirror })
    .from(chatRooms)
    .where(eq(chatRooms.id, roomId));
  if (!room?.smsMirror) return;

  // Opted-in members, excluding the author. Bots / phone-less users filtered below.
  const recipients = await db
    .select({ userId: roomMembers.userId, phone: users.phone, flags: users.flags })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.smsEnabled, true),
        ne(roomMembers.userId, authorId),
      ),
    );
  if (!recipients.length) return;

  // Author label (passed in from the app path; looked up for SMS/bot paths).
  let authorName = input.authorName;
  if (!authorName) {
    const [a] = await db
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, authorId));
    authorName = a?.displayName ?? a?.username ?? `user ${authorId}`;
  }

  const tag = room.name ?? `room ${roomId}`;
  const body = `[${tag}] ${authorName}: ${content}`;

  let sent = 0;
  for (const r of recipients) {
    if (!r.phone || (r.flags & UserFlags.BOT) !== 0) continue;
    const sid = await throttledSend(r.phone, body);
    await db.insert(smsDeliveries).values({
      userId: r.userId,
      messageId,
      roomId,
      direction: "out",
      body,
      twilioSid: sid,
    });
    if (sid) sent++;
  }
  log.info({ roomId, eligible: recipients.length, sent }, "sms fan-out complete");
}
