#!/usr/bin/env bash
# scoot-seed-sessions — re-run the standing-pattern schedule seeder so
# scoot_sessions never runs dry (BigMo refuses to guess a date/time once it
# does — see ri/src/server/llm/schedule.ts and memory bigmo_no_llm_time_math).
#
# ri/src/server/scripts/seed-sessions.ts keeps a rolling 28-day horizon and is
# idempotent (skips any (scoot, starts_at) that already exists), so running
# this more often than needed is harmless.
#
# Run as root via cron; execs into the running app container.
set -euo pipefail

COMPOSE_FILE="/home/brandon/scoot/ri/physical/docker-compose.yml"

/usr/bin/docker compose -f "$COMPOSE_FILE" exec -T app npx tsx ri/src/server/scripts/seed-sessions.ts
