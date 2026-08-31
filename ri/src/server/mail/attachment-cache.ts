// Filesystem-only TTL cache for fetched attachment bytes -- no DB row.
// Re-fetching+re-parsing a whole message every time its attachment is
// re-opened is wasteful; this just avoids repeat IMAP round-trips within a
// session. Swept periodically, same interval-timer pattern as mail/poller.ts.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { log } from "../log.js";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h

function cacheDir(): string {
  const dir = process.env.MAIL_ATTACHMENT_CACHE_DIR ?? "/tmp/scoot-mail-attachments";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export interface CachedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

function keyFor(accountId: number, folder: string, uid: number, partId: string): string {
  return createHash("sha256").update(`${accountId}/${folder}/${uid}/${partId}`).digest("hex");
}

// filename/contentType are stored as a tiny JSON sidecar next to the bytes so
// a cache hit never needs to re-fetch/re-parse the message for metadata.
export function getCached(accountId: number, folder: string, uid: number, partId: string): CachedAttachment | null {
  const base = join(cacheDir(), keyFor(accountId, folder, uid, partId));
  if (!existsSync(base) || !existsSync(`${base}.json`)) return null;
  const meta = JSON.parse(readFileSync(`${base}.json`, "utf8"));
  return { filename: meta.filename, contentType: meta.contentType, content: readFileSync(base) };
}

export function setCached(accountId: number, folder: string, uid: number, partId: string, att: CachedAttachment): void {
  const base = join(cacheDir(), keyFor(accountId, folder, uid, partId));
  writeFileSync(base, att.content);
  writeFileSync(`${base}.json`, JSON.stringify({ filename: att.filename, contentType: att.contentType }));
}

function sweep(): void {
  const dir = cacheDir();
  const now = Date.now();
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      const stat = statSync(path);
      if (now - stat.mtimeMs > TTL_MS) {
        unlinkSync(path);
        removed++;
      }
    } catch {
      // file removed concurrently — ignore
    }
  }
  if (removed > 0) log.info({ removed }, "mail attachment cache: swept");
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAttachmentCacheSweeper(): void {
  timer = setInterval(sweep, SWEEP_INTERVAL_MS);
}

export function stopAttachmentCacheSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
