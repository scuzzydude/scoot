-- Trust graph revocation (Phase 4 continued): a correction EVENT for a pledge,
-- never a mutation of it. At most one per pledge.
CREATE TABLE IF NOT EXISTS pledge_revocations (
  id           serial PRIMARY KEY,
  pledge_id    integer NOT NULL UNIQUE REFERENCES pledges(id),
  revoked_by   integer NOT NULL REFERENCES users(id),
  reason       text NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
