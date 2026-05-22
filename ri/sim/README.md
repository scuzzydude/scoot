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

## Current Status

| Area | Tests | Status |
|---|---|---|
| Bot @mention | `ri/src/server/services/bot-mentions.test.ts` | Exists |
| Bot mention integration | `ri/src/server/services/bot-mentions.integration.test.ts` | Exists |
| Auth | — | Not yet |
| Chat | — | Not yet |
| Wallet | — | Not yet |
| Staking | — | Not yet |
