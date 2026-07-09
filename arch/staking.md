# Staking Ritual — Phase 4 (v1, SMS-driven)

Status: **built, v1.** Supersedes the Phase 2 stub (`routes/staking.ts`, global
`UserFlags.STAKED`) — removed. See `ip/inventions/asimov_v2.13.md` / the
`social_graph_staking` design memory for the full original ceremony (QR + live
device handshake); this v1 is a deliberately simplified SMS-only version.

## Flow

1. **Prospect** texts BigMo `stake` (or `stake me`) — works for a totally new
   phone number; this IS how a brand-new prospect gets a `users` row at all (no
   self-serve signup otherwise). BigMo creates a placeholder user (phone only,
   no password) if needed and replies with a 5-digit code (`staking_codes`,
   24h expiry).
2. Prospect hands/tells the code to an **in-person staked member** (the staker).
3. **Staker** texts BigMo `stake <code>`. BigMo checks the staker is themselves
   staked, and the code is valid/unused/unexpired, then starts a **multi-turn
   Q&A** (never one rigid all-in-one message — that's exactly what trips up the
   members this is for):
   - *"Send me a photo of you two together."* — a bare photo (no caption needed)
     advances the flow. This selfie is evidentiary: a paper trail for the rare
     "mystery hooper turned out to be a scammer" case, not primarily public.
   - *"Is \[name\] a senior (55+), an OG (70+), or just a regular member?"* — the
     staker replies with a tier word (`senior`/`sr`/`55`, `og`/`70`,
     `member`/`regular`/`no`/`skip`). Unrecognized replies re-ask; `cancel` at
     any point abandons the flow with nothing changed.
4. On a valid tier reply: `scoot_members.userFlags` gets `STAKED` (+ the tier
   bit if any), the code is marked used, and a `pledges` row is inserted
   (`stakerId`, `stakeeId`, `selfieUrl`, `stakingCode`).

State for an in-progress Q&A lives in `sms_state.pending` (`kind: "stake_flow"`),
the same column §4/§8.5 routing uses for its own confirm/undo state — both share
one discriminated union (`sms/pending.ts`) so the two flows can't stomp each
other for the same user.

## Age tiers — no birthdate ever stored or computed

`ScootFlags.SENIOR` (1<<8=256, 55+) and `ScootFlags.OG` (1<<9=512, 70+) are
**attested directly by the staker** — the system never asks for or stores a
birth year/date for this. The 55/70-by-birth-**year** rule (flips Jan 1, not on
an actual birthday) is the rule the staker applies mentally in the field; BigMo
only ever sees the resulting tier (surfaced in the "who you're texting with"
persona line), never a birthdate — consistent with the platform's broader
no-LLM-date-math posture (see `bigmo_no_llm_time_math` memory / `llm/schedule.ts`).
Neither bit set = regular member. The bits are mutually exclusive in practice
(OG supersedes senior); nothing enforces that at the DB level.

## Trust graph (`ri/src/server/trust/`)

`pledges` **is** the directed graph (`stakerId → stakeeId` edges). Two modules:

- **`trust/ledger.ts`** — the only sanctioned way to insert a pledge
  (`recordPledge()`; never `db.insert(pledges)` directly). Pledges are treated
  as **append-only events**: nothing ever `UPDATE`s or `DELETE`s a pledge's core
  fields once inserted. Any future correction (e.g. revocation) must be recorded
  as a *new* event referencing the pledge, never a mutation. Each pledge gets a
  `contentHash` — a sha256 fingerprint of its immutable fields, computed at
  insert time with an explicit (never DB-default) timestamp, so there's zero
  ambiguity about what got hashed.
- **`trust/graph.ts`** — read-side queries: `traceToRoot(userId)` walks the
  pledge chain back to `ROOT_USER_ID` (rocketman, user id 1 — the platform's
  single global root), cycle-safe and tolerant of members who are `STAKED` but
  have no pledge on record (early/manually-seeded members predate the ritual —
  reported as `no-pledge-on-record`, not crashed on). `depthFromRoot()` and
  `listStakedByMe()` (a staker's own recall list — the ritual's actual point:
  recognizing someone who reappears after years) build on it.

