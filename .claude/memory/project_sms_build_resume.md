---
name: project_sms_build_resume
description: "SMS⇄Rooms §8 COMPLETE + SMS polish DONE + Phase 4 staking ritual v1 DONE. See arch/staking.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
---

**The `arch/sms-rooms.md` §8 build plan is COMPLETE (§8.1–§8.8).**

Done (committed): §8.1 data foundation, §8.2 read path, §8.3 member write
(`commands.ts`), §8.4 outbound fan-out (`fanout.ts`) + LEADER `mirror on/off`,
§8.5 inbound routing (`routing.ts`), §8.6 GYMBOSS schedule-by-SMS
(`schedule-commands.ts` + `tz.ts`), §8.7 leader oversight + disclaimer BACKEND
(`oversight.ts`: LEADER-gated all-messages feed + `GET /api/scoots/:id/oversight/messages`;
`disclaimer.ts`: yearly no-privacy SMS via shared throttle `send.ts`, recorded to
`sms_deliveries`, wired fire-and-forget in `bigmo.ts`). 60 tests. Plus BigMo→Memory
Vault (`memory.ts`), `ScootFlags.BETA/LEGEND_NUMBER`, `scoot_members.worn_number`.

§8.8 DONE: bigmo.ts now records every inbound+reply to `sms_deliveries` (finish()
wrapper); `sms/log.ts` + `GET /api/v1/sms/log` (own) + LEADER
`GET /api/scoots/:id/oversight/sms-log/:userId`; React transcript at
`/sms-log` (`pages/sms-log-page.tsx`, `api/sms.ts`). 63 tests.

SMS POLISH DONE (this session): §8.7 frontend (oversight-page.tsx + privacy-notice
+ nav Texts/Oversight; LEADER granted to Brandon 1 + Karen 127, migration 0013);
routing v2 (routing.ts §4 scored topical + confirm + undo, sms_state.pending);
§6 GYMBOSS conflict escalation (escalation.ts + schedule_verifications table
migration 0014: conflicting confirm/cancel polls all GYMBOSSes Y/N, first decisive
reply applies). 74 tests.

**Phase 4 staking ritual v1 DONE** (simplified vs. original QR-ceremony design —
Brandon's call): prospect texts BigMo "stake"/"stake me" → 5-digit code (creates
a placeholder user if new — this IS how a prospect gets an account); staker texts
"stake <code>" → multi-turn SMS Q&A (photo, then age tier: senior 55+/og 70+/
member, "cancel" anytime) → `scoot_members.STAKED`(+tier) set, `pledges` row
inserted. Age tier is a direct staker ATTESTATION — no birthdate ever stored;
`ScootFlags.SENIOR`(256)/`OG`(512). New `sms/staking.ts` + shared `sms/pending.ts`
(extracted from routing.ts so both flows share one sms_state.pending union).
Retired the old Phase-2 stub (`routes/staking.ts`, global UserFlags.STAKED) —
deleted. Full design + what's deferred (graph traversal, revocation, live QR
handshake): `arch/staking.md`. 86 tests total.

**Trust graph DONE** (`ri/src/server/trust/{ledger,graph}.ts`): pledges are an
append-only ledger (`recordPledge()` only — never raw insert), each row gets a
sha256 `contentHash` (explicit timestamp, no DB-default ambiguity) so Phase 5's
scootd can later ingest this table as a chain genesis without rebuilding
history. Deliberately NOT a self-referential hash chain — that's scootd's job
in C, building it twice in Postgres now would be waste. `traceToRoot()`
(cycle-safe, tolerates untraceable legacy members), `depthFromRoot()`,
`listStakedByMe()` (the staker's own recall list — the ritual's actual point).
SMS: `my pledges` / `my chain`. `ROOT_USER_ID=1` (rocketman) is the one place
root-of-trust is encoded. Full design: `arch/staking.md`. 100 tests total.

