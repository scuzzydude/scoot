import { Router } from "express";
import { db } from "../db/index.js";
import { chatRooms, messages, roomMembers } from "../db/schema.js";
import { eq, lt, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createRoomSchema, sendMessageSchema } from "../../shared/schema.js";

const router = Router();
router.use(requireAuth);

router.get("/rooms", async (req, res) => {
  const userId = (req.user as { id: number }).id;
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

  const msgs = await db.query.messages.findMany({
    where: before
      ? (m, { and }) => and(eq(m.roomId, roomId), lt(m.createdAt, new Date(before)))
      : eq(messages.roomId, roomId),
    orderBy: [desc(messages.createdAt)],
    limit: 50,
  });

  res.json({ ok: true, data: msgs.reverse() });
});

router.post("/rooms/:id/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const roomId = parseInt(req.params.id);

  const [msg] = await db.insert(messages).values({
    roomId,
    userId,
    content: parsed.data.content,
    mediaUrl: parsed.data.mediaUrl ?? null,
  }).returning();

  res.status(201).json({ ok: true, data: msg });
});

export default router;
