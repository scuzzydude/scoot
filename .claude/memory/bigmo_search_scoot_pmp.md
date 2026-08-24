---
name: bigmo_search_scoot_pmp
description: BigMo's web search now runs through scoot-pmp (self-hosted SearXNG + LLM synthesis), replacing the dead Perplexity/Tavily/Gemini chain
metadata:
  type: project
---

BigMo's `searchWeb()` (`ri/src/server/services/search.ts`) calls `scoot-pmp`
via `PMP_URL` instead of the old `Perplexity → Tavily → Gemini` fallback
ladder, which had no working API key and no path to get one (corporate email
rejected by Perplexity's signup — see [[bigmo_no_llm_time_math]] project for
similar BigMo-quality constraints).

**scoot-pmp** ("Poor Man's Perplexity") is a separate sibling repo —
`git@github.com:scuzzydude/scoot-pmp.git`, cloned at `/home/brandon/scoot-pmp`
on dreamlab — shared between this project and the Steve project. Each
deployment runs its own fully independent stack: own SearXNG container, own
`.env`, nothing shared at runtime. Self-hosted SearXNG (metasearch, no API
key) for retrieval + any OpenAI-compatible endpoint for synthesis.

**On dreamlab, three pieces:**
1. `scoot-pmp-searxng` docker container — SearXNG, bound to `127.0.0.1:8090` only (was briefly `0.0.0.0`, fixed).
2. `scoot-pmp.service` systemd unit — the Node HTTP daemon (`npm start` → `dist/server.js`) on port 4200. Runs as user `brandon`. **Must set `Environment=PATH=` explicitly to the nvm node bin dir** — `/usr/bin/node` on this box is an ancient v18 that doesn't support `--env-file`, and systemd units don't inherit the interactive shell's nvm PATH. Without that line the unit crash-loops with `node: bad option: --env-file=.env`.
3. Anthropic-compat shim — `ri/src/server/llm/anthropic-shim.ts`, started from `ri/src/server/index.ts`, listening on `127.0.0.1:4001` inside the Scoot app container (published host-only via `docker-compose.yml`). Exists so scoot-pmp's synthesis step can reuse Scoot's own `LLM_API_KEY` instead of a second Anthropic account. Gated on `PMP_SHIM_SECRET` being set — blank disables it. Auth is a bearer token compared against `PMP_SHIM_SECRET`, never the real Anthropic key.

Chain: `searchWeb()` → `PMP_URL/ask` (scoot-pmp, port 4200) → SearXNG (port 8090) for retrieval + `LLM_API_URL` (the shim, port 4001) for synthesis → back through the shim to Scoot's real Anthropic key.

Verified end-to-end 2026-08-24 from inside `scoot-app-1` via `searchWeb()` directly.

**Why:** BigMo's search-enabled bot responses were silently degrading to `null` (no working key on any of the three old providers) — this restores real grounded answers with citations at zero marginal API cost.

**How to apply:** if BigMo search looks dead again, check in order: (1) `systemctl status scoot-pmp.service` on dreamlab, (2) `docker ps` for `scoot-pmp-searxng`, (3) `PMP_SHIM_SECRET` set in `.env` and the app container recreated (`docker compose up -d app`) after any `.env` or `docker-compose.yml` port change — env/port changes need a container recreate, not just a code hot-reload via tsx watch.
