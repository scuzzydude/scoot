---
name: project_sms_build_resume
description: "SMS⇄Rooms build plan resume point — §8.1–8.5 done, NEXT is §8.6 GYMBOSS schedule-by-SMS"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
---

**Resume the `arch/sms-rooms.md` §8 build plan at §8.6.**

Done (committed): §8.1 data foundation, §8.2 read path, §8.3 member write
(`commands.ts`), §8.4 outbound fan-out (`fanout.ts`) + LEADER `mirror on/off`,
§8.5 inbound routing (`routing.ts`, sticky active room + hard-switch + group
auto-post). Plus BigMo→Memory Vault semantic memory (`memory.ts`), `ScootFlags.BETA`.

**NEXT — §8.6 GYMBOSS schedule-by-SMS:** let a GYMBOSS set/clear `scoot_sessions`
over text (e.g. `set game tue 7pm`, `cancel`, `all clear`), flag-gated on
`ScootFlags.GYMBOSS`, with the §6 verification-escalation (doubt/conflict → text
all GYMBOSS a Y/N, act on reply via `sms_state.pending`; hazards never auto-clear).
Then §8.7 leader oversight + yearly disclaimer, §8.8 app per-user SMS log. Routing
v2 (scored topical + confirm/undo, §4) deferred.

Also parked in-session (not blocking §8.6):
- User-id reservation DONE — ids 1–44 seated (family 1–5, Rockets legends on
  jersey #s, 23 real members). scuzzydude(101)+8 test users(102–109) still parked;
  ids 45–49 free; auto-signups start at 200. Migrations 0003/0004.
- Storage tooling DONE (`scoot-storage`, 6h cron). Storage plan awaiting go-ahead:
  immediate reclaim (~1.2G docker build cache), media→Azure Blob hot, log→Cold
  lifecycle. See [[infra_cold_archive]] and `ri/physical/storage-plan.md`.

Related: [[scoot_identity_and_sms_rooms]], [[project_plan]], [[bigmo_no_llm_time_math]].
