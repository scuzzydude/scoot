_Version: v0.2 | 2026-09-09 | Status: HANDOFF — written on the Steve host, to be executed on `dreamlab` by a BigMo session. Self-contained: assumes no access to Steve's filesystem. Source plan: `RIM_bigmo_instantiation_v0.4.md` (not visible from there; everything needed is inlined here).

**v0.2 — three corrections, all from the receiving session.** (1) Step 1.2 was **not** self-contained: it required files that exist only on the sending host and were never attached. A framework bundle now accompanies this document — `rim-sim-framework_v0.1.tar.gz` on the share. (2) Fact 1.7 overstated the mitigations. (3) The questionnaire is now committed on the receiving host, so §1's note about it was stale. The claim that this document was self-contained is recorded as a defect in §10 rather than silently repaired._

# HANDOFF — make BigMo a RIM machine (Phases 0–2)

## 0. The job, in one paragraph

BigMo is to become a **RIM machine**: a host where several agent sessions can work
concurrently without silently overwriting each other, with a session registry that survives
reboot, positional write ownership, and a housekeeping pass. Today it is a **level-3 design**
running on a platform — not a machine. **Its SMS commissioner job and personality must come
through untouched.** That is not a nice-to-have: the bot is the only thing on that host with
real users, and every step below is ordered to protect it.

**Scope of this handoff: Phases 0, 1 and 2 only.** Terminals (Phase 3), the enforcement gate
(Phase 4), the remote view (Phase 5) and "Little Calvin" (Phase 2′) are **deliberately
excluded** — §7 says why for each.

**Everything in Phases 1–2 is self-serve.** All three tools are on public GitHub and fully
pushed; nothing needs carrying from Steve.

---

## 1. Facts already established — do not re-derive these

These come from the questionnaire a BigMo session answered on 2026-09-07, **now committed on
your side** at `scoot/docs/BigMo_RIM_QA_v0.1.md` (commit `946bfda`). **Read it there** — it is
the full record; the table below is a summary. v0.1 of this document said it was uncommitted and
that a fresh session might not have it; that is no longer true, and committing it was the right
move — it puts the Map in the repo.

| # | Fact |
|---|---|
| 1.1 | BigMo the bot is a **level-3 design**. The Scoot platform *intends* to be the machine but has one real tenant. **The thing on that host that actually loops is the agent-sessions + git + `.claude/memory/` authoring loop** — that is what these phases upgrade. |
| 1.2 | Scored against the eight RIM criteria (§2): **meets 3 of 8.** Fails one-artifact, positional write authority, append-only history, and has no authoring coordination at all. |
| 1.3 | **Authority is by identity, deliberately** — a hardcoded root user, and a kill switch hard-gated to one phone number that no role grant can widen. **That is correct and must not be "fixed"** — see §2, criterion 3.2b. |
| 1.4 | **Editing a file on the host IS the deploy** (`tsx watch` over a bind mount, no CI, no staging). So any authoring session can restart the live bot mid-conversation. This is the central risk in the whole job. |
| 1.5 | **Dev and prod share the box and the database.** `npm test` hits production; that is how two test tenants leaked in on 2026-07-09 and they are still there. |
| 1.6 | **The repo is public.** Transcripts are pattern-redacted on save. Steve has had **six** secret-leak incidents on exactly this path — assume the same risk here. |
| 1.7 | Two OOM incidents (2026-08-24, 2026-08-26), **both caused by concurrent agent sessions, not by the workload.** Both predate the current mitigations: 8 GB swap across two files, `vm.swappiness=10`, and a memory limit on **one** container — the search container, at **512 MiB** (v0.1 said "container memory limits", plural, which overstated it). No OOM in the 14 days since. **512 MiB is a number to watch, not a box ticked** — fact 1.8 explains why. |
| 1.8 | The second OOM was a **search-container worker** killing the agent process. The declared new workload is web research, which loads that same container hardest. |
| 1.9 | `scoot-pmp` + its search container are **already installed and running.** Do not reinstall. |

---

## 2. The eight criteria you are building toward

Ordered by dependency. You are not expected to hit all eight — Phases 0–2 target 3.2, 3.3 and
3.7. Each has a **disqualifier**, because a criterion nothing can fail is not a criterion.

