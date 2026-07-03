-- Fonde user-id reservation remap (arch/sms-rooms — Dream Laboratory).
-- Non-destructive except WIPE MESSAGES. Reserves jersey #s for '94-'95 Rockets
-- legends, family at 1-5, curated Fonde fills, everyone else parked at 101+.
BEGIN;

-- WIPE MESSAGES (test/seed chatter) + dependent sms_deliveries (empty)
DELETE FROM sms_deliveries;
DELETE FROM messages;

-- Disable FK/trigger enforcement for the id shuffle (superuser).
SET session_replication_role = replica;

CREATE TEMP TABLE remap(old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;
INSERT INTO remap(old_id, new_id) VALUES
  -- family + curated Fonde fills
  (12,1),(14,2),(15,3),(16,4),(17,5),(18,6),(19,9),(13,12),(30,13),(36,14),(45,15),
  -- bots to system band
  (2,900),(3,901),
  -- everyone else parked in holding band (ascending old id -> 101+)
  (1,101),(4,102),(5,103),(6,104),(7,105),(8,106),(9,107),(10,108),(11,109),
  (20,110),(21,111),(22,112),(23,113),(24,114),(25,115),(26,116),(27,117),(28,118),
  (29,119),(31,120),(32,121),(33,122),(34,123),(35,124),(37,125),(38,126),(39,127),
  (40,128),(41,129),(42,130),(43,131),(44,132);

-- Phase A: offset every live user id + child ref by +100000 (disjoint from targets)
UPDATE users          SET id = id + 100000;
UPDATE bots           SET user_id = user_id + 100000;
UPDATE chat_rooms     SET created_by = created_by + 100000;
UPDATE dm_pairs       SET user_lo = user_lo + 100000, user_hi = user_hi + 100000;
UPDATE media          SET uploaded_by = uploaded_by + 100000;
UPDATE room_members   SET user_id = user_id + 100000;
UPDATE scoot_members  SET user_id = user_id + 100000;
UPDATE scoot_sessions SET updated_by = updated_by + 100000 WHERE updated_by IS NOT NULL;
UPDATE sms_state      SET user_id = user_id + 100000;

-- Phase B: map offset -> final id
UPDATE users          u SET id          = r.new_id FROM remap r WHERE u.id          = r.old_id + 100000;
UPDATE bots           t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;
UPDATE chat_rooms     t SET created_by  = r.new_id FROM remap r WHERE t.created_by  = r.old_id + 100000;
UPDATE dm_pairs       t SET user_lo     = r.new_id FROM remap r WHERE t.user_lo     = r.old_id + 100000;
UPDATE dm_pairs       t SET user_hi     = r.new_id FROM remap r WHERE t.user_hi     = r.old_id + 100000;
UPDATE media          t SET uploaded_by = r.new_id FROM remap r WHERE t.uploaded_by = r.old_id + 100000;
UPDATE room_members   t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;
UPDATE scoot_members  t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;
UPDATE scoot_sessions t SET updated_by  = r.new_id FROM remap r WHERE t.updated_by  = r.old_id + 100000;
UPDATE sms_state      t SET user_id     = r.new_id FROM remap r WHERE t.user_id     = r.old_id + 100000;

SET session_replication_role = origin;

-- Normalize dm_pairs so user_lo < user_hi (bigmo 3->901 flipped the pair)
UPDATE dm_pairs SET user_lo = LEAST(user_lo, user_hi), user_hi = GREATEST(user_lo, user_hi);

-- Honorary legend rows (jersey # = id) + Nick Gradney into the freed ids
INSERT INTO users (id, username, display_name, flags) VALUES
  (7,'carlherrera','Carl Herrera',0),
  (10,'samcassell','Sam Cassell',0),
  (11,'vernonmaxwell','Vernon Maxwell',0),
  (17,'marioelie','Mario Elie',0),
  (22,'clydedrexler','Clyde Drexler',0),
  (25,'roberthorry','Robert Horry',0),
  (30,'kennysmith','Kenny Smith',0),
  (33,'otisthorpe','Otis Thorpe',0),
  (34,'hakeemolajuwon','Hakeem Olajuwon',0),
  (50,'mattbullard','Matt Bullard',0),
  (8,'nickgradney','Nick Gradney',0);

-- Future auto-signups start at 200 (never squat a curated/jersey/holding id)
SELECT setval(pg_get_serial_sequence('users','id'), 200, false);

COMMIT;
