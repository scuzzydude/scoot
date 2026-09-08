# Pass 3 — Simulation / Tests

This directory holds test strategy, test run artifacts, and pass/fail reports.

Test source files live co-located with what they test (`ri/src/server/services/*.test.ts`) per software convention. Artifacts and reports from test runs land here.

## Pass 3 Entry Criteria

- Pass 2 (`ri/src/`) must have a working implementation for the feature under test
- Behavioral contract from Pass 1 (`ri/model/`) defines the expected behavior

## Pass 3 Exit Criteria

- All features enumerated in `ri/model/pass1_behavioral_model.md` have at least one test
- All tests pass
- No regressions introduced in adjacent features

## Current Status (reconciled 2026-09-08 against the tree)

Tests are co-located with the code they test, not only under `services/`. 21 files as of
2026-09-08 (`find ri/src -name '*.test.ts'`). Run with `npm test` from the repo root on the
host (note: host-side `DATABASE_URL` points at the **production** database — see
`.claude/memory/infra_prod_db_migrations.md`).

| Area | Tests | Status |
|---|---|---|
| Bot @mention | `services/bot-mentions.test.ts`, `services/bot-mentions.integration.test.ts` | Exist |
| SMS commands / routing | `sms/commands`, `sms/routing`, `sms/routing-v2`, `sms/log`, `sms/media-download` (`.test.ts` / `.integration.test.ts`) | Exist |
| SMS fan-out / disclaimer / oversight / shutdown | `sms/fanout`, `sms/disclaimer`, `sms/oversight`, `sms/shutdown` | Exist |
| Schedule (GYMBOSS) + escalation | `sms/schedule-commands`, `sms/escalation` | Exist |
| Staking / trust graph / revocation | `sms/staking`, `sms/self-stake-commands`, `sms/trust-commands`, `sms/revoke-commands`, `trust/graph`, `trust/catalog`, `trust/revocation`, `trust/self-stake` | Exist |
| Auth | — | Not yet |
| Chat (rooms, WebSocket) | — | Not yet |
| Wallet / Scoot ledger (`scoot/ledger.ts`) | — | Not yet |
| Player cards / card_art pipeline | — | Not yet |
| Mail poller / digest | — | Not yet |
