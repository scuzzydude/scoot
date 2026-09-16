---
name: project_bigmo_rim_questionnaire
description: BigMo RIM characterization questionnaire answered 2026-09-07 on dreamlab; answers live in ~/BigMo_RIM_QA_v0.1.md and are destined for RIM_architecture_v0.1.md §3/§4/§7 on the steveai host
metadata: 
  node_type: memory
  type: project
  originSessionId: d3da1ab4-bf52-4052-9304-02f85a6a11af
  modified: 2026-09-07T10:39:39.287Z
---

On 2026-09-07 Brandon dropped `~/BigMo_RIM_QA_v0.1.md` (a "RIM" six-criteria questionnaire written for the `RIM_architecture_v0.1.md` methodology doc kept at `/srv/steveai/ri/rim/` on a *different* host, "Steve") and asked for it to be processed. It was answered in place from direct inspection of `~/scoot`, the live Postgres, host systemd/cron, and the Memory Vault MCP. Headline verdict: BigMo is a Level 3 design; fails B1/B2, partial on B3/B4/B6; Part E lists 7 uncovered mechanisms and 6 falsifying cases; Part F2 lists 15 dated incidents.

**Why:** the doc's scope note forbids mixing content from other hosts, and `/srv/steveai` does not exist on dreamlab, so the answers stay in `~` until Brandon moves them. Earlier sibling docs `~/BIGMO_DISCOVERY_QA.md` (2026-08-16) and `~/BIGMO_SYNC_NOTE.md` cover the player-card build spec, not RIM.

**How to apply:** if a v0.2 questionnaire or the RIM doc itself shows up, start from the answered v0.1 rather than re-inspecting; re-verify live counts (they were: 65 users, 2 SMS users ever, 78 sms_deliveries, 0 schedule_verifications). Related: [[infra_claude_runs_on_dreamlab]].
