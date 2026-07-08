-- Trust graph ledger hardening (Phase 4 continued): pledges gets an
-- append-only-event contract + a per-row content hash, so Phase 5's scootd can
-- later ingest this table as a chain genesis without ambiguity about what a
-- pledge event "is". Table is empty in prod (0 rows) — no backfill needed.
ALTER TABLE pledges ADD COLUMN content_hash text NOT NULL;