**Revocation DONE** (governance resolved — Brandon's call: admin-only, not
consensus): `trust/revocation.ts` `revokePledge()` — records a new
`pledge_revocations` event (never mutates the pledge; at most one per pledge,
unique-constrained), clears ONLY STAKED/SENIOR/OG from scoot_members (leaves
BETA/GYMBOSS/LEADER/etc untouched), and `traceToRoot` now treats a revoked
pledge as if it never existed. SMS: one entry point `revoke <name>` branches by
asker — sender is the pledge's staker → 'bogus' path, freely self-service;
sender is LEADER + name matches any staked member → 'confirmed_human' path,
LEADER-only. Either way, a short reason Q&A follows (mirrors staking's Q&A UX);
`cancel` abandons. Downstream cascade to the revoked stakee's OWN pledges
stays deliberately out of scope (design memory defers it explicitly). 111
tests total.

**Client staking UI DONE**: self-stake bootstrap (`trust/self-stake.ts`) —
hard two-factor gate: caller must be BOTH `ROOT_USER_ID` (hardcoded, rocketman)
AND hold new `ScootFlags.ENGINEER` (1<<10=1024, deliberately a FRESH bit, not
the legacy rc-webhook engineer bits 1|2 which are an unrelated dead feature).
Recorded as a self-referencing pledge; "already done" checked via existing
self-pledge, NOT the STAKED bit (root's bit was already set from historical
bulk seeding in prod, with zero pledge/selfie behind it — a real gap the fix
specifically covers). `GET /scoots/:id/staking-catalog` (STAKED-members-only —
"Brotherhood public, but restricted"): root + selfie hierarchy tree (via
`getTrustCatalog`) + a `legacyMembers` bucket for pre-ritual staked members
with no pledge on record (most of the real current roster). Client:
`pages/staking-page.tsx`, nav "Brotherhood" (staked-only), self-stake button
shown only when server says `viewerCanSelfStake`. Brandon (user 1) already
holds ENGINEER on prod (migration 0018) — ready to self-stake for real. 117
tests total.

**Self-stake also reachable over SMS** (`sms/self-stake-commands.ts`, same hard
gate + selfStake()): "self stake"/"selfstake" -> code, bare photo completes it,
"cancel" abandons. Mirrors the app button; whichever path completes first wins
(hasSelfStaked() is keyed off the self-pledge, not the transport). 123 tests.
IMPORTANT gotcha for future tests touching this: self-pledges are GLOBAL per
user (pledges has no scootId) — ROOT_USER_ID can only ever self-stake ONCE
across the whole test run/prod, so tests must order "cancel" before "complete".

**Brandon self-staked for real over SMS on 2026-07-09** (pledge id 234, prod).
Found + fixed a real bug this surfaced: MMS `MediaUrl` is a Twilio-authenticated
URL (401 unauthenticated — browsers can't render it, and it's not durable
long-term). Added `sms/media-download.ts` (`localizeSelfieUrl` — downloads once
at pledge-creation time into local MEDIA_DIR, falls back to the raw URL on
failure), wired into both staking.ts and self-stake-commands.ts. Backfilled
pledge 234's selfie_url + recomputed contentHash to point at the durable local
copy (verified 200 OK, image/jpeg, matches the ledger's hash contract).

**IMPORTANT DATA-SAFETY LESSON (read before touching self-stake tests again):**
pledges/self-pledges have NO scoot-scoped isolation — ROOT_USER_ID=1 IS
Brandon's real identity, with no test/prod separation possible for this table.
Never write a test that queries-and-revokes "whatever self-pledge currently
exists" for ROOT_USER_ID — that's indistinguishable from destroying real prod
data. Caught this before executing it (verified pledge 234 untouched
throughout). Current tests (trust/self-stake.integration.test.ts,
sms/self-stake-commands.integration.test.ts) never touch pre-existing pledges
for the real root; Q&A mechanics are tested via direct sms_state.pending
construction, not by trying to win a fresh completion (impossible now —
permanently already-staked for real). 128 tests total, stable across repeated
runs.

**Global SMS kill switch DONE** (`sms/shutdown.ts`, arch/sms-rooms.md §8.9):
"shutdown"/"resume" hard-gated to ROOT_USER_ID's own phone (NOT a ScootFlags
grant — can't be delegated). Checked FIRST in bigmo.ts's pipeline, before even
a stranger's "stake" request. While active: zero outbound SMS to anyone;
inbound texts logged to sms_shutdown_queue instead (never auto-replayed).
Singleton row bigmo_shutdown (id=1) — DEFAULT_SHUTDOWN_ROW_ID is parametrized
specifically so tests use a disposable row and never touch the real one (this
literally controls whether the live bot responds to real texts — verified
untouched before/after every test run). 136 tests total.

**NEXT — pick one:**
- Anything else — Phase 4 is feature-complete (ritual, trust graph, revocation,
  self-stake bootstrap via app AND SMS + durable selfie storage, client catalog
  UI), §8 is complete incl. the new kill switch, modulo the explicitly deferred
  items noted above (downstream cascade, per-Scoot pledges, live QR).
- `chat_rooms.scoot_id` to scope oversight per-Scoot (returns all rooms today —
  fine for single Fonde Scoot).
- Ops: storage plan actions awaiting go-ahead (docker prune ~1.2G, media→Azure
  Blob, log→Cold, `ri/physical/storage-plan.md`).
- Later: Phase 5 C core + wallet; Phase 6 mobile.

Roster/infra done this session (not blocking §8.7):
- User-id reservation: reserved band 1–99 (family 1–5 + Rockets legend/patron
  jersey seats), regular members in the 100-block, bots/test at 900+. Migrations
  0003–0012. `ScootFlags.LEGEND_NUMBER` (64) + `scoot_members.worn_number`; McGhee
  is member 130 wearing #24 (BigMo legend seat at id 24). New signups start at 132.
- Storage tooling DONE (`scoot-storage`, 6h cron). Storage plan awaiting go-ahead:
  reclaim ~1.2G docker build cache, media→Azure Blob hot, log→Cold. See
  [[infra_cold_archive]] and `ri/physical/storage-plan.md`.

Related: [[scoot_identity_and_sms_rooms]], [[project_plan]], [[bigmo_no_llm_time_math]].
