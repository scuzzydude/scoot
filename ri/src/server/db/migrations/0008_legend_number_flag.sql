-- ScootFlags.LEGEND_NUMBER (1<<6 = 64): awarded a reserved legend's/patron's number.
-- First awardee: McGhee (user 24) — a deceased legend's # (Moses/BigMo/Kobe) given to an OG.
INSERT INTO scoot_members (scoot_id, user_id, user_flags)
VALUES (34, 24, '64')
ON CONFLICT (scoot_id, user_id) DO UPDATE SET user_flags = (scoot_members.user_flags::bigint | 64)::text;
