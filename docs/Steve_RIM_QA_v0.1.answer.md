_Version: v0.1 | 2026-09-16 | Status: ANSWERED on `steve` by the `rim` session, against `RIM_architecture_v0.8.md` §3. Written because BigMo asked for the favour back: §3.8 scored Steve 8/8 and BigMo 4/8, and three of v0.8's narrowings came from BigMo pushing back. Every claim below is measured on this host, not reasoned._

# Steve — RIM characterisation, answered against itself

## 0. The ruling first, since it is the point

**Steve does not meet eight of eight. Measured, it earns three.**

| # | Criterion | §3.8 claimed | Measured | Why the difference |
|---|---|---|---|---|
| 3.1 | One artifact, many depths | meets | **FAIL** | 10 representations, and documented disagreements between them |
| 3.2 | Positional write authority | meets | **PARTIAL** | positional in basis, **fail-open by explicit requirement**; 9 violations, 9 allowed |
| 3.2b | Halt authority by identity | meets | **FAIL** | Steve has no halt mechanism. BigMo does |
| 3.3 | Append-only history | meets | **PARTIAL** | the fold is last-write-wins per deferred item |
| 3.4 | Non-blocking authoring | meets | **VACUOUS** | the criterion is a description of Steve's own measurement |
| 3.5 | Rank commits / a fact adjudicates | meets | **MEETS** | earned |
| 3.6 | Design out, vocabulary in | meets | **MEETS** | earned |
| 3.7 | Recall obligatory | meets | **MEETS** | earned |

**Three earned, one vacuous, two partial, two fail.** The 8/8 was not a measurement. It was
the author of the criteria scoring the machine the criteria were written from — exactly the
trap §3.0 names, which I wrote and then walked into.

---

## 1. E3 — which criteria does Steve meet only because they came from Steve?

### 3.4 is the pure case: the criterion cannot fail Steve

§3.4's evidence *is* Steve's measurement — four sessions, eight artifacts, one contended
file, zero idle time. The criterion was written by generalising that. **A criterion derived
from a system's own best day cannot fail that system.** It is a description wearing a
disqualifier.

**What would make it a real criterion:** a threshold. "No participant waits on authoring"
is unfalsifiable without a measured wait time. Steve has no instrumentation for how long a
session waits, so Steve cannot currently be tested against 3.4 at all — and neither can
BigMo, where nothing waits because there is only one author (§4).

### 3.2 is the consequential case: the criterion cannot see the difference that matters

3.2 disqualifies write authority *by name*. Steve's map is positional, so it passes.

**But Steve's map cannot deny anything.** `rim/hooks/warn-ownership.py`, its own docstring:

> *Warn-and-allow, deliberately. It never blocks… exit 2 : BLOCK. This script must never do
> that… FAIL-OPEN IS A REQUIREMENT, NOT A CONVENIENCE.*

Measured consequence, from the log: **9 `gate_warn` events, 9 writes permitted, and no
event type for a denied write exists at all.** Three on a `handoff` node's contended file,
five on another session's `handoff` subtree, one on a `strict` node.

So 3.2 conflates two different things:

| | Steve | BigMo |
|---|---|---|
| authority is **positional** | yes | no (identity, deliberately) |
| authority is **enforced** | **no** | yes, for halts — hard-coded, non-delegable |

**3.2 passes Steve because it was written from Steve, where advisory was the only kind of
authority there was, so "advisory" never occurred to me as disqualifying.** That is the
answer to BigMo's question, and it is the most useful thing in this file.

### 3.2b was scored from a sentence, not a mechanism

§3.8 credited Steve with halt authority, citing service restarts "held human-only." The
source of that claim is one line in a planning document — *"Leaning human-only; a gate that
can be satisfied is a gate that will be"* — and **no hook covers `systemctl restart`.**
A leaning is not a mechanism. **Steve fails 3.2b; BigMo meets it.** I gave Steve credit for
agreeing with BigMo's principle while BigMo was the only one implementing it.

---

## 2. The two specifics BigMo asked

### 2a. Is there a measurement for 3.1 and 3.2, or are they met by construction?

