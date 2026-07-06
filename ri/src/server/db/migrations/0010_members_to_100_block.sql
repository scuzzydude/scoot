-- Renumber regular Fonde members to the 100-block; reserved 1-99 stays for
-- family + legend/patron jersey seats (McGhee 24 left untouched pending design).
BEGIN;
SET session_replication_role = replica;
CREATE TEMP TABLE remap(old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;
INSERT INTO remap(old_id, new_id)
  SELECT id, 100 + (row_number() OVER (ORDER BY id) - 1)::int
  FROM users
  WHERE id BETWEEN 6 AND 99
    AND id NOT IN (7,10,11,13,17,22,23,24,25,30,32,33,34,45,50);
INSERT INTO remap(old_id, new_id)
  SELECT id, 902 + (row_number() OVER (ORDER BY id) - 1)::int
  FROM users WHERE id BETWEEN 101 AND 109;

-- Phase A: offset every remapped id + child ref by +100000 (disjoint from targets)
UPDATE users          SET id          = id + 100000          WHERE id          IN (SELECT old_id FROM remap);
UPDATE chat_rooms     SET created_by  = created_by + 100000  WHERE created_by  IN (SELECT old_id FROM remap);
UPDATE dm_pairs       SET user_lo     = user_lo + 100000     WHERE user_lo     IN (SELECT old_id FROM remap);
UPDATE dm_pairs       SET user_hi     = user_hi + 100000     WHERE user_hi     IN (SELECT old_id FROM remap);
UPDATE media          SET uploaded_by = uploaded_by + 100000 WHERE uploaded_by IN (SELECT old_id FROM remap);
UPDATE room_members   SET user_id     = user_id + 100000     WHERE user_id     IN (SELECT old_id FROM remap);
UPDATE scoot_members  SET user_id     = user_id + 100000     WHERE user_id     IN (SELECT old_id FROM remap);
UPDATE scoot_sessions SET updated_by  = updated_by + 100000  WHERE updated_by  IN (SELECT old_id FROM remap);
UPDATE sms_state      SET user_id     = user_id + 100000     WHERE user_id     IN (SELECT old_id FROM remap);

-- Phase B: offset -> final id
UPDATE users          u SET id          = r.new_id FROM remap r WHERE u.id          = r.old_id + 100000;
UPDATE chat_rooms     t SET created_by  = r.new_id FROM remap r WHERE t.created_by  = r.old_id + 100000;
UPDATE dm_pairs       t SET user_lo     = r.new_id FROM remap r WHERE t.user_lo     = r.old_id + 100000;
UPDATE dm_pairs       t SET user_hi     = r.new_id FROM remap r WHERE t.user_hi     = r.old_id + 100000;
UPDATE media          t SET uploaded_by = r.new_id FROM remap r WHERE t.uploaded_by = r.old_id + 100000;
UPDATE room_members   t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;
UPDATE scoot_members  t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;
UPDATE scoot_sessions t SET updated_by  = r.new_id FROM remap r WHERE t.updated_by  = r.old_id + 100000;
UPDATE sms_state      t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;

SET session_replication_role = origin;
-- new auto-registered members continue the 100-block
SELECT setval(pg_get_serial_sequence('users','id'), 130, false);
COMMIT;
