// SMS inbound routing — §8.5 + §4 of arch/sms-rooms.md.
//
// One phone number serves many rooms. Each user has a STICKY active room
// (sms_state.active_room_id). Layered on top:
//   v1 (§8.5) — explicit hard-switch: "@nba" / "go nba" / a bare room name /
//     "home"/"bigmo". A leading token switches the active room deterministically.
//   v2 (§4)   — when a GROUP is active and the text isn't a switch, SCORE which
//     room it belongs to. A clear winner posts; an ambiguous call asks to confirm
//     (state parked in sms_state.pending); "no, that was for prayers" UNDOES the
//     last post. Scoring is keyword/recency based — deterministic, no LLM.
//
// Home (the BigMo DM) stays conversational: plain text there talks to BigMo.
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, messages, roomMembers, smsDeliveries, smsState } from "../db/schema.js";
import { postMemberMessage } from "./post.js";
import { getPending, setPending } from "./pending.js";
import { log } from "../log.js";

interface UserRoom {
  id: number;
  name: string | null;
  isDm: boolean;
}

// Rooms this user belongs to (includes the BigMo DM, which is a room like any other).
async function getUserRooms(userId: number): Promise<UserRoom[]> {
  return db
    .select({ id: chatRooms.id, name: chatRooms.name, isDm: chatRooms.isDm })
    .from(roomMembers)
    .innerJoin(chatRooms, eq(chatRooms.id, roomMembers.roomId))
    .where(eq(roomMembers.userId, userId));
}

// Persist a new sticky active room (upsert only the active_room_id column so it
// never clobbers a parked `pending`).
export async function setActiveRoom(userId: number, roomId: number): Promise<void> {
  await db
    .insert(smsState)
    .values({ userId, activeRoomId: roomId })
    .onConflictDoUpdate({ target: smsState.userId, set: { activeRoomId: roomId, updatedAt: new Date() } });
}

// --- scoring (§4) ----------------------------------------------------------
const RECENT_REPLY_MS = 15 * 60 * 1000;      // a [room] broadcast that hit their phone
const RECENT_ACTIVITY_MS = 24 * 60 * 60 * 1000;

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []));
}

interface Scored { room: UserRoom; score: number; }

