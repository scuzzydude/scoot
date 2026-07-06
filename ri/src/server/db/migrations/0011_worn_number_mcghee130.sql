BEGIN;
-- 1. new field: the reserved jersey a member is awarded to wear
ALTER TABLE scoot_members ADD COLUMN IF NOT EXISTS worn_number smallint;
-- 2. move McGhee 24 -> 130 (regular member slot); 24 becomes an empty reserved seat
SET session_replication_role = replica;
UPDATE users          SET id          = 130 WHERE id          = 24;
UPDATE chat_rooms     SET created_by  = 130 WHERE created_by  = 24;
UPDATE dm_pairs       SET user_lo     = 130 WHERE user_lo     = 24;
UPDATE dm_pairs       SET user_hi     = 130 WHERE user_hi     = 24;
UPDATE media          SET uploaded_by = 130 WHERE uploaded_by = 24;
UPDATE room_members   SET user_id     = 130 WHERE user_id     = 24;
UPDATE scoot_members  SET user_id     = 130 WHERE user_id     = 24;
UPDATE scoot_sessions SET updated_by  = 130 WHERE updated_by  = 24;
UPDATE sms_state      SET user_id     = 130 WHERE user_id     = 24;
SET session_replication_role = origin;
-- 3. McGhee (now 130) wears reserved #24 (LEGEND_NUMBER flag already set)
UPDATE scoot_members SET worn_number = 24 WHERE scoot_id = 34 AND user_id = 130;
-- 4. advance seq past McGhee's explicit id
SELECT setval(pg_get_serial_sequence('users','id'), 131, false);
COMMIT;
