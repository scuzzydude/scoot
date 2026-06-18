import { Router } from "express";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, users, bots, dmPairs } from "../db/schema.js";
import { eq, lt, desc, and, ne, asc, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema, moveRoomSchema, sendMessageSchema } from "../../shared/schema.js";
import { broadcast } from "../ws/chat-ws.js";
import { handleMentions } from "../services/bot-mentions.js";
import { log } from "../log.js";

const router = Router();
router.use(requireAuth);

// ── Room serialization ──────────────────────────────────────────────────────
// One SQL shape, used both for the full list and for single-room responses, so
// the client-facing Room contract (roomType / parentId / peerLabel / pinnedModel
// / peer / unreadCount) is computed identically everywhere.

interface RoomRow {
  id: number;
  name: string | null;
  room_type: string;
  parent_id: number | null;
  pinned_model: string | null;
  is_dm: boolean;
  created_by: number;
  created_at: Date;
  last_content: string | null;
  last_at: Date | null;
  peer_id: number | null;
  peer_username: string | null;
  peer_display_name: string | null;
  other_human_count: number;
  unread_count: number;
}

function roomQuery(filterClause: string): string {
  // $1 = viewer id. filterClause may reference $2.
  return `
    SELECT
      r.id, r.name, r.room_type, r.parent_id, r.pinned_model, r.is_dm, r.created_by, r.created_at,
      lm.content AS last_content,
      lm.created_at AS last_at,
      oh.id AS peer_id,
      oh.username AS peer_username,
      oh.display_name AS peer_display_name,
      (
        SELECT COUNT(*)::int
        FROM room_members rmh
        INNER JOIN users uu ON uu.id = rmh.user_id
        WHERE rmh.room_id = r.id AND rmh.user_id <> $1 AND uu.is_bot = false
      ) AS other_human_count,
      (
        SELECT COUNT(*)::int
        FROM messages
        WHERE room_id = r.id
          AND (rm_self.last_read_at IS NULL OR created_at > rm_self.last_read_at)
      ) AS unread_count
    FROM chat_rooms r
    INNER JOIN room_members rm_self
      ON rm_self.room_id = r.id AND rm_self.user_id = $1
    LEFT JOIN LATERAL (
      SELECT content, created_at
      FROM messages
      WHERE room_id = r.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT u.id, u.username, u.display_name
      FROM room_members rm_other
      INNER JOIN users u ON u.id = rm_other.user_id
      WHERE rm_other.room_id = r.id
        AND rm_other.user_id <> $1
        AND u.is_bot = false
      ORDER BY u.id
      LIMIT 1
    ) oh ON true
    ${filterClause}
  `;
}

function serializeRoom(r: RoomRow) {
  // peerLabel groups the inbox: a 1:1 (human peer) groups under that person;
  // group/solo rooms group under a fixed "Group"; folders have no label.
  const peerLabel =
    r.room_type === "folder"
      ? null
      : r.other_human_count === 1
        ? r.peer_display_name ?? r.peer_username
        : "Group";
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    roomType: r.room_type,
    pinnedModel: r.pinned_model,
    peerLabel,
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastMessage: r.last_content ? { content: r.last_content, createdAt: r.last_at } : null,
    peer:
      r.is_dm && r.peer_id !== null
        ? { id: r.peer_id, username: r.peer_username!, displayName: r.peer_display_name }
        : null,
    unreadCount: r.unread_count,
  };
}

// Reload a single room in the canonical client shape for the given viewer.
async function loadRoomForViewer(roomId: number, viewerId: number) {
  const { rows } = await pool.query<RoomRow>(roomQuery("WHERE r.id = $2"), [viewerId, roomId]);
  return rows.length ? serializeRoom(rows[0]) : null;
}

router.get("/rooms", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const { rows } = await pool.query<RoomRow>(
    roomQuery("ORDER BY COALESCE(lm.created_at, r.created_at) DESC"),
    [userId]
  );
  res.json({ ok: true, data: rows.map(serializeRoom) });
});

router.post("/rooms/:id/read", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const roomId = parseInt(req.params.id);
  if (isNaN(roomId)) {
    res.status(400).json({ ok: false, error: "Invalid room id" });
    return;
  }
  await db
    .update(roomMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  res.json({ ok: true, data: null });
});

router.get("/users", async (req, res) => {
  const meId = (req.user as { id: number }).id;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(and(ne(users.id, meId), eq(users.isBot, false)))
    .orderBy(asc(users.username));
  res.json({ ok: true, data: rows });
});

// Everyone the viewer can start a conversation with — all humans, plus only
// ENABLED bots (a disabled bot shouldn't be offered as a participant).
router.get("/participants", async (req, res) => {
  const meId = (req.user as { id: number }).id;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isBot: users.isBot,
    })
    .from(users)
    .leftJoin(bots, eq(bots.userId, users.id))
    .where(and(ne(users.id, meId), or(eq(users.isBot, false), eq(bots.enabled, true))))
    .orderBy(asc(users.isBot), asc(users.username));
  res.json({ ok: true, data: rows });
});

