---
name: scoot_currency_ledger
description: "Phase 5a DB-first scoot(X) currency rules — trustee-only mint, bilateral send, no C bridge yet"
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-07-28T16:42:40.058Z
---

Decided 2026-07-28, implemented in `ri/src/server/scoot/ledger.ts` + `routes/scoots.ts` (`/api/v1/scoots/:id/scoot/*`), schema in `db/schema.ts` (`scoot_transactions`, `scoot_transaction_responses`, `scoot_balances`, `scoots.trustee_id`).

**Brandon's rules for how scoot(X) currency actually works, grounded in the asimov book's Scoot Primer:**
1. Rules are per-Scoot, not global — each Scoot(X) can define its own mint/distribute policy. Scoot(34)'s current rule: **mint, then distribute.**
2. A send **must be accepted** by the recipient before balance moves — matches the book's "responsibility domain" (both parties validate). Not a unilateral bank-transfer model.
3. Real use case at Fonde (Scoot 34): pickup games, shared-ticket sports events — scoot is used for buy-ins/credits among Brothers, not abstract value storage.
4. **Mint is trustee-only.** Brandon (user id 1, `rocketman`) is the trustee of Scoot(34) — `scoots.trustee_id = 1` for scoot 34. This is a single FK column, not a table (the book describes a trustee as one person; revisit only if a Scoot ever needs a multi-trustee body).

**Design collapse:** "distribute" is not a third transaction type — it's just a `send` *from* the trustee, reusing the same bilateral-accept mechanism as any peer-to-peer send. Only two primitives: `mint` (trustee-only, unilateral, immediate) and `send` (proposal + separate accept/reject/cancel response row, balance only moves on accept).

**Append-only contract**, same pattern as `pledges`/`pledge_revocations` (see [[social_graph_staking]]): a transaction row is never UPDATEd; its outcome is a separate row in `scoot_transaction_responses`. Each transaction carries a sha256 `contentHash` so Phase 5b's `scootd` can later replay `scoot_transactions` as real chain history without ambiguity.

**Explicitly NOT built yet (deferred, not forgotten):**
- No escrow/fund-reservation at proposal time — a sender can propose more than their balance; it only fails at accept time (`insufficient-funds`). Fine for current low-volume, in-person use; revisit if it ever causes real confusion.
- No dedicated "event/ticket" concept — buy-ins are just a `send` with a `note` field. A real events table is a YAGNI call for now.
- The OLD singular `/api/v1/scoot` stub (fake `SCT1...` addresses) and `wallet-page.tsx` are untouched — still fake data. Wiring the real ledger into that UI is separate follow-up work.
- Phase 5b (`scootd` C command set, `ri/src/core/`, see [[project_plan]]) builds against this exact schema once real usage proves the rules out.

Verified end-to-end against real prod DB 2026-07-28 (trustee gate, bilateral accept, wrong-party rejection, overdraft rejection, cancel) then cleaned up — test data did not persist in Scoot(34)'s real transaction history.
