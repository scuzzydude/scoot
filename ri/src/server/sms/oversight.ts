// LEADER oversight — §7 / §8.7 of arch/sms-rooms.md.
//
// "No messages are private." A per-Scoot LEADER gets an all-messages view across
// every room, BYPASSING accessMask — an authority-gated read, nothing more. This
// is why the no-privacy disclaimer (disclaimer.ts) is mandatory.
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, messages, scootMembers, users, ScootFlags } from "../db/schema.js";

// Does this user hold LEADER in this Scoot? (The oversight gate.)
export async function userIsLeader(scootId: number, userId: number): Promise<boolean> {
  const [m] = await db
    .select({ f: scootMembers.userFlags })
    .from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return !!m && (BigInt(m.f) & ScootFlags.LEADER) !== 0n;
}

export interface FeedItem {
  id: number;
  roomId: number;
  roomName: string | null;
  userId: number;
  author: string;
  content: string;
  createdAt: Date;
}

// All messages across all rooms, newest first, bypassing accessMask. Keyset
// pagination by message id (beforeId → older page). Caller MUST gate on
// userIsLeader first (the route does).
//
// NOTE: single-Scoot deployment — every group room is Fonde's, so this returns
// all rooms. When a second Scoot exists, scope by a `chat_rooms.scoot_id` column
// (rooms aren't Scoot-linked in the schema yet). Tracked for §8.8/multi-Scoot.
export async function getLeaderMessageFeed(
  opts: { limit?: number; beforeId?: number } = {},
): Promise<FeedItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      roomName: chatRooms.name,
      userId: messages.userId,
      displayName: users.displayName,
      username: users.username,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(chatRooms, eq(chatRooms.id, messages.roomId))
    .innerJoin(users, eq(users.id, messages.userId))
    .where(opts.beforeId ? lt(messages.id, opts.beforeId) : undefined)
    .orderBy(desc(messages.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    roomId: r.roomId,
    roomName: r.roomName,
    userId: r.userId,
    author: r.displayName ?? r.username ?? `user ${r.userId}`,
    content: r.content,
    createdAt: r.createdAt,
  }));
}
