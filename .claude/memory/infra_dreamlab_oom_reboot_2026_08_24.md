---
name: infra_dreamlab_oom_reboot_2026_08_24
description: dreamlab (3.8GB RAM, no swap) became unresponsive under memory pressure from an oversized Claude Code session and had to be rebooted
metadata:
  type: project
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
regression. Consider: (1) adding swap (currently none) as a cheap mitigation,
(2) avoiding letting a single Claude Code session run for very long
stretches of heavy tool-output work (image pipelines, huge file dumps)
without periodically compacting/restarting it, (3) not running more than one
or two concurrent heavy sessions on this box at once. No data was lost in
this incident — Docker containers and the Postgres DB came back clean
(`restart: unless-stopped` on all services); only the two in-progress Claude
Code conversations were interrupted mid-turn.
