// Card source-photo intake: a member texts BigMo a photo (bare, or with a
// message mentioning their card) and it is stored content-addressed in
// card_art as a 'source' row, ready for the render pipeline. Nothing is
// generated here -- this is the durable, hash-tracked intake only. The same
// photo texted twice is recognised by hash and not stored again.
//
// Text-only queries: "my photos" / "card photos" lists what's on file.
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cardArt, cardLinks, playerCards, scootMembers } from "../db/schema.js";
import { fetchTwilioMediaBytes } from "./media-download.js";
import { log } from "../log.js";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/tmp/scoot-media";
const CARD_ART_SUBDIR = "card-art";
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

const PHOTO_LIST_PATTERN = /^(my |card |list )*(card )?(photos|pics|pictures)$/i;
// A photo accompanied by text: only treat it as a card photo if the text
// mentions card/photo/pic (or is empty), so an unrelated MMS in the middle of
// a conversation isn't silently filed as card art.
const PHOTO_INTENT_PATTERN = /\b(card|photo|pic|picture|headshot|selfie)\b/i;

export type CardArtRow = typeof cardArt.$inferSelect;

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

async function activeCardSerial(scootId: number, userId: number): Promise<string | null> {
  const [row] = await db.select({ serial: cardLinks.cardSerial })
    .from(cardLinks)
    .where(and(eq(cardLinks.scootId, scootId), eq(cardLinks.userId, userId), eq(cardLinks.isActive, true)))
    .limit(1);
  return row?.serial ?? null;
}

// Stores one source photo. Returns the row (new or pre-existing for a repeat
// upload) and whether it was new. Transport-agnostic: the bytes can come from
// Twilio, a web upload, or a test script.
export async function saveCardSourcePhoto(opts: {
  scootId: number;
  userId: number;
  buf: Buffer;
  ext: string;
  mime: string;
  origin: "sms" | "web" | "pipeline";
  meta?: Record<string, unknown>;
}): Promise<{ row: CardArtRow; isNew: boolean }> {
  const hash = createHash("sha256").update(opts.buf).digest("hex");
  const [existing] = await db.select().from(cardArt).where(eq(cardArt.hash, hash));
  if (existing) return { row: existing, isNew: false };

  const dir = path.join(MEDIA_DIR, CARD_ART_SUBDIR);
  await mkdir(dir, { recursive: true });
  const filename = `${hash}${opts.ext}`;
  await writeFile(path.join(dir, filename), opts.buf, { flag: "wx" }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "EEXIST") throw err; // same bytes already on disk from an earlier attempt -- fine
  });

  const cardSerial = await activeCardSerial(opts.scootId, opts.userId);
  const [row] = await db.insert(cardArt).values({
    hash,
    kind: "source",
    scootId: opts.scootId,
    userId: opts.userId,
    cardSerial,
    mediaUrl: `/media/${CARD_ART_SUBDIR}/${filename}`,
    mime: opts.mime,
    bytes: opts.buf.length,
    origin: opts.origin,
    status: "received",
    meta: opts.meta ?? {},
  }).returning();
  log.info({ hash: shortHash(hash), userId: opts.userId, cardSerial, bytes: opts.buf.length }, "card art: source photo stored");
  return { row, isNew: true };
}

export async function listCardSourcePhotos(scootId: number, userId: number): Promise<CardArtRow[]> {
  return db.select().from(cardArt)
    .where(and(eq(cardArt.scootId, scootId), eq(cardArt.userId, userId), eq(cardArt.kind, "source")))
    .orderBy(desc(cardArt.createdAt))
    .limit(10);
}

// SMS entry point. Returns null if this message isn't card-photo related
// (caller falls through). Must run BEFORE bigmo.ts's bare-photo guard.
export async function tryHandleCardPhotoCommand(
  userId: number,
  scootId: number,
  trimmed: string,
  mediaUrls: string[],
): Promise<string | null> {
  const hasPhoto = mediaUrls.length > 0;

  if (!hasPhoto) {
    if (!PHOTO_LIST_PATTERN.test(trimmed.trim())) return null;
    const rows = await listCardSourcePhotos(scootId, userId);
    if (!rows.length) return "No card photos on file for you yet. Text me a photo and I'll save it as a card photo.";
    const lines = rows.map((r) => `${shortHash(r.hash)}  ${r.status}  ${r.createdAt.toISOString().slice(0, 10)}`);
    return `Your card photos (newest first):\n${lines.join("\n")}`;
  }

  if (trimmed && !PHOTO_INTENT_PATTERN.test(trimmed)) return null;

  const [member] = await db.select({ userId: scootMembers.userId })
    .from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  if (!member) return "Got the photo, but I can only keep card photos for Fonde Brotherhood members — check with Brandon.";

  const saved: string[] = [];
  const dupes: string[] = [];
  let failed = 0;
  for (const url of mediaUrls) {
    const media = await fetchTwilioMediaBytes(url);
    if (!media) { failed++; continue; }
    if (!media.mime.startsWith("image/")) { failed++; continue; }
    if (media.buf.length > MAX_SOURCE_BYTES) { failed++; continue; }
    const { row, isNew } = await saveCardSourcePhoto({
      scootId, userId, buf: media.buf, ext: media.ext, mime: media.mime, origin: "sms",
      meta: { twilioMediaUrl: url, note: trimmed || undefined },
    });
    (isNew ? saved : dupes).push(shortHash(row.hash));
  }

  let cardName = "";
  const serial = await activeCardSerial(scootId, userId);
  if (serial) {
    const [card] = await db.select({ handle: playerCards.handle, aka: playerCards.aka })
      .from(playerCards).where(eq(playerCards.serial, serial));
    if (card) cardName = ` for ${card.aka || card.handle}`;
  }

  const parts: string[] = [];
  if (saved.length) parts.push(`Saved ${saved.length === 1 ? "card photo" : `${saved.length} card photos`}${cardName}: ${saved.join(", ")}. I'll render it and send the result for approval.`);
  if (dupes.length) parts.push(`Already had ${dupes.join(", ")} on file.`);
  if (failed) parts.push(`${failed} attachment${failed === 1 ? "" : "s"} couldn't be saved (not an image, too large, or download failed).`);
  return parts.join(" ") || "Couldn't read that attachment.";
}
