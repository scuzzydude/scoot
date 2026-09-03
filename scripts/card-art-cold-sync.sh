#!/usr/bin/env bash
# Mirror hash-addressed card art to Azure Blob cold storage and record the
# cold path in card_art. Runs on the HOST (rclone + docker are host tools) via
# the systemd timer in ri/physical/systemd/card-art-cold-sync.{service,timer}.
# Files are immutable (content-addressed), so `copy --immutable` is safe and
# idempotent; nothing is ever deleted from the remote.
set -euo pipefail
LOCAL_DIR="${CARD_ART_LOCAL_DIR:-/var/lib/scoot/media/card-art}"
REMOTE="${CARD_ART_REMOTE:-azarchive:media/card-art/versions}"
PG_CONTAINER="${PG_CONTAINER:-scoot-postgres-1}"
PG_URL="${PG_URL:-postgresql://scoot:password@localhost:5432/scoot}"

[ -d "$LOCAL_DIR" ] || exit 0
rclone copy --immutable --quiet "$LOCAL_DIR" "$REMOTE"

# Every file now present remotely gets its cold_path recorded (once).
rclone lsf "$REMOTE" | while read -r f; do
  hash="${f%%.*}"
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] || continue
  docker exec -i "$PG_CONTAINER" psql "$PG_URL" -qAt \
    -c "UPDATE card_art SET cold_path = '$REMOTE/$f' WHERE hash = '$hash' AND cold_path IS NULL;" >/dev/null
done
