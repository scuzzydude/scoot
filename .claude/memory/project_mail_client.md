---
name: project-mail-client
description: "Per-user multi-account IMAP mail client built into Scoot — read/reply/compose, inline attachment preview, dreamlab-vs-personal linking permission gate. Built 2026-08-31, mobile UI only so far."
metadata:
  node_type: memory
  type: project
  originSessionId: cd96f0f9-30dc-43a1-9570-e939a94424ad
  modified: 2026-08-31T14:15:00.000Z
---

Built 2026-08-31 (commit `96026bb`), plan at
`.claude/plans/zazzy-petting-marshmallow.md`. Brandon wanted to check his
dreamlab + personal Gmail + Hotmail accounts from inside Scoot, plus a
desktop-wide layout mode — scoped via Plan Mode, then a live clickable
mockup published to `fairchildlabs.org/mail-desktop-mockup/` for visual
sign-off before real implementation (per
[[feedback_prefer_server_hosting]], not a Claude Artifact). Mockup used
the real embedded Scoot logo (`white_on_transparent_scoot.png` as a data
URI) after Brandon's one correction ("use the logo, not say scoot").

**Shipped so far: the mail client, mobile UI only.** The desktop 3-pane
layout (phases 6-7 of the plan) is a separate, not-yet-done follow-up —
Brandon said "I want to start using it today," so this pass prioritized a
working read+reply+compose client over the layout work.

**Architecture, live IMAP fetch, no local mail store:** one new table,
`mailAccounts` (`ri/src/server/db/schema.ts`) — per-user, not
Scoot-scoped (unlike `[[project_card_link_sms_webchat|cardLinks]]`, an
email account isn't tied to Scoot membership). No message/thread/
attachment tables — `mail/client.ts` (ImapFlow) fetches folders/messages/
bodies live per request; IMAP already is the store. Deliberate v1 cut for
a personal-scale tool, revisit if usage ever grows.

**New capability: encryption at rest.** `lib/crypto.ts` — AES-256-GCM via
Node's built-in `crypto`, keyed by a new `ENCRYPTION_KEY` env var
(generated with `openssl rand -base64 32`, round-trip verified live in
the container). Confirmed at plan time this genuinely didn't exist
anywhere in the codebase before (only bcrypt/sha256 one-way hashing). If
the key is ever lost/rotated, affected accounts get `needsReauth = true`
via a dedicated `MailDecryptionError` (thrown by `mail/client.ts` and
`mail/smtp-send.ts`, caught in `routes/mail.ts`'s `handleMailError`) —
distinct from a generic IMAP/network failure, so reauth isn't triggered
on every transient hiccup.

**Permission gate:** `mail/domain-policy.ts` (`isDreamlabAddress` —
thedreamlaboratory.org, fairchildlabs.org, fonde.brotherhood@gmail.com)
+ `mail/permissions.ts` (`userIsLeaderAnywhere`, reusing the exact
`userHasScootFlag`/`userIsLeader` pattern from `sms/oversight.ts` rather
than inventing a new style). Enforced in `POST /api/v1/mail/accounts`:
dreamlab addresses linkable by any member, anything else needs Leader.
Client mirrors this live in `link-account-dialog.tsx` (calls
`GET /permissions`) so the gate explains itself instead of surprising
the user with a 403.

**Attachments:** inline preview shipped for images (`<img>`) and PDFs
(native `<embed>`) via `attachment-preview-dialog.tsx`; docx/mammoth
inline preview (both already unused deps in package.json before this)
was cut from this pass for time — falls back to download-only for now,
a known, flagged gap, not silently missing.

**Reply/compose + Sent-folder consistency:** `mail/smtp-send.ts` builds
the raw MIME message once via nodemailer's internal `MailComposer` (not
`@types/nodemailer`'s public surface — imported from
`nodemailer/lib/mail-composer/index.js` directly, typechecks fine
despite no explicit `@types` entry) so the exact same bytes both go out
over SMTP and get appended into the account's own Sent folder via
ImapFlow — avoids composing twice and any drift between what was sent
and what Sent shows. Port 587 (Outlook/Office365) needed
`requireTLS: true` added explicitly, not just `secure: false`, so
STARTTLS isn't left opportunistic on a provider that offers it.

**Verified so far:** schema migration applied by hand on prod (never
`db:push`, per [[infra_prod_db_migrations]]); full server+client
typecheck clean; `mailparser` had to be installed both on the host AND
separately inside the running container (`docker exec scoot-app-1 npm
install ...`) since `node_modules` is a named Docker volume, not
bind-mounted from the host — a real gotcha worth remembering next time a
new npm dependency is added while the container's already running.
Container recreated (`docker compose up -d app`) for the new env vars to
take effect, matching the same gotcha already documented in
[[bigmo_mail_poller]] and [[project_card_link_sms_webchat]] — now hit a
third time on this project.

**NOT yet done:** Brandon linking his real accounts and testing
read/reply/attachments against them live (the actual meaningful
verification, per the plan — everything above is code-level/typecheck
verification only); docx inline preview; the desktop-wide layout mode
(plan phases 6-7); a login-flow smoke test was attempted via curl but
this app's auth is OTP-based (`/api/v1/auth/login/request` +
`/verify`), not username/password, so it wasn't practical to script —
skipped in favor of Brandon testing live in his own browser session.
