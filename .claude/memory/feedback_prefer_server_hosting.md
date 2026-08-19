---
name: feedback-prefer-server-hosting
description: "Prefer serving review/output pages via plain HTTP on the prod server over Claude Artifacts, when already working directly on that box"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-19T17:08:23.402Z
---

When working in `/home/brandon/scoot` (Claude Code running directly on
the `dreamlab` prod server — see [[infra_claude_runs_on_dreamlab]]),
prefer hosting review pages, generated reports, or other HTML output on
the server itself (plain HTTP, e.g. `fairchildlabs.org`'s
`/var/www/html/` — see [[infra_prod_server]] for the exact convention)
rather than publishing to a Claude Artifact.

**Why:** Brandon asked directly (2026-08-19), "is there a reason you
need to use the artifact claude page instead of putting the results on
the server so I can just use http" — there's no real reason to route
through claude.ai when already running with full access on the target
server. Serving locally also sidesteps the Artifact tool's 16MB size
cap, which a large image-heavy review page can hit.

**How to apply:** Default to server-hosting for this kind of output in
this project. Claude Artifacts are still fine for genuinely ephemeral
scratch work or when Claude Code is NOT running on infrastructure the
user controls directly (e.g. a laptop/WSL session with no public web
server to drop files on) — the preference is specific to contexts where
a real server is already right there.
