---
name: Keep SETUP.md current with install procedure
description: Whenever env vars, install steps, or first-run setup changes, update SETUP.md in the same commit
metadata:
  type: feedback
  originSessionId: d9c700ee-872f-42d5-b2dd-1a66df825c88
---
Whenever I add a new env var, change first-run steps, or introduce anything a user must configure to bring the project up on a fresh machine, update `SETUP.md` in the same commit so the installation procedure stays accurate.

**Why:** The developer works across three machines (laptop, home, work) and relies on `SETUP.md` as the single source of truth for standing up a new one. When a new env var was added but not documented, the work machine ended up with no way to log in. He said explicitly: "make the env vars part of the installation procedure, which you should be keeping track of."

**How to apply:** Treat `SETUP.md` like code — if a change to `.env.example`, `docker-compose.yml`, a seed/init step, or any one-time-per-machine action ships, the matching section of `SETUP.md` must ship with it. Never rely on memory or chat context to convey install steps; bake them into the doc.
