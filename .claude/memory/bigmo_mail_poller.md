---
name: bigmo-mail-poller
description: "BigMo periodically checks an IMAP mailbox (Zoho, thedreamlaboratory.org) and texts Brandon when new mail arrives — first background/scheduled job in this codebase. IMAP_HOST unset = disabled."
metadata: 
  node_type: memory
  type: project
  originSessionId: e915d70f-d9db-403c-8d29-6a6e5004097b
  modified: 2026-08-21T14:02:05.666Z
---

Built 2026-08-21. Brandon: "I want to wire in thedreamlaboratory.org
emails and have BigMo check them periodically and give me a text if
there is new mail."

**Mailbox setup:** Brandon added a `bigmo@thedreamlaboratory.org`
alias that delivers into his existing `brandon@` Zoho mailbox — not a
separate account. IMAP login is therefore his real `brandon@` address
+ an app-specific password (Zoho Mail → Settings → Security → App
Passwords), not his regular login password. Whether he set up a Zoho
filter to route `bigmo@`-addressed mail into its own IMAP folder
(recommended, scopes notifications to mail meant for the bot rather
than his whole inbox) vs. just polling `INBOX` directly — **not yet
confirmed which he chose**; whichever folder, set `IMAP_MAILBOX`
accordingly in `.env`.

**Architecture:** `ri/src/server/mail/poller.ts` — `imapflow` client,
`checkMailOnce()` fetches UIDs newer than `mail_check_state.lastUid`
(new table, one row per mailbox), summarizes up to 3 senders/subjects,
sends via the existing `throttledSend()` queue (same A2P-throttled
path everything else uses) to `ROOT_USER_ID`'s (id=1, "rocketman" —
Brandon's own account) phone, respects `isShutdownActive()` first.
First run for a mailbox just records the baseline UID without
notifying, so flipping this on doesn't text him about the entire
existing backlog. `startMailPoller()` wires a `setInterval` (default
5 min, `MAIL_CHECK_INTERVAL_MS`) into `index.ts`'s startup sequence,
gated on `IMAP_HOST` being set — same optional-feature pattern as
Memory Vault (`MEMORY_VAULT_URL`).

**This is the first scheduled/background job in the Scoot server.**
Confirmed via research before building: no cron library, no
`setInterval`, nothing periodic existed anywhere in `ri/src` — even
the yearly privacy-disclaimer check is reactive (piggybacks on inbound
SMS), not polled. "GYMBOSS" sounds like scheduling infra but isn't —
it's a permission bit for who may edit `scoot_sessions` via SMS
commands, no timer behind it. If another periodic feature comes up
later, `startMailPoller()`'s pattern (plain `setInterval`, gated on an
optional env var, one `try/catch` in `index.ts`) is the precedent to
follow rather than introducing a job-queue library.

**Migration applied directly** (per [[infra_prod_db_migrations]]):
`CREATE TABLE mail_check_state` run via `docker compose exec -T
postgres psql`, not `db:push`. New npm dependency (`imapflow`) needed
an extra step beyond normal bind-mount hot-reload: the app container
has its own `node_modules` named volume, so `npm install` on the host
doesn't propagate — had to `docker compose exec app npm install
imapflow`, then restart the container (tsx watch's process had already
hard-crashed on the missing-module error, `restart` was required, a
file edit alone wouldn't have recovered it).

**Not yet done:** Brandon hasn't added the real `IMAP_USER`/
`IMAP_PASSWORD`/`IMAP_MAILBOX` to `.env` yet (told him to add them
directly rather than paste the password in chat) — feature is
deployed but inert (logs "IMAP_HOST not set, mailbox checking
disabled") until he does. Also touched on BigMo *sending* email:
already possible today via the existing SendGrid integration
(`ri/src/server/email/sendgrid.ts`, already sends OTP from
`brandon@thedreamlaboratory.org`) — no new capability needed there,
separate from this inbound-checking feature.
