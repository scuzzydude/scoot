---
name: project_sms_build_resume
description: "SMS⇄Rooms build plan resume point — §8.1–8.6 done, NEXT is §8.7 leader oversight + yearly disclaimer"
metadata: 
  node_type: memory
  type: project
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
---

**Resume the `arch/sms-rooms.md` §8 build plan at §8.7.**

Done (committed): §8.1 data foundation, §8.2 read path, §8.3 member write
(`commands.ts`), §8.4 outbound fan-out (`fanout.ts`) + LEADER `mirror on/off`,
§8.5 inbound routing (`routing.ts`), §8.6 GYMBOSS schedule-by-SMS
(`schedule-commands.ts` + `tz.ts`: `gym confirm/cancel/time/note/clear`, flag-gated,
deterministic time math, 10 tests). Plus BigMo→Memory Vault (`memory.ts`), `ScootFlags.BETA`.

**NEXT — §8.7 leader oversight + disclaimer:** LEADER all-messages view across rooms
(bypass accessMask); mandatory no-privacy disclaimer on join + yearly
(`users.privacy_disclaimer_at`), over SMS + app, delivery recorded. Then §8.8 app
per-user SMS log (render `sms_deliveries`). Deferred: routing v2 (scored topical +
confirm/undo, §4); the §6 multi-GYMBOSS Y/N verification-escalation (§8.6 shipped the
core set/clear without it).

Roster/infra done this session (not blocking §8.7):
- User-id reservation: reserved band 1–99 (family 1–5 + Rockets legend/patron
  jersey seats), regular members in the 100-block, bots/test at 900+. Migrations
  0003–0012. `ScootFlags.LEGEND_NUMBER` (64) + `scoot_members.worn_number`; McGhee
  is member 130 wearing #24 (BigMo legend seat at id 24). New signups start at 132.
- Storage tooling DONE (`scoot-storage`, 6h cron). Storage plan awaiting go-ahead:
  reclaim ~1.2G docker build cache, media→Azure Blob hot, log→Cold. See
  [[infra_cold_archive]] and `ri/physical/storage-plan.md`.

Related: [[scoot_identity_and_sms_rooms]], [[project_plan]], [[bigmo_no_llm_time_math]].
