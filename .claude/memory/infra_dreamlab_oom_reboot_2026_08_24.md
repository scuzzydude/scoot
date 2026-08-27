---
name: infra_dreamlab_oom_reboot_2026_08_24
description: "dreamlab (3.8GB RAM) repeatedly hits OOM under memory pressure; 08-24 caused a full reboot (no swap), 08-26/27 recurred with swap in place and OOM-killed the claude process directly plus a searxng crash-loop, fixed via container mem_limit"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e56fcf2-315e-4fe3-9a33-8b836065384a
  modified: 2026-08-27T11:50:49.008Z
---

On 2026-08-24 around 21:43–22:06 UTC, dreamlab (see [[infra_prod_server]])
went under sustained memory pressure (`systemd-journald: Under memory
pressure, flushing caches` every 30–60s for ~23 minutes) severe enough that
SSH sessions stopped tearing down cleanly (`Failed to abandon session scope
... Connection timed out`) and the box became unresponsive. Brandon had to
restart it via the Azure portal — the kernel logged `hv_utils: Shutdown
request received` at 21:57:55 but the actual reboot didn't complete until
~22:09, i.e. the machine was too memory-starved to shut down promptly.

**Likely primary cause:** two concurrent Claude Code sessions running on a
3.8GB VM with **zero swap configured** (`swapon --show` empty). One session's
transcript (`e915d70f-...jsonl`, the player-cards facial-likeness / PuLID
image pipeline work, see [[project_player_cards_facial_likeness]]) had grown
to **162MB** by the time of the crash — an unusually large amount of
accumulated tool-output/image-pipeline context for a single session, which
inflates that `claude` process's own RSS as it holds/re-sends that history.
A second session (`f5dbaadf-...`, the scoot-pmp/BigMo search work, see
[[bigmo_search_scoot_pmp]]) was active at the same time, mid `npm run build`
+ `docker compose up -d app` when the box went down — that work was resumed
and completed cleanly in a fresh session afterward with no data loss (nothing
was mid-write to disk).

**Why:** matters for judging future "is dreamlab okay" questions and for
avoiding a repeat — this was resource exhaustion, not an app bug, a kernel
panic, or an Azure host failure.

**How to apply:** if dreamlab becomes sluggish or SSH hangs again, check
`free -h` and `journalctl | grep -i "memory pressure"` before assuming a code
regression. Avoid letting a single Claude Code session run for very long
stretches of heavy tool-output work (image pipelines, huge file dumps)
without periodically compacting/restarting it, and avoid running more than
one or two concurrent heavy sessions on this box at once. No data was lost in
this incident — Docker containers and the Postgres DB came back clean
(`restart: unless-stopped` on all services); only the two in-progress Claude
Code conversations were interrupted mid-turn.

**2026-08-24 follow-up:** Brandon grew the Azure disk to 64G (was smaller,
~42G free at the time), then had a 4G swapfile added as mitigation:
`/swapfile` (0600), `mkswap`+`swapon`, persisted in `/etc/fstab`
(`/swapfile none swap sw 0 0`), with `vm.swappiness=10` set in
`/etc/sysctl.d/99-swappiness.conf` so swap is used as OOM insurance rather
than for routine paging. Root cause (large sessions / too many concurrent
heavy sessions) is unchanged — swap just buys time before a hard OOM kill
instead of the box hanging outright.

**2026-08-26/27 recurrence — swap helped, but `claude` still got OOM-killed
directly:** Around 22:27–22:28 UTC on 08-26 the box hit a severe double
memory-exhaustion event: `postgres` triggered an OOM that killed the user's
own `systemd --user` instance (pid, `session-1.scope`), then 34s later
`python3` (a `scoot-pmp-searxng` granian worker, see
[[bigmo_search_scoot_pmp]]) triggered another OOM that killed the `claude`
process itself (pid 4745, total-vm 7.1GB). Unlike 08-24, the box did **not**
reboot or hang this time (the 4G swapfile bought enough headroom), but the
kernel-wide OOM killer still picked processes somewhat arbitrarily across the
whole host rather than containing the damage to the actual offender.

