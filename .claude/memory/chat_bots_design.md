---
name: Chat bot architecture — multi-bot, table-driven, @mention triggered
description: How LLM bots are modeled in Scoot (multi-bot, personality per bot, @mention in chat), with key design decisions locked in
type: project
originSessionId: 30c264ac-2abc-4e83-9020-c83e0856f83f
---
Bots are first-class chat participants in Scoot, not a separate subsystem. Users invoke them via `@<botname>` in any chat message, and the bot replies in the same room as a regular message.

## Identity

A bot is a row in `users` with `is_bot = true`. This keeps the message/membership/broadcast model unchanged — bot messages are just messages.

`users` has two added columns:
- `is_bot boolean NOT NULL DEFAULT false` — the marker
- `display_name text` (nullable) — opt-in display override. Falls back to `username`. **Applies to humans AND bots.** This is the resolution of the earlier "login handle vs alias" open question — yes, we have both, but `display_name` is optional, not enforced.

## Per-bot config in `bots` table

A new `bots` table holds personality + behavior per bot:
- `user_id` (PK, FK → users.id)
- `system_prompt text NOT NULL` — the personality. Edited via SQL or `bot:edit` CLI.
- `auto_join_new_rooms boolean NOT NULL DEFAULT false` — `true` only for the primary helpful assistant (`claude`). Personas (Kobe, Moses, etc.) are `false` and invited per-room.
- `enabled boolean NOT NULL DEFAULT true`

## Mention semantics

- Pattern: `@<username>` anywhere in a message, case-insensitive match against `users.username`
- First bot mention wins (multi-bot fanout deferred)
- Bots can't trigger bots — messages authored by `is_bot=true` users are skipped at the parser
- Bot must be a `roomMembers` row in the target room to be mentionable there

## Dispatch flow

1. Human sends message → route handler inserts + broadcasts + returns 201 immediately
2. Async: parse mentions, find matching bot member
3. Broadcast `{type: "typing", userId, username, roomId}` over WS
4. Build provider payload: last 20 messages with `"username: text"` prefix on user turns, plain content on bot turns, system prompt from `bots.system_prompt`
5. Call provider.chat() — Anthropic for v1, OpenAI-compat available via swap
6. Insert bot's reply as a `messages` row, broadcast as normal message
7. Broadcast `{type: "typing_stop", userId, roomId}`
8. On error: log via pino, post short "I'm having trouble responding…" message, broadcast stop

## Locked decisions

- **History window:** 20 messages of room history fed to the LLM per reply
- **Max reply tokens:** 500 (chat bubbles, not essays)
- **Provider for v1:** Anthropic only
- **Default bot:** `claude`, auto-joins new rooms, helpful/dry/direct system prompt
- **Personas:** added via `npm run bot:create` CLI, invited to rooms via `npm run bot:invite`
- **Typing indicator:** YES — both `typing` and `typing_stop` WS message types
- **Error visibility:** YES — user sees a graceful failure message in chat. Server logs everything via pino regardless.
- **UI scrollback:** unlimited, paginated 50 at a time. Server-side already supports `?before=`. Client-side scroll-to-load is a separate follow-up, NOT part of bot v1.

## Bots and the staking graph

Bots are not stakeable (per `social_graph_staking.md`). The `is_bot` flag is the explicit exclusion. Bots can be members of stake-gated rooms in the future; the gating predicate just doesn't apply to them.

## Why not OpenClaw or similar agent platforms

OpenClaw (openclaw.ai) is a personal AI assistant with shell/file/browser tools. Overkill — and a security risk — for a multi-user chat reply bot. The provider abstraction approach above gives `@<botname>` chat without exposing real-world action capability. Real agent integration (tools, actions) is a Phase 4+ concern, not v1.
