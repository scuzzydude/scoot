#!/usr/bin/env bash
# Auto-trigger for the card render pipeline. Runs on the HOST (needs modal,
# rclone, docker, rembg, reportlab, sudo cp) from the systemd timer in
# ri/physical/systemd/card-render-worker.{service,timer}. Each run renders at
# most one queued source photo (oldest first); the timer fires every 2 min so
# a queue drains serially -- Modal's GPU container is single-tenant anyway.
# The app's render-notifier texts the member when status flips to rendered/failed.
set -uo pipefail
cd "$(dirname "$0")/.."
PG_CONTAINER="${PG_CONTAINER:-scoot-postgres-1}"
PG_URL="${PG_URL:-postgresql://scoot:password@localhost:5432/scoot}"
LIMIT="${CARD_RENDERS_PER_DAY:-5}"
LOG="${CARD_RENDER_LOG:-/var/log/scoot/card-render-worker.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || LOG=/tmp/card-render-worker.log
exec 9>/tmp/card-render-worker.lock; flock -n 9 || exit 0   # one render at a time

psql() { docker exec "$PG_CONTAINER" psql "$PG_URL" -qAt -c "$1" </dev/null; }

# Oldest received source whose member hasn't hit the daily render limit.
row=$(psql "
  SELECT s.hash FROM card_art s
  WHERE s.kind='source' AND s.status='received' AND s.card_serial IS NOT NULL
    AND (SELECT count(*) FROM card_art r
         WHERE r.kind='render' AND r.meta->>'stage'='card'
           AND r.user_id=s.user_id AND r.created_at > now() - interval '24 hours') < $LIMIT
  ORDER BY s.created_at LIMIT 1")
[ -n "$row" ] || exit 0

echo "$(date -Is) start $row" >> "$LOG"
if [ "${1:-}" = "--dry-run" ]; then echo "would render $row"; exit 0; fi
if python3 tools/player-cards/render_card_photo.py "$row" >> "$LOG" 2>&1; then
  echo "$(date -Is) done  $row" >> "$LOG"
else
  echo "$(date -Is) FAIL  $row (status set to failed by driver)" >> "$LOG"
  # belt and braces: if the driver died before it could mark the row, mark it here
  psql "UPDATE card_art SET status='failed', meta = meta || '{\"error\":\"worker: driver exited non-zero\"}'::jsonb WHERE hash='$row' AND status IN ('received','rendering')" >/dev/null
fi
