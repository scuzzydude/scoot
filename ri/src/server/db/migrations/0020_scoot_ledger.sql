-- Phase 5a: Scoot currency ledger, DB-first (see asimov_v2.13 Scoot Primer).
-- Append-only, same contract as pledges/pledge_revocations.

ALTER TABLE scoots ADD COLUMN trustee_id integer REFERENCES users(id);

CREATE TABLE IF NOT EXISTS scoot_transactions (
  id             serial PRIMARY KEY,
  scoot_id       integer NOT NULL REFERENCES scoots(id) ON DELETE CASCADE,
  type           text NOT NULL,
  from_user_id   integer REFERENCES users(id),
  to_user_id     integer NOT NULL REFERENCES users(id),
  amount         integer NOT NULL,
  note           text,
  initiated_by   integer NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  content_hash   text NOT NULL
);

CREATE TABLE IF NOT EXISTS scoot_transaction_responses (
  id             serial PRIMARY KEY,
  transaction_id integer NOT NULL UNIQUE REFERENCES scoot_transactions(id),
  decision       text NOT NULL,
  responded_by   integer NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoot_balances (
  scoot_id    integer NOT NULL REFERENCES scoots(id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance     integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scoot_id, user_id)
);

-- Brandon (user 1) is Scoot(34)'s trustee today.
UPDATE scoots SET trustee_id = 1 WHERE id = 34;