Exposed over SMS (`sms/trust-commands.ts`): text BigMo **`my pledges`** (who
you've staked, newest first) or **`my chain`** (your trace back to root, by
name).

### Why this is "blockchain-ready" without building a blockchain

The two properties that actually matter for Phase 5's `scootd` to later ingest
this table as a chain genesis are (1) **immutability discipline** — the ledger
is a clean, ordered event log, never mutated — and (2) a **canonical
per-event hash** with no ambiguity about its inputs. Both are in place now.
What's deliberately **not** built: a self-referential hash chain (each pledge
linking to the previous) with the locking that would require. That's real
tamper-evidence machinery nobody consumes yet, and the actual chain will do
proper hashing/linking in C when it exists — building it twice in the meantime
would be pure waste.

## Revocation (`trust/revocation.ts`)

The governance question is resolved (Brandon's call): **confirmed-human
revocation is admin-only** (LEADER-gated), not a multi-party consensus.

One SMS entry point resolves which path applies based on who's asking:

- **`revoke <name>`** where the sender is the pledge's **original staker** →
  the **bogus** path (they were tricked, the prospect wasn't real/unique, or
  they broke the ritual rules). Freely self-service, no gate — trusts the
  staker's judgment, same as the ritual itself.
- **`revoke <name>`** where the sender is a **LEADER** and the name matches
  *any* staked member → the **confirmed_human** path (the person WAS real but
  the community un-vouches anyway, e.g. a later-discovered bad actor).
  LEADER-only, deliberately admin-only.
- Neither → "I don't see anyone matching that in your staked pledges" — a
  non-LEADER never learns whether someone *else* staked the name they typed.

Either path asks a short reason next ("Why? Reply with a short reason, or
'skip'"), mirroring the staking ritual's multi-turn Q&A rather than demanding
it all in one message; `cancel` abandons with nothing changed.

`revokePledge()` records the correction as a **new event** in
`pledge_revocations` (never a mutation of the `pledges` row — at most one
revocation per pledge, enforced by a unique constraint) and clears **only**
the bits staking added (`STAKED`, `SENIOR`, `OG`) from the stakee's
`scoot_members` row — other flags (`BETA`, `GYMBOSS`, `LEADER`, …) are
untouched. A revoked pledge no longer counts as a trust-graph edge:
`traceToRoot()` treats it as if it never existed.

**Deliberately still out of scope:** downstream impact on the *revoked
stakee's own* pledges (people they in turn staked) — the design memory
explicitly defers this "until building the staking-gated chat/wallet
features"; nothing cascades today.

## Self-stake bootstrap (`trust/self-stake.ts`)

The pledge ritual needs a starting point: the root of trust has nobody to
stake them, since they're the base case every chain traces back to.
**Self-stake** is that one-time bootstrap, hard-gated to a narrow two-factor
check — the caller must be **both**:

1. `ROOT_USER_ID` (hardcoded in `trust/graph.ts`, currently rocketman/user 1), **and**
2. hold `ScootFlags.ENGINEER` (a fresh bit, 1<<10=1024 — deliberately *not* the
   legacy rc-webhook "engineer" bits 1|2, an unrelated vestigial RC-chat-role
   feature; reusing that would risk accidentally widening a high-stakes gate).

Either alone is insufficient — a future engineer granted `ENGINEER` for
legitimate dev-access reasons still cannot self-stake unless they're *also*
the hardcoded root; they go through the normal ritual like anyone else.

Self-stake is recorded as a **self-referencing pledge** (`stakerId ===
stakeeId === root`), reusing the exact same `recordPledge()` ledger — no
parallel bootstrap data model. "Already done" is judged by **whether a
self-pledge already exists**, not by the `STAKED` bit — root's bit may already
be set from historical bulk seeding with no pledge/selfie behind it (this was
in fact true in prod), and self-stake must not block on that alone.

## Staking catalog (client UI)

`GET /api/v1/scoots/:id/staking-catalog` — **"Brotherhood public info, but
restricted"**: gated to any `STAKED` member of the Scoot (not the general
public, not an unstaked registered user). Returns `trust/graph.ts`'s
`getTrustCatalog()`: the root (+ their self-stake selfie, if any), every live
(non-revoked) pledge as a hierarchy edge with the stakee's current tier, and
a `legacyMembers` bucket for staked members who predate the ritual and have no
traceable pledge at all (most of the current real roster, seeded before this
system existed). Also carries `viewerCanSelfStake` so the client only shows
the self-stake action to whoever the server would actually permit.

Client: `pages/staking-page.tsx` (nav: **Brotherhood**, shown to staked
members only) renders the hierarchy as an indented tree with selfie
thumbnails and tier badges, the legacy bucket below it, and — only when
`viewerCanSelfStake` and no self-pledge exists yet — a **"Self-stake with a
photo"** button (reuses the existing chat media upload endpoint for the
photo, then calls `POST /scoots/:id/self-stake`).

