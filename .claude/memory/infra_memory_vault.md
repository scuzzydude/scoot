---
name: infra_memory_vault
description: "Memory Vault (Postgres+pgvector MCP) on dreamlab (prod, formerly named steve) — semantic-recall layer ALONGSIDE the git-file memory; loopback-only, user-scope MCP"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
  modified: 2026-07-28T11:14:41.195Z
---

**What:** Memory Vault (`github.com/mihaibuilds/memory-vault`, MIT) — a Postgres 16 + pgvector hybrid-search memory MCP server. Set up on **this prod box** (hostname `dreamlab`, renamed 2026-07-27 from `steve`) 2026-06-26 as a **semantic-recall layer that runs ALONGSIDE** the git-file memory in `.claude/memory/`. The git files stay the durable, versioned, redaction-safe **source of truth** (see CLAUDE.md); Memory Vault adds fuzzy/semantic recall on top. Exposes 4 MCP tools: `remember`, `recall`, `forget`, `memory_status` (+ knowledge graph).

**Where / how it runs:**
- Cloned at `/home/brandon/memory-vault` — **NOT** inside the scoot repo (third-party code, machine-specific).
- Docker stack (`docker compose up -d` there): `db` + `app`. Both bound **loopback-only** because this is a public-IP box: DB on `127.0.0.1:54320`→5432 (high port to dodge any default-5432 PG), dashboard/REST on `127.0.0.1:8000`. Reach the dashboard via SSH tunnel, never the internet. Edited the base `docker-compose.yml` ports directly (a `docker-compose.override.yml` does NOT work — Compose **appends** `ports` lists, so an override can't remove the base `0.0.0.0` mapping).
- Host-side MCP server runs from a venv: `/home/brandon/memory-vault/.venv`. Invoked as `python -m src.mcp` with `PYTHONPATH=/home/brandon/memory-vault`. The package is src-layout and `pip install .` only installed **deps** — `src` itself is imported via PYTHONPATH, so CLI/MCP must run with that env (and from the repo dir for the CLI). Deps include CPU torch + spaCy `en_core_web_sm`.
- MCP registered at **user scope** via `claude mcp add memory-vault --scope user` (lives in `~/.claude.json`, so it's **per-machine, NOT git-synced** — local to this box only, by the "local on prod first" decision). Health-checks ✔ Connected. Tools go live on the next Claude Code restart.

**Seed:** `.claude/memory/*.md` (skip `MEMORY.md` index) ingested into space `scoot` → 56 chunks, 118 entities, 545 relationships. Re-seed/refresh:
```
cd /home/brandon/memory-vault && . .venv/bin/activate && export PYTHONPATH=$PWD
python -m src.cli space create scoot   # once
for f in /home/brandon/scoot/.claude/memory/*.md; do
  [ "$(basename "$f")" = MEMORY.md ] && continue
  python -m src.cli ingest "$f" --space scoot
done
python -m src.cli status   # Database: healthy, chunk counts
```

**BigMo runtime integration (the product use, separate from Claude Code's MCP):**
BigMo (the SMS bot) uses Memory Vault as long-term semantic memory **via the REST API, NOT MCP** — MCP is only for Claude Code. Code: `ri/src/server/sms/memory.ts` (graceful `recall`/`remember`/`ensureSpace`; degrades to no-op if `MEMORY_VAULT_URL` unset or the service is slow/down — a vault hiccup must NEVER break/delay an SMS reply), wired into `handleSmsMessage` (`bigmo.ts`): recall-before-reply injects relevant past member texts into the system prompt as BACKGROUND (the Verified Schedule still wins for any date/time), and remember-after stores substantive (≥12 char) member messages fire-and-forget, attributed via the API's `speaker` field. Space is per-Scoot: `bigmo-${slug}` = `bigmo-dream-laboratory` (separate from the dev `scoot` space).
- **Networking:** scoot-app reaches it at `http://memory-vault-app-1:8000`. The scoot compose (`ri/physical/docker-compose.yml`) joins the app to the external `memory-vault_default` network (alongside `default`). Host-loopback binding doesn't block container-to-container traffic on the shared network.
- **Auth/env:** bearer token (`memory-vault token create bigmo`) + `MEMORY_VAULT_URL`/`MEMORY_VAULT_TOKEN`/`MEMORY_VAULT_TIMEOUT_MS` in scoot `.env` (gitignored — token never committed); placeholders in `.env.example`. Recreate app to pick up env: `cd ri/physical && docker compose up -d app` (DATA_DIR auto-loads from `ri/physical/.env`; only `app` recreates, postgres untouched — dry-run first).
- Ties into [[scoot_identity_and_sms_rooms]] / [[bigmo_no_llm_time_math]].

**Status / gotchas:** evaluation/early use — git memory is still primary; if MV proves out, cross-machine (one shared vault via tunnel/bearer-token) is the deferred next step (MV is single-instance by design). Each CLI invocation cold-loads the embedding model (~10s) — batch seeds run in background. DB creds are the local defaults `memory_vault/memory_vault` (loopback-only, low risk). Relates to [[infra_prod_server]], [[infra_claude_runs_on_dreamlab]].

**Restart policy (fixed 2026-07-28):** the `docker-compose.yml` originally had no `restart` field, so after the 2026-07-27 host reboot (steve→dreamlab rename) both containers stayed exited for ~13h until manually noticed and brought back up — BigMo's `recall`/`remember` silently no-op when the vault is down (by design, so it doesn't break SMS), so this kind of gap is easy to miss. Added `restart: unless-stopped` to both `db` and `app` services so it now survives reboots like the main scoot stack does. Local edit only, not committed upstream.
