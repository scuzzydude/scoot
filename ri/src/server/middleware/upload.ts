import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";

const storage = multer.diskStorage({
  destination: process.env.MEDIA_DIR ?? "/tmp/scoot-media",
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  // All file types accepted (general file transfer). Non-image types are served
  // with Content-Disposition: attachment + nosniff (see /media in app.ts), so an
  // uploaded HTML/SVG can't execute inline in the app origin.
});
