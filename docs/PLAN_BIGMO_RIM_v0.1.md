_Version: v0.2 | 2026-09-08 | Status: PROPOSED — plan for executing `HANDOFF_BIGMO_RIM_v0.2.md` Phases 0–2 on dreamlab. EXECUTED 2026-09-08 — Phases 0–2 complete except the encrypted off-host upload (waiting on `~/.backup-pass`). Results and open items in `~/HANDBACK_BIGMO_RIM_v0.1.md`. Local copies: `~/HANDOFF_BIGMO_RIM_v0.2.md` (v0.1 kept), `~/rim-sim-framework_v0.1.tar.gz`, `~/BigMo_RIM_QA_v0.1.md` (also committed as `scoot/docs/BigMo_RIM_QA_v0.1.md`, commit `946bfda`). Share files archived to `azarchive:archive/var-www/shared/2026-09-08/`._

_v0.2 change: 1.2 is unblocked by the framework bundle. Bundle verified on arrival: 7 files, 28 KB; leak scan for employer/host strings clean; no `fetch`/XHR/localStorage/CDN; only relative `<script src>`. Tar timestamps are one day ahead (sender clock), harmless. One new gap: `CANONICAL_DOC` has no local target (no `RIM_architecture_*.md` on this host)._

# Plan — make BigMo a RIM machine, Phases 0–2

## What was checked before planning (2026-09-08, read-only)

| Finding | Evidence | Effect on plan |
|---|---|---|
| `scoot-win-term` is already cloned and current | `~/scoot-win-term`, HEAD `b965e70` 2026-09-04, clean | 1.1 is "wire", not "clone" |
| `sn` exists but is a hand-rolled function, not the repo's shell integration | `~/.bashrc:127`; `grep shell-integration ~/.bashrc` → 0; no `~/.scoot-rim` | 1.1 must replace the function so the event log starts being written |
| Two named screens already running | `screen -ls` → `RIM` (attached), `scoot-win-term` (detached) | 2.4 adopt has real sessions to bind |
| `scoot-rim-agentd` is Python 3.11+, stdlib only, 41 tests; no daemon, no gate | README; `python3 --version` → 3.12.3 | 2.3 timer + boot restore are systemd units from `examples/systemd`, site-side |
| Ownership config is TOML via `$SCOOT_RIM_OWNERSHIP`, policies `own-subtree` / `handoff` / `strict` | `examples/ownership.toml` | 2.2 map drafted below |
| SIM pages are NOT on this host and NOT inlined in the handoff | `grep -rli 'RIM⁵|rim5' ~/scoot ~/scoot-win-term /var/www/html` → nothing | 1.2 is blocked on content from Steve |
| Memory baseline with two sessions right now | `ps -C claude` → 337 MB + 280 MB RSS; `free -m` → 1964 used / 1901 available; swap 1.3 G used; `journalctl -k` OOM since 08-24 → 0 | 0.4 has a resting number already; needs a loaded run |
| `sar` is already collecting every 10 min | `sysstat-collect.timer` in `systemctl list-timers` | 0.4 can use `sar -r` history instead of a bespoke sampler |
| Only the search container has a memory limit | `docker inspect scoot-pmp-searxng` → 512 MiB, oom_score_adj 500; `docker stats` shows app/postgres/memory-vault at "/ 3.776GiB" | Contradicts handoff fact 1.7 "container memory limits" (plural); goes in the handback |
| SearXNG has no result cache and limiter off | `~/scoot-pmp/searxng/settings.yml:13 limiter: false`; no redis/valkey in compose | 0.5 needs a decision, not a check |
| Backup path exists | `docker exec scoot-postgres-1 pg_dump --version` → 16.14; DB 12 MB; `rclone lsd azarchive:` works; `gpg` present | 0.1 is cheap; `.env` must be encrypted before it leaves the box |
| The wrong "only checkout" claim lives in two places | `.claude/memory/infra_claude_runs_on_dreamlab.md:23`, `.claude/memory/MEMORY.md:22` | 0.2 edits both |
| The questionnaire IS committed now | `scoot/docs/BigMo_RIM_QA_v0.1.md`, commit `946bfda` | Handoff §1 preamble is stale; note in handback |

