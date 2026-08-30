---
name: project-card-link-sms-webchat
description: "Player cards linked to real users via SMS (BigMo)/webchat — 'my card' MMS/webchat delivery, claim-by-code, self-edit profile/aka, multi-card-per-member (card_links). Built 2026-08-30, verified live against real Twilio."
metadata: 
  node_type: memory
  type: project
  originSessionId: cd96f0f9-30dc-43a1-9570-e939a94424ad
  modified: 2026-08-30T19:50:00.000Z
---

Built and shipped 2026-08-30 (commit `ee30f01`), plan at
`.claude/plans/zazzy-petting-marshmallow.md`. Closes the gap flagged the
same day: Brandon texted BigMo "send me my card" and got "don't have your
card info in front of me" — confirmed by code inspection there was zero
wiring between the player-cards pipeline (see
[[project_player_cards_facial_likeness]]) and the live app: no DB table
for cards, no phone→serial link, no SMS command for it.

**Key discovery that changed the plan:** queried the live DB directly and
found Brandon had ALREADY bulk-imported 31 users (ids 100–130) with real
phone numbers, usernames matching most card handles almost exactly
(`snake`→KennyG, `kiwi`, `rufus`, `shipp`, `jennifer`, `aj`, etc.) — he'd
forgotten he'd done this ("I did give you users and telephone numbers
already, right?"). This meant linking was mostly a name-match problem,
not a data-collection problem — 20 of 31 cards auto-linked by username
match in one script run, no manual list needed.

**Data model:** new `player_cards` table (serial, handle, name, aka,
tier, stats, profile1-3, `front_image_url`, 6-char `code`) — the roster
data that previously only existed in a scratch CSV is now real, queryable
data. `scoot_members` gained a nullable `card_serial` column (references
`player_cards.serial`), same shape as the existing `worn_number` column
precedent. Migration applied by hand against the postgres container
(`docker exec -i scoot-postgres-1 psql ...`), per
[[infra_prod_db_migrations]] — never `db:push` on this box.

