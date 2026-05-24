---
name: Revised build plan — DB-first, scootchain deferred, staking is core
description: Priority order: chat, staking ritual, Scoot token (Postgres-direct), scootchain integration later
type: project
originSessionId: fc4abb98-a71e-4272-ab69-d327858311ed
---
Scootchain (the C blockchain daemon) is the long-term goal but is NOT a prerequisite for a working app. Everything runs from Postgres directly until the chain is ready.

## Priority order

1. **Chat foundation** — rooms, messages, live WebSocket delivery (DONE — works end to end).
2. **Native chat UI** ← NEXT — Replace RC iframe in `chat-page.tsx` with a real Scoot chat UI (room list left, message thread right, WebSocket live). Backend routes and WS are fully built in `chat.ts`. RC iframe decision: RC was dropped as a UI layer — it had a separate user system with no SSO, iframe broke on LAN access. RC containers may stay for BigMo webhook only.
3. **Chat polish** — read receipts + unread counts, image attachments, after native UI is in place.
4. **Staking ritual (pledges)** — the in-person QR + code + selfie ceremony. See `social_graph_staking.md` for the full flow. This unlocks identity-aware features and is a prerequisite for stake-gated chat/wallet behavior.
5. **Scoot token** — balances, send/receive, transaction history, Postgres via Drizzle (no C daemon, no bridge yet). Likely tied to staking (Scoot as stake collateral, slashing on revocation).
6. **Room privacy / staking-gated chat** — visibility and DM rules expressed as graph predicates against the staking graph. Comes after both staking and token exist.
7. **Scootchain integration** — future phase; existing DB transactions and pledges get committed to the chain when ready.

## Why this order

- Chat works today and the user can use it. Read receipts/DMs/images are pure additive UX and don't depend on identity.
- Staking is the core identity primitive of the platform — every feature that's "user-to-user trust" depends on it. Build it before designing the trust-dependent features.
- Token comes after staking so the staking ↔ wallet relationship (collateral, slashing) is designed once, not twice.
- Room privacy is deferred until after staking + token because its design changes radically depending on what graph queries are available.
- Scootchain is last because the DB is the source of truth and will feed the chain later.

## Practical implications

- Wallet endpoints will use Drizzle directly, not the C bridge.
- Schema additions to plan for: `pledges` (staker_id, stakee_id, selfie_url, created_at, revoked_at), `pledge_codes` (one-time codes for the ritual), `wallets` and `transactions` later.
- Pledge selfies are private-to-staker by default (the selfie is the staker's memory aid for recognizing returning users — see `social_graph_staking.md` for full reasoning). Storage path needs access control, not just a different bucket.
- The C bridge and scootd daemon are deferred until chat, staking, and token are solid.
