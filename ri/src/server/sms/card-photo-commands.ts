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
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { cardArt, cardLinks, playerCards, scootMembers } from "../db/schema.js";
import { fetchTwilioMediaBytes } from "./media-download.js";
import { log } from "../log.js";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/tmp/scoot-media";
const CARD_ART_SUBDIR = "card-art";
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
// Photos (= renders) a member may submit per rolling 24h. Cost is cents per
// render; the limit is about queue fairness (Modal runs one at a time) and
// approval-message volume, not money. The host worker enforces it too.
const RENDERS_PER_DAY = Number(process.env.CARD_RENDERS_PER_DAY ?? 5);

const PHOTO_LIST_PATTERN = /^(my |card |list )*(card )?(photos|pics|pictures)$/i;
// A photo accompanied by text: only treat it as a card photo if the text
// mentions card/photo/pic (or is empty), so an unrelated MMS in the middle of
// a conversation isn't silently filed as card art.
const PHOTO_INTENT_PATTERN = /\b(card|photo|pic|picture|headshot|selfie)\b/i;
// Text-only "use this as my card pic" / "new card photo" -- the photo itself
// usually arrives as a separate MMS a second before or after (phones split
// text + attachment into two webhooks), so answer in terms of what's on file.
const CARD_PIC_TEXT_PATTERN = /\b(card|profile)\s*(pic|photo|picture|shot)s?\b|\bas my card\b/i;
const RECENT_PHOTO_WINDOW_MS = 10 * 60 * 1000;
// Approval loop for a finished render: the member (or Brandon, during the
// trial) texts "approve card" to make the newest rendered card THE card
// ("my card" sends it from then on), or "reject card" to bin it. Only the
// newest rendered-but-undecided card is in play at any time.
const APPROVE_PATTERN = /^(approve|accept|keep|yes)( (my |the |new )?card)?$/i;
const REJECT_PATTERN = /^(reject|decline|no|redo|nope)( (my |the |new )?card)?$/i;

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

async function pendingRenderedCard(scootId: number, userId: number): Promise<CardArtRow | null> {
  const [row] = await db.select().from(cardArt)
    .where(and(
      eq(cardArt.scootId, scootId), eq(cardArt.userId, userId),
      eq(cardArt.kind, "render"), eq(cardArt.status, "rendered"),
      sql`${cardArt.meta}->>'stage' = 'card'`,
    ))
    .orderBy(desc(cardArt.createdAt))
    .limit(1);
  return row ?? null;
}

// Approve: the render becomes the card's front image (player_cards.frontImageUrl),
// so "my card" and the app both show it. Reject: just mark it; the file and
// row stay (nothing in card_art is ever deleted -- it's the version history).
export async function applyCardDecision(render: CardArtRow, decision: "approved" | "rejected"): Promise<string> {
  await db.transaction(async (tx) => {
    await tx.update(cardArt).set({ status: decision }).where(eq(cardArt.hash, render.hash));
    if (decision === "approved" && render.cardSerial) {
      await tx.update(playerCards).set({ frontImageUrl: render.mediaUrl }).where(eq(playerCards.serial, render.cardSerial));
    }
  });
  log.info({ hash: shortHash(render.hash), cardSerial: render.cardSerial, decision }, "card art: decision");
  return decision === "approved"
    ? `Done — ${shortHash(render.hash)} is your card now. Text "my card" any time to see it.`
    : `Got it, ${shortHash(render.hash)} is out. Send another photo whenever you want a redo.`;
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
    const t = trimmed.trim();
    if (APPROVE_PATTERN.test(t) || REJECT_PATTERN.test(t)) {
      const decision = APPROVE_PATTERN.test(t) ? "approved" : "rejected";
      const pending = await pendingRenderedCard(scootId, userId);
      if (!pending) {
        // A bare "yes"/"no" with nothing pending isn't ours -- let the LLM have it.
        if (/^(yes|no|nope)$/i.test(t)) return null;
        return "No new card waiting on your say-so right now. Text me a photo and I'll make one.";
      }
      return applyCardDecision(pending, decision);
    }
    if (!PHOTO_LIST_PATTERN.test(t)) {
      if (!CARD_PIC_TEXT_PATTERN.test(trimmed)) return null;
      const [latest] = await listCardSourcePhotos(scootId, userId);
      if (latest && Date.now() - latest.createdAt.getTime() < RECENT_PHOTO_WINDOW_MS) {
        return `Got it — the photo you just sent (${shortHash(latest.hash)}) is saved as your card photo. I'll render it and send you the result to approve.`;
      }
      return "Send me the photo and I'll save it as your card photo. Face the camera, good light, arm's length works best.";
    }
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

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ n: todayCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(cardArt)
    .where(and(eq(cardArt.scootId, scootId), eq(cardArt.userId, userId), eq(cardArt.kind, "source"), gte(cardArt.createdAt, since)));
  if (todayCount >= RENDERS_PER_DAY) {
    return `You've sent ${todayCount} card photos in the last day -- that's the limit (${RENDERS_PER_DAY}). Try again tomorrow.`;
  }

  const saved: string[] = [];
  const dupes: string[] = [];
  let failed = 0;
  for (const url of mediaUrls.slice(0, RENDERS_PER_DAY - todayCount)) {
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
  if (saved.length) parts.push(`Saved ${saved.length === 1 ? "card photo" : `${saved.length} card photos`}${cardName}: ${saved.join(", ")}. Give me a few minutes -- I'll text you the card to approve.`);
  if (dupes.length) parts.push(`Already had ${dupes.join(", ")} on file.`);
  if (failed) parts.push(`${failed} attachment${failed === 1 ? "" : "s"} couldn't be saved (not an image, too large, or download failed).`);
  return parts.join(" ") || "Couldn't read that attachment.";
}
