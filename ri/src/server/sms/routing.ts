// SMS inbound routing — §8.5 of arch/sms-rooms.md (deterministic-first v1).
//
// One phone number serves many rooms. Each user has a STICKY active room
// (persisted in sms_state.active_room_id) that survives restarts. This v1 does
// EXPLICIT hard-switches only — no LLM/probabilistic scoring yet (Brandon's
// call: predictable and senior-safe). The §4 scored topical layer + confirm/undo
// is a tunable v2 that layers on top of this same active-room structure.
//
// Model:
//   - Active room is the BigMo DM (home)  → plain text is a CONVERSATION with
//     BigMo (handled by the caller, not here).
//   - Active room is a GROUP              → plain text AUTO-POSTS to that group
//     and fans out (§8.4). You "are in" the room, like a group chat.
//   - Switch the active room with "@nba" / "go nba" / a bare room name, and
//     "home" / "bigmo" to return to BigMo. "@nba <text>" switches AND posts.
//   - "rooms" / "where" lists your groups and shows which is active.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { chatRooms, roomMembers, smsState } from "../db/schema.js";
import { postMemberMessage } from "./post.js";
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

// Persist a new sticky active room (upsert mirrors conversation.ts).
export async function setActiveRoom(userId: number, roomId: number): Promise<void> {
  await db
    .insert(smsState)
    .values({ userId, activeRoomId: roomId })
    .onConflictDoUpdate({ target: smsState.userId, set: { activeRoomId: roomId, updatedAt: new Date() } });
}

type Switch =
  | { roomId: number; name: string; isDm: boolean; rest: string }
  | { notFound: string };

// Detect a hard-switch. Returns a resolved switch, a { notFound } for an explicit
// @x/go x with no matching room, or null when the text isn't a switch at all.
function parseSwitch(body: string, rooms: UserRoom[], dmRoomId: number): Switch | null {
  let name: string | null = null;
  let rest = "";
  let explicit = false; // the "@" sigil is a deliberate switch → unknown = error

  const at = body.match(/^@([\w-]+)\s*([\s\S]*)$/);
  const go = body.match(/^go\s+([\w-]+)\s*$/i);
  if (at) {
    name = at[1];
    rest = at[2].trim();
    explicit = true;
  } else if (go) {
    name = go[1];
  } else {
    // A bare whole-message token only switches if it exactly names a room the
    // user is in (or home/bigmo). Otherwise it's an ordinary message — null.
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
  // Unknown target: an explicit "@x" is an error; a natural "go x" (a cheer like
  // "go team!") falls through to normal handling instead of being hijacked.
  if (!room) return explicit ? { notFound: name } : null;
  return { roomId: room.id, name: room.name ?? `room ${room.id}`, isDm: false, rest };
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
  handled: boolean; // true → reply is the answer; false → caller runs BigMo conversation
  reply?: string;
  newActiveRoomId?: number;
}

// Route a non-command inbound. Handles switches, the rooms/where status, and
// group auto-posting; returns handled:false only when the active room is the
// BigMo DM and the text is an ordinary message (→ BigMo converses).
export async function routeInbound(
  userId: number,
  dmRoomId: number,
  activeRoomId: number,
  body: string,
): Promise<RouteOutcome> {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();
  const rooms = await getUserRooms(userId);

  if (lower === "rooms" || lower === "where") {
    return { handled: true, reply: renderRoomList(rooms, activeRoomId) };
  }

  const sw = parseSwitch(trimmed, rooms, dmRoomId);
  if (sw) {
    if ("notFound" in sw) {
      return { handled: true, reply: `I don't see a group called "${sw.notFound}". Text "rooms" to see yours.` };
    }
    await setActiveRoom(userId, sw.roomId);
    log.info({ userId, roomId: sw.roomId, name: sw.name }, "sms active-room switch");
    if (sw.rest) {
      // "@nba LeBron traded?!" — switch AND post the trailing text.
      await postMemberMessage(sw.roomId, userId, sw.rest);
      return { handled: true, reply: `[${sw.name}] Posted.`, newActiveRoomId: sw.roomId };
    }
    const guide = sw.isDm
      ? `[BigMo] You're back with BigMo — text me anything.`
      : `[${sw.name}] You're in ${sw.name}. Text to post here; reply "home" for BigMo.`;
    return { handled: true, reply: guide, newActiveRoomId: sw.roomId };
  }

  // Not a switch/status. Behaviour depends on the active room type.
  const active = rooms.find((r) => r.id === activeRoomId);
  const isDm = active ? active.isDm : true;
  if (!isDm && active) {
    // In a group → the plain text is a post to that group.
    await postMemberMessage(active.id, userId, trimmed);
    return { handled: true, reply: `[${active.name ?? `room ${active.id}`}] Posted.` };
  }

  // Home (BigMo DM) → let the caller run the conversational path.
  return { handled: false };
}