| # | Criterion | Disqualified if |
|---|---|---|
| 3.1 | **One artifact, many depths** — one thing every participant reads and writes | any depth exists only inside a tool others cannot read |
| 3.2 | **Positional write authority** — who may write derives from position in a tree | write authority is by *name*. Names change across restarts; directories do not |
| 3.2b | **Halt authority by identity, non-delegable** — the opposite rule, and it is not a contradiction | the halt can be granted by a role, acquired by position, or loses input while engaged |
| 3.3 | **Append-only history** — state is a fold over an immutable log | truth is a snapshot with no history behind it, so "deferred and never resumed" is unanswerable |
| 3.4 | **Non-blocking authoring** — contended writes hand off to the owner; nobody waits | *authoring* is serialized by a lock. A lock on an external serial constraint (a carrier rate limit, one GPU) is **fine** |
| 3.5 | **Rank commits, never adjudicates — but a computed fact always does** | position can settle a technical dispute, or a probabilistic layer overrides a computed one |
| 3.6 | **Design out, vocabulary in** | the *design* is an input. A fixed *vocabulary* is fine and helps |
| 3.7 | **Recall is obligatory** — a participant reconstitutes from history before acting | reading prior state is optional, best-effort, or depends on someone remembering to ask |

**Why the order matters more than the features.** These are not a checklist — they are what a
machine grows under concurrency pressure, in dependency order. **The map and the log come
before the terminals.** Adding authors to a host with no way to serialize their writes
reproduces, on purpose, the failure that motivated all of this: four sessions on one file, where
`git status` reported clean while another session was mid-edit, every session checked correctly
before writing, and they still collided.

---

## 3. Three findings that change what you do first

### 3.1 There are two checkouts of this repo, not one

`/home/brandon/scoot` on `dreamlab` **and** `/home/steve/scoot` on the Steve host. The second is
live in a container there, bind-mounted.

### 3.2 The Steve-side checkout is 319 commits / 103 days behind

`c02f799` (2026-05-28) versus `origin/main` (2026-09-07). **Nothing on `dreamlab` needs
fixing for this** — it is recorded so you know the other copy exists and is stale, and so that
if development starts happening there, it starts from a pull.

**Checked already, because it was the only urgent question:** that copy has **no Twilio and no
Anthropic credentials**. It cannot text a member. There is no double-bot risk.

### 3.3 BigMo's own memory is wrong about this

A memory file records *"dreamlab is the ONLY repo checkout."* There are two. **This is the exact
class of failure the whole job exists to prevent** — the map disagrees with the territory, and
every participant that consults it is misled while behaving correctly. Correcting it is step 0.2,
not a footnote.

---

## 4. Phase 0 — do no harm

Nothing here changes behaviour. Do all of it before Phase 1.

| Step | Action | Done when |
|---|---|---|
| **0.1** | **Snapshot first.** `pg_dump` the production database and copy `.env` **off-host**. Verify the dump restores once, into a scratch database — not into production. | a restore has actually been tested |
| **0.2** | **Correct the "only checkout" memory.** Record both checkouts, which is authoritative (`dreamlab`), and that the other is stale and credential-free. | the memory file names both, with dates |
| **0.3** | **Reconcile `CLAUDE.md` against the code.** Six known disagreements exist: a test-status table that says tests do not exist when 21 test files do; docs claiming a C daemon owns the ledger when TypeScript does and that daemon has never run; a stated WSL dev environment when the only checkout is production; a flags constant described as "to be added" that exists with four more flags than documented; a folder-structure section that does not match the tree; and a partly-stale roster note. | each one closed, or explicitly deferred **with a reason recorded** |
| **0.4** | **Measure memory under two concurrent agent sessions** on the *current* mitigated config. Record peak RSS per session, swap used, and whether the OOM killer fires. | **a number written into the handback**, replacing an argument with evidence |
| **0.5** | **Check the search container's memory limit and result caching** before research volume ramps (fact 1.8). | limit confirmed; cache policy decided and recorded |
| **0.6** | **Decide the two leaked test tenants** — clean up while you have a verified snapshot, or record a decision to keep them. | either way, recorded |

