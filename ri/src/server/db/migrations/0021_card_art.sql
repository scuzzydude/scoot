-- Card art versions, content-addressed by sha256 so a member can submit any
-- number of source photos and each photo can yield any number of renders.
-- Nothing here is ever overwritten: a new photo or render is a new row/file.
-- Files live at MEDIA_DIR/card-art/<hash>.<ext>; the host-side cold-sync
-- timer (scripts/card-art-cold-sync.sh) mirrors them to Azure Blob and
-- fills cold_path once they are safely there.

CREATE TABLE IF NOT EXISTS card_art (
  id           serial PRIMARY KEY,
  hash         text NOT NULL UNIQUE,                 -- sha256 hex of the file bytes
  kind         text NOT NULL,                        -- 'source' (member photo) | 'render' (pipeline output)
  scoot_id     integer NOT NULL REFERENCES scoots(id) ON DELETE CASCADE,
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_serial  text REFERENCES player_cards(serial), -- the member's active card at submit time, if any
  parent_hash  text REFERENCES card_art(hash),       -- render -> the source photo it came from
  media_url    text NOT NULL,                        -- '/media/card-art/<hash>.<ext>'
  cold_path    text,                                 -- rclone path in cold storage once synced
  mime         text NOT NULL,
  bytes        integer NOT NULL,
  origin       text NOT NULL,                        -- 'sms' | 'web' | 'pipeline'
  status       text NOT NULL DEFAULT 'received',     -- received | rendering | rendered | approved | rejected
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- seed, prompt, stage notes, twilio sid, ...
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_art_user_idx ON card_art(scoot_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_art_parent_idx ON card_art(parent_hash);
