-- RIM criterion 3.3 (append-only history), 2026-09-15.
--
-- `sms_state.pending` is ONE slot per user, upserted. A second deferred thing for the
-- same member silently destroyed the first, so the system could not answer "what was
-- deferred and never resumed" — the question RIM_architecture_v0.8 §3.3 names as the
-- disqualifier, citing this exact column.
--
-- The fix is not to delete the snapshot. §3.3's own narrowing says "a derived snapshot is
-- required, not forbidden ... the disqualifier is about which one is THE TRUTH". So the
-- log below becomes the truth and `sms_state.pending` stays as the fast current-slot read,
-- derived from it.
CREATE TABLE IF NOT EXISTS sms_pending_events (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- defer     — a flow was parked
  -- advance   — the same flow moved to a later step
  -- resume    — the flow ended and the slot was cleared
  -- displaced — a DIFFERENT flow overwrote it. This row is the loss that used to be silent.
  event      text NOT NULL,
  kind       text,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_pending_events_user_idx ON sms_pending_events (user_id, id DESC);
CREATE INDEX IF NOT EXISTS sms_pending_events_event_idx ON sms_pending_events (event, id DESC);
