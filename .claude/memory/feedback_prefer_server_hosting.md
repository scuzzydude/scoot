---
name: feedback-prefer-server-hosting
description: "Always deliver a web link (server-hosted, not a raw file attach or a Claude Artifact) for any review output, including quick one-off spot checks, when already working directly on the prod box"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-27T13:03:10.633Z
---

When working in `/home/brandon/scoot` (Claude Code running directly on
the `dreamlab` prod server — see [[infra_claude_runs_on_dreamlab]]),
prefer hosting review pages, generated reports, or other output on the
server itself (plain HTTP, e.g. `fairchildlabs.org`'s `/var/www/html/`
— see [[infra_prod_server]] for the exact convention) rather than
publishing to a Claude Artifact **or sending a raw file via
SendUserFile**.

**Why:** Brandon asked directly (2026-08-19), "is there a reason you
need to use the artifact claude page instead of putting the results on
the server so I can just use http" — there's no real reason to route
through claude.ai when already running with full access on the target
server. Serving locally also sidesteps the Artifact tool's 16MB size
cap. **Reinforced 2026-08-27** ("always give me a web link") after a
single QR-code test card was sent as a raw `SendUserFile` attachment
instead of published — the preference isn't limited to big multi-image
review pages, it applies to ANY output worth showing him, including a
quick one-off spot-check image. Default to a link even for something
that feels too small to deserve its own page.

**How to apply:** Default to server-hosting for ANY visual output in
this project — a full round's review page, a single test render, a
diagnostic screenshot, anything. Even a one-image check gets a tiny
page (or gets dropped into an existing review page) rather than a
direct file send. Claude Artifacts and SendUserFile are still fine for
genuinely ephemeral scratch work or when Claude Code is NOT running on
infrastructure the user controls directly (e.g. a laptop/WSL session
with no public web server to drop files on) — the preference is
specific to contexts where a real server is already right there, which
is true for this whole project.
