---
name: project_sms_build_resume
description: "SMS⇄Rooms §8 build plan COMPLETE (8.1–8.8). Next: staking ritual (Phase 4) or SMS polish (§8.7 UI / routing v2)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
---

**The `arch/sms-rooms.md` §8 build plan is COMPLETE (§8.1–§8.8).**

Done (committed): §8.1 data foundation, §8.2 read path, §8.3 member write
(`commands.ts`), §8.4 outbound fan-out (`fanout.ts`) + LEADER `mirror on/off`,
§8.5 inbound routing (`routing.ts`), §8.6 GYMBOSS schedule-by-SMS
(`schedule-commands.ts` + `tz.ts`), §8.7 leader oversight + disclaimer BACKEND
(`oversight.ts`: LEADER-gated all-messages feed + `GET /api/scoots/:id/oversight/messages`;
`disclaimer.ts`: yearly no-privacy SMS via shared throttle `send.ts`, recorded to
`sms_deliveries`, wired fire-and-forget in `bigmo.ts`). 60 tests. Plus BigMo→Memory
Vault (`memory.ts`), `ScootFlags.BETA/LEGEND_NUMBER`, `scoot_members.worn_number`.

§8.8 DONE: bigmo.ts now records every inbound+reply to `sms_deliveries` (finish()
wrapper); `sms/log.ts` + `GET /api/v1/sms/log` (own) + LEADER
`GET /api/scoots/:id/oversight/sms-log/:userId`; React transcript at
`/sms-log` (`pages/sms-log-page.tsx`, `api/sms.ts`). 63 tests.

SMS POLISH DONE (this session): §8.7 frontend (oversight-page.tsx + privacy-notice
+ nav Texts/Oversight; LEADER granted to Brandon 1 + Karen 127, migration 0013);
routing v2 (routing.ts §4 scored topical + confirm + undo, sms_state.pending);
§6 GYMBOSS conflict escalation (escalation.ts + schedule_verifications table
migration 0014: conflicting confirm/cancel polls all GYMBOSSes Y/N, first decisive
reply applies). 74 tests.

**NEXT — Phase 4 (Staking ritual)** is the agreed next MAJOR build per [[project_plan]]:
QR + one-time code + selfie pledge ceremony; trust graph / scootage from the pledge
graph. (Brandon wanted to PLAY with the SMS framework before starting Phase 4.)

Still deferred (not blocking Phase 4): `chat_rooms.scoot_id` to scope oversight
per-Scoot (returns all rooms today — fine for single Fonde Scoot). Ops: storage
plan actions awaiting go-ahead (docker prune ~1.2G, media→Azure Blob, log→Cold,
`ri/physical/storage-plan.md`). Later: Phase 5 C core + wallet; Phase 6 mobile.

Roster/infra done this session (not blocking §8.7):
- User-id reservation: reserved band 1–99 (family 1–5 + Rockets legend/patron
  jersey seats), regular members in the 100-block, bots/test at 900+. Migrations
  0003–0012. `ScootFlags.LEGEND_NUMBER` (64) + `scoot_members.worn_number`; McGhee
  is member 130 wearing #24 (BigMo legend seat at id 24). New signups start at 132.
- Storage tooling DONE (`scoot-storage`, 6h cron). Storage plan awaiting go-ahead:
  reclaim ~1.2G docker build cache, media→Azure Blob hot, log→Cold. See
  [[infra_cold_archive]] and `ri/physical/storage-plan.md`.

Related: [[scoot_identity_and_sms_rooms]], [[project_plan]], [[bigmo_no_llm_time_math]].
