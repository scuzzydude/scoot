-- §6 escalation: GYMBOSS conflict verification poll.
CREATE TABLE IF NOT EXISTS schedule_verifications (
  id            serial PRIMARY KEY,
  scoot_id      integer NOT NULL REFERENCES scoots(id) ON DELETE CASCADE,
  session_id    integer NOT NULL REFERENCES scoot_sessions(id) ON DELETE CASCADE,
  requested_by  integer NOT NULL REFERENCES users(id),
  action        text NOT NULL,
  question      text NOT NULL,
  status        text NOT NULL DEFAULT 'open',
  resolved_by   integer REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS schedule_verifications_open_idx ON schedule_verifications (scoot_id) WHERE status = 'open';
