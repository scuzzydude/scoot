import { Router } from "express";
import { db, pool } from "../db/index.js";
import { chatRooms, messages, roomMembers, users, bots } from "../db/schema.js";
import { eq, lt, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema, sendMessageSchema } from "../../shared/schema.js";
import { broadcast } from "../ws/chat-ws.js";
import { handleMentions } from "../services/bot-mentions.js";
import { log } from "../log.js";

const router = Router();
router.use(requireAuth);

router.get("/rooms", async (_req, res) => {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    created_by: number;
    created_at: Date;
    last_content: string | null;
    last_at: Date | null;
  }>(`
    SELECT
      r.id, r.name, r.created_by, r.created_at,
      lm.content AS last_content,
      lm.created_at AS last_at
    FROM chat_rooms r
    LEFT JOIN LATERAL (
      SELECT content, created_at
      FROM messages
      WHERE room_id = r.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(lm.created_at, r.created_at) DESC
  `);

  const rooms = rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastMessage: r.last_content
      ? { content: r.last_content, createdAt: r.last_at }
      : null,
  }));

  res.json({ ok: true, data: rooms });
});

router.post("/rooms", async (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const [room] = await db.insert(chatRooms).values({ name: parsed.data.name, createdBy: userId }).returning();
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

  res.status(201).json({ ok: true, data: room });
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
