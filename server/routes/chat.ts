import { Router } from "express";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, users, bots, dmPairs } from "../db/schema.js";
import { eq, lt, desc, and, ne, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema, sendMessageSchema } from "../../shared/schema.js";
import { broadcast } from "../ws/chat-ws.js";
import { handleMentions } from "../services/bot-mentions.js";
import { log } from "../log.js";

const router = Router();
router.use(requireAuth);

router.get("/rooms", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const { rows } = await pool.query<{
    id: number;
    name: string | null;
    is_dm: boolean;
    created_by: number;
    created_at: Date;
    last_content: string | null;
    last_at: Date | null;
    peer_id: number | null;
    peer_username: string | null;
    peer_display_name: string | null;
  }>(
    `
    SELECT
      r.id, r.name, r.is_dm, r.created_by, r.created_at,
      lm.content AS last_content,
      lm.created_at AS last_at,
      peer.id AS peer_id,
      peer.username AS peer_username,
      peer.display_name AS peer_display_name
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
      WHERE r.is_dm = true
        AND rm_other.room_id = r.id
        AND rm_other.user_id <> $1
      LIMIT 1
    ) peer ON true
    ORDER BY COALESCE(lm.created_at, r.created_at) DESC
    `,
    [userId]
  );

  const rooms = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isDm: r.is_dm,
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastMessage: r.last_content
      ? { content: r.last_content, createdAt: r.last_at }
      : null,
    peer:
      r.is_dm && r.peer_id !== null
        ? { id: r.peer_id, username: r.peer_username!, displayName: r.peer_display_name }
        : null,
  }));

  res.json({ ok: true, data: rooms });
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
      .values({ name: null, isDm: true, createdBy: me.id })
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

  const room = await db.query.chatRooms.findFirst({ where: eq(chatRooms.id, roomId) });
  res.json({
    ok: true,
    data: {
      id: roomId,
      name: room?.name ?? null,
      isDm: true,
      createdBy: room?.createdBy ?? me.id,
      createdAt: room?.createdAt ?? new Date(),
      lastMessage: null,
      peer: { id: peer.id, username: peer.username, displayName: peer.displayName },
    },
  });
});

router.post("/rooms", async (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const [room] = await db
    .insert(chatRooms)
    .values({ name: parsed.data.name, isDm: false, createdBy: userId })
    .returning();
  await db.insert(roomMembers).values({ roomId: room.id, userId });

  const autoJoinBots = await db
    .select({ userId: bots.userId })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.userId))
    .where(and(eq(bots.autoJoinNewRooms, true), eq(bots.enabled, true), eq(users.isBot, true)));

  if (autoJoinBots.length > 0) {
    await db
      .insert(roomMembers)
      .values(autoJoinBots.map((b) => ({ roomId: room.id, userId: b.userId })));
  }

  res.status(201).json({
    ok: true,
    data: {
      id: room.id,
      name: room.name,
      isDm: room.isDm,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
      lastMessage: null,
      peer: null,
    },
  });
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
    .values({ roomId, userId: user.id, content: parsed.data.content, mediaUrl: parsed.data.mediaUrl ?? null })
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

export default router;
