_Version: v0.1 | 2026-09-08 | Status: HANDBACK — written on `dreamlab` by the BigMo session that executed `HANDOFF_BIGMO_RIM_v0.2.md` Phases 0–2. Carried by Brandon. Every factual claim cites a path, a command, or an output; `UNVERIFIED` marks what could not be observed from this host. Redaction-checked before leaving the box (§8)._

# HANDBACK — BigMo RIM Phases 0–2

## 0. In one paragraph

Phases 0, 1 and 2 are done, with one exception: the boot-restore unit (2.3) is installed
but deliberately not enabled, per the unit's own header. (The off-host snapshot, open at
first writing, completed 2026-09-09.) The bot came
through intact: one strict path was written (`ri/physical/docker-compose.yml`, the
Brandon-approved `mem_limit`, recorded as a `claim`/`release` in the event log) and the app
container was recreated once for it after the load test, with `/api/health` back at 200 on
the first check and BigMo re-registered; nothing under the SMS, personality, or schema nodes
was touched. The §8
prediction is **refuted as stated** and **supported in a reworded form** (§5). Three facts
in the handoff's §1 needed correction (§6). Four things the eight criteria do not cover
showed up (§7).

## 1. Step-by-step status

| Step | Status | Evidence |
|---|---|---|
| 0.1 snapshot | **done** | `~/backups/scoot-2026-09-08.dump` (387 KB, `pg_dump -Fc`); restored into `scoot_restore_test`, `pg_stat_user_tables` row counts identical across 32 tables, throwaway DB dropped. Off-host (2026-09-09): dump and `.env` encrypted with `gpg --symmetric AES256` using a passphrase Brandon supplied via a 600 file, decrypt round-trip verified with `cmp`, uploaded to `azarchive:archive/dreamlab-snapshots/2026-09-08/` (`rclone lsl` shows both), passphrase file shredded. Only Brandon holds the passphrase. |
| 0.2 checkout memory | done | `scoot` `453f35a` — both checkouts recorded with dates; the Steve-side facts marked UNVERIFIED from dreamlab. |
| 0.3 reconcile docs | done, 6/6 closed | `196b4a9` sim README; `ab818db` scootd status; `9fe086f` dev env; `3da1a11` flags table; `706380a` folder structure + file locations; `bd7161c` roster line. Nothing deferred. |
| 0.4 memory number | **see §2** | `scratchpad/loadtest-2026-09-08-1556.log`, 32 samples over 16 min. |
| 0.5 search container | done | limit confirmed 512 MiB (`docker inspect scoot-pmp-searxng`); **no cache** by decision (SearXNG needs a redis container for one); citation convention + limit recorded in `scoot-pmp` README (`d3b2cb5`). `mem_limit` staged for `scoot-app` (1 GiB) and both memory-vault containers (512 MiB) in their compose files; **applied after the load test** so as not to confound it (see §2). |
| 0.6 test tenants | done — deleted | Brandon's decision. `scoots 78, 80` + their 2 `scoot_members` rows removed in one transaction after every FK to `scoots` was checked (`player_cards`, `card_links`, `card_art`, `scoot_sessions`, …: 0 dependents). Recorded `0ba55f4`. Root cause (integration tests hitting prod) **not** fixed. |
| 1.1 `sn` | done | `scoot-win-term` was already cloned (`b965e70`) but **behind origin by 4 commits** that add the event log; fast-forwarded to `341f20f`. Hand-rolled `sn()` at `~/.bashrc:127` replaced by `source …/shell-integration.bash`. `sn`/`sls` resolve; `~/.scoot-rim/events.jsonl` now written. |
| 1.2 SIM pages | done | Bundle verified (leak scan clean, no external resources), tokens replaced, served at `https://fairchildlabs.org/rim-sim/{rim5,machine,design}/` (HTTP 200 ×6 incl. `RIM_architecture_v0.8.md`). Level 3 = player-card pipeline. Brandon ran the 4-step selector done-when in a browser 2026-09-09: **all four pass**. 2026-09-09: `/rim-sim/` also served on `thedreamlaboratory.org` (Apache `ProxyPass /rim-sim !`) and linked from the app nav for LEADER/BETA/ENGINEER members. **2026-09-15: superseded by bundle v0.2** — level 1 now carries the five original Recursive Integration figures and the recursion section (143 → 361 lines), level 3 became Scoot(34) with its implementations beneath it rather than the player-card pipeline alone, and the stylesheet gained three media queries. v0.2 arrived pre-filled from the 2026-09-07 questionnaire, so five stale claims were corrected against the running host before serving: agentd described as "not yet installed" (installed 09-08), a service table missing the search daemon on 4200 and all four host timers, placeholder paths in the layers table, six Map/Model disagreements cited as live (closed 09-08), and the score. Deployed, committed `e151b13`, verified by **content type** rather than status code on both vhosts — the trap the bundle's §5 warns about — with no symlinks anywhere in the tree. |
| 1.3 instruction path | done | `CLAUDE.md` "Ownership and Concurrency — Read Before Editing" (`2ff252c`, corrected `a7e794b`); `docs/handoffs/` created for payloads. |
| 1.4 scoot-pmp | done, with a finding | Citation convention added. **Finding:** the running daemon started 2026-08-24 from `dist/` built that day; the repo has 4 commits to `src/` since (Exa deep-search integration, cost logging) and `.env` has no `EXA_*` keys. The service is behind its own repo. **Not restarted** — a restart would load code that may need a key that is not there. Brandon's call. |
| 2.1 agentd | done | `~/scoot-rim-agentd` at `e386aa4`; `python3 -m unittest discover -s tests` → 49 tests OK (README says 41). |
| 2.2 ownership map | done | `~/.scoot-rim/ownership.toml`, 26 nodes (§3). Probed with `owner`/`check` on 15 paths and 6 scenarios. |
| 2.3 log + timer + restore | done / installed-disabled | `scoot-rim-reconcile.timer` enabled (5 min, `Persistent=true`), first run clean. `scoot-rim-restore.service` installed, **disabled** per its header; `restore-plan` printed (both sessions would resume approximately). |
| 2.4 adopt + bind | done | `scoot-rim adopt` → 2 adopted. This session `register`ed itself from inside (`$STY`, `$CLAUDE_CODE_SESSION_ID`). `suggest-bindings --apply` bound 0 (the other session's best candidate is MEDIUM: `dir-match, active, newest`, three alternatives) — **left unbound** as instructed. `doctor`: 2 live, 1 unbound. |
| 2.5 prediction | done | §5. |
| 2.6 warn-only hook (Brandon opted in) | done | `~/.scoot-rim/check-hook.sh`, PreToolUse on `Edit|Write|MultiEdit` in `~/.claude/settings.json`. Pipe-tested (deny/allow/no-path), then proved live on a real Edit (see `~/.scoot-rim/check.log`). Every verdict is also a `gate_warn` event in `events.jsonl` (the agentd's fold-known type; my first draft used an ad-hoc `check` type, which the CLI accepted but warned it would ignore — three such rows exist in the log). Exit is always 0. |

## 2. The 0.4 memory number

**Setup (2026-09-08 15:56–16:13 UTC, bot live, current mitigations in place):** two agent sessions running (this one, active, doing all of Phase 0–2 work concurrently; the other attached but idle — I could not drive it), plus a research burst of 15 `POST /research` queries through `scoot-pmp` spaced 25 s apart. Sampler every 30 s: `ps -C claude` RSS, `free -m`, swap, `docker stats` for app and search, `journalctl -k` OOM count. Raw log: `~/rim-loadtest-2026-09-08.log` (32 samples).

| Measure | Value |
|---|---|
| Peak RSS, active session | 354 MB |
| Peak RSS, idle session | 305 MB |
| Peak host used | 2,138 MB of 3,866 |
| Minimum available | 1,727 MB |
| Swap in use (start → peak) | 1,610 → 1,621 MB (flat; pre-existing pages, no new swapping) |
| Search container peak | 105 MiB of its 512 MiB limit |
| App container peak | 164 MiB |
| Research queries | 15/15 HTTP 200, 12–45 s each |
| OOM-killer events | 0 |
| `sar -r` 16:10 | 35.9 % memused, 2,087 MB available |

**Reading:** on the current box, two sessions plus a research burst leave ~1.7 GB available and touch no new swap. The August OOMs were driven by a 162 MB transcript session and a searxng crash loop, neither of which recurred under load. **Do not resize.** The number to watch is per-session RSS growth over a long heavy session, not the steady state; the sampler script is reusable (`scratchpad/loadtest.sh` copied to `~/rim-loadtest.sh`).

**Caveat:** the "second session" was idle. A true two-active-session number needs Brandon to run heavy work in the other screen while the sampler runs; the script is ready for that.

**Applied after the test (0.5):** `mem_limit` 1 GiB on `scoot-app`, 512 MiB on both memory-vault containers; app recreated (health returned within the check window), compose change committed.

## 3. The ownership map as authored

`~/.scoot-rim/ownership.toml`, root `/home/brandon`, 26 nodes. Not in any repo.

| Policy | Nodes |
|---|---|
| strict | `scoot/ri/src/server/{sms,llm,cards,mail,db}`, `routes/sms.ts`, `scoot/ri/personalities`, `scoot/ri/physical`, `scripts/{card-render-worker,card-art-cold-sync}.sh`, `scoot/.env`, `scoot-pmp/docker-compose.yml` |
| handoff | `scoot/arch`, `scoot/docs`, `scoot/CLAUDE.md`, `scoot/.claude/memory/MEMORY.md` |
| own-subtree | `scoot/ri/src/client`, `scoot/scoot-chat`, `scoot/tools`, rest of `scoot/scripts`, new files in `scoot/.claude/memory`, `scoot` catch-all, `scoot-pmp/src`, `scoot-win-term`, `scoot-rim-agentd`, `research/transportation`, `research/scoot-system` |

**Where position and intuition disagreed:**

1. **`scripts/` is not parallel-safe.** Two files in it are executed by root's cron and a systemd timer every 2 and 10 minutes. Those two are strict; the rest of the directory is own-subtree. "Most specific wins" handles it.
2. **`.claude/memory/` as `handoff` fights the repo's own rule** that every session writes memory after every change. Resolved by making only `MEMORY.md` (the index, the sole collision point) handoff and new files free. A new file never collides.
3. **The home-directory session is not a super-owner.** I assumed a session at `/home/brandon` would own everything beneath it. `check` says the opposite: it is denied on every strict and handoff node ("caller is at .") and allowed only in own-subtree areas. That is the correct behaviour and CLAUDE.md rule 1 was rewritten to match (`a7e794b`). It also means **this session would have been denied on the files it edited today** (`CLAUDE.md`, `arch/*`, `.claude/memory/MEMORY.md` — all handoff nodes; scenario C/E in the probe run). It was not actually denied, because those edits were made through shell scripts (`python3`/`sed` in Bash), which the Edit/Write hook does not see. The hook's first real verdict on this session was an `allow` on `~/PLAN_BIGMO_RIM_v0.1.md` ("outside any managed node"). So the record shows two things at once: the gate works, and a session can route around it by using a different tool. That gap is real and is listed in §7.
4. **Two files were outside every node** until a catch-all was added (`README.md`, `routes/chat.ts`). A map with no catch-all reports "outside any managed node" rather than a policy; whether that should be allow or deny is a site decision. Chose allow (own-subtree).

## 4. Two things learned that were not in §6.1

- **The agentd resolves relative paths against its own cwd, not the map root.** My first probe run used relative paths and every answer came back "own-subtree (scoot-rim-agentd)" — because `scoot/ri/…` was resolved to `/home/brandon/scoot-rim-agentd/scoot/ri/…`, which is inside the agentd's own node. Silent, plausible, wrong. Always pass absolute paths; a hook must resolve before calling.
- **`scoot-win-term` on GitHub is ahead of what the handoff assumed.** The README's "the shell layer writes the log today" was false for the clone on this host until it was fast-forwarded. A clone that exists is not a clone that is current — same shape as the handoff's own §10 defect.

## 5. The §8 prediction, scored

> The next mechanism this machine needs is a write map (3.2), and the trigger is a second independent author, not a second end user.

**Refuted as stated; supported reworded.** Evidence:

- **The second checkout is not a second author.** `scoot` has no commits from the Steve checkout since `c02f799` (2026-05-28); all 20 commits since 09-07 are from this host (`git log --since=2026-09-07`). Two checkouts on one remote, and no collision followed — which is the refuting case the handoff itself listed.
- **The second author that actually exists is on a different repo.** `scoot-pmp`'s `origin/master` had 5 commits (2026-09-03/04) absent from the dreamlab clone, including `3c7173b "Merge remote searxng hardening … with local research fixes"` — two checkouts both authoring, merged by git. Today my push was rejected non-fast-forward and rebased cleanly. So: a second author, a collision, zero loss, resolved by git. That is a *repository*-level write map already doing the job for whole-file commits.
- **The two concurrent sessions on this host did not collide on files.** Session `033aab1b` (cwd `~/scoot`, last active 15:57 today) edited 0 files since 09-07 via Edit/Write; this session edited 3, all under `~`. Overlap: none. Their two recorded collisions were RAM, not files.
- **What the loop actually grew first today, in order:** (1) the log (`events.jsonl`, via `scoot-win-term`, which arrived as an upstream pull before the map existed), (2) the map, (3) the timer. The log came first because the tool shipped it first — a dependency-order fact about the tooling, not about the machine's need.

**Reworded prediction that the evidence does support:** the trigger for a write map is a second *concurrent session on one checkout*, and until that session writes files, the map's first job is to deny the *supervising* session (this one) rather than to arbitrate between peers. The first deny recorded on this host was against the session that authored the map.

## 6. Corrections to §1 of the handoff

| Fact | Correction |
|---|---|
| 1.7 "container memory limits" | One container (search, 512 MiB) — already fixed in v0.2. As of this handback: app 1 GiB and memory-vault 512 MiB ×2 staged, applied after the load test. |
| 1.9 "`scoot-pmp` already installed and running — do not reinstall" | True, but the running daemon is **4 source commits behind its own repo** (started 2026-08-24; commits 09-03/04 add Exa). Not reinstalling, but "running" ≠ "current". |
| §1 preamble | The questionnaire is committed (`946bfda`) — fixed in v0.2. |
| §5 1.1 "`git clone scoot-win-term`" | It was already cloned on 09-04 and had a hand-rolled `sn` predating the shell integration. "Clone" was the wrong verb; "fast-forward and source" was the step. |
| README claim "41 tests" | 49 pass at `e386aa4`. |
| (new) the running app was not running its own `.env` | `.env` was modified 2026-09-07 09:25 (with `.env.example`, same second — the `CARD_RENDERS_PER_DAY` commit `ea130d5`); the app container had been up since 2026-09-03 11:16 with the older environment. The 0.5 recreate loaded the current file. Within two minutes the mail poller logged `AUTHENTICATIONFAILED` for the Gmail IMAP account (`gmail:INBOX`), which the 72-hour log scan this morning had never shown. Whether the credential in the file is stale or Google blocked the fresh login is UNVERIFIED from here; see §9. Same class as fact 1.9: *running* is not *current*. |

## 7. What the eight criteria do not cover (found while doing this)

1. **A path-resolution convention is a criterion.** Positional authority is only as good as the path the checker sees; a relative path silently re-rooted the whole map (§4). "Every participant states paths from the same root" is load-bearing and unstated.
2. **The supervisor is the first thing the map denies.** With one concurrent author, the map's practical effect is to stop the *planning* session from touching the tree it plans for. That is a supervision rule (§9 of the pattern doc) expressed positionally, and it fell out of the map rather than being designed.
3. **Currency of a clone is not attested anywhere.** Two of today's four surprises were "the copy exists but is behind" (`scoot-win-term` local, `scoot-pmp` daemon vs repo). The criteria cover the log and the map; nothing says a participant must be at the head of the thing it runs.
4. **A gate on one write path is not a gate.** The PreToolUse hook sees `Edit`/`Write`; a shell heredoc, `sed -i`, or a Python one-liner writes the same file unseen. This session did exactly that all day, unintentionally. The enforcement phase (4) has to hook the file, not the tool — or accept that the gate is advisory for shell writes and say so.
5. **A machine-readable map needs a prose twin and they will drift.** CLAUDE.md rule 1 was wrong within an hour of being written and was corrected from `check` output. The map is the authority; the prose exists so a session that never runs `check` still knows the rule. Which of the two a session reads first is the question 3.1 asks, one level down.

## 8. Redaction check

Run before this file leaves the box: a case-insensitive grep over this file for the employer's name and short code, the work-LAN address prefix, the share-drive name, the author's surname, the usual secret words, PEM headers, and any dotted-quad IP. Hits: the word "tokens" (template tokens, §1 row 1.2) and the word "passphrase" in prose about the backup (no values). The term list itself is not reproduced here for the reason the framework README §6 gives. No hostnames beyond `dreamlab` and public domains. No `.env` contents.

## 9a. Rescore, 2026-09-15 (what Phase 2 actually moved)

The v0.2 bundle predicted that 3.2 and 3.3 were the two criteria Phase 2 would move. Both
moved, and both to **partial** rather than to meets — which is the more useful result.

| # | Was (09-07) | Now (09-15) | Evidence |
|---|---|---|---|
| 3.2 Positional write authority | fails | **partial** | `~/.scoot-rim/ownership.toml`, 26 nodes, genuinely positional — `check` denies a session whose cwd is outside the owning node, including the home-directory session that authored the map. But the gate is warn-only and sees only the editor's file tools, so any shell write bypasses it. |
| 3.3 Append-only history | fails | **partial** | `~/.scoot-rim/events.jsonl`, 24 events across 7 types; `live`, `tree` and `doctor` are folds with no cached snapshot; `restore-plan` replays from it. The designs running on the machine still keep snapshot state, and the two product ledgers hold 1 and 0 rows. |

**Four meets, three partial, one fail** (was four meets, one partial, three fails). The single
outright fail is 3.1, one artifact, which is the one concurrency has not yet forced.

## 9b. Three compliance gaps closed, 2026-09-15

Rescoring against v0.8 rather than the questionnaire-era notes showed that two criteria had
been judged against text the document has since retracted or narrowed, and that the real
remaining work was three specific items rather than a general push for eight of eight. All
three are done.

**1. The deferred slot that overwrote (§3.3's named example).** `sms_state.pending` was one
upserted column per member, so a second parked flow destroyed the first with no record and
*"deferred and never resumed"* was unanswerable — the exact column v0.8 cites. Migration
`0024` adds `sms_pending_events`, append-only, written in the same transaction as the slot:
`defer`, `advance`, `resume`, and `displaced`. A cross-kind overwrite now keeps the
destroyed flow's payload, so lost member progress is recoverable rather than silent. The
snapshot stays, because §3.3's own narrowing says a derived snapshot is required, not
forbidden — the disqualifier is about which one is the truth. Four integration tests,
fixtures cleaned up (`80fef6f`).

**2. Absence must be logged, not merely survived.** v0.8 added this requirement by
correcting our own framing, after our Memory Vault outage ran roughly thirteen hours with
recall silently no-op'ing. `lib/dependency-health.ts` keeps one warn per failure as before,
emits a single error when an outage is established, logs recovery, and surfaces a snapshot
on `/api/health`, where `ok` stays true but a `degraded` list names what is missing. Five
unit tests, and verified end to end against the live vault: a cold start recorded as down,
recovery recorded on the next successful call (`abd9d91`).

**3. The session registry was incomplete**, so any future gate would have failed open. The
unbound session had been adopted with a working directory inferred from its *name*
(`~/scoot-win-term`) while `/proc` showed its shell and its agent both in `~/scoot`.
Correcting the recorded position raised the binding from medium to high confidence and it
bound cleanly. `doctor` now reports the log internally consistent with every live session
restorable. **This is the criterion demonstrating itself**: a name-derived fact was wrong,
the positional fact was right, and correcting the position is what made the system
recoverable.

**One bug caught in the making.** The first version of the health tracker declared a local
`body`, shadowing `post()`'s own `body` parameter, which would have thrown on every memory
call — breaking the very dependency the change exists to monitor. The end-to-end test
against a dead endpoint caught it before it shipped. Unit tests alone would not have.

**Not done, deliberately.** The enforcement gate stays warn-only: v0.8's §3.2 disqualifier
is authority *by name*, which we do not do, and the handoff is explicit that a gate must not
ship before the registry is trusted — it is trusted only as of today. One artifact (§3.1)
stays open because v0.8 says plainly that its cost is proportional to the number of
participants who must agree, near zero at one author, and **"not a virtue to buy early."**

**The rescore is not ours to make.** Whether any of the three moves a verdict from partial
to meets is left to the pattern document's author. Scoring your own machine upward is the
one direction that needs an outside check, and §3.0 names that trap itself.

## 9. Open for Brandon

1. ~~Create `~/.backup-pass`~~ — done 2026-09-09; upload verified, file shredded.
2. Run the 4-step selector test at `https://fairchildlabs.org/rim-sim/rim5/index.html`.
3. Decide on restarting `scoot-pmp` to pick up the Exa commits (needs an `EXA_*` key first, UNVERIFIED which).
4. Run `scoot-rim register` inside the `scoot-win-term` screen so its binding stops being approximate.
5. Optionally enable `scoot-rim-restore.service` once `doctor` reports 0 unbound.
6. **RESOLVED 2026-09-11.** Root cause confirmed from Google's own security log: **"Password changed" 2026-09-08 07:19 AM Central = 12:19 UTC**, three minutes after the last successful poll (12:16 UTC) — a Google password change revokes every app password and OAuth grant on the account. New app password issued by Brandon, verified against Google from the host first, rotated into `.env` (strict node; `claim`/`release` recorded), app recreated, first successful poll 17:41 UTC, 0 errors. Remaining: re-run the three OAuth connector flows (needs Brandon's browser + PuTTY tunnels) and publish the GCP consent screen; update the mail client's stored copy of the Fonde Gmail password in the app. Original diagnosis kept below for the record. **Gmail IMAP poll failing — the app recreate is exonerated (debugged 2026-09-09).** `mail_check_state.last_checked_at` for `gmail:INBOX` = 2026-09-08 12:16 UTC, four hours *before* the recreate; a direct `imaplib` login from the host with the same 16-char app password gets `[AUTHENTICATIONFAILED] Invalid credentials` from Google; container env matches the file byte-for-byte. Separately, all three Google OAuth connectors (gmail/calendar/gdrive) return `invalid_grant`: their tokens were issued 2026-08-27 under a consent screen in **Testing** mode, whose refresh tokens Google expires after 7 days. Fix is Brandon-side: new app password (and check Google's security-activity page for what revoked the old one), re-run the three MCP auth flows, and move the GCP consent screen out of Testing so it stops recurring. Either issue a fresh Google app password and update `GMAIL_IMAP_PASSWORD` in `.env` (strict node; not touched by me), or remove the `GMAIL_IMAP_*` keys if that account no longer matters after the 09-02 mail migration. The Zoho/local account and the bot are unaffected. Recreate `app` after editing.
