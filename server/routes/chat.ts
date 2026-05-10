import { Router } from "express";
import { db } from "../db/index.js";
import { chatRooms, messages, roomMembers, users } from "../db/schema.js";
import { eq, lt, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema, sendMessageSchema } from "../../shared/schema.js";
import { broadcast } from "../ws/chat-ws.js";

const router = Router();
router.use(requireAuth);

router.get("/rooms", async (_req, res) => {
  const rooms = await db.query.chatRooms.findMany({
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
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
  const user = req.user as { id: number; username: string };
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
    content: msg.content,
    mediaUrl: msg.mediaUrl,
    createdAt: msg.createdAt.toISOString(),
  };

  broadcast(roomId, { type: "message", roomId, message: msgPayload });
  res.status(201).json({ ok: true, data: msgPayload });
});

export default router;