router.post("/dms/:userId", async (req, res) => {
  const me = req.user as { id: number };
  const peerId = parseInt(req.params.userId);
  if (isNaN(peerId)) {
    res.status(400).json({ ok: false, error: "Invalid user id" });
    return;
  }
  if (peerId === me.id) {
    res.status(400).json({ ok: false, error: "Cannot DM yourself" });
    return;
  }

  const title = typeof (req.body as { title?: unknown })?.title === "string"
    ? ((req.body as { title: string }).title.trim() || null)
    : null;

  const peer = await db.query.users.findFirst({ where: eq(users.id, peerId) });
  if (!peer) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }
  if (peer.isBot) {
    res.status(400).json({ ok: false, error: "Cannot DM a bot" });
    return;
  }

  const userLo = Math.min(me.id, peerId);
  const userHi = Math.max(me.id, peerId);

  const existing = await db.query.dmPairs.findFirst({
    where: and(eq(dmPairs.userLo, userLo), eq(dmPairs.userHi, userHi)),
  });

  let roomId: number;
  if (existing) {
    roomId = existing.roomId;
  } else {
    const [room] = await db
      .insert(chatRooms)
      .values({ name: title, isDm: true, roomType: "dm", createdBy: me.id })
      .returning();
    roomId = room.id;

    try {
      await db.insert(dmPairs).values({ userLo, userHi, roomId });
    } catch {
      // Race: another request created the pair concurrently. Roll back our room and re-fetch.
      await db.delete(chatRooms).where(eq(chatRooms.id, roomId));
      const winner = await db.query.dmPairs.findFirst({
        where: and(eq(dmPairs.userLo, userLo), eq(dmPairs.userHi, userHi)),
      });
      if (!winner) {
        res.status(500).json({ ok: false, error: "DM creation failed" });
        return;
      }
      roomId = winner.roomId;
    }

    const existingMembers = await db
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(eq(roomMembers.roomId, roomId));
    const have = new Set(existingMembers.map((m) => m.userId));
    const toAdd = [me.id, peerId].filter((id) => !have.has(id));
    if (toAdd.length > 0) {
      await db.insert(roomMembers).values(toAdd.map((userId) => ({ roomId, userId })));
    }
  }

  const data = await loadRoomForViewer(roomId, me.id);
  res.json({ ok: true, data });
});

router.post("/rooms", async (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const { name, inviteIds, skipBots } = parsed.data;

  const [room] = await db
    .insert(chatRooms)
    .values({ name, isDm: false, roomType: "conversation", createdBy: userId })
    .returning();

  // Members: creator + any invited humans (deduped, excluding the creator). Bots
  // can't be invited as humans here — they join via the auto-join path below.
  const memberIds = new Set<number>([userId]);
  if (inviteIds?.length) {
    const validHumans = await db
      .select({ id: users.id })
      .from(users)
      .where(and(ne(users.id, userId), eq(users.isBot, false)));
    const allowed = new Set(validHumans.map((u) => u.id));
    for (const id of inviteIds) if (allowed.has(id)) memberIds.add(id);
  }
  await db.insert(roomMembers).values([...memberIds].map((id) => ({ roomId: room.id, userId: id })));

  if (!skipBots) {
    const autoJoinBots = await db
      .select({ userId: bots.userId })
      .from(bots)
      .innerJoin(users, eq(users.id, bots.userId))
      .where(and(eq(bots.autoJoinNewRooms, true), eq(bots.enabled, true), eq(users.isBot, true)));

    const botRows = autoJoinBots
      .filter((b) => !memberIds.has(b.userId))
      .map((b) => ({ roomId: room.id, userId: b.userId }));
    if (botRows.length > 0) await db.insert(roomMembers).values(botRows);
  }

  const data = await loadRoomForViewer(room.id, userId);
  res.status(201).json({ ok: true, data });
});

// Move / rename / pin-model — used by the sidebar's drag-to-folder and model picker.
router.patch("/rooms/:id", async (req, res) => {
  const me = req.user as { id: number };
  const roomId = parseInt(req.params.id);
  if (isNaN(roomId)) {
    res.status(400).json({ ok: false, error: "Invalid room id" });
    return;
  }
  const parsed = moveRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const check = await requireRoomMember(roomId, me.id);
  if (!("ok" in check)) {
    res.status(check.status).json({ ok: false, error: check.error });
    return;
  }

  const { name, parentId, pinnedModel } = parsed.data;
  const update: Partial<{ name: string; parentId: number | null; pinnedModel: string | null }> = {};
  if (name !== undefined) update.name = name;
  if (parentId !== undefined) update.parentId = parentId;
  if (pinnedModel !== undefined) update.pinnedModel = pinnedModel;

  if (Object.keys(update).length > 0) {
    await db.update(chatRooms).set(update).where(eq(chatRooms.id, roomId));
  }

  const data = await loadRoomForViewer(roomId, me.id);
  res.json({ ok: true, data });
});

