#!/usr/bin/env bash
# scoot-storage — survey Scoot's critical data stores, their growth, and the
# headroom left on steve's disk, so we don't run out of space again.
#
# Modes:
#   scoot-storage              human-readable report + append a history row
#   scoot-storage --quiet      append a history row only (for cron survey mode)
#   scoot-storage --history    dump the raw CSV history and exit
#
# Run as root (or via sudo) so it can size root-owned dirs and reach docker.
# History CSV: /var/log/scoot-storage/history.csv (override with $SCOOT_STORAGE_HISTORY).
# Warns when the root filesystem is over $SCOOT_STORAGE_WARN_PCT% (default 85).
set -euo pipefail

HISTORY="${SCOOT_STORAGE_HISTORY:-/var/log/scoot-storage/history.csv}"
WARN_PCT="${SCOOT_STORAGE_WARN_PCT:-85}"
PG_CONTAINER="${SCOOT_PG_CONTAINER:-scoot-postgres-1}"
DATA_DIR="${SCOOT_DATA_DIR:-/var/lib/scoot}"
MEMVAULT_DIR="${SCOOT_MEMVAULT_DIR:-/home/brandon/memory-vault}"

mode="report"
case "${1:-}" in
  --quiet)   mode="quiet" ;;
  --history) [ -f "$HISTORY" ] && cat "$HISTORY" || echo "no history yet at $HISTORY"; exit 0 ;;
  "" )       ;;
  *) echo "usage: scoot-storage [--quiet|--history]" >&2; exit 2 ;;
esac

# --- helpers ---------------------------------------------------------------
# Bytes of a path (0 if missing/unreadable). No -x: docker overlay2 uses same-fs
# mounts that -x would wrongly skip, undercounting /var/lib/docker.
dir_bytes() { [ -e "$1" ] && du -sb "$1" 2>/dev/null | awk '{print $1+0}' || echo 0; }
h() { numfmt --to=iec --suffix=B --format="%.1f" "${1:-0}" 2>/dev/null || echo "${1}B"; }

# --- collect metrics (all in bytes) ---------------------------------------
ts=$(date +%s)
iso=$(date -Is)

# root filesystem
read -r fs_size fs_used fs_avail < <(df -B1 --output=size,used,avail / | tail -1)
fs_pct=$(( fs_used * 100 / fs_size ))

docker_bytes=$(dir_bytes /var/lib/docker)
# reclaimable docker build cache (best-effort): "1.157GB (100%)" -> bytes
docker_reclaim_h=$(docker system df --format '{{.Type}}|{{.Reclaimable}}' 2>/dev/null \
  | awk -F'|' '$1=="Build Cache"{v=$2; sub(/ *\(.*/,"",v); sub(/B$/,"",v); print v}')
docker_reclaim=$(numfmt --from=iec "${docker_reclaim_h:-0}" 2>/dev/null || echo 0)
docker_reclaim=${docker_reclaim:-0}

media_bytes=$(dir_bytes "$DATA_DIR/media")
scootdb_bytes=$(docker exec "$PG_CONTAINER" psql -U scoot -d scoot -tAc \
  "SELECT pg_database_size('scoot')" 2>/dev/null | tr -dc '0-9' || echo 0)
scootdb_bytes=${scootdb_bytes:-0}
memvault_bytes=$(dir_bytes "$MEMVAULT_DIR")
journal_bytes=$(dir_bytes /var/log/journal)
apache_bytes=$(dir_bytes /var/log/apache2)
clog_bytes=$(du -bc $(docker inspect --format '{{.LogPath}}' $(docker ps -q) 2>/dev/null) 2>/dev/null | tail -1 | awk '{print $1+0}')
clog_bytes=${clog_bytes:-0}

# --- persist history row ---------------------------------------------------
mkdir -p "$(dirname "$HISTORY")"
if [ ! -f "$HISTORY" ]; then
  echo "ts,iso,fs_used,fs_avail,fs_pct,docker,docker_reclaim,media,scoot_db,memvault,journal,apache,container_logs" > "$HISTORY"
fi
prev_line=$(tail -n +2 "$HISTORY" 2>/dev/null | tail -1 || true)
echo "$ts,$iso,$fs_used,$fs_avail,$fs_pct,$docker_bytes,$docker_reclaim,$media_bytes,$scootdb_bytes,$memvault_bytes,$journal_bytes,$apache_bytes,$clog_bytes" >> "$HISTORY"

[ "$mode" = "quiet" ] && exit 0

# --- growth since previous survey -----------------------------------------
growth_note=""; days_to_full=""
if [ -n "$prev_line" ]; then
  p_ts=$(echo "$prev_line" | cut -d, -f1)
  p_used=$(echo "$prev_line" | cut -d, -f3)
  dt=$(( ts - p_ts ))
  if [ "$dt" -gt 0 ]; then
    used_delta=$(( fs_used - p_used ))
    per_day=$(( used_delta * 86400 / dt ))
    if [ "$per_day" -gt 0 ]; then
      growth_note="+$(h "$per_day")/day"
      days_to_full=$(( fs_avail / per_day ))
    elif [ "$per_day" -lt 0 ]; then
      growth_note="$(h "$per_day")/day (shrinking)"
    else
      growth_note="flat"
    fi
  fi
fi

# --- report ----------------------------------------------------------------
printf '\n  Scoot storage survey — %s\n' "$iso"
printf '  ────────────────────────────────────────────────────────────\n'
printf '  Root filesystem : %s used / %s total  (%s%%), %s free\n' \
  "$(h "$fs_used")" "$(h "$fs_size")" "$fs_pct" "$(h "$fs_avail")"
[ -n "$growth_note" ] && printf '  Growth          : %s' "$growth_note" && \
  { [ -n "$days_to_full" ] && printf '  →  ~%s days to full\n' "$days_to_full" || printf '\n'; }
printf '  ────────────────────────────────────────────────────────────\n'
printf '  %-22s %10s\n' "STORE" "SIZE"
printf '  %-22s %10s\n' "docker (/var/lib)" "$(h "$docker_bytes")"
printf '  %-22s %10s   ← prune to reclaim\n' "  ↳ build cache" "$(h "$docker_reclaim")"
printf '  %-22s %10s\n' "media uploads" "$(h "$media_bytes")"
printf '  %-22s %10s\n' "postgres (scoot db)" "$(h "$scootdb_bytes")"
printf '  %-22s %10s\n' "memory vault" "$(h "$memvault_bytes")"
printf '  %-22s %10s\n' "systemd journal" "$(h "$journal_bytes")"
printf '  %-22s %10s\n' "apache logs" "$(h "$apache_bytes")"
printf '  %-22s %10s\n' "container logs" "$(h "$clog_bytes")"
printf '  ────────────────────────────────────────────────────────────\n'

if [ "$fs_pct" -ge "$WARN_PCT" ]; then
  printf '  ⚠️  root filesystem at %s%% (warn ≥ %s%%). Reclaim: docker builder prune -f; journalctl --vacuum-size=100M\n' "$fs_pct" "$WARN_PCT"
fi
printf '  history: %s  (%s rows)\n\n' "$HISTORY" "$(( $(wc -l < "$HISTORY") - 1 ))"
