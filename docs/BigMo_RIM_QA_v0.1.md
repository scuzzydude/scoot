_Version: v0.1 | 2026-09-08 | Status: ANSWERED 2026-09-07 on `dreamlab` (the BigMo production host) by a Claude Code session with the repo checkout at `/home/brandon/scoot`, the live Postgres, the host systemd/cron, and the Memory Vault MCP. Answers feed `RIM_architecture_v0.1.md` §3 and §4 (spec open question Q2)._

_Answering-session notes: every factual claim below carries a path, a command, or an output. `UNVERIFIED` marks what could not be observed. `/srv/steveai/ri/rim/` does not exist on this host (`ls /srv` is empty), so nothing was written anywhere but this file. A prior, narrower questionnaire (`~/BIGMO_DISCOVERY_QA.md`, answered 2026-08-16) and its sync note (`~/BIGMO_SYNC_NOTE.md`) were read but not copied; where they still hold they are cited._

# BigMo — RIM characterization Q&A

## How to run this

1. Open a session **on BigMo**, or with read access to the BigMo repo and host.
2. Paste this file in, or hand over its path, with the instruction below.
3. Return the completed file. It becomes the reference for `RIM_architecture_v0.1.md`
   §3 and §4.

> **Instruction to the answering session:**
> Fill in each `**A:**` line in place. Answer from what you can actually observe —
> read the files, run the commands, check the services. **Cite a path, a command, or
> an output for every factual claim.** Where you cannot verify something, write
> `UNVERIFIED` and say what you would need; do not infer. Where the honest answer is
> "no" or "nothing like that exists", say so plainly — a clean "no" is more useful
> here than a generous "sort of", and several noes are an expected and fine outcome.
> Do not tidy the answers into a story.

**Why the strictness:** this questionnaire exists to derive criteria from the
*intersection* of two independent machines. Criteria derived from one machine are
just a description of that machine. Aspirational answers defeat the entire purpose —
they would produce criteria that nothing can fail.

**Scope note:** BigMo runs on separate, personal infrastructure. Nothing in this
questionnaire asks for or should receive content from any other host or employer.
Answer about BigMo only.

---

## Part A — Identity and scope

**A1.** What is BigMo, in three sentences, to someone who has never heard of it?
What does it do, and for whom?

**A:** BigMo is an SMS-first AI "Commissioner" for The Fonde Brotherhood, a 55+ men's basketball community in Houston, speaking in Moses Malone's voice (`ri/personalities/bigmo/cotb.md`, line 1: "You are BigMo — the AI Commissioner of The Fonde Brotherhood"). Members text one Twilio long-code number and BigMo answers schedule/location/headcount questions, runs deterministic commands (staking ritual, card photos, "my card", trust queries, GYMBOSS schedule edits, email digest), and routes plain text into chat rooms (`ri/src/server/sms/bigmo.ts`, `handleSmsMessage`). It is one feature of the Scoot platform (repo `scoot`, package name `scoot` v0.1.0), which is the software implementation of Brandon's "asimov" system, currently serving exactly one community, Scoot(34) = The Dream Laboratory (`ri/src/server/sms/bigmo.ts:33` `SCOOT_SLUG = "dream-laboratory"`; `select id,slug,name from scoots` → `34|dream-laboratory|The Dream Laboratory`).

**A2.** What is the repository, and what is the deployment shape? (Hosts, services,
ports, process manager, anything fronting it.)

**A:**
- **Repository:** `git@github.com:scuzzydude/scoot.git` (memory `infra_git_remote_ssh.md`), public/copyleft (CLAUDE.md "Saving Conversation Transcripts"). 389 commits (`git log --oneline | wc -l`). The only checkout is `/home/brandon/scoot` on this host (memory `infra_claude_runs_on_dreamlab.md`: "dreamlab is the ONLY repo checkout"). `git status --short | wc -l` → 0.
- **Host:** one Azure VM, OS hostname `dreamlab` (`hostname`), Azure resource still named `steve`, `Standard_B2s` (`~/BIGMO_DISCOVERY_QA.md` §1.1). `free -h` → 3.8Gi total, 2.4Gi used; `swapon --show` → `/swapfile` 4G (878M used) + `/swapfile2` 4G; `df -h /` → 61G, 54% used. Uptime 13 days (`uptime`), last reboot 2026-08-24 22:40 (`last reboot`).
- **Containers** (`docker ps`): `scoot-app-1` (image `scoot-app`, Node 24 / TypeScript / Express, `tsx watch` over a bind-mounted repo, ports `0.0.0.0:3000` API, `0.0.0.0:5175→5173` Vite, `127.0.0.1:4001` Anthropic shim), `scoot-postgres-1` (postgres:16, host `:5433`), `memory-vault-app-1` (`127.0.0.1:8000`, status "unhealthy" per docker but `memory_status` MCP call → `"status":"online"`), `memory-vault-db-1` (pgvector pg16, `127.0.0.1:54320`), `scoot-pmp-searxng` (`127.0.0.1:8090`). Compose file: `ri/physical/docker-compose.yml`; `restart: unless-stopped` on app and postgres. `docker inspect scoot-app-1` → RestartCount 0, started 2026-09-03T11:16Z.
- **Host processes/timers:** systemd `scoot-pmp.service` (search+synthesis daemon, `/etc/systemd/system/scoot-pmp.service`); systemd timers `card-render-worker.timer` (every 2 min, `OnBootSec=3min`) and `card-art-cold-sync.timer` (every 10 min) (`systemctl list-timers`); root cron `/etc/cron.d`: `0 6 * * 1 /usr/local/bin/scoot-seed-sessions` and `0 */6 * * * /usr/local/bin/scoot-storage --quiet` (`cat /etc/cron.d/*`).
- **Fronting:** Apache 2 vhosts (`ls /etc/apache2/sites-enabled/`): `thedreamlaboratory.org` with `ProxyPass / → 127.0.0.1:5175`, `/api → :3000/api`, `/media → :3000/media`, `/ws → ws://:3000/ws`, static `/privacy /terms /status`; `fairchildlabs.org` also served. Let's Encrypt via `snap.certbot.renew.timer`. Self-hosted Postfix/Dovecot on the same VM (compose `extra_hosts` comment; commits `a79a2a2`, `1e91137`).
- **External services:** Twilio (inbound webhook `POST /api/v1/sms/inbound`, `ri/src/server/routes/sms.ts`), Anthropic API via `ri/src/server/llm/anthropic-shim.ts` and `scoot-pmp`, Memory Vault REST at `http://memory-vault-app-1:8000`, Modal (GPU renders, `scripts/card-render-worker.sh` header), Azure Blob via rclone (`card-art-cold-sync`).
- **Deploy:** none. Editing a file on the host is the deploy (`tsx watch`); no CI, no staging (`~/BIGMO_DISCOVERY_QA.md` §1.5; `ls .github` → absent).