### Self-stake over SMS (`sms/self-stake-commands.ts`)

Same hard two-factor gate, reachable over text — SMS is the platform's
primary interface, so self-stake shouldn't be the one app-only feature.
Mirrors the code-then-photo shape of the normal ritual (the code itself is
largely ceremonial here — there's no second party to prove co-presence with,
so the real security boundary is the gate, not the code):

- `"self stake"` / `"selfstake"` → issues a one-time code (reuses
  `staking_codes`, 24h expiry), or reports already-done / not-permitted.
- A bare photo mid-flow completes it; `"cancel"` abandons with nothing
  changed.

Shares the exact same `selfStake()` — whichever path (app button or SMS)
gets there first wins; the other correctly reports "already self-staked"
since that check is keyed off the self-pledge, not the transport.

### Selfies are localized, not left on Twilio (`sms/media-download.ts`)

An MMS photo's `MediaUrl` is a **Twilio-authenticated API URL** — a browser
can't render it (no Twilio credentials client-side, confirmed: unauthenticated
fetch → 401), and it isn't guaranteed durable (selfies must "survive years of
storage" per the design memory). `localizeSelfieUrl()` downloads the photo
once, at pledge-creation time (Basic Auth with the account's own Twilio
credentials), into the same local media store everything else uses
(`MEDIA_DIR`, served at `/media`), and returns that URL instead. Falls back to
the raw Twilio URL on any download failure — never blocks the ritual. Wired
into both `staking.ts` (the 2-person selfie) and `self-stake-commands.ts`.

**Testing hazard, permanently on the record:** pledges are keyed to real user
ids with no scoot-scoped isolation, so a naive test that "resets" or
"revokes whatever self-pledge currently exists for `ROOT_USER_ID`" would
operate on Brandon's real pledge, not test data — there is no test/prod
separation for this specific table. `trust/self-stake.integration.test.ts`
and `sms/self-stake-commands.integration.test.ts` are written to never query
"any existing pledge" for the real root; state-machine mechanics (cancel,
photo-prompt) are tested by directly constructing `sms_state.pending` rather
than by trying to win a fresh completion, since that path is now permanently
exercised for real (Brandon completed it 2026-07-09) and can't be safely
re-exercised without touching production data.

## Deliberately deferred vs. the original design

- **Live QR/device handshake** — replaced by the SMS code+photo+Q&A above.
- **Root of trust** — `rocketman` (user id 1) is the de facto root per this
  session's user-id reservation work; `trust/graph.ts`'s `ROOT_USER_ID`
  constant is the one place this is encoded.
- **Downstream revocation cascade** — see above.
- **Pledges are global, not per-Scoot** — `pledges` has no `scootId` column
  (consistent with "is this a real human" being a platform-wide question, not
  a per-Scoot one per the design memory). One practical consequence: a user
  can only ever have ONE live self-pledge across the whole platform, not one
  per Scoot. Fine today (single Scoot); worth revisiting if a second Scoot
  ever needs its own bootstrap root.
