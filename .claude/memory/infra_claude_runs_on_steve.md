---
name: infra-claude-runs-on-steve
description: "Claude Code for this project runs directly on the Azure prod VM (steve), not on a WSL dev box. No SSH to \"deploy\" — edit and restart in place."
metadata: 
  node_type: memory
  type: project
  originSessionId: ddc7ab1a-729e-40b8-a8f1-8456f9a6d11d
---

When Claude Code is running in `/home/brandon/scoot` on this project, the host **is** prod steve (Azure VM, public IP 13.64.77.78, kernel `*-azure`, hostname `steve`).

**Why:** Earlier in the build Brandon developed on WSL; CLAUDE.md still reflects that history. As of 2026-05-27 he runs Claude Code directly on the Azure VM, so file edits in `/home/brandon/scoot/.env`, `docker compose ...`, and `curl localhost:3000/...` all operate on prod immediately.

**How to apply:**
- Don't try to `ssh brandon@steve` / `ssh ... 13.64.77.78` to "reach prod" — you're already there. The pubkey `brandon@steve-prod` was generated *on* this box; it's not for hopping to it.
- Don't assume there's a separate "deploy" step. Editing the working tree + restarting the container *is* the deploy.
- "steve" on the local resolver here returns IPv6 link-locals — those are unrelated machines on Azure's L2 segment, not the work-LAN steve at 10.238.64.17 (which is a *different* machine entirely on Brandon's office network).
- Because this is prod, treat actions with extra care: confirm before touching shared services (Apache vhosts, postgres data, fairchildlabs.org). See [[infra_prod_server]] for the stack layout and Apache caveat.
- Cross-reference: [[infra_prod_server]] describes the VM itself; this memory clarifies *where Claude is running from*.
