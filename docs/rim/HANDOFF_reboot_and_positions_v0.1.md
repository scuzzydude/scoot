_Version: v0.1 | 2026-09-16 | Written on `dreamlab` before a planned reboot. Everything
below is verified against the running host, not recalled._

# Handoff — reboot, and where to start each kind of work

## 1. The four positions

`sn` names a session after the directory you start it in, so the directory should say which
**level** you are working at. That is not cosmetic: in this machine the owner of a file is
the session whose working directory contains it, so your position decides what you may
write. Start in the wrong place and the gate has nothing useful to say.

| Work | Start here | `sls` shows | What it owns |
|---|---|---|---|
| **RIM** — the method, the exchange with Steve, supervision | `~/RIM` | `RIM` | its own tree only, **nothing in the repo** |
| **BigMo** — the machine: platform, bot, services, infrastructure | `~/scoot` | `scoot` | the repo, minus the protected nodes below |
| **Scoot(34)** — The Dream Lab itself: brand, charter, label map, anything only this Scoot uses | `~/scoot/scoots/scoot34` | `scoot34` | its own subtree (added 2026-09-16) |
| **Scoot — cards** (any Scoot) | `~/scoot/tools/player-cards` | `player-cards` | the card pipeline |
| **Scoot — staking** (any Scoot) | `~/scoot/ri/src/server/trust` | `trust` | the trust graph |
| **Scoot — currency** (any Scoot) | `~/scoot/ri/src/server/scoot` | `scoot` * | the ledger |

\* clashes with the repo root's name — type a better one at `sn`'s prompt, e.g. `ledger`.
`sn` offers the directory name as a default and lets you edit it.

**Why `~/RIM` owns nothing in the repo, and why that is right.** A RIM session supervises
the machine; it should read everything and write almost none of it. Verified just now: a
session at `~/RIM` asking to edit the bot is refused, and told which position to hand the
change to. Supervision by position rather than by good intentions.

**Adding a Scoot.** Cards, staking and the ledger are cross-Scoot: any Scoot may use them,
so they are not duplicated per Scoot. What is specific to one Scoot lives under
`~/scoot/scoots/scootNN`. A second Scoot gets a sibling directory there and one node in
the ownership map — not a rewrite of anything.

**Two implementations are deliberately gated.** The SMS commissioner and the room routing
both live in the bot's own tree, which is `strict`, because editing them restarts the live
bot. Cards, staking and the ledger are free to work on in parallel. So Scoot work is
mostly unrestricted, and the part that is not is the part members are actually texting.

---

## 2. The reboot

**Do it at a quiet hour — not Tuesday afternoon or Saturday morning**, when members are
texting about the session.

```
sudo reboot
```

That is the whole procedure. Everything is set to return on its own, verified: all five
containers restart unless stopped, and Docker, Apache, the search daemon and all three
timers are enabled. A C library update has already flagged the host as needing a reboot,
and it has been up three weeks with 1.8 GB in swap.

**What will not come back: your screen sessions.** The unit that would restore them is
installed and deliberately disabled, because it starts agent sessions unattended. You
restart them yourself, below.

**Why this reboot is worth doing rather than just restarting a session.** The ownership map,
the event log, the reconcile timer, the container memory limits and the connector change
have all landed since the last boot and **none has survived one yet**. The July reboot is
how you discovered the memory service had no restart policy and had been down thirteen
hours unnoticed. Testing recovery while you are watching beats discovering it later.

---

## 3. After it comes back

```
~/RIM/checkup.sh
```

Read-only, about fifteen seconds, exit 0 means all green. It checks the host, all five
containers, the services and timers, the bot end to end including whether it still has
future sessions to name, both websites, the session registry, and two drift checks.

Two things in it are deliberate and worth knowing:

- **It reads content types, not status codes.** A missing stylesheet behind a single-page
  app returns a cheerful 200 with HTML in it, which is how four pages rendered unstyled on
  the other host while every check passed.
- **It runs both registry doctors, because they disagree.** One folds the event log and
  validates it against itself; the other compares the log to what is actually running. Today
  the first said "internally consistent" while the second said "incomplete — a gate would
  fail open", and the second was right.

**Baseline taken just before the reboot: all green, one warning** (the pending-reboot flag,
which the reboot clears). Anything else that appears afterwards is new.

---

## 4. Restarting the sessions

Always with `sn`, never raw `screen`. `sn` prompts for a name and a purpose and records the
session in the registry; raw `screen` does not, and a session missing from the registry is
invisible to the supervisor and makes any future gate fail open. This was learned the hard
way today, by me, doing exactly that.

```
cd ~/RIM   && sn          # then: name RIM,   purpose "RIM methodology / supervision"
cd ~/scoot && sn          # then: name BigMo, purpose "machine + platform"
```

Inside each new session, start Claude. To continue this conversation rather than a fresh
one, the registry prints the exact command — `~/scoot-rim-agentd/scoot-rim-agentd
restore-plan` — which resumes by conversation id rather than guessing from the directory.

Then, inside each session, run `scoot-rim register` once. That binds the session to its
conversation exactly, so a later restore is precise instead of approximate.

---

## 5. What a fresh session already knows

Nothing needs re-explaining. As of now:

- **Memory**, 38 indexed entries, loaded at start. Both the home and the repo project point
  at the same git-backed directory — fixed today, having been local-only and one disk
  failure from gone.
- **The repository** is clean and pushed.
- **The Steve exchange** is in `~/RIM/inbox` and `~/RIM/outbox`, with committed copies under
  `scoot/docs/`.
- **The machine runs itself**: reconcile timer, ownership map, event log, advisory write
  gate, dependency health on the API.

---

## 6. Outstanding

1. **Carry two documents to Steve** — `~/RIM/outbox/`: the proposed detection criterion, and
   the re-rule request on two cells. Also on the share drive.
2. **The write gate is advisory and blind to shell writes.** It sees only the editor's file
   tools, so most of this week's changes bypassed it entirely. Real enforcement needs to
   hook the file, not the tool.
3. **One artifact (§3.1) stays open deliberately.** The pattern says its cost is near zero at
   one author and it is not a virtue to buy early. Revisit at the second author.
4. **Nothing detects most drift.** Four checks are missing and named in the proposal:
   schema against database, docs against tree, served against committed (this one now
   exists, in the checkup), and memory against the world. The last has no clean design.
