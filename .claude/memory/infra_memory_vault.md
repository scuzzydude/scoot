---
name: infra_memory_vault
description: "Memory Vault (Postgres+pgvector MCP) on steve — semantic-recall layer ALONGSIDE the git-file memory; loopback-only, user-scope MCP"
metadata:
  node_type: memory
  type: project
---

**What:** Memory Vault (`github.com/mihaibuilds/memory-vault`, MIT) — a Postgres 16 + pgvector hybrid-search memory MCP server. Set up on **steve** 2026-06-26 as a **semantic-recall layer that runs ALONGSIDE** the git-file memory in `.claude/memory/`. The git files stay the durable, versioned, redaction-safe **source of truth** (see CLAUDE.md); Memory Vault adds fuzzy/semantic recall on top. Exposes 4 MCP tools: `remember`, `recall`, `forget`, `memory_status` (+ knowledge graph).

**Where / how it runs:**
- Cloned at `/home/brandon/memory-vault` — **NOT** inside the scoot repo (third-party code, machine-specific).
- Docker stack (`docker compose up -d` there): `db` + `app`. Both bound **loopback-only** because steve is a public-IP box: DB on `127.0.0.1:54320`→5432 (high port to dodge any default-5432 PG), dashboard/REST on `127.0.0.1:8000`. Reach the dashboard via SSH tunnel, never the internet. Edited the base `docker-compose.yml` ports directly (a `docker-compose.override.yml` does NOT work — Compose **appends** `ports` lists, so an override can't remove the base `0.0.0.0` mapping).
- Host-side MCP server runs from a venv: `/home/brandon/memory-vault/.venv`. Invoked as `python -m src.mcp` with `PYTHONPATH=/home/brandon/memory-vault`. The package is src-layout and `pip install .` only installed **deps** — `src` itself is imported via PYTHONPATH, so CLI/MCP must run with that env (and from the repo dir for the CLI). Deps include CPU torch + spaCy `en_core_web_sm`.
- MCP registered at **user scope** via `claude mcp add memory-vault --scope user` (lives in `~/.claude.json`, so it's **per-machine, NOT git-synced** — local to steve only, by the "local on steve first" decision). Health-checks ✔ Connected. Tools go live on the next Claude Code restart.

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

**Status / gotchas:** evaluation/early use — git memory is still primary; if MV proves out, cross-machine (one shared vault via tunnel/bearer-token) is the deferred next step (MV is single-instance by design). Each CLI invocation cold-loads the embedding model (~10s) — batch seeds run in background. DB creds are the local defaults `memory_vault/memory_vault` (loopback-only, low risk). Relates to [[infra_prod_server]], [[infra_claude_runs_on_steve]].