> **Do not resize the VM.** Step 0.4 exists to settle that question with data. Current prices:
> the box is ~$30/mo; 8 GiB is ~$61/mo; 16 GiB is ~$121/mo. If 0.4 shows real pressure, the
> cheap answer is **burst-resize** — B-series bills hourly and a resize is a reboot, so ~20
> hours a month of headroom costs about $3 rather than $91. A permanent 4× bill buys capacity
> that sits idle almost all the time.

---

## 5. Phase 1 — ground the machine (no memory cost)

| Step | Action | Done when |
|---|---|---|
| **1.1** | `git clone https://github.com/scuzzydude/scoot-win-term.git`. Wire `linux-agent/shell-integration.bash` into `~/.bashrc`. Confirm `screen` is installed. This gives you `sn` — named sessions with a recorded purpose. | `sn` starts a named session and it appears in the manifest |
| **1.2** | **Port the RIM⁵ SIM pages with BigMo at level 2.** **Unblocked in v0.2** — extract `rim-sim-framework_v0.1.tar.gz` from the share to `/var/www/html/rim-sim/` and read its `README_FRAMEWORK.md`. Seven files, ~28 KB, pure static, no build step, no external resources, no data files. Level 1 is portable as-is; levels 2 and 3 are templates with `UPPER_CASE` tokens to replace. | The header dropdown shows three options with the current level pre-selected, and changing it navigates to that level — verified in both directions. Full done-when in the bundle's README §3 |
| **1.3** | **Write the instruction-path rules.** A `CLAUDE.md` at the repo root stating: which files are contended and who owns them; that parallel-safe work happens in your own subtree while contended writes are handed to the owner; the version-bump rule (a shipped version is never edited in place); and that a finding is not a version. | the file exists and a fresh session loads it |
| **1.4** | **Tune `scoot-pmp` for research volume** (facts 1.8, 1.9): container memory limit, result caching, and a citation convention for research output. | limits set; a research query returns cited results |

> **1.3 is the highest-value step in this phase and it needs no tooling.** The root cause of the
> collisions that motivated this work was that every convention lived in *content* files inside
> the work tree. Those load only when a session is told to read them — advisory at best,
> invisible at worst, and nothing can gate on them. One file fixes that.

---

## 6. Phase 2 — the Map and the log (the load-bearing phase)

| Step | Action | Done when |
|---|---|---|
| **2.1** | `git clone https://github.com/scuzzydude/scoot-rim-agentd.git`. The engine is generic by design — **do not fork it.** Site specifics are config, read by path from an environment variable. | its tests pass |
| **2.2** | **Author the ownership map.** Ownership is **positional**: the owner of a file is the session whose working directory contains it — never a session *name*. Suggested nodes below. | the map loads and `tree`/query reports the expected owner for a probe path |
| **2.3** | Install the **event log**, the **reconcile timer** (periodic, catches sessions that died without logging an exit) and **boot restore**. | a reboot brings sessions back |
| **2.4** | **Adopt** existing sessions, then run the binding suggester. **Leave low-confidence bindings unapplied.** | applied bindings are all high-confidence; the rest recorded as deferred |
| **2.5** | **Score the prediction** (§8). | a yes/no in the handback |

**Suggested ownership nodes** — derive from position, adjust to the real tree:

| Path | Policy | Why |
|---|---|---|
| the SMS server subtree | **strict** — gate edits | this is the live bot (fact 1.4) |
| the personality/prompt subtree | **strict** | the personality is the product |
| the architecture docs + memory files | **handoff** — one writer, others hand off a payload | several sessions need these |
| the client subtree | own-subtree | parallel-safe |
| the tools subtree | own-subtree | parallel-safe |
| one node per level-3 design — transportation research, the Scoot system | own-subtree each | so the two research streams never contend |

> **The strict nodes are how "keep the bot intact" stops being a promise and becomes
> mechanical.** That is the point of doing Phase 2 before terminals.

### 6.1 Two things learned the hard way on the first machine

- **Restore only via the service manager.** Restoring sessions from inside a session leaves a
  child-session marker that stops transcripts being saved. The unit needs to stay alive after
  its main process exits and must not kill the children it started.
- **A renamed directory breaks session identity in both directions** — the conversation stays
  filed under the old name while every process-level view reports the new one. Both directions
  occurred inside one twelve-session tree, so treat it as routine. The parent path is still
  positional evidence; resolve it to a *lower confidence grade* rather than to nothing.

