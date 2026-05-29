---
name: prod-server-steve-azure-vm-fairchildlabs-org-thedreamlaboratory-org
description: "Production Azure VM hosting Scoot. Hostname steve, public IP 13.64.77.78. Apache fronts existing fairchildlabs.org. Scoot stack runs in Docker on :3000 (API) and :5175 (Vite). DATA_DIR=/var/lib/scoot, postgres on :5433."
metadata: 
  node_type: memory
  type: project
  originSessionId: ddc7ab1a-729e-40b8-a8f1-8456f9a6d11d
---

Production Scoot host. Distinct from WSL dev box (`steve` server vs WSL2 at 192.168.1.118 — see [[infra_wsl_network]]).

- **Hostname:** `steve` — Azure VM, Ubuntu 24.04 LTS, kernel 6.17 azure
- **Public IP:** 13.64.77.78
- **Internal IP:** 10.0.0.4 (eth0)
- **HW:** 2 CPU, 3.8 GB RAM, 30 GB root disk, 8 GB ephemeral `/mnt` (Azure resource disk — DO NOT use for data; gets wiped on dealloc)
- **Domains served:** `fairchildlabs.org` (HTTPS, Let's Encrypt) and `thedreamlaboratory.org` (HTTP only, static placeholder under `/var/www/thedreamlaboratory.org/html`) — both via Apache on 80/443

## Scoot stack layout

- Docker + Compose v2 installed via official apt repo. `brandon` is in `docker` group but new shell sessions need fresh login to use docker without sudo.
- Stack started with `sudo docker compose -f ri/physical/docker-compose.yml up -d --build`
- **DATA_DIR=/var/lib/scoot** (owned by `brandon`); subdirs `postgres/` and `media/`
- ⚠️ **DATA_DIR must be set in `ri/physical/.env`** (machine-local, gitignored), NOT the repo-root `.env`. Compose reads its interpolation env-file from the compose file's own directory (`ri/physical/`), not the CWD/root. The root `.env` is only injected into the container via `env_file:`, which does NOT feed `${DATA_DIR}` substitution. If `ri/physical/.env` is missing, `${DATA_DIR:-/tmp/scoot-data}` silently falls back to **/tmp** — meaning the live DB + uploads land in `/tmp` (subject to systemd-tmpfiles 30-day cleanup). This bit us 2026-05-29: data was in `/tmp/scoot-data`; migrated to `/var/lib/scoot` and added `ri/physical/.env` with `DATA_DIR=/var/lib/scoot`. Verify with `docker compose -f ri/physical/docker-compose.yml config | grep source:` → must show `/var/lib/scoot`, not `/tmp`. A stale backup copy may remain at `/tmp/scoot-data` — safe to delete once confident.
- Ports exposed to host: API 3000, Vite 5175 (mapped to container 5173), Postgres 5433 (mapped to container 5432). **Note:** Vite host port was 5174 until 2026-05-29, remapped to 5175 because the Steve tracker now occupies 5174 on the host (commit 0097c6e).
- `.env` has DEFAULT_USERNAME=scuzzydude seeded on first boot; bots `claude` and `bigmo` seed automatically
- **Apache IS reverse-proxying thedreamlaboratory.org to Scoot** (as of 2026-05-27). Vhost forwards `/api` and `/media` → Express :3000, `/ws` → Express :3000 WebSocket, everything else → Vite :5175. HTTP redirects to HTTPS. Vhost files mirrored in repo at `ri/physical/apache/`.
- **HTTPS is live** for both `thedreamlaboratory.org` and `www.thedreamlaboratory.org` (Let's Encrypt, expires 2026-08-25, certbot auto-renew configured). Cert lives at `/etc/letsencrypt/live/thedreamlaboratory.org/`.
- **Static legal pages** served via Apache `Alias` outside the proxy: `/privacy` and `/terms` resolve to `/var/www/thedreamlaboratory.org/html/{privacy,terms}.html`. Source-of-truth copies committed at `ri/physical/legal/`.

**Why:** Brandon's production target for the Dream Laboratory / Fonde Brotherhood (Scoot(34)). Server bringup happened 2026-05-27 after a HW bump (RAM/CPU) made the VM able to actually run the stack.

**How to apply:** When deploying changes to prod, ssh in, `cd /home/brandon/scoot`, `git pull`, `sudo docker compose -f ri/physical/docker-compose.yml up -d --build`. If schema changed: `sudo docker compose -f ri/physical/docker-compose.yml exec app npm run db:push`. Don't touch Apache vhosts without confirming with Brandon — `fairchildlabs.org` is live.
