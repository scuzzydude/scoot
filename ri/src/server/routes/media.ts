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
  const filename = path.basename(req.file.path);

  const [record] = await db.insert(media).values({
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storagePath: req.file.path,
    uploadedBy: userId,
  }).returning();

  res.status(201).json({ ok: true, data: { id: record.id, url: `/media/${filename}` } });
});

export default router;
