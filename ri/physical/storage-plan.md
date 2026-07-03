# Scoot Storage Plan — steve

steve's OS disk is **29 GiB and holds everything**. That's the root problem: any
fast-growing store eats into the same tiny disk the OS runs on. This plan ranks
growth, monitors headroom, and keeps SSD from oversubscribing by pushing cold
data to Azure Blob.

## What grows most (ranked)

1. **Media — video/HLS** (`/var/lib/scoot/media`). Tiny now (~130 KB) but grows
   fastest; HLS renditions multiply size. The 4.9 GiB `1995` dir we archived was
   all video — the canary. **Biggest risk by far.**
2. **Postgres** (`scoot` DB, ~9 MB). `messages` + `sms_deliveries` (every SMS
   fan-out is logged) grow with membership × activity.
3. **Memory Vault** (~1.5 GB, mostly embedding model + pgvector). Grows each time
   BigMo remembers a text.
4. **Docker** — build cache (currently **~1.2 GB reclaimable**), uncapped logs.
5. **systemd journal** (~216 MB), apache logs — steady, easily capped.

## Monitoring — DONE

- `ri/physical/scoot-storage.sh` → installed at `/usr/local/bin/scoot-storage`.
  `scoot-storage` prints stores + growth/day + days-to-full; `--quiet` appends a
  CSV row; `--history` dumps it. History: `/var/log/scoot-storage/history.csv`.
- Cron survey every 6h: `/etc/cron.d/scoot-storage`. Days-to-full estimate gets
  accurate once a few days of history accrue. Warns at ≥85% root usage.

## Immediate reclaim (safe, low-risk) — PROPOSED

- `docker builder prune -f` → frees ~1.2 GB now.
- Cap the journal: `journalctl --vacuum-size=100M` + `SystemMaxUse=100M` in
  `/etc/systemd/journald.conf` (216 MB → 100 MB, bounded going forward).
- Add docker log caps (`max-size:10m,max-file:3`) in `/etc/docker/daemon.json`.

## Structural fix — media → Azure Blob (hot tier) — PROPOSED

The scalable answer (CLAUDE.md already allows S3-compatible + HLS): the media
layer writes/reads **Azure Blob (hot)** instead of `/var/lib/scoot/media`, so the
fastest-growing store never touches SSD. Reuse the `azarchive` account (new `media`
container, **Hot** tier) or a dedicated account. Node media routes get a storage
adapter (local FS ↔ blob) selected by env, mirroring the LLM provider pattern.
Until then, media stays local but is small.

Alternative/complement: attach an Azure **data disk** and move `/var/lib/scoot`
(Postgres data + media) + Memory Vault onto it, keeping the 29 GiB OS disk for OS.

## Log & cold-data lifecycle — PROPOSED

Push aged, rarely-read data to the **Cold** archive (`azarchive:`, ~$0.0045/GB·mo)
and prune locally, on a schedule:

- **Rotated logs → Cold:** logrotate already gzips apache/other logs; a weekly job
  ships `*.gz` older than 30d to `azarchive:archive/logs/<host>/` then deletes local.
- **Media → Cold lifecycle:** once media is on Blob, an Azure lifecycle rule moves
  blobs untouched for N days Hot→Cool→Cold automatically (no code).
- **Docker hygiene:** weekly `docker builder prune -f --keep-storage 2GB` +
  `docker image prune -f`.
- All cleanup jobs land in `/etc/cron.d/` and are visible to `scoot-storage`.

## Rollout order (proposed)

1. Immediate reclaim (builder prune + journal/docker caps) — minutes, frees ~1.3 GB.
2. Let the survey run a week → real growth curve before sizing anything.
3. Media → Blob adapter (the durable win) when media starts climbing.
4. Log→Cold + docker-hygiene cron jobs.
5. Data disk only if Postgres/Memory Vault growth warrants it.