// score(room) = .40 active + .35 replying-to-recent(decayed) + .30 topical + .10 recent-activity
async function scoreRooms(
  userId: number,
  activeRoomId: number,
  body: string,
  groups: UserRoom[],
  now: number,
): Promise<Scored[]> {
  const bodyWords = words(body);
  const groupIds = groups.map((g) => g.id);

  // most-recent outbound delivery per room within the window (replying_to_recent)
  const recent = await db
    .select({ roomId: smsDeliveries.roomId, createdAt: smsDeliveries.createdAt })
    .from(smsDeliveries)
    .where(and(
      eq(smsDeliveries.userId, userId),
      eq(smsDeliveries.direction, "out"),
      gt(smsDeliveries.createdAt, new Date(now - RECENT_REPLY_MS)),
    ));
  const lastOut = new Map<number, number>();
  for (const r of recent) {
    if (r.roomId == null) continue;
    const t = r.createdAt.getTime();
    if (t > (lastOut.get(r.roomId) ?? 0)) lastOut.set(r.roomId, t);
  }

  // rooms with any message in the last day (recent_activity)
  const activeRooms = new Set<number>();
  if (groupIds.length) {
    const rows = await db
      .select({ roomId: messages.roomId })
      .from(messages)
      .where(and(inArray(messages.roomId, groupIds), gt(messages.createdAt, new Date(now - RECENT_ACTIVITY_MS))));
    for (const r of rows) activeRooms.add(r.roomId);
  }

  const topical = (room: UserRoom): number => {
    const nameWords = (room.name ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return nameWords.length && nameWords.some((w) => bodyWords.has(w)) ? 1 : 0;
  };

  return groups
    .map((room) => {
      let s = 0;
      if (room.id === activeRoomId) s += 0.4;
      const lo = lastOut.get(room.id);
      if (lo) s += 0.35 * Math.max(0, 1 - (now - lo) / RECENT_REPLY_MS);
      s += 0.3 * topical(room);
      if (activeRooms.has(room.id)) s += 0.1;
      return { room, score: s };
    })
    .sort((a, b) => b.score - a.score);
}

type Switch =
  | { roomId: number; name: string; isDm: boolean; rest: string }
  | { notFound: string };

function parseSwitch(body: string, rooms: UserRoom[], dmRoomId: number): Switch | null {
  let name: string | null = null;
  let rest = "";
  let explicit = false;

  const at = body.match(/^@([\w-]+)\s*([\s\S]*)$/);
  const go = body.match(/^go\s+([\w-]+)\s*$/i);
  if (at) {
    name = at[1];
    rest = at[2].trim();
    explicit = true;
  } else if (go) {
    name = go[1];
  } else {
    const l = body.toLowerCase();
    if (l === "home" || l === "bigmo") name = l;
    else if (rooms.some((r) => (r.name ?? "").toLowerCase() === l)) name = body;
    else return null;
  }

  const key = name.toLowerCase();
  if (key === "home" || key === "bigmo") {
    return { roomId: dmRoomId, name: "BigMo", isDm: true, rest };
  }
  const room = rooms.find((r) => !r.isDm && (r.name ?? "").toLowerCase() === key);
  if (!room) return explicit ? { notFound: name } : null;
  return { roomId: room.id, name: room.name ?? `room ${room.id}`, isDm: false, rest };
}

// "no, that was for prayers" / "wrong room — prayers" → the named group, when an
// undo-ish word AND a group name both appear.
function parseUndo(lower: string, groups: UserRoom[]): UserRoom | null {
  if (!/\b(no|not|wrong|oops|meant|undo|nvm|nope)\b/.test(lower)) return null;
  for (const g of groups) {
    const n = (g.name ?? "").toLowerCase();
    if (n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return g;
  }
  return null;
}

function renderRoomList(rooms: UserRoom[], activeRoomId: number): string {
  const groups = rooms.filter((r) => !r.isDm);
  const activeName = rooms.find((r) => r.id === activeRoomId)?.name ?? "BigMo";
  if (!groups.length) {
    return `You're just in BigMo right now (no groups yet). Active: ${activeName}.`;
  }
  const list = groups.map((r) => `${r.id === activeRoomId ? "→ " : "  "}${r.name}`).join("\n");
  return `Your groups:\n${list}\nActive: ${activeName}. Text "@name" to switch, "home" for BigMo.`;
}

export interface RouteOutcome {
  handled: boolean;
  reply?: string;
  newActiveRoomId?: number;
}

export async function routeInbound(
  userId: number,
  dmRoomId: number,
  activeRoomId: number,
  body: string,
): Promise<RouteOutcome> {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();
  const rooms = await getUserRooms(userId);
  const groups = rooms.filter((r) => !r.isDm);
  const now = Date.now();
  const pending = await getPending(userId);
  const roomName = (r: UserRoom) => r.name ?? `room ${r.id}`;

  const doPost = async (room: UserRoom): Promise<RouteOutcome> => {
    const mid = await postMemberMessage(room.id, userId, trimmed);
    await setPending(userId, { kind: "posted", messageId: mid, roomId: room.id, roomName: roomName(room) });
    return { handled: true, reply: `[${roomName(room)}] Posted.` };
  };

  // (A) resolve a pending confirmation
  if (pending?.kind === "route_confirm") {
    const pick = pending.candidates.find((c) => lower === c.name.toLowerCase() || lower.includes(c.name.toLowerCase()));
    if (pick) {
      const mid = await postMemberMessage(pick.id, userId, pending.body);
      await setPending(userId, { kind: "posted", messageId: mid, roomId: pick.id, roomName: pick.name });
      log.info({ userId, roomId: pick.id }, "sms route confirm → posted");
      return { handled: true, reply: `[${pick.name}] Posted.` };
    }
    if (/^(no|nvm|nevermind|cancel|stop|skip)\b/.test(lower)) {
      await setPending(userId, null);
      return { handled: true, reply: `Okay, didn't post it.` };
    }
    // neither a pick nor a cancel → drop the prompt and treat this as a fresh message
    await setPending(userId, null);
  }

  // (B) status
  if (lower === "rooms" || lower === "where") {
    return { handled: true, reply: renderRoomList(rooms, activeRoomId) };
  }

  // (C) undo the last post ("no, that was for prayers")
  if (pending?.kind === "posted") {
    const undo = parseUndo(lower, groups);
    if (undo) {
      await db.update(messages).set({ roomId: undo.id }).where(eq(messages.id, pending.messageId));
      await setPending(userId, { kind: "posted", messageId: pending.messageId, roomId: undo.id, roomName: roomName(undo) });
      log.info({ userId, messageId: pending.messageId, roomId: undo.id }, "sms undo → moved last post");
      return { handled: true, reply: `Moved to [${roomName(undo)}].` };
    }
  }

  // (D) hard switch
  const sw = parseSwitch(trimmed, rooms, dmRoomId);
  if (sw) {
    if ("notFound" in sw) {
      return { handled: true, reply: `I don't see a group called "${sw.notFound}". Text "rooms" to see yours.` };
    }
    await setActiveRoom(userId, sw.roomId);
    log.info({ userId, roomId: sw.roomId, name: sw.name }, "sms active-room switch");
    if (sw.rest) {
      const mid = await postMemberMessage(sw.roomId, userId, sw.rest);
      await setPending(userId, { kind: "posted", messageId: mid, roomId: sw.roomId, roomName: sw.name });
      return { handled: true, reply: `[${sw.name}] Posted.`, newActiveRoomId: sw.roomId };
    }
    const guide = sw.isDm
      ? `[BigMo] You're back with BigMo — text me anything.`
      : `[${sw.name}] You're in ${sw.name}. Text to post here; reply "home" for BigMo.`;
    return { handled: true, reply: guide, newActiveRoomId: sw.roomId };
  }

  // (E) active room behaviour
  const active = rooms.find((r) => r.id === activeRoomId);
  if (!active || active.isDm) return { handled: false }; // home → BigMo converses

  // (F) scored routing among the user's groups
  const scored = await scoreRooms(userId, activeRoomId, trimmed, groups, now);
  const best = scored[0];
  const second = scored[1];
  const clearWin = !!best && best.score >= 0.6 && (!second || best.score - second.score >= 0.2);
  const ambiguous = !clearWin && !!second && second.score >= 0.3;
  if (ambiguous) {
    const cands = [best, second].map((s) => ({ id: s.room.id, name: roomName(s.room) }));
    await setPending(userId, { kind: "route_confirm", body: trimmed, candidates: cands });
    log.info({ userId, cands }, "sms route ambiguous → confirm");
    return { handled: true, reply: `Post to [${cands[0].name}] or [${cands[1].name}]? reply the name.` };
  }
  return doPost(best?.room ?? active);
}