router.get("/rooms/:id", async (req, res) => {
  const room = await db.query.chatRooms.findFirst({
    where: eq(chatRooms.id, parseInt(req.params.id)),
  });
  if (!room) {
    res.status(404).json({ ok: false, error: "Room not found" });
    return;
  }
  res.json({ ok: true, data: room });
});

router.get("/rooms/:id/messages", async (req, res) => {
  const roomId = parseInt(req.params.id);
  const before = req.query.before as string | undefined;

  const rows = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      userId: messages.userId,
      username: users.username,
      displayName: users.displayName,
      isBot: users.isBot,
      content: messages.content,
      mediaUrl: messages.mediaUrl,
      mediaName: messages.mediaName,
      mediaType: messages.mediaType,
      attachments: messages.attachments,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(
      before
        ? and(eq(messages.roomId, roomId), lt(messages.createdAt, new Date(before)))
        : eq(messages.roomId, roomId)
    )
    .orderBy(desc(messages.createdAt))
    .limit(50);

  res.json({ ok: true, data: rows.reverse() });
});

router.post("/rooms/:id/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const user = req.user as { id: number; username: string; displayName: string | null; isBot: boolean };
  const roomId = parseInt(req.params.id);

  const [msg] = await db
    .insert(messages)
    .values({
      roomId,
      userId: user.id,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl ?? null,
      mediaName: parsed.data.mediaName ?? null,
      mediaType: parsed.data.mediaType ?? null,
      attachments: parsed.data.attachments ?? null,
    })
    .returning();

  const msgPayload = {
    id: msg.id,
    roomId: msg.roomId,
    userId: msg.userId,
    username: user.username,
    displayName: user.displayName,
    isBot: user.isBot,
    content: msg.content,
    mediaUrl: msg.mediaUrl,
    mediaName: msg.mediaName,
    mediaType: msg.mediaType,
    attachments: msg.attachments ?? null,
    createdAt: msg.createdAt.toISOString(),
  };

  broadcast(roomId, { type: "message", roomId, message: msgPayload });
  res.status(201).json({ ok: true, data: msgPayload });

  void handleMentions({
    roomId,
    authorId: user.id,
    authorIsBot: user.isBot,
    content: msg.content,
  }).catch((err) => log.error({ err, roomId, messageId: msg.id }, "handleMentions threw"));
});

async function requireRoomMember(
  roomId: number,
  userId: number
): Promise<
  | { ok: true; room: { id: number; isDm: boolean } }
  | { status: number; error: string }
> {
  const room = await db.query.chatRooms.findFirst({ where: eq(chatRooms.id, roomId) });
  if (!room) return { status: 404, error: "Room not found" };
  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)),
  });
  if (!membership) return { status: 403, error: "Not a member of this room" };
  return { ok: true, room: { id: room.id, isDm: room.isDm } };
}

router.get("/rooms/:id/members", async (req, res) => {
  const me = req.user as { id: number };
  const roomId = parseInt(req.params.id);
  if (isNaN(roomId)) {
    res.status(400).json({ ok: false, error: "Invalid room id" });
    return;
  }
  const check = await requireRoomMember(roomId, me.id);
  if (!("ok" in check)) {
    res.status(check.status).json({ ok: false, error: check.error });
    return;
  }
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isBot: users.isBot,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt));
  res.json({ ok: true, data: rows });
});

router.post("/rooms/:id/members", async (req, res) => {
  const me = req.user as { id: number };
  const roomId = parseInt(req.params.id);
  const targetId = Number((req.body as { userId?: unknown })?.userId);
  if (isNaN(roomId) || !Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ ok: false, error: "Invalid room or user id" });
    return;
  }

  const check = await requireRoomMember(roomId, me.id);
  if (!("ok" in check)) {
    res.status(check.status).json({ ok: false, error: check.error });
    return;
  }
  if (check.room.isDm) {
    res.status(400).json({ ok: false, error: "Cannot add members to a DM" });
    return;
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!target) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }
  if (target.isBot) {
    res.status(400).json({
      ok: false,
      error: "Bots are added via the bot:invite CLI, not the chat UI",
    });
    return;
  }

  const existing = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetId)),
  });
  if (!existing) {
    await db.insert(roomMembers).values({ roomId, userId: targetId });
  }

  res.json({
    ok: true,
    data: {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      isBot: target.isBot,
    },
  });
});

export default router;
