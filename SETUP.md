# Scoot — Dev Environment Setup

## Prerequisites

Install these on the new machine before anything else.

- **Git** — https://git-scm.com
- **Docker Desktop** (Windows/Mac) or **Docker Engine + Docker Compose** (Linux/WSL)
  - WSL: https://docs.docker.com/engine/install/ubuntu/
  - Windows: https://www.docker.com/products/docker-desktop/
- A GitHub account with access to `scuzzydude/scoot`

## First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/scuzzydude/scoot.git
cd scoot

# 2. Create your local env file
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | What to set |
|---|---|
| `SESSION_SECRET` | Any 64-character random string |
| `DEFAULT_USERNAME` | Username for the initial admin account (e.g. `admin`) |
| `DEFAULT_PASSWORD` | Password for the initial admin account |
| `DEFAULT_EMAIL` | Email for the initial admin account |
| `LLM_API_KEY` | Your Anthropic API key (or leave blank if using vLLM) |
| `MEDIA_DIR` | A local path for uploaded files, e.g. `/tmp/scoot-media` |

Leave `DATABASE_URL` as-is — Docker Compose overrides it automatically to point at the containerized Postgres.

The `DEFAULT_*` vars exist because public registration is disabled. On first startup, if the `users` table is empty, the server seeds one account from these values so you can log in. If the table already has users, these vars are ignored — change the password in-app, not by editing `.env`.

```bash
# 3. Build and start the containers
docker compose up --build -d

# 4. Push the database schema (first run only)
docker compose exec app npm run db:push
```

## Done

Open http://localhost:5173 in your browser and log in with the `DEFAULT_USERNAME` / `DEFAULT_PASSWORD` you set in `.env`.

- Frontend (Vite) → port 5173
- API (Express) → port 3000
- Postgres → port 5432

## Day-to-day use

```bash
# Start everything
docker compose up -d

# Stop everything
docker compose down

# View logs
docker compose logs -f

# Pull latest code and restart
git pull && docker compose up -d --build
```

## Switching machines mid-session

All work is committed and pushed after every change (see CLAUDE.md). On the new machine:

```bash
git pull
docker compose up -d
```

No rebuild needed unless `package.json` or `Dockerfile.dev` changed. If you're unsure, add `--build`.

## Claude Code memory — one-time symlink per machine

Claude Code's project memory lives in this repo at `.claude/memory/` so it syncs across all dev machines via git. The Claude harness expects to find it at `~/.claude/projects/-home-scuzzydude-projects-scoot/memory/`, so each new machine needs a one-time symlink:

```bash
# Run this once on each new machine after cloning
mkdir -p ~/.claude/projects/-home-scuzzydude-projects-scoot
ln -sfn "$PWD/.claude/memory" ~/.claude/projects/-home-scuzzydude-projects-scoot/memory
```

After the symlink is in place, `git pull` automatically picks up any new memories Claude has written on another machine. If the repo lives somewhere other than `/home/scuzzydude/projects/scoot`, the path in the symlink target must match the actual repo location AND the directory name under `~/.claude/projects/` must match the slugified repo path Claude Code uses (replace `/` with `-`).

## Troubleshooting

**Port already in use (5432, 3000, or 5173)**
Something else is using that port. Find and stop it:
```bash
# See what's on a port
sudo ss -tlnp | grep 5432

# Or stop all running Docker containers
docker stop $(docker ps -q)
```

**Containers started but can't reach each other**
This can happen if a previous failed start left containers without proper networking. Fix:
```bash
docker compose down
docker compose up -d
```

**Schema changes after a pull**
If a teammate (or Claude) updated the database schema:
```bash
docker compose exec app npm run db:push
```
