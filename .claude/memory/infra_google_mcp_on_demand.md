---
name: infra_google_mcp_on_demand
description: Google MCP connectors (Gmail/Calendar/Drive) were removed from user scope 2026-09-15 and are now loaded on demand via ~/.mcp-google.json; nothing in the running system needs them
metadata:
  type: infra
---

The three `bigmo-google` MCP connectors are **no longer registered at user scope**. Load them for a session with `claude-google` (a `.bashrc` function wrapping `claude --mcp-config ~/.mcp-google.json`). Credentials still live in `~/.mcp-creds/bigmo-google/`; only the registration moved.

**Why:** they were spawning in *every* Claude Code session on a 3.8 GB box — 19 processes, roughly 490 MB across two sessions, of which ~279 MB was pure `npm exec`/`sh` wrapper overhead launching binaries that were already installed. Brandon's actual use is occasional ad-hoc mail lookups.

**The load-bearing fact:** nothing in the running system uses MCP for email. `ri/src/server/mail/poller.ts` polls IMAP directly every five minutes (`MAIL_CHECK_INTERVAL_MS=300000`) and texts Brandon; the digest summarises via the LLM. Grepping `mail/`, `sms/` and `scripts/` for MCP returns nothing. So "load the connectors when the cron checks mail" does not apply — the cron never used them, and removing them cannot break the mail flow.

**How to apply:** don't re-add them at user scope. If a session needs Gmail/Drive/Calendar, start it with `claude-google`. Savings land only when existing sessions restart, since a running session keeps its spawned children. Related: [[infra_bigmo_google_mcp]] for the re-auth procedure, [[project_bigmo_rim_execution]].
