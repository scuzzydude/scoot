import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { db } from "../db/index.js";
import { media } from "../db/schema.js";
import path from "path";

const router = Router();
router.use(requireAuth);

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: "No file uploaded" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const baseUrl = process.env.MEDIA_BASE_URL ?? "http://localhost:3000/media";

  const [record] = await db.insert(media).values({
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storagePath: req.file.path,
    uploadedBy: userId,
  }).returning();

  const url = `${baseUrl}/${record.id}/${path.basename(req.file.path)}`;
  res.status(201).json({ ok: true, data: { id: record.id, url } });
});

router.get("/:id", (_req, res) => {
  res.status(501).json({ ok: false, error: "Signed URL generation — Phase 4" });
});

export default router;