## Phase 0 — do no harm (est. half a day)

| Step | Concrete action | Needs from Brandon |
|---|---|---|
| 0.1 | `docker exec scoot-postgres-1 pg_dump -U scoot -Fc scoot > ~/backups/scoot-YYYY-MM-DD.dump`; `gpg -c` both the dump and `.env`; `rclone copy` to `azarchive:archive/dreamlab-snapshots/YYYY-MM-DD/`; restore test into a throwaway DB in the same container (`createdb scoot_restore_test` → `pg_restore` → row-count diff against prod → `dropdb`). Never touches `scoot`. | A gpg passphrase, typed by him at run time (never stored on the box). |
| 0.2 | Rewrite memory line to: dreamlab is the authoritative checkout; a second checkout exists at `/home/steve/scoot` on the Steve host, 319 commits behind (`c02f799`, 2026-05-28), no Twilio/Anthropic creds, per `HANDOFF_BIGMO_RIM_v0.1.md`; UNVERIFIED from dreamlab. Update `MEMORY.md` index line. Commit. | — |
| 0.3 | Six reconciliations, each its own commit: (a) `ri/sim/README.md` status table vs 21 test files; (b) `CLAUDE.md` + `arch/spec.md` scootd/ledger claim → "DB-first, scootd not yet running"; (c) `CLAUDE.md` Developer Context WSL → dreamlab; (d) `arch/sms-rooms.md` §2 "to be added" + missing four flags; (e) `arch/spec.md` Folder Structure and `CLAUDE.md` File Locations vs `ri/src/{client,server,shared}`; (f) `MEMORY.md` roster line "11 need manual resolution". Anything not closed gets a dated "deferred because" line. | — |
| 0.4 | Two-part number. Resting: already have it (above). Loaded: with both sessions running, drive a research burst through `scoot-pmp` (10–20 queries) and a heavy tool-output task in the second session; sample `ps -C claude -o rss`, `free -m`, `swapon --show` every 30 s for 15 min; pull `sar -r` for the window; check `journalctl -k` for OOM. Write peak RSS per session, peak used, peak swap, OOM yes/no into the handback. | Consent to run the load test while the bot is live (it is the same load two ordinary sessions create). |
| 0.5 | Record searxng limit (512 MiB, present). Decide cache: SearXNG only caches with a redis/valkey backend, which costs another container on a 3.8 G box; recommendation is **no cache**, keep the limit, and add a `mem_limit` to `scoot-app-1` and both memory-vault containers so the search container is not the only bounded one. | Agree or override on cache. |
| 0.6 | List dependents of scoots 78/80 (each has one `scoot_members` row, flags 1028; check `card_art`, `scoot_sessions`, `pledges` by `scoot_id`). Recommendation: delete both after 0.1's restore test passes; single transaction; record in memory. | The decision. |

## Phase 1 — ground the machine (est. half a day, 1.2 excluded)

