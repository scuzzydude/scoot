---
name: bigmo-mail-poller
description: "BigMo periodically checks an IMAP mailbox (Zoho, thedreamlaboratory.org) and texts Brandon when new mail arrives — first background/scheduled job in this codebase. IMAP_HOST unset = disabled."
metadata: 
  node_type: memory
  type: project
  originSessionId: e915d70f-d9db-403c-8d29-6a6e5004097b
  modified: 2026-08-24T00:00:00.000Z
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

**2026-08-24 update — fully working, verified end-to-end.** IMAP
creds were added; poller confirmed connecting to `imappro.zoho.com`
and picking up new UIDs. Outbound send was swapped from SendGrid to
plain SMTP on this same Zoho mailbox — SendGrid's free plan turned out
to have 0 allotted credits (not a daily quota, a dead account),
confirmed via `GET /v3/user/credits`. `ri/src/server/email/sendgrid.ts`
deleted, replaced by `ri/src/server/email/smtp.ts` (nodemailer,
`smtppro.zoho.com:465`, reuses `IMAP_USER`/`IMAP_PASSWORD` — same
account, so no new secret). Full send→reply→poll→SMS loop tested live
(sent test mail, replied from scuzzydude@hotmail.com, forced a poll,
got a real text back).

**Gotcha worth remembering:** `docker compose restart app` does NOT
reread `env_file` — it restarts the container with whatever env it
was *created* with. Editing `.env` requires `docker compose -f
ri/physical/docker-compose.yml up -d app` (recreate) for new/changed
vars to actually reach the process. Verified by checking
`/proc/1/environ` inside the container — `restart` left new vars
absent, `up -d` picked them up. Also: `docker compose exec app <cmd>`
does not inherit the container's env_file-derived environment either
(a fresh exec shell only gets Dockerfile-baked ENV) — pass `-e VAR=val`
explicitly on the exec command, or check `/proc/1/environ` to see what
the real running process actually has.
