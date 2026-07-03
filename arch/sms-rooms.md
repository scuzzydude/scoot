# SMS ⇄ Rooms — Unified Messaging Framework

Status: **design, pre-implementation.** Owner: Brandon. Drafted with Claude Code.

This supersedes the earlier "interleave website + SMS" idea, which didn't work.
The schedule/notes design from the same discussion folds into this one (see
[Schedule](#schedule--scoot_sessions)).

---

## 1. Core model

**Rooms are the backbone. The app and SMS are two transports onto the same
`messages` table.** One message, two delivery paths. A "group" (notifications,
prayers, nba, …) is just a `chat_rooms` row. Users opt in by joining; users can
create groups.

```
                       ┌─────────────┐
   app (WebSocket) ◄──►│             │
                       │  messages   │◄──► room (chat_rooms)
   SMS (Twilio)   ◄──►│  (one table)│
                       └─────────────┘
```

Most of this already exists from Phase 2: `chat_rooms` (name, roomType,
parentId tree, accessMask/postMask, createdBy), `room_members`, `messages`,
`media`. The work is wiring **SMS as a transport** onto it.

---

## 2. Roles — per-Scoot

Roles live in `scoot_members.userFlags` (64-bit mask, stored as text, read with
`BigInt`). NOT global `users.flags` — Karen runs Fonde, not every future Scoot.

Legacy: bits `1|2` are "engineer roles" on other Scoots (`& 3n`, see
`rc-webhook.ts`). Gym roles use higher bits to stay clear:

| Flag | Bit | Value | Meaning |
|---|---|---|---|
| `STAKED`  | 1<<2 | 4  | staked member of this Scoot |
| `LEADER`  | 1<<3 | 8  | oversight: can read all messages, enable SMS-mirror |
| `GYMBOSS` | 1<<4 | 16 | schedule authority: set/clear `scoot_sessions` |
| `BETA`    | 1<<5 | 32 | beta/dev tester: early SMS features + rollout announcements before general release |
| `LEGEND_NUMBER` | 1<<6 | 64 | awarded a reserved legend's/patron's number (an honor). Rule: a champ keeps their #; a *deceased* legend's # may be awarded to an OG (e.g. McGhee → 24, Moses/BigMo/Kobe). |

(`ScootFlags` constant to be added to `schema.ts`. The global `UserFlags.GYMBOSS`
is deprecated by this; migrate Fonde gymbosses into the per-Scoot mask, then
retire the global bit.)

---

## 3. Schema changes

### New tables

**`scoot_sessions`** — authoritative schedule. Structured data, GYMBOSS-only.
(Named `scoot_*` to avoid the connect-pg-simple `session` table.)
```
id            serial pk
scoot_id      → scoots(id) cascade
starts_at     timestamptz
ends_at       timestamptz
location      text
status        text default 'tentative'   -- tentative | confirmed | cancelled
note          text                        -- e.g. "moved to 5pm"
updated_by    → users(id)                 -- must hold GYMBOSS
updated_at    timestamptz default now()
created_at    timestamptz default now()
```
`tentative` = auto-seeded from the standing pattern, not yet human-confirmed →
BigMo **hedges**. `confirmed` → BigMo asserts. `cancelled` → "no game".

**`sms_state`** — per-user SMS routing state (persisted so a restart doesn't
lose someone mid-conversation).
```
user_id        → users(id) pk cascade
active_room_id  → chat_rooms(id)
pending         jsonb        -- e.g. {kind:'route_confirm', candidates:[..], body:'..'}
updated_at      timestamptz default now()
```

**`sms_deliveries`** — per-user SMS log ("what texts they see"), truthful record
of what actually went over the wire incl. BigMo replies.
```
id          serial pk
user_id     → users(id) cascade
message_id  → messages(id) set null   -- null for BigMo system replies
room_id     → chat_rooms(id)
direction   text        -- 'in' | 'out'
body        text
twilio_sid  text
created_at  timestamptz default now()
```

### Column additions

- `chat_rooms.sms_mirror   boolean not null default false` — room allowed to fan out to SMS at all
- `room_members.sms_enabled boolean not null default false` — this member wants this room on their phone
- `messages.session_id     integer → scoot_sessions(id)` — optional: tag a field note to a session
- `users.privacy_disclaimer_at timestamptz` — last time the no-privacy disclaimer was sent

All additive (CREATE TABLE / ADD COLUMN with defaults). **Prod migration via raw
SQL in the postgres container — never `db:push`** (it wants to drop `session`).

---

## 4. Inbound SMS routing (the crux)

One phone number, many rooms. Sticky **active room** per user + keyword switch,
with **scored** routing and **confirm-on-low-confidence**.

**Context tag, always.** Every outbound text carries the room:
`[nba] pookie: LeBron traded?!` and BigMo acks `[nba] Posted.` — so a Brother
always sees where he is and can catch a misroute.

**Hard switch (no scoring).** A leading room token / `@nba` / "go nba" → switch
active room, route there, score 1.0. A *mid-sentence* mention ("I need prayers")
does NOT hard-switch — it only feeds topical score.

**Scored routing (code decides; LLM only advises `topical_match`):**
```
score(room) =
  + 0.40 · is_active_room        (sticky continuity)
  + 0.35 · replying_to_recent    ([room] broadcast hit their phone < ~15m, time-decayed)
  + 0.30 · topical_match         (LLM/keyword 0..1)
  + 0.10 · recent_activity

best, second = top two
if best ≥ 0.60 AND (best − second) ≥ 0.20 → route to best, ack "[room] Posted."
else                                       → confirm: "Post to [nba] or [prayers]? reply the name."
```
Two gates: absolute **threshold** AND **margin**. Weights/thresholds tunable; the
structure is the contract. Same safety pattern as the schedule escalation: when
unsure, ask — don't assert.

**Undo backstop.** Because the `[room]` tag is visible, "no, that was for
prayers" moves the last message. Threshold catches ambiguity up front; undo
catches confident-but-wrong.

---

## 5. Outbound fan-out

When a message lands in an `sms_mirror` room, text every member with
`sms_enabled`, prefixed `[room] author: body`. Log each send to
`sms_deliveries`. Respect Twilio A2P 10DLC throughput (long-code limits).

**SMS-mirror gating:** user-created groups are **app-only by default**; a
`LEADER` flips on `sms_mirror` — so a chatty room can't blow the A2P limits.

---

## 6. Schedule — `scoot_sessions`

The structured schedule is GYMBOSS-only data; BigMo answers from the next
non-cancelled session (no runtime day-of-week math → cardinal-sin-proof).
`schedule.ts`'s standing pattern demotes to a **seeder** that pre-creates the
next ~4 weeks as `tentative` rows.

**Field notes fold into rooms.** "No parking at Fonde" is just a message in the
notifications room (optionally `session_id`-tagged), NOT a separate table. The
counter-note thread IS the room history. BigMo surfaces a "Heads up:" block from
recent relevant notification-room messages when answering a schedule question.

**Clearing a note** (= the message stops surfacing as a heads-up), safest-first:
1. **Time-expiry** — session ends → its notes stop surfacing. Deterministic backstop.
2. **GYMBOSS clear** — "all clear". Human authority.
3. **BigMo context-clear** — only when confident AND low-stakes (logistics, not hazards).
4. **Verification escalation** — doubt/conflict → BigMo texts all GYMBOSS a Y/N, acts on reply (state in `sms_state.pending`). Hazards & conflicts never auto-clear.

---

## 7. Leader oversight + privacy

No messages are private. A `LEADER` (per-Scoot) gets an all-messages view across
all rooms, **bypassing `accessMask`**. Just an authority-gated query + UI.

Because of that, a **no-privacy disclaimer** is mandatory: sent on join and at
least **once per year** (`users.privacy_disclaimer_at`), over SMS and shown in
the app. Delivery is recorded; not a hard posting-block (too much friction for
seniors).

---

## 8. Build plan (incremental, commit per phase, check in with Brandon)

1. **Data foundation** — schema additions above + prod-safe SQL migration; seed
   next ~4 weeks of `tentative` `scoot_sessions`; add `ScootFlags`.
2. **Read path** — BigMo answers schedule from `scoot_sessions`; "Heads up:" from
   notification-room messages.
3. **Member write** — `post_note` into the active room; per-room SMS opt-in.
4. **Outbound fan-out** — room message → SMS to opted-in members, `[room]` tags,
   `sms_deliveries` log, A2P-aware.
5. **Inbound routing** — active room + scored routing + confirm + undo (`sms_state`).
6. **GYMBOSS schedule** — `set_schedule` / `clear`, flag-gated; escalation.
7. **Leader oversight + disclaimer** — all-messages view; yearly disclaimer.
8. **App: per-user SMS log** — render `sms_deliveries` as an SMS transcript.

---

## 9. Open / deferred decisions

- Exact scoring weights & thresholds — start with §4, tune against real traffic.
- Default room for a brand-new SMS user with no active room (likely
  notifications, or a BigMo DM).
- Whether posting is blocked until the disclaimer is acknowledged (default: no).
- Migration/cutover of existing global `UserFlags.GYMBOSS` → per-Scoot mask.
