---
name: project_mail_brevo_activation_pending
description: "Brevo relay live 2026-09-03; only remaining step is Brandon cancelling the Zoho subscription. Delete once he confirms."
metadata:
  type: project
---

**Done 2026-09-03:** Brevo SMTP activated, Postfix relayhost switched to `[smtp-relay.brevo.com]:587`, SPF now `include:spf.brevo.com`, final Zoho→local straggler sync completed (Message-ID dedupe). Nothing on dreamlab depends on Zoho any more.

**Remaining (Brandon's action):** cancel the Zoho Mail subscription. Ask if it's been done; delete this memory when confirmed.

**Resolved 2026-09-03:** the shared mailbox password had been committed in cleartext in `MAIL_MIGRATION_CHECKPOINT.md`. Same day: all three dreamlab mailboxes rotated to distinct random passwords (cleartext kept root-only in `/root/dreamlab-mail-passwords.txt`; Dovecot passwd, `mail_accounts` rows 1+5, and `.env IMAP_PASSWORD` updated), and git history rewritten with `git filter-repo --replace-text` + force-push. (No other checkouts exist — dreamlab is the only clone.) Old commits may linger in GitHub's cache until GitHub support purges them.

Full state: `MAIL_MIGRATION_CHECKPOINT.md`. Related: [[project_mail_client]], [[infra_prod_server]].