Separately, from 23:52 on 08-26 through 06:06 on 08-27, the
`scoot-pmp-searxng` docker container's granian worker got OOM-killed and
auto-respawned (via its internal forkserver) roughly 15 times, each time
growing to 250–580MB RSS before dying — because the container had **no
memory limit set**, so a single worker could balloon and drag the whole host
into a global OOM scan instead of being contained to its own cgroup.

**Fix applied 2026-08-27:** `/home/brandon/scoot-pmp/docker-compose.yml` now
sets `mem_limit: 512m`, `mem_reservation: 256m`, `oom_score_adj: 500`, and
`GRANIAN_WORKERS=1` on the `searxng` service (commit `f7382d4` in the
`scoot-pmp` repo, not yet pushed). This makes the container the preferred
kill target within its own memory ceiling rather than letting unrelated
host processes (like an active Claude Code session) get picked instead. The
underlying host-is-oversubscribed problem (3.8GB RAM across Scoot app +
Postgres + memory-vault/pgvector + scoot-pmp + searxng + containerd +
dev-server esbuild/vite builds) is still unaddressed — this only fixes one
specific offender.

**2026-08-27 follow-up: swap doubled to 8G.** Added a second 4G swapfile
(`/swapfile2`, same 0600/mkswap/swapon pattern as the original, persisted in
`/etc/fstab`) alongside the existing `/swapfile`, rather than resizing the
original in place (avoids a `swapoff` while memory was already tight).
Total swap now 8G, `vm.swappiness=10` unchanged, applies to both files.
Brandon's framing: "less concerned about absolute performance, don't want
crashes" — explicitly harm-reduction, not a fix for the root oversubscription
problem. Real fix discussed but not yet actioned: resize the VM from
`Standard_B2s` (2 vCPU/4GB, `FairchildLabs1`/westus) to `Standard_B2ms` (2
vCPU/8GB, same burstable family/credit rate) — needs a brief stop/start
downtime and a cost increase, so it's pending Brandon's go-ahead, not done.

**Root cause of the 08-26/27 event, confirmed 2026-08-27:** not random —
the killed session's last command launched all 24 `finalize_card.py`
(rembg + numpy) processes concurrently via `&`/`wait` in a bash loop (see
[[project_player_cards_facial_likeness]]), on a 3.8GB box. That's what
triggered the initial OOM that killed `claude` itself, then the crash-loop
for the next 8 hours as bash's `wait` sat on the backgrounded jobs (most
individually OOM-killed one at a time as memory freed up, only 6/24
survived). Rerunning the same step **sequentially** the next day took
~8s/card with zero memory pressure. **Lesson: never launch N-way
concurrent subprocess batches (rembg/PIL/onnxruntime — anything with real
per-process RSS) with `&`/`wait` on this box — sequential only**, even
though it's slower, until the RAM situation actually changes (see the
B2ms resize discussion above).

**Running multiple Claude Code sessions concurrently on this box:**
filesystem/git side is fine (no directory locking, worst case is a
transient `.git/index.lock` retry) — the real constraint is memory, same
as above. Two sessions is survivable now with 8G swap but still real
risk if either is doing anything memory-heavy (docker builds, batch
card generation, npm builds) at the same time as the other. Fine to run
from the same directory in separate terminals; just don't stack heavy
work in both at once pre-resize.

**How to apply (updated):** if `claude` (or any process) gets killed with no
warning, check `sudo journalctl -k --since "-1 day" | grep -i "invoked
oom-killer\|Killed process"` first — it names both the trigger and the
victim per event. Don't assume the invoking process is the one that got
killed. If it's a docker container ballooning, prefer adding
`mem_limit`/`oom_score_adj` to that service in its compose file over ad-hoc
`kill`s — that's the pattern now established for `scoot-pmp-searxng` and
should be the template for any other unbounded container on this box.
