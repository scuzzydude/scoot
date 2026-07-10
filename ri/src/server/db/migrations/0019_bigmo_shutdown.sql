-- Global outbound-SMS kill switch (see sms/shutdown.ts). Hard-gated to
-- ROOT_USER_ID's own phone number, not a ScootFlags permission.
CREATE TABLE IF NOT EXISTS bigmo_shutdown (
  id            integer PRIMARY KEY,
  active        boolean NOT NULL DEFAULT false,
  activated_by  integer REFERENCES users(id),
  activated_at  timestamptz
);
INSERT INTO bigmo_shutdown (id, active) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sms_shutdown_queue (
  id           serial PRIMARY KEY,
  from_phone   text NOT NULL,
  body         text NOT NULL,
  media_urls   jsonb,
  received_at  timestamptz NOT NULL DEFAULT now()
);
