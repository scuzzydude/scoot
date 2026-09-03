---
name: infra-claude-runs-on-dreamlab
description: "Claude Code for this project runs directly on the Azure prod VM (dreamlab, formerly named steve), not on a WSL dev box. No SSH to \"deploy\" — edit and restart in place."
metadata: 
  node_type: memory
  type: project
  originSessionId: ddc7ab1a-729e-40b8-a8f1-8456f9a6d11d
---

When Claude Code is running in `/home/brandon/scoot` on this project, the host **is** prod (Azure VM, public IP 13.64.77.78, kernel `*-azure`, hostname `dreamlab`).

**Renamed 2026-07-27:** OS hostname changed from `steve` → `dreamlab` specifically to stop colliding with a *separate* work-LAN machine also named `steve` at 10.238.64.17 (see the old collision note below — this was a recurring point of confusion). The Azure VM *resource* itself is still named "steve" in Azure's own metadata/portal/CLI (that's permanent short of recreating the VM — not worth it for a naming clash), but the box's OS-level hostname, shell prompts, and `hostname` command output are now `dreamlab`. `preserve_hostname: true` was set via `/etc/cloud/cloud.cfg.d/99-preserve-hostname.cfg` so cloud-init doesn't revert it on next boot (cloud-init otherwise re-applies the hostname from Azure metadata on every boot). No functional dependency existed anywhere in the app stack (verified: Apache vhosts, TLS certs, Docker Compose, env vars all reference domain names or IPs, never the OS hostname) — this was a pure identity/cosmetic change.

**Why (original note, still true):** Earlier in the build Brandon developed on WSL; CLAUDE.md still reflects that history. As of 2026-05-27 he runs Claude Code directly on the Azure VM, so file edits in `/home/brandon/scoot/.env`, `docker compose ...`, and `curl localhost:3000/...` all operate on prod immediately.

**How to apply:**
- Don't try to `ssh brandon@dreamlab` / `ssh ... 13.64.77.78` to "reach prod" — you're already there. The pubkey `brandon@steve-prod` (named before the rename) was generated *on* this box; it's not for hopping to it.
- Don't assume there's a separate "deploy" step. Editing the working tree + restarting the container *is* the deploy.
- There is a *separate, unrelated* machine named `steve` at 10.238.64.17 on Brandon's work-LAN — this is the collision the 2026-07-27 rename was meant to resolve. If you ever see "steve" referenced in older memory/docs/commits, it means this box (now dreamlab), not the work machine.
- Because this is prod, treat actions with extra care: confirm before touching shared services (Apache vhosts, postgres data, fairchildlabs.org). See [[infra_prod_server]] for the stack layout and Apache caveat.
- Cross-reference: [[infra_prod_server]] describes the VM itself; this memory clarifies *where Claude is running from*.

**2026-09-03:** Brandon confirmed dreamlab is the *only* checkout of the scoot repo — no clones on laptop/home/work (CLAUDE.md's 3-machine note is historical). History rewrites/force-pushes here need no follow-up on other machines.
