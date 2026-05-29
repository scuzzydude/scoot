---
name: prod-db-migrations-no-db-push
description: "Never run drizzle db:push against prod — it proposes DROPPING the connect-pg-simple `session` table (data loss). Apply additive chat/schema columns via ALTER TABLE in the postgres container. Prod DB is on host :5433, app bind-mounts repo + tsx watch."
metadata: 
  node_type: memory
  type: project
  originSessionId: 23cf48e3-58b9-4e04-9be6-778c29961de4
---

Operational facts for migrating/deploying the Scoot stack on **steve** (prod). See [[infra_prod_server]] and [[infra_claude_runs_on_steve]].

**Never `npm run db:push` (drizzle-kit push) against prod.** The Passport session store (`connect-pg-simple`) creates a `session` table that is NOT in `ri/src/server/db/schema.ts`. drizzle-kit sees it as drift and proposes **dropping it** — "data-loss statements: about to delete session table". Confirming would wipe all logged-in sessions (and signals push will make other unintended changes too). For additive schema changes, apply them surgically instead:

```bash
sudo docker compose -f ri/physical/docker-compose.yml exec -T postgres \
  psql -U scoot -d scoot -v ON_ERROR_STOP=1 -c \
  "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type> ...;"
```

`exec -T` (no TTY) is what saved us — drizzle-kit's interactive confirm errored out instead of applying, so nothing was dropped.

**DB connection topology:**
- Prod Postgres (container `scoot-postgres-1`) is reachable **from the host at `localhost:5433`** (compose maps `5433:5432`).
- The **container** connects via `postgres:5432` (docker network) — compose sets `DATABASE_URL=postgresql://scoot:password@postgres:5432/scoot` for the app service.
- The host `.env` `DATABASE_URL` points at `localhost:5433` (fixed 2026-05-29; was `:5432` which reached nothing). So host-side tooling — `npm test`, drizzle, one-off scripts — now talks to the dockerized prod DB directly. `npm test` passes 25/25 from the host. NOTE: this means host scripts hit **prod** data; be deliberate.

**Code is live without rebuild.** The `app` service (`Dockerfile.dev`) bind-mounts the whole repo (`../..:/app`) and runs `npm run dev` (tsx watch + Vite). Editing files on the host = editing `/app` in the container; tsx watch restarts the server automatically (visible in `docker logs scoot-app-1`). `scoot-chat` is mounted at `/scoot-chat`. So a normal "deploy" of code changes needs no `docker compose build` — only schema changes (manual ALTER) and dependency changes (rebuild for the `node_modules` named volume) need extra steps.

**Why:** Established 2026-05-29 while integrating the new scoot-chat room data contract (added `chat_rooms.room_type` + `pinned_model`). db:push tried to drop `session`; applied the two columns via ALTER TABLE IF NOT EXISTS + backfilled `room_type='dm' WHERE is_dm` instead.