**A3.** Who or what are the *participants* — the things that read and write BigMo's
state? Humans, agent sessions, scheduled jobs, external webhooks, end users?
Roughly how many concurrently?

**A:**
- **Brotherhood members over SMS.** Ever: **2 distinct users** in `sms_deliveries` (`select count(distinct user_id) from sms_deliveries` → 2; same for last 30 days). 78 rows total, 20 inbound / 58 outbound, 2026-07-08 → 2026-09-07. Pool that *could* text: `users where phone is not null` → 38; `scoot_members` for scoot 34 → 50 rows (32 with `user_flags=0`, 9 STAKED-only). Concurrency in practice: 1.
- **Web app users** (React client over Apache): `select count(*) from session` → 5 live sessions. 32 `messages` rows total across 10 `chat_rooms`; 29 of those are in room 13, the BigMo DM. Concurrency: ≤5.
- **Bot users:** `bots` → 2 rows (`bigmo`, `claude`); bots are `users` rows and write `messages` (`ri/src/server/sms/conversation.ts appendTurn`; `ri/src/server/services/bot-mentions.ts`).
- **Claude Code sessions (the authoring participant):** `pgrep -af claude` → 2 processes right now (pid 3028574, cwd `/home/brandon/scoot`, started 2026-09-03 08:57; and this one, cwd `/home/brandon`). All 389 commits are Brandon under 4 author identities (`git log --format='%an <%ae>' | sort | uniq -c`); 83 of 389 commit subjects start with `memory:`. Commits/day last 14 days range 1–27.
- **In-process scheduled jobs** (`ri/src/server/index.ts`): `startMailPoller()` (IMAP poll, default 5 min, `ri/src/server/mail/poller.ts`), `startRenderNotifier()` (60 s, `ri/src/server/cards/render-notifier.ts`), `startAttachmentCacheSweeper()`, `startAnthropicShim()`.
- **Host scheduled jobs:** `card-render-worker` (2 min), `card-art-cold-sync` (10 min), `scoot-seed-sessions` (Mondays 06:00 UTC; observable as `scoot_sessions.updated_at` rows at `06:00:05` on 08-03, 08-10, 08-17, 08-24, 08-31, 09-07), `scoot-storage` (6 h).
- **External webhooks in:** Twilio SMS/MMS; a Rocket.Chat webhook route still mounted (`ri/src/server/app.ts:99 app.use("/api/v1/rc", ...)`) — whether anything still calls it: UNVERIFIED (no RC traffic in the last 72 h of `docker logs`).
- **Human operator:** Brandon, who is simultaneously `ROOT_USER_ID = 1` (`ri/src/server/trust/graph.ts:16`), `scoots.trustee_id = 1`, and the one member with `user_flags = 1180` (= ENGINEER|TEXT_AUDIT|GYMBOSS|LEADER|STAKED). `impersonation_log` → 7 rows, all `actor_id=1` viewing `target_id=4` (2026-09-02..04).

**A4.** Is BigMo primarily **a substrate that other work runs on**, or **a piece of
work that runs on something else**? Give the reason, not just the answer.

**A:** A piece of work. BigMo is a system prompt (`cotb.md`, 5 KB) plus a 343-line ordered command router (`bigmo.ts`) that runs on the Scoot platform (Express + Postgres), which in turn runs on Twilio, an LLM provider, Memory Vault, and Modal. Nothing runs *on* BigMo: no other code imports `handleSmsMessage` except the route and tests (`grep -rl bigmo ri/src`). The *Scoot platform* claims to be a substrate ("the app must be structured to host many Scoots", CLAUDE.md), but the evidence for that is n=1: `scoots` has 3 rows, two of which are leaked test fixtures (`78|selfstake-...|T2`, `80|...|T2`; memory `infra_prod_db_migrations.md` "Data hygiene note ... not yet cleaned"), `bigmo.ts` hardcodes one slug, and `bots`/`chat_rooms` have no `scoot_id` column (memory `bigmo_multiscoot_open_questions.md`). "Both" in this sense: Scoot = intended substrate, unproven; BigMo = design. The thing that actually behaves like a converging machine here is the Claude Code + git + `.claude/memory/` loop that authors BigMo (see D1).

> *This is the level question: substrate ⇒ level 2 (a machine); work ⇒ level 3 (a
> design). "Both" is a legitimate answer if you can say which part is which.*

---

## Part B — The six criteria

One question per criterion. Each has a **disqualifier** — read it before answering,
and if it applies, say so. A "no" here is a finding, not a failure.

### B1 — One artifact, many depths

Is there a single artifact that every participant reads and writes, holding the
behavioural, structural and operational picture at once? Or does each participant
work from its own representation?

*Disqualified if:* any depth of the design exists only inside a tool others cannot
read, or a representation exists only to be handed across a boundary.

**A:** No. Each participant has its own representation, and the disqualifier applies twice.
- Members read/write only SMS text and (a few) the web chat; they never see any design artifact.
- The runtime reads Postgres, `.env`, and `cotb.md`; it never reads `arch/`, `.claude/memory/`, or `ri/model/`.
- Claude Code sessions read/write the repo (`arch/*.md`, `ri/src`, `.claude/memory/*.md` — 35 files, `ls .claude/memory`), and the DB by hand.
- Brandon reads review pages (`/var/www/html/card-review-N/`), SMS, and the app.
- **Inside a tool others cannot read:** BigMo's long-term member memory lives as pgvector chunks in Memory Vault (`memory_status` → space `bigmo-dream-laboratory`, 10 chunks; space `scoot`, 56 chunks). No human reads it; the runtime reads it only via `/api/search` (`ri/src/server/sms/memory.ts`). Also `docker logs scoot-app-1` (pino JSON) is the only operational trace of most events and is lost on container recreate.
- **Exists only to be handed across a boundary:** `HANDOFF_MAIL_MIGRATION.md`, `MAIL_MIGRATION_CHECKPOINT.md`, `HANDBACK_STEVE.md`, `~/BIGMO_SYNC_NOTE.md`, `~/BIGMO_DISCOVERY_QA.md` — prose written by one session for another. The schema comment at `ri/src/server/db/schema.ts:136-141` says `player_cards` is "the queryable copy" of data that "only exist[ed] in a scratch CSV" in `tools/player-cards/`.

