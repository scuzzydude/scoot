// Player-card commands — "my card" / claim-by-code / self-edit profile text.
// Shared core used by BOTH SMS (bigmo.ts) and webchat @mentions
// (bot-mentions.ts) — the lookup/write logic is transport-agnostic; each
// caller handles its own delivery (SMS: throttledSend with a fully-
// qualified media URL; webchat: postBotMessage with an app-relative one).
// Explicit-keyword-only, matching the rest of the SMS command surface
// (§8.3, see trust-commands.ts) — a whole-message or clear-prefix match, so
// normal chatter never gets hijacked. See
// .claude/plans/zazzy-petting-marshmallow.md for the full design.
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { playerCards, scootMembers } from "../db/schema.js";
import { throttledSend } from "./send.js";
import { log } from "../log.js";

export type PlayerCard = typeof playerCards.$inferSelect;

// player_cards.front_image_url is stored as an app-relative path
// ("/media/card-....png", same convention messages.mediaUrl already uses)
// so webchat can use it as-is. MMS needs a fully-qualified public URL —
// Twilio fetches it server-side, a relative path means nothing to them.
// MEDIA_BASE_URL is documented as the full base ("https://host/media"); this
// strips a trailing "/media" so concatenating with the stored path (which
// already starts with "/media/") doesn't double it up, regardless of
// whether the env var was set with or without that suffix.
export function absoluteMediaUrl(relativePath: string): string {
  const base = (process.env.MEDIA_BASE_URL ?? "http://localhost:3000/media").replace(/\/media\/?$/, "");
  return `${base}${relativePath}`;
}

const CODE_PATTERN = /^[0-9a-f]{6}$/i;
const MAX_PROFILE_LINES = 3;
const MAX_LINE_CHARS = 28; // arch/player-cards.md: hard limit, longer runs off the card

async function getLinkedCard(scootId: number, userId: number): Promise<PlayerCard | null> {
  const [row] = await db.select({ cardSerial: scootMembers.cardSerial })
    .from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  if (!row?.cardSerial) return null;
  const [card] = await db.select().from(playerCards).where(eq(playerCards.serial, row.cardSerial));
  return card ?? null;
}

function splitProfileLines(text: string): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (lines.length >= MAX_PROFILE_LINES) break;
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > MAX_LINE_CHARS) {
      if (cur) lines.push(cur);
      cur = w.length > MAX_LINE_CHARS ? w.slice(0, MAX_LINE_CHARS) : w;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < MAX_PROFILE_LINES) lines.push(cur);
  return lines.slice(0, MAX_PROFILE_LINES);
}

export type CardCommandResult =
  // announceInline: true for a claim (the confirmation text matters on its
  // own, e.g. via TwiML's synchronous reply) vs. false for a plain "my
  // card" request (the MMS/webchat image already carries the message, an
  // extra synchronous text reply would just be a duplicate for SMS).
  | { kind: "send-card"; card: PlayerCard; text: string; announceInline: boolean }
  | { kind: "text"; text: string };

// Transport-agnostic core: figures out what a card-command message should
// do and does any DB read/write, but never sends anything itself. Returns
// null if `trimmed` isn't a card command at all (caller should fall through
// to its normal LLM/chat path).
export async function resolveCardCommand(
  userId: number,
  scootId: number,
  trimmed: string,
): Promise<CardCommandResult | null> {
  const norm = trimmed.trim().toLowerCase();

  if (norm === "my card" || norm === "send my card" || norm === "card") {
    const card = await getLinkedCard(scootId, userId);
    if (!card) {
      return { kind: "text", text: "Don't have a card linked to this number yet. Text me the 6-character code printed on your card (under the QR) and I'll link it." };
    }
    log.info({ userId, serial: card.serial }, "card command: sending");
    return { kind: "send-card", card, text: `Here's your card, ${card.aka || card.handle}!`, announceInline: false };
  }

  if (CODE_PATTERN.test(norm)) {
    const [card] = await db.select().from(playerCards).where(eq(playerCards.code, norm.toUpperCase()));
    if (!card) return null; // not a real code — let it fall through rather than a hard error
    const result = await db.update(scootMembers)
      .set({ cardSerial: card.serial })
      .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)))
      .returning({ userId: scootMembers.userId });
    if (!result.length) {
      log.warn({ userId, serial: card.serial }, "card claim: no scoot_members row to link");
      return { kind: "text", text: "Got the code, but I don't have you as a Fonde Brotherhood member yet — check with Brandon." };
    }
    log.info({ userId, serial: card.serial }, "card command: claimed");
    return { kind: "send-card", card, text: `Linked! You're ${card.aka || card.handle} — here's your card.`, announceInline: true };
  }

  if (norm === "my profile" || norm === "what's my profile" || norm === "whats my profile") {
    const card = await getLinkedCard(scootId, userId);
    if (!card) return { kind: "text", text: "Don't have a card linked to this number yet. Text me the code from your card and I'll link it." };
    const lines = [card.profile1, card.profile2, card.profile3].filter(Boolean);
    if (!lines.length) return { kind: "text", text: "Your profile's empty right now. Text \"set my profile: <text>\" to add one (up to 3 short lines)." };
    return { kind: "text", text: `Your profile:\n${lines.join("\n")}` };
  }

  const profileMatch = trimmed.match(/^set my profile:?\s*(.+)$/is);
  if (profileMatch) {
    const card = await getLinkedCard(scootId, userId);
    if (!card) return { kind: "text", text: "Don't have a card linked to this number yet. Text me the code from your card first, then try again." };
    const lines = splitProfileLines(profileMatch[1]);
    await db.update(playerCards)
      .set({ profile1: lines[0] ?? null, profile2: lines[1] ?? null, profile3: lines[2] ?? null })
      .where(eq(playerCards.serial, card.serial));
    log.info({ userId, serial: card.serial }, "card command: profile updated");
    return { kind: "text", text: `Saved:\n${lines.join("\n")}` };
  }

  const akaMatch = trimmed.match(/^set my aka:?\s*(.+)$/is);
  if (akaMatch) {
    const card = await getLinkedCard(scootId, userId);
    if (!card) return { kind: "text", text: "Don't have a card linked to this number yet. Text me the code from your card first, then try again." };
    const aka = akaMatch[1].trim().slice(0, MAX_LINE_CHARS);
    await db.update(playerCards).set({ aka }).where(eq(playerCards.serial, card.serial));
    log.info({ userId, serial: card.serial, aka }, "card command: aka updated");
    return { kind: "text", text: `Saved — aka "${aka}".` };
  }

  return null;
}

// SMS wrapper: sends the MMS itself (throttledSend, fully-qualified URL)
// and returns the TwiML-facing reply string. "" for a successful card send
// means the MMS already carries everything -- no separate text reply needed.
export async function tryHandleCardCommand(
  userId: number,
  phone: string,
  scootId: number,
  trimmed: string,
): Promise<string | null> {
  const result = await resolveCardCommand(userId, scootId, trimmed);
  if (result == null) return null;
  if (result.kind === "text") return result.text;

  const url = result.card.frontImageUrl ? absoluteMediaUrl(result.card.frontImageUrl) : undefined;
  await throttledSend(phone, result.text, url ? [url] : undefined);
  return result.announceInline ? result.text : "";
}
