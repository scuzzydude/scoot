BEGIN;
SET session_replication_role = replica;
-- Karen 23 -> 47
UPDATE users          SET id          = 47 WHERE id          = 23;
UPDATE chat_rooms     SET created_by  = 47 WHERE created_by  = 23;
UPDATE dm_pairs       SET user_lo     = 47 WHERE user_lo     = 23;
UPDATE dm_pairs       SET user_hi     = 47 WHERE user_hi     = 23;
UPDATE media          SET uploaded_by = 47 WHERE uploaded_by = 23;
UPDATE room_members   SET user_id     = 47 WHERE user_id     = 23;
UPDATE scoot_members  SET user_id     = 47 WHERE user_id     = 23;
UPDATE scoot_sessions SET updated_by  = 47 WHERE updated_by  = 23;
UPDATE sms_state      SET user_id     = 47 WHERE user_id     = 23;
-- Kevin 32 -> 48
UPDATE users          SET id          = 48 WHERE id          = 32;
UPDATE chat_rooms     SET created_by  = 48 WHERE created_by  = 32;
UPDATE dm_pairs       SET user_lo     = 48 WHERE user_lo     = 32;
UPDATE dm_pairs       SET user_hi     = 48 WHERE user_hi     = 32;
UPDATE media          SET uploaded_by = 48 WHERE uploaded_by = 32;
UPDATE room_members   SET user_id     = 48 WHERE user_id     = 32;
UPDATE scoot_members  SET user_id     = 48 WHERE user_id     = 32;
UPDATE scoot_sessions SET updated_by  = 48 WHERE updated_by  = 32;
UPDATE sms_state      SET user_id     = 48 WHERE user_id     = 32;
SET session_replication_role = origin;
INSERT INTO users (id, username, display_name, flags) VALUES
  (23,'calvinmurphy','Calvin Murphy',0),
  (32,'shaq','Shaquille ONeal',0);
COMMIT;
