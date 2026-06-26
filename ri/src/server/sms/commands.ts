// SMS member-write commands — §8.3 of arch/sms-rooms.md.
//
// EXPLICIT-KEYWORD ONLY (Brandon's call): an inbound text is treated as a member
// command only when it opens with an unambiguous verb. Everything else falls
// through to BigMo's conversational reply path, so normal chatter is never
// silently posted or misinterpreted.
//
// Two command families:
//   - post_note : "note: <text>" / "post: <text>"  → write <text> into the
//                 sender's active room as a real message authored by THEM
//                 (visible to the room / app, fanned out to SMS in §8.4).
//   - sms opt-in: "follow" / "mute" / "sms on" / "sms off"  → toggle this
//                 member's room_members.sms_enabled for the active room.
//
// Every reply carries the [room] context tag (arch/sms-rooms.md §4) so a Brother
// always sees where his text landed.
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, messages, roomMembers } from "../db/schema.js";
import { log } from "../log.js";

// Short room label for the [room] context tag that prefixes every ack.
async function roomTag(roomId: number): Promise<string> {
  const [r] = await db.select({ name: chatRooms.name }).from(chatRooms).where(eq(chatRooms.id, roomId));
  return r?.name ?? `room ${roomId}`;
}

// Try to handle an inbound as an explicit member-write command.
// Returns the ack string when handled, or null when the text is NOT a command
// (→ caller runs the BigMo conversation path).
export async function tryHandleCommand(
  userId: number,
  roomId: number,
  body: string,
): Promise<string | null> {
  // post_note — colon required, so a sentence that merely starts with "post"
  // ("post game we hit the gym") is NOT swallowed.
  const postMatch = body.match(/^(?:note|post)\s*:\s*/i);
  if (postMatch) {
    const tag = await roomTag(roomId);
    const text = body.slice(postMatch[0].length).trim();
    if (!text) return `[${tag}] Nothing to post — try "note: <your message>".`;
    await db.insert(messages).values({ roomId, userId, content: text });
    log.info({ userId, roomId, len: text.length }, "sms post_note");
    return `[${tag}] Posted.`;
  }

  // sms opt-in — the WHOLE message must be the command (short, deliberate words),
  // so "mute"/"follow" appearing inside a sentence to BigMo aren't hijacked.
  const opt = body.trim().toLowerCase();
  if (opt === "follow" || opt === "mute" || opt === "sms on" || opt === "sms off") {
    const tag = await roomTag(roomId);
    const enable = opt === "follow" || opt === "sms on";
    const res = await db.update(roomMembers)
      .set({ smsEnabled: enable })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
    // drizzle/pg returns rowCount; if the sender isn't a member of the active
    // room there's nothing to toggle.
    if ((res as { rowCount?: number }).rowCount === 0) {
      return `[${tag}] You're not in this group, so there's nothing to ${enable ? "follow" : "mute"}.`;
    }
    log.info({ userId, roomId, enable }, "sms opt-in toggle");
    return enable
      ? `[${tag}] You'll get this group's messages by text. Reply "mute" to stop.`
      : `[${tag}] Muted — no more texts from this group. Reply "follow" to turn it back on.`;
  }

  return null;
}