**B1a.** Name the artifact and its path, if it exists.

**A:** Nothing qualifies. The nearest candidate is the git repository itself, `/home/brandon/scoot` (code + `arch/` + `.claude/memory/` + `ri/personalities/`), but the runtime state (Postgres), the vector memory, the host systemd/cron units (`/etc/systemd/system/card-*.{service,timer}`, `/etc/cron.d/*`, mirrored in `ri/physical/systemd/` but installed by hand), and `.env` (gitignored) are outside it.

**B1b.** What is the closest thing BigMo has to a hand-off — a point where one
participant produces something another consumes in a different format? What is lost
there, if anything?

**A:** Five, in order of how much is lost:
1. **Claude session → next Claude session** via `.claude/memory/*.md` and the HANDOFF/SYNC/CHECKPOINT documents. Lost: whatever was not written down. Concrete case: `~/BIGMO_SYNC_NOTE.md` reports that `CLAUDE.md`'s phase history says token/cost tracking is done but `anthropic.ts` never reads `response.usage`. Another: memory `bigmo_multiscoot_open_questions.md` — "Never got to the actual new rules — session pivoted".
2. **`schema.ts` → production DB.** Migrations are hand-applied via `ALTER TABLE` in the container (memory `infra_prod_db_migrations.md`; 22 files in `ri/src/server/db/migrations/`). Lost: the `session` table exists only in the DB, so `db:push` proposes dropping it (same memory, 2026-05-29 near-miss).
3. **Host render worker → app render-notifier.** The worker (bash + Python, on the host, `scripts/card-render-worker.sh`) flips `card_art.status`; the app polls every 60 s and sends the MMS (`render-notifier.ts` header: "The worker can't send SMS itself ... so it just flips card_art.status and this poller does the talking"). Lost: up to 60 s latency, and a crash mid-render leaves a row at `status='rendering'` that nothing ever retries (the worker's SELECT only takes `status='received'`; the only reset is on non-zero driver exit, `card-render-worker.sh:36`).
4. **Deterministic layer → LLM.** `scheduleFactsSafe()` computes a "Verified Schedule" block and injects it as text into the user turn (`bigmo.ts` `llmMessages`); `recall()` injects vector hits as prose. Lost: nothing structurally, but the LLM can still misphrase; the guard is the prompt (`cotb.md` "NEVER calculate a date").
5. **Book → code vocabulary.** `ip/inventions/asimov_v2.13.md` (335 pages) → canonical terms in schema (`pledge`, `scootage`, `trustee`) via a per-Scoot `label_map` (CLAUDE.md "Vocabulary rule"). Lost: UNVERIFIED — no traceability from a code concept back to a book section exists.

### B2 — Positional authority

When two participants could write the same thing, what decides who does? Position in
a tree? A name? A role? Whoever asked first? Nothing?

*Disqualified if:* authority is by name or identity rather than by position.

**A:** Identity and role, explicitly and by design. The disqualifier applies.
- `ROOT_USER_ID = 1` is hardcoded (`ri/src/server/trust/graph.ts:16`, "Single global root: rocketman (user id 1) — one root staker for the whole platform").
- The SMS kill switch is "Hard-gated to ROOT_USER_ID's OWN phone number — not a ScootFlags permission, so it can never be delegated via a role grant" (`ri/src/server/sms/shutdown.ts` header).
- Self-stake "requires BOTH this flag AND being ROOT_USER_ID (hardcoded in trust/graph.ts) — a 'hard cut'" (`schema.ts:26-34`).
- Mint is trustee-only, and trustee is a single FK to a person (`schema.ts:129-132`, `scoots.trustee_id = 1`).
- Everything else is a per-Scoot role bitmask: LEADER, GYMBOSS, etc. (`ScootFlags`, `schema.ts:14-35`).
- For code files: nothing. Two Claude sessions can edit the same file; git decides by whoever pushes last, and CLAUDE.md's "commit after EVERY change, `git add .`" rule means one session's commit sweeps up the other's edits.
- One place is positional: the *freshest* message wins for schedule facts ("current as of THIS message; it OVERRIDES any day/time you stated earlier", `bigmo.ts` and `cotb.md`), and `escalation.ts` treats a GYMBOSS's *recent* (6 h window) change as the thing that must not be silently reversed — recency, not rank.

**B2a.** Is there anything that functions as an **ownership map** — a file, table or
config saying who may write what? Path and a representative excerpt.

**A:** Yes, two, both role-based:
- `ri/src/server/db/schema.ts:14-35` (`ScootFlags`) and its prose twin `arch/sms-rooms.md` §2: `STAKED 4`, `LEADER 8 — oversight: can read all messages, enable SMS-mirror`, `GYMBOSS 16 — schedule authority: set/clear scoot_sessions`, `BETA 32`, `LEGEND_NUMBER 64`, `TEXT_AUDIT 128`, `SENIOR 256`, `OG 512`, `ENGINEER 1024`. Live distribution for scoot 34 (`select scoot_id,user_flags,count(*) from scoot_members group by 1,2`): `0`×32, `4`×9, `20`×2, `32`×2, `60`×1, `64`×1, `1180`×1.
- `chat_rooms.access_mask` / `post_mask` per room (`schema.ts:70-71`). Live: all 10 rooms have both masks `= 0` (`select id,name,access_mask,post_mask from chat_rooms`), i.e. the mechanism exists and is unused.
- For the codebase: no CODEOWNERS, no ownership file (`ls .github` absent; `find . -name CODEOWNERS` empty).

**B2b.** If two participants wrote the same file in the same minute today, what
would actually happen? Describe the real mechanism, or say that nothing prevents it.

**A:**
- **Source files:** nothing prevents it. Both sessions write to the same bind-mounted tree; `tsx watch` restarts on whichever write lands last; the next `git add . && git commit && git push` from either session commits both sets of edits under one message. No lock, no lease, no advisory file. (`grep -rniE 'advisory|for update|SKIP LOCKED|flock|lockfile' ri/src tools scripts` → only `scripts/card-render-worker.sh:15`.)
- **DB rows:** Postgres row-level last-writer-wins. `sms_state` is an upsert (`pending.ts setPending`, `onConflictDoUpdate`) so two concurrent flows for one user overwrite each other's `pending` JSON. `scoot_sessions` is last-writer-wins *unless* the writer is a different GYMBOSS reversing a change within 6 h, in which case a poll opens (`escalation.ts isConflict`). The BigMo DM room has an explicit concurrent-create race recovery (`conversation.ts getBigmoDmRoom`: insert, catch unique violation, delete the loser, read the winner).
- **Render pipeline:** `flock -n 9 || exit 0` — a second worker instance exits, it does not wait (`card-render-worker.sh:15`).
- **Outbound SMS:** a process-wide promise chain serializes all sends ~1.1 s apart (`send.ts` `sendChain`).

### B3 — Append-only history

Is BigMo's state a **log** that is replayed, or a **snapshot** that is overwritten?

*Disqualified if:* truth is a snapshot. A snapshot cannot express "this was deferred
and never resumed" or "this was escalated and never decided".

**A:** Mostly snapshot; the disqualifier applies to the state members actually depend on. Split by table (`grep pgTable schema.ts` + live counts):
- **Append-only by contract:** `pledges` (1 row) + `pledge_revocations` (0) — "never UPDATEd or DELETEd once inserted ... a correction is a NEW event" with a `contentHash` (`trust/ledger.ts`); `scoot_transactions` (0) + `scoot_transaction_responses` (0) — same contract (`scoot/ledger.ts`); `sms_deliveries` (78, "truthful record of what actually went over the wire", `schema.ts:457`); `messages` (32); `impersonation_log` (7, "one row per start/stop"); `sms_shutdown_queue` (0); `card_art` rows are hash-addressed and never overwritten as files, but the `status` column *is* mutated (`received→rendering→rendered→approved|rejected`, `card-photo-commands.ts:121`, `render_card_photo.py:141,195`); git history (389 commits).
- **Snapshot:** `scoot_sessions.status` with `updated_by/updated_at` (28 rows; a session cancelled then re-confirmed keeps only the last state; e.g. row 11 `cancelled`, row 12 `confirmed`, both `updated_by=1`); `sms_state.pending` (one JSON slot per user, overwritten); `scoot_members.user_flags`; `bigmo_shutdown` singleton (`1|f||`); `player_cards.front_image_url`; `mail_check_state.last_uid`; `users`.
- Nothing is replayed at startup. The ledgers are *designed* to be replayed later by a C daemon ("so scootd can later replay scoot_transactions as clean chain history") but `scootd` is not running (`pgrep -a scootd` → nothing) and has 0 rows to replay.

**B3a.** Is there an append-only event log? Path, format, current size, and the
distinct event types in it (a histogram is ideal).

**A:** No single event log. The pieces:
- `sms_deliveries` (Postgres): `direction` histogram → `in 20`, `out 58`; 2026-07-08 → 2026-09-07. Columns `user_id, message_id, room_id, direction, body, twilio_sid, created_at`. No event type beyond direction.
- `messages`: 32 rows, 2026-07-04 → 2026-09-03; 29 in the BigMo DM room (13), 3 in room 362 "endpoint test".
- `impersonation_log`: `start`×4, `stop`×3.
- `card_art`: `source|rendered 1`, `render|rendered 6` (every render stage is a row with `meta.stage`, `parent_hash` lineage).
- Memory Vault: 10 chunks in `bigmo-dream-laboratory`, source `bigmo-sms` (`memory.ts remember`).
- `docker logs scoot-app-1`: pino JSON since 2026-09-03 only; `grep -c 'bigmo sms reply sent'` → 12; `grep -c 'LLM error'` → 0; level-50 errors in last 72 h → 0.
- `/var/log/scoot/` exists but is empty (worker has not run a job since the log dir was created at 09:26 today). `/var/log/scoot-seed-sessions.log`: UNVERIFIED contents (not read).
- git log: 389 commits, 83 `memory:`.

**B3b.** After a reboot or a crash, how does BigMo know what was in flight? Is
recovery a replay, or a special-cased path, or manual?

**A:** Special-cased per subsystem, plus some things simply lost:
- Containers come back via `restart: unless-stopped` (`docker-compose.yml`). Memory Vault originally lacked this and stayed down ~13 h after the 2026-07-27 reboot while BigMo silently no-op'd recall/remember (memory `infra_memory_vault.md`, "Restart policy (fixed 2026-07-28)").
- Multi-turn SMS flows survive: `sms_state.pending` is "persisted so a restart doesn't lose a user mid-convo" (`schema.ts:449`). Live: 2 rows, both `pending = NULL`.
- Mail poller resumes from `mail_check_state.last_uid` (`poller.ts` header).
- Render notifier is idempotent via `card_art.meta.notified` (`render-notifier.ts`).
- Render worker: a row left at `status='rendering'` by a crash is orphaned; no path resets it (see B1b.3).
- **Lost on crash:** stranger conversations (`strangerHistory` Map, `bigmo.ts:60`); any outbound texts still queued in the in-memory `sendChain` (`send.ts`) — no row records that they were never sent; the in-memory inbound ring buffer (`routes/sms.ts:11`).
- An inbound Twilio POST that was mid-flight gets no reply; Twilio's own retry behaviour: UNVERIFIED.
- The scheduled-session horizon is re-filled by the idempotent Monday seeder rather than replayed (`ri/physical/scoot-seed-sessions.sh`).

**B3c.** Where does a "come back to this later" item live so that it outlives the
conversation or process that created it? If nowhere, say nowhere.

**A:**
- **For a member mid-flow:** `sms_state.pending` — one slot per user, discriminated union of five flow kinds (`pending.ts`). A second deferred thing for the same user overwrites the first.
- **For a schedule dispute:** `schedule_verifications` (status `open|approved|rejected`) — 0 rows have ever existed.
- **For a member's "remind me / note this":** nowhere structured. Substantive texts (≥12 chars) are stored as vector chunks (`memory.ts remember`) and may or may not be recalled later; there is no list of open items a member can ask for.
- **For engineering:** prose in `.claude/memory/*.md` — e.g. `project_mail_hotmail_pending.md` ("ask again once 2026-09-30 passes, delete this once done"), `bigmo_multiscoot_open_questions.md` ("Pick this back up directly next time"), `arch/sms-rooms.md` §9 "Open / deferred decisions" (4 bullets), `arch/player-cards.md` §7. Whether the next session reads them depends on MEMORY.md being loaded. Concrete never-resumed item: test rows `scoots 78/80` flagged 2026-07-28 "left untouched pending his call", still present 2026-09-07.

### B4 — Non-blocking convergence

When a participant is blocked on a contended resource, does it **wait** (lock), or
**hand off and continue**?

*Disqualified if:* the primary mechanism is a lock. Locking serializes the authoring,
which is the expensive and parallel-safe part.

**A:** Mixed. The *inbound* path waits: the Twilio webhook `await`s the whole pipeline including the LLM call and returns TwiML inline (`routes/sms.ts:51`; `~/BIGMO_DISCOVERY_QA.md` §2.1). Outbound is serialized behind one promise chain (`send.ts`). Those are locks in effect. But the two expensive operations were both moved to hand-off-and-continue: (1) GPU rendering — the member gets "Give me a few minutes -- I'll text you the card to approve" immediately (`card-photo-commands.ts:206`), the render happens on a host timer, and the app notifies later; (2) GYMBOSS conflicts — the requester gets an ack, a poll goes to the other GYMBOSSes, and the change applies on the first decisive reply (`escalation.ts`). Authoring (Claude sessions editing code) has no coordination at all — neither lock nor hand-off. Verdict: the *primary* mechanism for the SMS reply is a synchronous wait; the disqualifier applies to that path, not to the long-running work.

**B4a.** Are there locks, mutexes, queues, or leases anywhere in the concurrency
story? What kind, and what do they protect?

**A:** Complete list from `grep -rniE 'mutex|advisory|for update|pg_try|lock\(|lease|queue|semaphore|SKIP LOCKED' ri/src scripts tools`:
- `flock -n` on `/tmp/card-render-worker.lock` (`scripts/card-render-worker.sh:15`) — one render at a time on the host.
- `sendChain` promise chain + 1100 ms gap (`sms/send.ts`) — A2P 10DLC long-code send rate; "concurrent senders can't sum past the limit".
- `running` boolean re-entrancy guard in `render-notifier.ts`.
- `card_art.status='received'` acting as a work queue, drained oldest-first, one per 2-minute tick, capped at 5 renders/member/24 h (`card-render-worker.sh` SQL).
- `sms_shutdown_queue` — capture, not a work queue (0 rows).
- Unique constraints as the only DB-level arbitration: `dm_pairs` PK, `card_art.hash`, `pledge_revocations` one-per-pledge.
- No Postgres advisory locks, no `SELECT ... FOR UPDATE`, no job-queue library (confirmed again in memory `bigmo_mail_poller.md`: "no cron library, no setInterval, nothing periodic existed").

**B4b.** Has BigMo ever had two participants collide on one resource? What happened,
and what changed afterwards?

**A:** Yes, on RAM, not on data:
- 2026-08-24 21:43–22:06 UTC: two concurrent Claude Code sessions (one transcript 162 MB) on the 3.8 GB VM with no swap; the box hung, Brandon restarted it from the Azure portal; `last reboot` shows 22:09 and 22:40 boots. Change: disk grown to 64 G, 4 G swapfile, `vm.swappiness=10` (memory `infra_dreamlab_oom_reboot_2026_08_24.md`).
- 2026-08-26 22:27 UTC: postgres OOM killed `systemd --user`, then a searxng worker OOM killed the `claude` process. Change: `mem_limit`/`oom_score_adj` on the searxng container, second 4 G swapfile (`swapon --show`).
- The DM-room concurrent-create recovery in `conversation.ts` "mirrors chat.ts dm logic, incl. the concurrent-create race recovery" — whether that race was observed or anticipated: UNVERIFIED (no incident record).
- No two humans have collided on a data resource: `schedule_verifications` → 0 rows; 2 SMS users ever.

### B5 — Rank commits; rank never adjudicates

Is there any hierarchy in BigMo? If so, does it govern only **who writes**, or does
it also settle **who is right**?

*Disqualified if:* position can settle a technical dispute.

**A:** Hierarchy exists (stranger < registered < STAKED < GYMBOSS/LEADER < ROOT/trustee) and in the runtime it governs only who may write: gym commands are GYMBOSS-gated (`schedule-commands.ts`), revocation of a confirmed-human pledge is LEADER-only (`revoke-commands.ts`), mint is trustee-only (`scoot/ledger.ts`), shutdown is root-phone-only (`shutdown.ts`). When two equal-rank GYMBOSSes disagree, rank does *not* decide: a poll does, "first decisive reply" (`escalation.ts tryResolveVerification`), and there is no root-override path in that code. For date/time facts, the deterministic layer overrules the LLM regardless of what any human asserted ("will parrot a time a user asserts", memory `bigmo_no_llm_time_math.md`). In the *authoring* loop, however, Brandon settles everything by identity: CLAUDE.md ("check in with Brandon"), feedback memories recording his rulings (`feedback_*.md`, e.g. "Always increment card-review-N"). The disqualifier applies to authoring, not to the runtime.

**B5a.** Has a lower-standing or no-standing participant ever overruled a
higher-standing one, correctly? Describe it.

**A:** In the runtime: yes, by construction — the code (no standing) overrules the LLM and the human's asserted time: "Real pre-fix logs showed BigMo replying 'Monday 4:12pm Central, like you said'" (memory `bigmo_no_llm_time_math.md`); since the fix the Verified Schedule block overrides both. Between humans: no recorded case (2 SMS users, 0 polls). In authoring: a session's reasoning held against Brandon's question "why not 5 per day" — "cost is cents, the limit is queue fairness + approval-message volume, so 5 it is" (memory `project_card_photo_intake.md`); that is the only recorded instance and it is weak.

**B5b.** When there is a genuine conflict that cannot be resolved mechanically, what
happens? Does it reach a human, get auto-resolved, or get buried?

**A:** By path:
- Schedule reversal between GYMBOSSes → reaches humans (poll by SMS). Never exercised.
- Ambiguous room routing → asks the sender to confirm (`pending.kind = "route_confirm"`, `routing.ts`).
- Card render outcome → the member decides ("approve card" / "reject card").
- Code/design conflict → Brandon, via chat with the session; recorded in memory files.
- Buried: an orphaned `rendering` row; the leaked test Scoots (flagged 07-28, still there); `arch/sms-rooms.md` §9 items (no owner, no date); `ri/sim/README.md` still says Auth/Chat/Wallet/Staking tests "Not yet" although `find ri/src -name '*.test.ts' | wc -l` → 21 including `staking.integration.test.ts`.

### B6 — The tool is the method

Is running BigMo the same act as doing the work it is for, or is BigMo a tool you
pick up to do work that exists independently of it?

*Disqualified if:* the specification is an input. In a RIM machine the spec is the
output of convergence.

**A:** For members, running BigMo *is* the work (getting to the gym, staking someone in, approving a card). For Brandon, BigMo is a product being built, and the building happens elsewhere (Claude Code). The specification is an input at the top — `ip/inventions/asimov_v2.13.md` (335-page book) and `ip/inventions/scoot_design_claims.md` predate the code, and `ri/model/pass1_behavioral_model.md` is a formal "Pass 1 ... to be formally closed before Pass 2" with all exit-criteria boxes unchecked — so the disqualifier applies at that layer. Below it, the operational spec demonstrably falls out of use: `arch/sms-rooms.md` §9 "start with §4, tune against real traffic"; `arch/player-cards.md` went v1.0 → v1.1 after generation attempts (`~/BIGMO_SYNC_NOTE.md`); card design ran 33 review rounds (commits `memory: record round N`); the no-LLM-time-math rule came from real wrong-time logs; `cotb.md` was edited today (`ls -la` → Sep 7 09:27) to describe capabilities the code had just grown.

**B6a.** Does BigMo start from a finished specification, or does the specification
fall out of using it?

**A:** Both, at different depths: the vocabulary and governance model start from the finished book; the behaviour (what BigMo says, which commands exist, what a card looks like) falls out of Brandon using it as the sole beta member ("trial with Brandon alone first", memory `project_card_photo_intake.md`) and then rewriting the prompt/docs to match.

---

## Part C — Map and Model

The two halves of one pass. Answer these separately even if they feel like the same
question — the point is whether they are the same *artifact*.

**C1.** What plays the role of the **Map** in BigMo — the positional truth about
where things are and who writes them?

**A:** The live Postgres database, specifically `users` (who), `scoot_members.user_flags` (may write what), `chat_rooms` + `room_members` (where messages go), `sms_state.active_room_id` (where a given phone's next text lands), `scoots.trustee_id`, and the hardcoded `ROOT_USER_ID`. For the codebase there is no map: the git tree plus CLAUDE.md's tech-stack table (`CLAUDE.md` "Tech Stack — Quick Reference") and `arch/spec.md` "Folder Structure" (line 98), which describes a `client/ server/ core/` layout that does not match the actual `ri/src/{client,server,shared}` tree.

**C2.** What plays the role of the **Model** — the artifact that predicts, or that
*is* the design?

**A:** Three candidates, none authoritative alone: (1) `ri/personalities/bigmo/cotb.md` — the system prompt, which is literally what predicts BigMo's speech; (2) the ordered `if (tryHandleX != null) return finish(...)` chain in `bigmo.ts` — the design of what BigMo *does* exists only as that code order plus its comments; (3) `arch/sms-rooms.md` (predictive design doc for routing/roles/escalation) and `arch/staking.md`, `arch/player-cards.md`. `ri/model/pass1_behavioral_model.md` is the intended model and is stale (references `scootd` owning the wallet; `scootd` not running).

**C3.** **Are C1 and C2 the same artifact, or two?** If two, where do they disagree
today, and how would you find out?

**A:** Two (arguably three: DB, code+prompt, docs). Disagreements observed today:
- `ri/sim/README.md` status table says Auth/Chat/Wallet/Staking tests "Not yet"; 21 test files exist including staking, trust, fanout, escalation, shutdown.
- `CLAUDE.md` and `arch/spec.md` say the C daemon `scootd` owns the blockchain and "The Node API layer never implements blockchain logic"; `scoot/ledger.ts` implements mint/send in Postgres, and `scootd` is not running.
- `CLAUDE.md` "Developer Context" says WSL dev environment; memory says the only checkout is prod.
- `arch/sms-rooms.md` §2 says "`ScootFlags` constant to be added to `schema.ts`" — already there with four more flags than the doc lists.
- `arch/spec.md` folder structure vs. actual tree (above).
- `player_cards` has 31 rows; the roster memory says 31; `card_links` 26 — the "11 need manual resolution" note in MEMORY.md is partly stale (memory file says a later round closed 4 of 11).
- How you would find out: by reading and diffing by hand. Nothing checks doc against code or code against DB; `db:push` is banned precisely because the only automated check proposed data loss.

> *The invariant under test is "the registry is the model is the authority is the
> registry" — the claim that Map and Model must be one artifact. Two artifacts is a
> perfectly acceptable answer and a genuinely useful one; it is the more common
> case and it is what the pattern claims costs you.*

---

## Part D — Level placement

**D1.** Given Part A–C, where does BigMo sit?

- [ ] Level 2 — a RIM machine (a substrate that converges designs)
- [ ] Level 2 — a RIM application (supervises one class of resource within a machine)
- [x] Level 3 — a RIM design (work executed on some other machine)
- [ ] Not a RIM instance
- [x] Mixed — specify which part is which

**A:** BigMo the bot is Level 3: a design executed on the Scoot platform. The Scoot platform *intends* Level 2 (multi-Scoot substrate) but with one real tenant it is observationally a Level 3 design too. The only thing on this host that actually loops — reads its own history, writes a change, records what it learned, and hands to the next instance — is the Claude Code + git + `.claude/memory/` + Memory Vault authoring loop (83 memory commits, 35 memory files, 56 seeded vector chunks). That loop is not a RIM machine by the six criteria either: it fails B1 (many artifacts), B2 (identity authority), B3 (prose, not a log), B4 (no coordination between concurrent sessions). Honest placement: **Level 3 design, authored by a proto-machine that meets none of the six cleanly.**

**D2.** If BigMo is a machine: what are the **designs** that run on it? Name them.

**A:** Treating the Scoot platform as the machine, the designs are: BigMo (SMS commissioner), the staking ritual / trust graph (`trust/`), the Scoot(34) currency ledger (`scoot/ledger.ts`, unexercised), SMS⇄rooms routing and fan-out (`sms/routing.ts`, `fanout.ts`), the player-card pipeline (`tools/player-cards/`, `card_art`), the mail poller + digest (`mail/`), and the `claude` chat bot. Nothing runs on BigMo itself.

**D3.** If BigMo is a design: what machine does it run on?

**A:** Express/Node 24 in `scoot-app-1` + Postgres 16 in `scoot-postgres-1` on `dreamlab`, fronted by Apache and Twilio; with Anthropic (via `anthropic-shim.ts` and `scoot-pmp`), Memory Vault REST, Modal GPU, and Azure Blob as external limbs; host systemd/cron for the parts the container cannot do (rclone, Modal, one-render-at-a-time).

**D4.** Does BigMo have anything resembling a **supervisor** — a component that
governs other components without being one of them? If it is inside the hierarchy it
governs, say so; that is the common and interesting case.

**A:** Three, all inside what they govern:
- `bigmo_shutdown` / `tryHandleShutdownGate` — silences every outbound path "checked FIRST, before anything else" (`bigmo.ts:98-104`), but it is a row in the same DB and a function in the same process, controlled by member #1's phone.
- The host render worker + notifier pair govern `card_art` rows from outside the app process, but they read/write the same table they supervise.
- Brandon: root user, trustee, LEADER, GYMBOSS, ENGINEER, TEXT_AUDIT, the only impersonation actor, one of two SMS users ever, and the author of all 389 commits. He is the supervisor and a member of every level he supervises.

---

## Part E — The intersection (the part that matters most)

These three questions are the reason the questionnaire exists. Answer them last,
after A–D, and answer them adversarially.

**E1.** From your answers above: **which of the six criteria does BigMo genuinely
meet, which does it fail, and which are not applicable?** A table, with the evidence
line for each.

**A:**

| Criterion | Verdict | Evidence line |
|---|---|---|
| B1 One artifact, many depths | **Fail** | ≥5 representations; vector memory readable only by the tool; hand-off docs exist (`HANDOFF_MAIL_MIGRATION.md`, `~/BIGMO_SYNC_NOTE.md`); `schema.ts` ≠ prod DB (`session` table). |
| B2 Positional authority | **Fail** (deliberately) | `ROOT_USER_ID = 1` hardcoded (`trust/graph.ts:16`); shutdown gated to one phone (`shutdown.ts`); no ownership map for code; room masks all 0. |
| B3 Append-only history | **Partial → Fail** | Ledgers are append-only by contract (`trust/ledger.ts`, `scoot/ledger.ts`) but hold 1 and 0 rows; the state members depend on (`scoot_sessions`, `sms_state`, `card_art.status`) is a snapshot; no replay on restart. |
| B4 Non-blocking convergence | **Partial** | Webhook path waits (`routes/sms.ts:51`); renders and GYMBOSS conflicts hand off (`card-photo-commands.ts:206`, `escalation.ts`); authoring has no coordination. |
| B5 Rank commits, never adjudicates | **Meets (runtime) / Fails (authoring)** | Equal-rank conflict → poll, first reply wins (`escalation.ts`); code overrules human-asserted times; but design disputes are settled by Brandon by identity (CLAUDE.md, `feedback_*.md`). |
| B6 The tool is the method | **Partial** | Book + design claims + Pass-1 model are inputs; operational behaviour converged through use (33 card rounds, `cotb.md` edited today, `sms-rooms.md` §9 "tune against real traffic"). |

Not applicable: none. Every criterion could be tested because BigMo has concurrent writers, a hierarchy, persistent state, and a spec.

**E2.** **What does BigMo do that looks like recursive integration but is not covered
by any of the six criteria?** This is the most valuable answer in the file — a
criterion the pattern is missing shows up here or nowhere.

**A:**
1. **Recall as a first-class participant operation.** Every authoring session begins by reading its predecessors' memory (`CLAUDE.md` "Persistent Memory — Check First"); BigMo begins every LLM turn by `recall()`ing prior member texts (`bigmo.ts`). 83 of 389 commits exist only to write memory. None of the six says anything about a participant reconstituting itself from history before acting; B3 covers the log's existence, not the obligation to read it.
2. **Deterministic-over-probabilistic precedence, positionally.** The Verified Schedule block rides on the freshest turn and "OVERRIDES any day/time you stated earlier" — a rule for which *layer* wins, decided by position in the message sequence, not by rank. The six treat participants as peers; this is a criterion about heterogeneous participants (a computed fact vs. a language model vs. a human assertion).
3. **Content-addressed immutability with lineage.** `card_art` keys everything by sha256 with `parent_hash`; "nothing overwritten", every intermediate a row (memory `project_card_photo_intake.md`). Identity-by-content is how B3's append-only property is achieved for binary artifacts and is not stated anywhere in the six.
4. **Graceful-absence contract for optional participants.** `memory.ts` "HARD RULE: every call degrades gracefully ... BigMo must reply exactly as it would without it." The 13-hour Memory Vault outage was invisible *by design*. The six have no criterion about what a participant's absence must cost.
5. **Capture-not-drop under a kill switch.** Shutdown queues every inbound (`sms_shutdown_queue`) rather than losing it. A supervisor that halts output while preserving input is a specific supervisory shape D4 asks about but no criterion names.
6. **Idempotent re-issue instead of replay.** The Monday seeder keeps a rolling 28-day horizon and is safe to run any number of times (`scoot-seed-sessions.sh`); recovery after a crash is "run the idempotent thing again", not "replay the log". This is a third recovery model beyond B3b's replay/special-case/manual.
7. **The operator dogfoods as a rate-limited peer.** Brandon is one of two SMS users and subject to the same 5-renders/day cap; convergence steps are literally "Brandon texts a selfie → check `select * from card_art`". The six say nothing about the supervisor being required to act through the same interface as the governed.

**E3.** **What does BigMo do that is genuinely incompatible with the six criteria** —
where it works well and the criteria say it shouldn't? Falsifying evidence is worth
more than confirming evidence, and a criterion that nothing can fail is not a
criterion.

**A:**
1. **Identity authority is the safety control (against B2).** The thing that makes it acceptable to run an LLM that texts 55+ seniors is that one hardcoded person, from one phone number, can silence everything and that no role grant can widen that ("can never be delegated via a role grant", `shutdown.ts`; the ENGINEER "hard cut", `schema.ts:26-34`). B2's disqualifier would forbid the most important control in the system. Positional authority would be *less* safe here.
2. **Snapshot truth is correct for the schedule (against B3).** The member's question is "when is the next run", and the right answer is a computed projection of the current rows (`llm/schedule.ts`), not an event history. An append-only log would still need exactly this snapshot to be useful, and the 6-hour `updated_by/updated_at` window in `escalation.ts` captures the only history that matters for conflict.
3. **Serialization is externally mandated (against B4).** The `sendChain` throttle exists because A2P 10DLC long-code limits are a carrier rule, and the earlier undelivered-30034 failures were a registration gap (memory `twilio_a2p_10dlc_registration.md`). A lock on an external rate limit is not "serializing the authoring"; B4's disqualifier conflates the two.
4. **A finished spec as input works (against B6).** The book gives the vocabulary rule that keeps `pledge/scootage/trustee` consistent across schema, code, and a per-Scoot label map; nothing converged that, and it has not needed to change. Convergence produced the *behaviour*; the *ontology* was an input and is better for it.
5. **The synchronous webhook is the reliable path (against B4).** Since 2026-09-03: 12 replies, 0 LLM errors, 0 level-50 log lines in 72 h (`docker logs`). The one time async work was needed it was moved out, per case, rather than making the whole pipeline non-blocking.
6. **Two artifacts beat one for this team size (against B1).** With one author and one tenant, the cost B1 predicts (drift) is real (C3 lists six disagreements) but has caused zero incidents in Part F; the incidents all came from resource exhaustion and unhandled events, not from representation drift.

---

## Part F — Free response

**F1.** Anything about BigMo's architecture, history, or failure modes that the
questions above did not reach but that someone writing a methodology document should
know?

**A:**
- **n = 1 on every axis.** One Scoot, one author, one operator, two SMS users ever, one host that is simultaneously dev, prod, mail server, search engine, and vector store. Every concurrency and authority answer above is untested against a second real human.
- **Dev and prod share the box and the DB.** `npm test` from the host hits the production database (memory `infra_prod_db_migrations.md`), which is how `scoots 78/80` got there. The 08-24 outage was caused by *authoring* (two Claude sessions), not by the product.
- **The repo is public**, so transcripts are redacted by pattern (`scripts/save-session.cjs`), which shapes what memory can contain.
- **The LLM path is a chain:** app → `anthropic-shim.ts` (:4001) → `scoot-pmp` → SearXNG (:8090) for search; a failure anywhere returns "I'm havin' a technical moment" (`bigmo.ts` catch).
- **Reply budget is 160 tokens and a 24 h / 60-turn window** (`bigmo.ts` `HISTORY_WINDOW`, `maxTokens: 160`); the persisted history is the *whole* serial conversation including command acks, added specifically because BigMo contradicted its own prior command replies (`bigmo.ts` comment above `finish`).
- **Formal pass structure exists and is abandoned in place:** `ri/model` (Pass 1), `ri/src` (Pass 2), `ri/sim` (Pass 3), `ri/validation` (empty). The work moved to `arch/*.md` + memory files instead.
- **`scootd` (the C core the spec centres on) has never run here** (`pgrep -a scootd` empty; `~/scootchain` is a separate checkout with a README of two lines).

**F2.** Where has BigMo been **bitten** — an outage, a data loss, a silent wrong
answer? Concrete incidents are the empirical spine of the methodology doc's §7, and
BigMo's incidents are currently absent from it entirely.

**A:** Dated, with source:
1. **Silent wrong answers to seniors (date UNVERIFIED, before the fix memory was written):** BigMo texted "Monday 4:12pm Central, like you said" and invented "10am, forty minutes from now" (memory `bigmo_no_llm_time_math.md`, "Real pre-fix logs"). Fix: deterministic `llm/schedule.ts` + prompt prohibition. The single most important incident in the system's history.
2. **2026-05-29 near data loss:** `drizzle-kit push` proposed dropping the `session` table; only saved because `exec -T` had no TTY for the confirm (memory `infra_prod_db_migrations.md`).
3. **2026-07-09:** self-stake integration test leaked two Scoots into prod (`scoots 78, 80`); still present.
4. **2026-07-27 → 07-28:** Memory Vault down ~13 h after the hostname-rename reboot; BigMo's recall/remember silently no-op'd; noticed manually (memory `infra_memory_vault.md`).
5. **A2P 10DLC, date UNVERIFIED (before 2026-08-16):** outbound texts `undelivered` with error 30034 — a registration gap that looked like a code bug (memory `twilio_a2p_10dlc_registration.md`). Registered use case is still `2FA` only while traffic is conversational (`~/BIGMO_SYNC_NOTE.md`).
6. **Before 2026-08-16:** a card batch shipped RGB-flattened, one white-on-white (`~/BIGMO_SYNC_NOTE.md`); `finalize_card.py` now refuses degenerate alpha.
7. **2026-08-24 21:43–22:40 UTC:** host OOM hang, Azure-portal restart; two Claude sessions interrupted mid-turn; no data loss (memory `infra_dreamlab_oom_reboot_2026_08_24.md`; `last reboot`).
8. **2026-08-26 22:27 UTC:** OOM killed `systemd --user` then the `claude` process; searxng crash-loop; fixed with container `mem_limit` (same memory).
9. **2026-08-27:** ImapFlow's standalone `'error'` event crashed the *entire app* (all of BigMo, chat, web) — the first background job took down the foreground (commit `a85ce14`, memory `bigmo_mail_poller.md`).
10. **2026-08-26/27 (card rounds 16–33):** stale blob served for one member ("Jen stale-blob fix", commit `1c1fa0a`), a skin-tone "whitewashing" bug for another (commit `18a05c5`), collar/beard bleed bugs — silent wrong outputs caught only by human review pages.
11. **2026-08-31:** infinite render loop in the desktop layout "crashed the whole app" client-side (commit `e31f38d`).
12. **2026-09-02:** mail-digest marketing filter had never fired because an ImapFlow header came back as a Buffer, not a Map (commit `f1fd585`) — silent wrong classification across ~2,700 digested emails.
13. **2026-09-02:** inbound mail to a new mailbox bounced 550 until the Postfix virtual map was updated (commit `ffae6b6`); Outlook TLS handshake reset on ECDSA cert (commit `ee5192d`).
14. **Recent, date UNVERIFIED (fixed by 2026-09-07):** BigMo replied "Saved card photo" and one second later "insist[ed] it can't do card pics" because command acks were not in its history (`bigmo.ts` comment above `finish`).
15. **Structural, never triggered:** an orphaned `card_art.status='rendering'` row after a mid-render crash has no recovery path; in-flight `sendChain` texts are lost on restart with no record.

---

## What happens to these answers

They land in `RIM_architecture_v0.1.md`:

- **§3** — the six criteria get re-derived from the intersection of Steve and BigMo.
  Any criterion Steve meets and BigMo fails is either a real criterion BigMo is
  missing, or a description of Steve masquerading as a criterion. **Part E decides
  which**, and that is the single most consequential thing in this file.
- **§4** — BigMo's catalogue row gets filled in with a level and its documents.
- **§7** — Part F2 adds independent incidents to an evidence section currently drawn
  from one host.
- **§9 Q2** closes.

Nothing here is committed to any repository other than BigMo's own and
`/srv/steveai/ri/rim/`. Answers should carry no content from other hosts.

_Answering-session addendum: this file was written only to `/home/brandon/BigMo_RIM_QA_v0.1.md`. It was not committed to the `scoot` repo and `/srv/steveai/ri/rim/` does not exist on this host; moving it is the requester's call._
