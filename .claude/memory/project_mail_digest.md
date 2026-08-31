---
name: project-mail-digest
description: "Email digest — LLM summarization + critical-info extraction for archived mail, queryable via BigMo (SMS/webchat). Built 2026-08-31."
metadata: 
  node_type: memory
  type: project
  created: 2026-08-31
  originSessionId: cd96f0f9-30dc-43a1-9570-e939a94424ad
  modified: 2026-08-31T16:57:48.310Z
---

**Built 2026-08-31** (commits `ccea0a3`–`1e84754`). Plan at
`.claude/plans/zazzy-petting-marshmallow.md`. Scopes Gmail accounts only
(Dreamlab/Zoho excluded); designed for personal-scale backlog processing on
mdcon's 2,714 archived emails across years 2020–2025.

## Architecture & Implementation

**Provider model override** (`ri/src/server/llm/provider.ts` +
`anthropic.ts`): added `ChatOptions.model` to swap LLM per-call. Default
remains configured `LLM_MODEL` (Sonnet for BigMo replies), but digest job uses
`MAIL_DIGEST_MODEL=claude-haiku-4-5-20251001` (env var, cost-optimized).

**Marketing filter** (`mail/client.ts`, `isLikelyMarketing()`): header-only
fetch (ImapFlow's `headers: ["list-unsubscribe"]`) to detect RFC 2369
mailing lists without downloading bodies — biggest cost lever, enables
skipping the LLM on ~70–80% of archived mail in typical inboxes.

**Schema** (`schema.ts`, `mailDigestEntries` table): mail account FK (cascade),
per-UID summary + critical-info extraction, category flag (marketing|content),
unique(mailAccountId, folder, uid) constraint for idempotence. Created via
hand-written psql on prod (never db:push per [[infra_prod_db_migrations]]).

**Digest job** (`mail/digest.ts`): `processFolder()` iterates UIDs, skips
already-processed via constraint, header-checks marketing, fetches full body
(truncated 3000 chars) for non-marketing, calls Haiku asking for summary +
critical flag + extraction. `parseDigestResponse()` splits the labeled
plain-text format (`SUMMARY: ... / CRITICAL: yes|no / CRITICAL_INFO: ...`),
handles multiline output. `runDigestPass()` finds year folders (^\d{4}$),
processes each sequentially.

**CLI script** (`scripts/mail-digest-run.ts <email>`): lookup, init LLM
provider, trigger runDigestPass. Same pattern as `link-mail-account.ts` +
`mail-archive-by-year.ts`. Npm script: `npm run mail:digest-run <email>`.

**BigMo interface** (`sms/mail-digest-commands.ts` + SMS/webchat wiring):
`resolveMailDigestCommand(userId, trimmed)` — transport-agnostic core, queries
user's digest entries (owner-only, no Leader bypass), returns critical first.
SMS wrapper `tryHandleMailDigestCommand()` slots into `bigmo.ts` handler chain
(after card-commands, before revoke-commands), recognizes phrases like "my
digest", "email digest", "critical emails". Webchat: inline call from
`bot-mentions.ts` (same card-commands pattern), dual-wired identically.

## Known State & Gaps

**Test run (2026-08-31)**: ran digest on full mdcon account (2,714 emails
across 6 year folders). Generated 20 entries before timeout (Haiku is cheap
but LLM rate-limited). Parser initially captured full LLM response as
summary due to newline-handling bug in regex; fixed `parseDigestResponse()`
post-run. Entries cleared, ready for full retry.

**Still unverified**: (1) full backlog pass on mdcon (is the 2700+ email
estimate correct after marketing filter? how many actually hit Haiku?), (2)
BigMo SMS/webchat digest query end-to-end (wired, not yet tested live), (3)
LLM critical-info extraction quality (spot-check a few real "critical: yes"
rows against source mail).

**Deliberate non-goals**: cross-account moves (full feature scope), OneDrive
or cloud-bucket integration (no Graph API client exists), automated recurring
digest pass (v1 is on-demand CLI, background poller is fast-follow).

## Verification Checklist (Next Steps)

- [ ] Run mdcon digest pass on single year folder (2024, smallest) to verify
  parser on real LLM output
- [ ] Check DB: confirm summaries are clean (no embedded format markers),
  critical_info extracts look legitimate (account numbers, codes, etc., not
  hallucinated)
- [ ] Test BigMo SMS: text "my digest" to BigMo, verify concise SMS response
  (critical first, count totals, terse format)
- [ ] Test BigMo webchat: @bigmo my digest, verify richer markdown response
  (full subject lines, summaries side-by-side with critical flags)
- [ ] Optional: full backlog pass once small-folder verification passes. Run
  in background (no foreground timeout) or with progress logging.