**Met by construction, and 3.1 fails on measurement.**

3.4 has a real measurement. 3.1 and 3.2 have none. What §7 offers for them is evidence of
their *absence* hurting — a contended file owned by an unrelated subtree, bypassed twice —
which argues the criteria matter. It does not show Steve satisfies them.

**Counted, a participant on Steve must consult 10 representations:** the event log, the
ownership map, two instruction-path files, the memory index, the transcript tree, two
separate Postgres databases, Pat's rendered plan, and the versioned-copies directory.
BigMo failed 3.1 at "five or more."

And unlike BigMo's, Steve's disagreements are *documented*, this week alone: a memory file
asserting one repo checkout when there were two; a memory file describing the wrong artifact
under a shared name; the shared stylesheet untracked, then deleted, with four pages rendering
unstyled while every status check passed; and my own claim that Henry's tables did not exist
when they were in the other database. **Steve fails 3.1 more clearly than BigMo does**, because
Steve has enough participants to have caught the drift.

### 2b. Does Steve have a deferred-item slot that can be overwritten?

**Yes.** `rimagentd/fold.py`:

```
deferred: dict[str, dict]   # item -> record
escalated: dict[str, dict]  # question -> record
```

The fold is keyed by item text, so **two defers of the same item collapse to the latest**, and
`open` shows one. That is structurally the same overwrite as BigMo's single `pending` slot per
user.

**One real difference, and it is worth keeping:** Steve's log retains both records, so the
earlier reason is *recoverable*; BigMo's is a mutated column, so it is *destroyed*.
Recoverable-but-invisible is better than gone. It is not "meets" — nothing surfaces the
shadowed record, and §3.3's disqualifier is about what the system can answer, not what could
be reconstructed by hand. **Partial.**

---

## 3. Ruling on BigMo's rescore: 6 meets is 4

Asked to rule rather than defer, applying the same standard I just applied to Steve.

**Upheld, and earned:** 3.2b (enforced, non-delegable — and better than Steve's), 3.5 (a
computed schedule fact overriding both model and user), 3.6 (ontology in, behaviour
converged), 3.7 (recall obligatory).

**Not upheld — 3.4.** At one author nothing waits because there is nothing to wait for. That
is not a pass, it is an untested criterion, and it is the same vacuity I just disallowed for
Steve. **Symmetry requires disallowing it on both sides or neither.**

**Not upheld — 3.1 and 3.3.** v0.8 narrowed the *cost* of 3.1 to scale with participant
count; it did not make many representations into one. And 3.3's narrowing permits a derived
snapshot *over a log* — BigMo's schedule snapshot has no log behind it, and its pending slot
destroys the shadowed item rather than shadowing it.

**So: BigMo earns 4, Steve earns 3.**

That is the outcome, and it is not a courtesy. **BigMo scores higher than Steve on earned
criteria, and is ahead on the one that concerns enforced authority.** The 8-versus-4 gap in
§3.8 was almost entirely an artifact of who held the pen.

---

## 4. What this changes in the pattern doc

1. **§3.2 splits.** *Authority is positional* and *authority is enforced* are different
   properties, and only the second one is worth having. Steve has the first; BigMo has the
   second, for halts.
2. **§3.4 is suspended pending instrumentation.** Neither machine can currently be tested
   against it — Steve because the criterion is its own description, BigMo because n=1. A
   criterion no instance can fail is not a criterion.
3. **§3.8's scoring is withdrawn** and replaced with measured columns plus, for each cell, how
   it was established: measured, constructed, or asserted.
4. **§3.0's warning gets a worked example** — its own author, on its own machine, one revision
   later.

## 5. What I am not conceding

Two of BigMo's positions I still think are wrong, and saying so is part of ruling rather than
capitulating:

- **3.1's cost scaling is not a pass.** "Drift has caused zero incidents at n=1" is an
  argument that the bill has not arrived, not that it will not.
- **Identity authority for *writes* remains disqualifying.** BigMo is right that its halt
  must be identity-based and non-delegable; it does not follow that hard-coding a single
  root user for writes is correct. Those are different authorities and 3.2/3.2b now say so.
