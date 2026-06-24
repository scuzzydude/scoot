-- 0001_sms_rooms.sql — Phase 1 data foundation for the SMS<->rooms framework.
-- See arch/sms-rooms.md. ADDITIVE ONLY (no drops). Apply on prod via psql in the
-- postgres container — NEVER db:push (it wants to drop the connect-pg-simple
-- `session` table). Idempotent: safe to re-run.

BEGIN;

-- ── Column additions ─────────────────────────────────────────────────────────
ALTER TABLE users        ADD COLUMN IF NOT EXISTS privacy_disclaimer_at timestamptz;
ALTER TABLE chat_rooms   ADD COLUMN IF NOT EXISTS sms_mirror  boolean NOT NULL DEFAULT false;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false;

-- ── scoot_sessions — authoritative schedule (GYMBOSS-only) ───────────────────
CREATE TABLE IF NOT EXISTS scoot_sessions (
  id         serial PRIMARY KEY,
  scoot_id   integer NOT NULL REFERENCES scoots(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  location   text,
  status     text NOT NULL DEFAULT 'tentative',  -- tentative | confirmed | cancelled
  note       text,
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scoot_sessions_scoot_starts_idx
  ON scoot_sessions (scoot_id, starts_at);

-- messages.session_id — optional tag of a field note to a session
ALTER TABLE messages ADD COLUMN IF NOT EXISTS session_id integer
  REFERENCES scoot_sessions(id) ON DELETE SET NULL;

-- ── sms_state — per-user routing state ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_state (
  user_id        integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_room_id integer REFERENCES chat_rooms(id),
  pending        jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── sms_deliveries — per-user SMS log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_deliveries (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id integer REFERENCES messages(id) ON DELETE SET NULL,
  room_id    integer REFERENCES chat_rooms(id),
  direction  text NOT NULL,  -- 'in' | 'out'
  body       text NOT NULL,
  twilio_sid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_deliveries_user_created_idx
  ON sms_deliveries (user_id, created_at);

COMMIT;