---

## 7. Explicitly out of scope, and why

| Not now | Reason |
|---|---|
| **Web terminals** | The largest memory cost on the smallest host, and step 0.4 has not reported yet. When it does: **one** container first, a second only after a week with no OOM. |
| **The enforcement gate** | **Must not ship before the registry is complete.** Gating on a partial registry fails *open* — it permits exactly the writes it should stop while denying legitimate ones. Warn-and-allow first, always. |
| **The remote view** | Read-only, loopback, reached by SSH tunnel. **No mutating endpoint** — restore and terminate are precisely the actions that are dangerous to trigger by accident, and a touch device is the worst place to expose them. |
| **"Little Calvin"** | Two reasons. Its code lives in a repo not visible from `dreamlab`, so it must be carried over separately. And **the taxonomy is the real work** — the chip taxonomy does not port, a transportation/Scoot one has to be authored from real accumulated files, and taxonomy drift is what stalled the first generation for weeks. Build the mechanism when the files exist to write a taxonomy against. |
| **Changing identity-based authority** | Fact 1.3. The kill switch being non-delegable is the most important safety control on that host. Criterion 3.2 governs *writes*; 3.2b says halts are correctly by identity. Leave it. |
| **Any chip tooling** | Not this machine's work. |

---

## 8. The prediction you are testing

The pattern document stakes a falsifiable claim, and Phase 2 is where it gets scored:

> **The next mechanism this machine needs is a write map (3.2), and the trigger is a second
> independent author — not a second end user.**

Two checkouts on one remote (§3.1) is that trigger, and it was already true before the
prediction was written.

**It is wrong if** an append-only log turns out to be the more urgent need, or the real trigger
is end-user concurrency, or a second author appears and no collision follows. **Report which
happened.** A refuted prediction is a better result than a vague one — it would mean the growth
ordering is specific to the first machine rather than general, which is exactly what needs
knowing.

---

## 9. What to hand back

Write a handback file on `dreamlab` and let Brandon carry it — there is no network path between
the hosts, and he is the transport (that is how the questionnaire round-tripped).

Include:

1. **Step-by-step status** — done / deferred / blocked, with a reason for anything not done.
2. **The 0.4 memory number.** The single most useful thing in the handback; it settles the
   capacity argument in either direction.
3. **The ownership map as authored**, and any node where position and intuition disagreed.
4. **The §8 prediction result.**
5. **Anything that contradicts §1.** Those facts are a day old and were gathered by a different
   session. If one is wrong, say so plainly — the first machine's evidence base has been
   corrected four times by exactly this kind of pushback, and each correction improved it.
6. **Anything you did that these criteria do not cover.** A criterion the set is missing shows
   up here or nowhere. The most valuable finding in the last questionnaire was of exactly this
   shape.

**Cite a path, a command, or an output for every factual claim, and write `UNVERIFIED` rather
than inferring.** A clean "no" is worth more than a generous "sort of".

---

## 10. Defect in v0.1 of this document, recorded rather than repaired

**v0.1 asserted it was self-contained. It was not.** Step 1.2 required files that exist only
on the sending host, and nothing was attached. The receiving session found it in one command —
a recursive grep for the page names, returning nothing — which is a check the sender never ran.

**This is worth recording because of what the document is.** RIM's whole claim is that hand-offs
destroy information, and the answer is one artifact read by every participant. A *handoff
document* that names files the recipient cannot reach is that failure occurring inside a
document about that failure. The information needed was present on the sending side the entire
time and was destroyed at the hand-off, exactly as the hypothesis predicts.

**Root cause, and it is a repeat.** "Self-contained" was a property *claimed* rather than
*checked*. The check is trivial and mechanical: for each step, ask whether the recipient can
reach every path it names. Nobody ran it. The same root cause has now produced four separate
defects in this work — a miscount taken from transcripts, a component declared retired from its
retirement notice rather than its code, an unsourced pricing claim, and this. The pattern is
always the same shape: **a property asserted from the artifact nearest to hand instead of from
the thing itself.**

**What changed as a result.** A rule, not a resolution: any handoff step naming a path gets
that path resolved from the recipient's side before the document ships. Cheap, and it would
have caught this in seconds.
