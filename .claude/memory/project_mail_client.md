---
name: project-mail-client
description: "Per-user multi-account IMAP mail client + toggleable desktop-wide layout (first in this app) — read/reply/compose, inline attachment preview, dreamlab-vs-personal linking gate, Chat+Mail in 3-pane desktop mode. Built 2026-08-31."
metadata:
  node_type: memory
  type: project
  originSessionId: cd96f0f9-30dc-43a1-9570-e939a94424ad
  modified: 2026-08-31T15:10:00.000Z
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

**Update 2026-08-31, same day, commit `ef74690`:** rather than making
Brandon re-type app passwords BigMo's own poller already has, added
`scripts/seed-mail-accounts.ts` (`npm run seed:mail-accounts`, idempotent
— reads `IMAP_*`/`GMAIL_IMAP_*` env vars, skips anything already linked
or unconfigured) and ran it once against prod. Both dreamlab accounts
verified live against real IMAP servers (not just DB rows) — Zoho
returned 11 folders/11 unread, Gmail returned 8 folders/56 messages in
INBOX. Real gotcha hit again: `npm install mailparser` on the host
didn't reach the running container (`node_modules` is a named Docker
volume, not bind-mounted) — had to `docker exec scoot-app-1 npm
install` separately before the container's `tsx watch` stopped
erroring.

**Update 2026-08-31, same day, commit `c57a906`: desktop-wide layout
shipped** (plan phases 6-7, the part deferred from the first pass).
New `hooks/use-layout-mode.ts` (localStorage `scoot:layoutMode`,
one-time `matchMedia` default, explicit toggle always wins after) and
`components/layout/desktop-shell.tsx` — the first responsive/multi-pane
layout this client has ever had (confirmed zero prior precedent during
planning). Toggle lives as a Monitor/Smartphone icon button in both
`header.tsx` (mobile) and `DesktopShell`'s own topbar.

Slot architecture: `useDesktopSlots({sidebar, rightPanel})` — a page
registers custom content via a React context `DesktopShell` provides;
un-opted-in pages (wallet, bot, sms-log, oversight, staking) fall back
automatically to a default nav sidebar (`DefaultNavSidebar`, built on a
new shared `hooks/use-nav-items.ts` extracted from `bottom-nav.tsx` so
the mobile and desktop nav lists can't drift apart) and no right panel
— exactly "every other page renders unchanged inside main" from the
plan, with zero changes needed to those page files.

Chat docks `RoomList` in the sidebar and shows thread+input side-by-side
(no more list/thread view-swap in desktop mode); mobile path re-verified
unchanged. Mail is the flagship 3/4-pane case: `mail-sidebar.tsx`
(new, accounts+folders) in the sidebar, message list + reading pane
split inside `main`, and attachment preview slides into the right panel
via a shared `AttachmentPreviewBody` extracted out of the mobile
Dialog-based preview so neither mode duplicates the image/PDF-preview
logic.

**Still NOT done:** Brandon linking his personal (non-dreamlab) Gmail
and Hotmail accounts through the UI and testing read/reply/attachments
against them live — the dreamlab accounts were verified server-side via
a script, but nobody has yet exercised the actual browser UI end to
end; docx inline preview (still download-only fallback); a login-flow
smoke test was attempted via curl but this app's auth is OTP-based
(`/api/v1/auth/login/request` + `/verify`), not username/password, so
it wasn't practical to script — real verification is Brandon using it
live in his own browser session, both layout modes.
