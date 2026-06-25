-- 0002_flags_to_scoot_members.sql — migrate global user roles into per-Scoot
-- stakes for Scoot(34). Staking/roles are per-Scoot (scoot_members.user_flags),
-- not global. See arch/sms-rooms.md + memory scoot_identity_and_sms_rooms.
-- Idempotent: re-OR-ing the same bits is a no-op. Apply via psql, not db:push.
--
-- Bit maps differ between the two flag systems:
--   global users.flags:  STAKED=2,  GYMBOSS=4
--   ScootFlags (per-Scoot): STAKED=4, LEADER=8, GYMBOSS=16

UPDATE scoot_members sm
SET user_flags = (
    (sm.user_flags::bigint)
  | (CASE WHEN (u.flags & 2) <> 0 THEN 4  ELSE 0 END)   -- global STAKED  -> ScootFlags.STAKED
  | (CASE WHEN (u.flags & 4) <> 0 THEN 16 ELSE 0 END)   -- global GYMBOSS -> ScootFlags.GYMBOSS
)::text
FROM users u
WHERE sm.user_id = u.id AND sm.scoot_id = 34;
