---
name: scoot_identity_and_sms_rooms
description: "Scoot identity model (scoots.id = canonical index, users global, staking per-Scoot) + SMS<->rooms framework"
metadata: 
  node_type: memory
  type: project
  originSessionId: a3a73736-523a-4447-bf55-a6166bfcbe17
---

**Identity layering (confirmed by Brandon, 2026-06):**
- `users` is **global** — pledges of the Foundation, one identity per human, above any Scoot. Global `users.flags` should hold only Foundation-level bits (BOT). The global `STAKED`/`GYMBOSS` bits are **deprecated** — staking and roles are per-Scoot.
- A user is **staked into** a specific Scoot via a `scoot_members` row (a user can be in Scoot(34) AND Scoot(17)). Per-Scoot roles live in `scoot_members.userFlags` (64-bit BigInt mask) — see `ScootFlags` in schema.ts: STAKED=4, LEADER=8, GYMBOSS=16 (bits 1|2 are legacy engineer roles).
- **`scoots.id` IS the canonical Foundation Scoot index, NOT a serial surrogate.** Scoot(34) = the row with `id=34`. Future Scoots insert their real assigned index as the PK. The serial sequence is parked past assigned indices as a safety net. Don't "fix" this back to serial — getting it wrong once cost a re-point.

**Build target:** Scoot(34) "The Dream Laboratory", slug `dream-laboratory`, scootage = Fonde Brotherhood. Code references the Scoot by **slug**, never a hardcoded number. Bootstrap via `seed-scoot34.ts`; seed schedule via `seed-sessions.ts`. See [[scoot_concept_model]].

**SMS<->rooms framework** (design in `arch/sms-rooms.md`): rooms are the backbone; app + SMS are two transports onto the one `messages` table. Phase 1 done (schema + prod migration `0001_sms_rooms.sql` + seed): tables `scoot_sessions` (authoritative schedule, GYMBOSS-only, tentative|confirmed|cancelled), `sms_state` (active room + pending confirm), `sms_deliveries` (per-user SMS log). Field notes = room messages, not a separate table. Inbound SMS routing = sticky active room + scored routing w/ threshold+margin, confirm-on-low-confidence. Ties to [[bigmo_no_llm_time_math]] (BigMo answers schedule from scoot_sessions, never computes).
