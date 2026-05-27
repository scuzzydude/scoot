# Chat System Handoff — Steve Project

**Author:** Brandon / Claude Code  
**Date:** 2026-05-27  
**Status:** Draft — pending Brandon review

---

## Why This Document Exists

Brandon is building a shared `chat-ui` component that both the Scoot platform and the Steve project will use. The two apps live on separate servers and are separate codebases, but they share the same chat UI, the same WebSocket protocol, and the same permission model. This document tells you:

1. What the shared layer provides (you don't build this)
2. What you need to build on the Steve side
3. The exact schema additions needed
4. The protocol your WebSocket server must speak
5. Your role/permission definitions

---

## What the Shared Layer Provides

A standalone `chat-ui` React package (extracted from the Scoot codebase) containing:

- `<RoomList>` — sidebar list of rooms with unread counts
- `<MessageThread>` — scrollable message history, renders text + images inline
- `<MessageInput>` — text box, send button, attach media
- `useChatSocket(wsUrl, roomId)` — hook that manages WebSocket connection, reconnects, feeds the components
- Shared TypeScript types: `Message`, `Room`, `User`, `BotMention`

This package also works in React Native (the hook is pure logic, the UI components have `.native.tsx` variants for the eventual mobile app).

You install it as a dependency. You do not modify it. Feature requests go to Brandon.

---

## What You Build (Steve Side)

### 1. WebSocket server

Your backend must implement the protocol below on `ws://your-host/ws/chat/:roomId`.

### 2. Database tables

Add these to your Postgres schema (see exact DDL below).

### 3. REST endpoints

The chat-ui calls a small set of REST endpoints for initial load (room list, message history, upload media). Details below.

### 4. Auth integration

The `useChatSocket` hook sends a session cookie on the WS upgrade. Your server validates the session the same way your HTTP routes do — no extra auth work.

---

## Permission Model

Every user has a `user_flags BIGINT` column on their membership record. Each room has two mask columns. Access is a bitwise check:

```
can_see_room  = (user_flags & room_access_mask) != 0
can_post      = (user_flags & room_post_mask) != 0
```

If `room_access_mask = 0`, the room is public to all authenticated users.  
If `room_post_mask = 0`, anyone who can see the room can post.

### Steve Project Bit Definitions

| Bit | Constant | Who |
|-----|----------|-----|
| 0 | `CHIEF_ENGINEER` | Brandon — admin, full access |
| 1 | `LAB_ENGINEER` | Henry — full access including invention tooling |
| 2 | `DWEEB` | Basic user — chat only, no invention tooling |
| 3–63 | reserved | Future roles |

Assign bits by OR-ing constants when inserting/updating a user record.  
Example: Henry gets `user_flags = 0b0010` (bit 1 set). Brandon gets `0b0001` (bit 0). A future dual-role user gets `0b0011`.

### Suggested Room Structure

Rooms are organized in a two-level parent → child hierarchy. Parent rooms are categories (no messages). Child rooms are where people talk.

```
General                        (parent, access_mask=0 — all users)
  └── Water Cooler             (child)
  └── AI Chat / @steve         (child)

Engineering                    (parent, access_mask=0b0011 — engineers only)
  └── Projects                 (child)
  └── Lab Notes                (child)

BrotherWhoNeedsHelp            (parent, access_mask=0 — all users can read/support)
  └── Nick                     (child — Nick's situation)
  └── Mick                     (child — Mick's situation)
  └── ... (new room per person as needed)

Admin                          (parent, access_mask=0b0001 — Brandon only)
  └── System                   (child)
```

Creating a new room under "BrotherWhoNeedsHelp" is just an INSERT with `parent_id` pointing to that category row. No schema change needed.

---

## Schema Additions

Add these columns/tables to your Postgres database. Use whatever migration tool you have.

```sql
-- Add to your users table (or a project_members junction if you have one)
ALTER TABLE users ADD COLUMN user_flags BIGINT NOT NULL DEFAULT 0;

-- Rooms table (create if you don't have one)
-- parent_id enables a two-level hierarchy: category → room.
-- Parent rooms (parent_id IS NULL) are organizational containers — no messages posted directly.
-- Child rooms (parent_id IS NOT NULL) are where conversation happens.
CREATE TABLE IF NOT EXISTS chat_rooms (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,  -- NULL = top-level category
  is_dm       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  INTEGER REFERENCES users(id) NOT NULL,
  access_mask BIGINT NOT NULL DEFAULT 0,   -- 0 = public
  post_mask   BIGINT NOT NULL DEFAULT 0,   -- 0 = anyone who can see it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room membership (tracks who is in each room + unread cursor)
CREATE TABLE IF NOT EXISTS room_members (
  room_id      INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  room_id     INTEGER REFERENCES chat_rooms(id) NOT NULL,
  user_id     INTEGER REFERENCES users(id) NOT NULL,
  content     TEXT NOT NULL,
  media_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bots (one row per AI personality)
CREATE TABLE IF NOT EXISTS bots (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## WebSocket Protocol

Connect to `ws://your-host/ws/chat/:roomId`.

All messages are JSON. Client and server both send/receive these types.

### Server → Client

```json
// New message in the room
{
  "type": "message",
  "roomId": 5,
  "message": {
    "id": 123,
    "userId": 42,
    "displayName": "Henry",
    "content": "hello",
    "mediaUrl": null,
    "createdAt": "2026-01-01T00:00:00Z",
    "isBot": false
  }
}

// Someone started typing (optional — implement if wanted)
{ "type": "typing", "roomId": 5, "userId": 42 }

// Error (e.g. user not authorized for this room)
{ "type": "error", "code": "FORBIDDEN", "message": "Access denied" }
```

### Client → Server

```json
// Send a message
{
  "type": "send",
  "content": "@steve what is a heat exchanger?",
  "mediaUrl": null
}

// Mark room as read (sent when user views the room)
{ "type": "mark_read" }
```

### Bot @mention Flow

When the server receives a `send` message whose `content` contains `@botname`:

1. Broadcast the human message to all room members immediately
2. Look up the bot by username
3. Call your LLM provider with the bot's system prompt + recent message history
4. Insert the bot's reply as a message from the bot's user record
5. Broadcast the bot reply to the room

The chat-ui renders bot messages with a distinct visual style (bot badge, different background) — you just need `isBot: true` in the message payload.

---

## REST Endpoints

The chat-ui expects these endpoints on your API server:

```
GET  /api/rooms                      — list rooms the current user can access
GET  /api/rooms/:roomId/messages     — last N messages (default 50), oldest first
POST /api/rooms/:roomId/messages     — send a message (alternative to WS for slow clients)
POST /api/media/upload               — multipart upload, returns { mediaUrl: "..." }
```

All return `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

---

## AI Personality — "Steve"

The Steve project's bot is named `steve`. Create a user record with `username = "steve"`, `is_bot = TRUE`, and a row in the `bots` table with the system prompt defining the Steve personality.

Users @mention it with `@steve` in any room.

The LLM backend uses the same provider abstraction as Scoot (`LLM_PROVIDER=anthropic` or `openai_compat`). The system prompt is the only thing that makes it "Steve" rather than BigMo.

---

## What This Does NOT Cover

- Invention tooling (your existing feature — chat doesn't touch it)
- User registration / auth (you already have this)
- Push notifications — deferred to native app phase
- Message search — deferred
- Message editing / deletion — deferred (append-only for now)
- Video with DRM/watermark — that is a Scoot-specific requirement, not wired into chat-ui

---

## Open Questions for Brandon

1. Does Steve project need room *categories* (like a folder above rooms) or is a flat room list fine for now?
2. Does Henry (lab engineer) create rooms, or only Brandon?
3. Should `@steve` be available in all rooms, or only designated rooms?
4. What is the Steve AI's personality / system prompt?

---

*This document is maintained in the Scoot repo at `HANDBACK_STEVE.md`. Updates go here first, then get communicated to Steve.*