**Import/link script:** `tools/player-cards/export_cards_to_app.py` —
reads the roster CSV (still only in a prior session's scratchpad, never
committed — path is in the script's own usage if this needs rerunning),
renders each person's individual front-card PNG via `build_cards.py`'s
own `draw_front()` (single-card canvas, not the 6-up sheet), copies into
`/var/lib/scoot/media/` (the real host path — `MEDIA_DIR=/var/scoot/media`
in `.env` is the CONTAINER path, bind-mounted from
`/var/lib/scoot/media` on the host; needs `sudo cp`, owned by root),
generates SQL for review before running. Unmatched-by-name cards (need
manual link or self-claim): Cleo, EDub, Black, Bo (`bigbo`/`oldbo`
ambiguity — two Bo's in the users table, unresolved), Kobe, Reggie,
McGhee (has a `mcghee` user row but no phone on file), Frank, Zelle, Jen
(different from the auto-linked `jennifer`), and Trey-Up/Nick
(`nickgradney` user row exists but has no phone either).

**Real, previously-dead bug fixed along the way:** `MEDIA_BASE_URL` was
defined in `.env` but read nowhere in the entire codebase — a genuinely
unused env var, and its value pointed at `http://localhost:3000/media`.
Harmless while unused; would have silently broken the first real MMS
send the moment anything finally read it (Twilio can't fetch
`localhost`). Now fixed to the real public origin and wired through
`card-commands.ts`'s `absoluteMediaUrl()` — the ONLY place that needs a
fully-qualified URL (MMS); webchat keeps using the app-relative
`/media/...` path that `messages.mediaUrl` already used for human image
attachments.

**Gotcha rediscovered:** editing `.env` alone didn't take effect —
`tsx watch`'s hot-reload only picks up code changes, not env vars, which
are only read at container creation. Needed
`docker compose -f ri/physical/docker-compose.yml up -d app` (recreate),
matching the exact gotcha already documented in
[[bigmo_mail_poller]] from the 08-24 IMAP work. Two dead ends this
project has now hit the same wall on — worth remembering reflexively
whenever an env var change doesn't seem to take effect on this box.

**Architecture:** `card-commands.ts` exports a transport-agnostic
`resolveCardCommand(userId, scootId, trimmed)` — does the DB read/write,
returns a discriminated result, never sends anything itself. Two thin
wrappers consume it: `tryHandleCardCommand` (SMS, slotted into
`bigmo.ts`'s existing explicit-command dispatch chain right after
`tryHandleTrustQuery` — same `async (userId, trimmed) => string | null`
pattern as every other SMS command) calls `throttledSend` with a fully-
qualified media URL; the webchat side (inline in `bot-mentions.ts`'s
`handleMentions`, gated on `bot.username === "bigmo"` since card commands
are Scoot(34)-specific, not generic multi-bot infra) calls the now-fixed
`postBotMessage(..., mediaUrl)`. Commands: "my card" (send), a bare
6-char code (claim — the same code already printed on the physical card
next to its QR, no new token needed), "my profile" (read), "set my
profile: ..." / "set my aka: ..." (self-edit, live immediately per
Brandon's explicit call — no approval queue). Tier/stats/handle/name
have no SMS write path at all, by design — Brandon's call: those carry
real community-recognition/game-result meaning, not self-reportable.

**Verified live, not just against a dev/mock provider:** simulated
inbound SMS via `curl` against `/api/v1/sms/inbound` (works because
`TWILIO_SKIP_SIGNATURE=true` is already set for local testing) using
Brandon's own real linked number — confirmed via Twilio's own delivery
API that a real MMS was sent and `delivered` with the card image
attached. Tested unlink → "my card" (correct claim-prompt reply) →
claim-by-code (correctly relinked) → "set my profile" → "my profile"
read-back (round-tripped correctly) → cleaned up the test profile text
afterward so it didn't leave fake bio content on Brandon's real card.
Webchat path verified by invoking `handleMentions()` directly against a
real room (Brandon's BigMo DM, room 13) — confirmed the resulting
message row has the right `content` + `media_url`; genuinely NOT
verified: opening the actual React client in a browser to confirm it
renders that image inline (mediaUrl is the same field real human image
messages already populate, so it should render the same way, but this
wasn't visually checked — flagged honestly rather than assumed).

**Where this actually is right now:** the core "read/write my own card
via text" loop works end-to-end on both channels. Manual resolution
round (2026-08-30, same day) closed 4 of the original 11 unmatched
cards — E-Dub, Black, Reggie (new user rows + phone numbers Brandon
supplied over chat) and Trey-Up/Nick Gradney (phone added to his
existing `nickgradney` row) — all linked via card_links (see below).
Still open: the Bo ambiguity (`bigbo` vs `oldbo`), and no phone yet for
Cleo, Kobe, Frank, Zelle. (2) profile-text edits update the DB
immediately but do NOT regenerate the front-card image — "my card"
always sends whatever PNG was rendered at import time, a known/accepted
V1 scoping limit (see the plan file), (3) no browser-side visual
confirmation of the webchat image render yet.

**Schema changed 2026-08-30: one card per member → many.** Brandon's
own framing: "we have 2026 cards but will produce a 2027 card set" —
the original design (`scootMembers.cardSerial`, a single nullable
column) couldn't hold more than one card per person, ever. Also hit
immediately by a real case: Jen (34-DRAFT-24) and Jennifer
(34-DRAFT-26) turned out to be the same person/phone
(832-282-1314) — Brandon's call: "Same person, but we want to produce
both cards for her."

Replaced with a `card_links` join table (`ri/src/server/db/schema.ts`):
`(id, scootId, userId, cardSerial, isActive, linkedAt)`, unique on
`(scootId, userId, cardSerial)`. `isActive` marks the one "my card"
sends by default. Claiming a card by code (`card-commands.ts`, wrapped
in `db.transaction`) deactivates the member's other links and
activates/upserts the new one — old cards stay linked, just inactive,
so nothing is lost when a new season's card is claimed. Migration on
prod: created `card_links`, backfilled all 24 existing single-links
from `scoot_members.card_serial` (all becoming `isActive=true`),
inserted Jen's card as Jennifer's second (inactive) link, then dropped
the old column entirely (no back-compat shim, per this repo's
convention of deleting rather than preserving unused code/columns).
Verified live via simulated inbound SMS: "my card" from Jennifer's number still
resolves to her active card (34-DRAFT-26), confirmed via app logs.
`tools/player-cards/export_cards_to_app.py` (the reusable roster-import
script) updated to generate `card_links` INSERT/deactivate SQL instead
of the old single-column UPDATE — this is what a 2027 import run will
use.

No new SMS command surface added for multi-card yet (e.g. "my cards" to
list all, or a way to pick a specific edition without re-texting its
code) — not asked for, easy to add later against this same table.
