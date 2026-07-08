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

## Deliberately deferred vs. the original design

- **Live QR/device handshake** — replaced by the SMS code+photo+Q&A above.
- **Revocation** — no revoke path yet; the design memory's confirmed-human vs.
  bogus-pledge governance question (admin-only? staker + their staker must
  agree?) is genuinely unresolved and deliberately not decided here. When
  built, it must be a new event type (e.g. a `pledge_revocations` table), never
  a mutation of the original pledge — the ledger's append-only contract holds.
- **Root of trust** — `rocketman` (user id 1) is the de facto root per this
  session's user-id reservation work; `trust/graph.ts`'s `ROOT_USER_ID`
  constant is the one place this is encoded.
- **LEADER-facing graph visualization** — `traceToRoot`/`listStakedByMe` exist
  and are tested, but there's no admin UI over them yet (SMS-only so far).
