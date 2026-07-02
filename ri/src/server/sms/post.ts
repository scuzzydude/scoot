// Canonical "post a member-authored message into a room" for the SMS transport.
// Inserts the message and mirrors it to SMS (fan-out is a no-op unless the room
// is an sms_mirror room). Used by both the explicit note:/post: command and
// §8.5 group auto-posting, so the two never diverge.
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { fanOutToSms } from "./fanout.js";
import { log } from "../log.js";

export async function postMemberMessage(roomId: number, userId: number, content: string): Promise<number> {
  const [row] = await db.insert(messages).values({ roomId, userId, content }).returning({ id: messages.id });
  void fanOutToSms({ messageId: row.id, roomId, authorId: userId, content })
    .catch((err) => log.error({ err, roomId }, "fanOutToSms (post) threw"));
  return row.id;
}