| Step | Concrete action | Blocker |
|---|---|---|
| 1.1 | Replace the `sn()` function at `~/.bashrc:127` with `source ~/scoot-win-term/linux-agent/shell-integration.bash`; confirm `sn` and `sls` resolve from a fresh login shell; start one named session and confirm `~/.scoot-rim/events.jsonl` receives an event. The two existing screens keep running. | None. |
| 1.2 | **Unblocked (bundle received 2026-09-08).** Extract `~/rim-sim-framework_v0.1.tar.gz` to `/var/www/html/rim-sim/` (existing Apache docroot, no vhost change). Replace tokens in one pass over the three HTML files and `_shared/rim_selector.js`: `HOME_NAME` → drop the `<a>` (no parent app); `MACHINE_NAME` → "BigMo / dreamlab"; `DESIGN_NAME` → "Player-card pipeline" (Steve's recommendation, agreed: it has inputs, stages, a rendered output and a status state machine in `card_art`); `MACHINE_PATH` → `/home/brandon/scoot`; `METHODOLOGY_PATH` → `scoot/CLAUDE.md` + `scoot/.claude/memory/`; `PATTERN_PATH`/`CANONICAL_DOC` → see decision 4; `DESIGN_PATH` → `scoot/tools/player-cards/` + `scoot/arch/player-cards.md`; services table from the questionnaire A2 (scoot-app :3000, scoot-postgres :5433, memory-vault :8000, scoot-pmp-searxng :8090, `PORT_RIM` → 4300 once 2.1 lands, "planned" until then); level-3 `DOMAIN` → Scoot(34) player cards, `DOMAIN_DESIGN_SYSTEM` → `arch/player-cards.md` v1.1, `STATUS` → "converging, 33 review rounds", `MAP_DESCRIPTION` → `card_art` rows (hash, parent_hash, status), `MODEL_DESCRIPTION` → `render_card_photo.py` stages. Then run the README §3 four-step done-when in a browser. Keep the four "what makes it a RIM machine" cards verbatim but add a one-line footer note that BigMo meets them **aspirationally** until Phase 2 lands, so the page is accurate rather than aspirational (README §1's own rule). Commit the tokenised copy under `scoot/docs/rim-sim/` for the record. | Decision 4 (canonical doc). |
| 1.3 | Add an "Ownership and concurrency" section to the existing 360-line `CLAUDE.md` (not a new file): the contended paths and their policy (mirrors 2.2), own-subtree rule, version-bump rule, "a finding is not a version", and the rule that a session starts in the subtree it will work on (see the positional tension in 2.2). | None. |
| 1.4 | Apply 0.5's decision; add a citation convention for research output (`source URL + retrieved date` per claim) to `~/scoot-pmp/README.md`; verify a query returns cited results. | None. |

## Phase 2 — the Map and the log (est. one day)

| Step | Concrete action |
|---|---|
| 2.1 | `git clone https://github.com/scuzzydude/scoot-rim-agentd.git ~/scoot-rim-agentd`; `python3 -m unittest discover -s tests` → expect 41 pass. Do not fork. |
| 2.2 | Author `~/.scoot-rim/ownership.toml` (outside every repo, never committed; `.env`-class file). Draft below. Verify with `owner`/`check` on probe paths. |
| 2.3 | Install from `examples/systemd`: a reconcile timer (10 min) and a boot-restore unit. Per handoff §6.1, restore only via the unit, never from inside a session. First run `restore-plan` and read it before enabling anything. |
| 2.4 | `suggest-bindings` for the two live screens; `--apply` high-confidence only; leave the rest recorded as deferred. |
| 2.5 | Score §8 (method below). |
| 2.6 (optional, warn-only) | A Claude Code PreToolUse hook on Edit/Write that runs `scoot-rim-agentd check <path> --cwd $PWD` and **only logs** the verdict. This is not the enforcement gate (Phase 4, excluded); it is the instrument that makes 2.5 answerable with data instead of recollection. Ship only if Brandon agrees. |

### Draft ownership map (root = `/home/brandon`)

