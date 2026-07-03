BEGIN;
SET session_replication_role = replica;
CREATE TEMP TABLE pmap(old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;
INSERT INTO pmap(old_id,new_id) VALUES
 (110,16),(111,18),(112,19),(113,20),(114,21),(115,23),(116,24),(117,26),(118,27),
 (119,28),(120,29),(121,31),(122,32),(123,35),(124,36),(125,37),(126,38),(127,39),
 (128,40),(129,41),(130,42),(131,43),(132,44);
-- disjoint source(110-132)/target(16-44) ranges -> single-phase is collision-free
UPDATE users          u SET id          = p.new_id FROM pmap p WHERE u.id          = p.old_id;
UPDATE chat_rooms     t SET created_by  = p.new_id FROM pmap p WHERE t.created_by  = p.old_id;
UPDATE dm_pairs       t SET user_lo     = p.new_id FROM pmap p WHERE t.user_lo     = p.old_id;
UPDATE dm_pairs       t SET user_hi     = p.new_id FROM pmap p WHERE t.user_hi     = p.old_id;
UPDATE media          t SET uploaded_by = p.new_id FROM pmap p WHERE t.uploaded_by = p.old_id;
UPDATE room_members   t SET user_id     = p.new_id FROM pmap p WHERE t.user_id     = p.old_id;
UPDATE scoot_members  t SET user_id     = p.new_id FROM pmap p WHERE t.user_id     = p.old_id;
UPDATE scoot_sessions t SET updated_by  = p.new_id FROM pmap p WHERE t.updated_by  = p.old_id;
UPDATE sms_state      t SET user_id     = p.new_id FROM pmap p WHERE t.user_id     = p.old_id;
SET session_replication_role = origin;
COMMIT;