| Path | Policy | Why |
|---|---|---|
| `scoot/ri/src/server/sms/**`, `scoot/ri/src/server/routes/sms.ts`, `scoot/ri/src/server/llm/**`, `scoot/ri/src/server/cards/**`, `scoot/ri/src/server/mail/**` | strict | the live bot; `tsx watch` restarts on write (fact 1.4) |
| `scoot/ri/personalities/**` | strict | the personality is the product |
| `scoot/ri/src/server/db/**` | strict | schema and migrations hit prod by hand |
| `scoot/ri/physical/**`, `scoot/scripts/card-render-worker.sh`, `scoot/scripts/card-art-cold-sync.sh`, `scoot/.env`, `scoot-pmp/docker-compose.yml` | strict | executed by systemd/cron on the host; "gate writes AND side effects" |
| `scoot/arch/**`, `scoot/docs/**`, `scoot/CLAUDE.md`, `scoot/.claude/memory/**` | handoff | several sessions need these |
| `scoot/ri/src/client/**`, `scoot/scoot-chat/**` | own-subtree | parallel-safe |
| `scoot/tools/**`, rest of `scoot/scripts/**` | own-subtree | parallel-safe |
| `scoot-pmp/src/**`, `scoot-win-term/**`, `memory-vault/**` | own-subtree | separate repos |
| `research/transportation/**`, `research/scoot-system/**` | own-subtree each | the two research streams; directories do not exist yet, create on first use |

**Where position and intuition disagree (for the handback):**
1. `scripts/` and `tools/` are "parallel-safe" by intuition, but two scripts in `scripts/` are run by root's cron and a systemd timer every 2 min; those two files are strict.
2. `.claude/memory/**` as `handoff` conflicts with `CLAUDE.md`'s rule that every session writes memory after every change; handoff would funnel all memory writes through one owner. Proposal: `handoff` on `MEMORY.md` (the index, the real collision point) and `own-subtree`-style freedom on new `*.md` files, since a new file never collides.
3. Positional ownership makes a session whose cwd is `/home/brandon` (this one, screen `RIM`) the owner of everything. That is the "root session = strict" case in the example map, and it is why 1.3 adds "start in the subtree you will work on".

### §8 prediction scoring method

The claim: next needed mechanism is a write map, triggered by a second independent author. Evidence to gather: (a) the Steve checkout has produced no commits since `c02f799` (verify via `git log --all --author` on `origin` after a fetch); (b) the two concurrent sessions on *this* checkout (pids 2021174 and 3028574) — diff the file sets each edited (their transcripts under `~/.claude/projects/-home-brandon*/`) for overlap in the same hour; (c) whether either collision here was a file collision or a RAM collision. Expected outcome on current evidence: the second *checkout* is not a second *author*; the second *session* is, and no file collision has been observed, only the two RAM collisions. That would refute the prediction as stated and support "the trigger is a second concurrent session on one checkout". Report whichever the data shows.

## Handback contents (per handoff §9)

Written to `~/HANDBACK_BIGMO_RIM_v0.1.md`, redaction-checked before it leaves the box (fact 1.6). Sections: step status; the 0.4 numbers; the ownership map as authored plus the three disagreements above; the §8 result; corrections to §1 (so far: 1.7 "container memory limits" is one container; the questionnaire is committed; `sn` predates the shell integration); anything the eight criteria do not cover.

## Decisions needed from Brandon before starting

1. gpg passphrase for the off-host `.env` + dump (typed at run time).
2. Delete scoots 78/80, or keep.
3. Cache policy for search (recommend none) and whether to add `mem_limit` to app + memory-vault.
4. **Resolved 2026-09-08.** `RIM_architecture_v0.8.md` received (`~/RIM_architecture_v0.8.md`, 1512 lines, header "cleared for external distribution", leak scan clean: only the author's name). In 1.2: serve it at `/rim-sim/RIM_architecture_v0.8.md`, point `CANONICAL_DOC` and `PATTERN_PATH` there, and commit it alongside the tokenised pages under `scoot/docs/rim-sim/`. Its §3.8 scores the dreamlab loop on the eight criteria and §3.9 states the prediction verbatim; 2.5 should quote §3.9 and score against §3.8's row, not the handoff's summary.
5. Whether the warn-only check hook (2.6) is in scope.
6. OK to run the 0.4 load test with the bot live.
