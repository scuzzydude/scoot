---
name: project_mail_brevo_activation_pending
description: "Brevo relay live 2026-09-03; only remaining step is Brandon cancelling the Zoho subscription. Delete once he confirms."
metadata:
  type: project
---

**Done 2026-09-03:** Brevo SMTP activated, Postfix relayhost switched to `[smtp-relay.brevo.com]:587`, SPF now `include:spf.brevo.com`, final Zoho→local straggler sync completed (Message-ID dedupe). Nothing on dreamlab depends on Zoho any more.

**Remaining (Brandon's action):** cancel the Zoho Mail subscription. Ask if it's been done; delete this memory when confirmed.

**Security note raised 2026-09-03:** the shared Dovecot mailbox password was committed in cleartext in `MAIL_MIGRATION_CHECKPOINT.md` (commits `96391f0`, `684c7de`) in the public repo. Scrubbed from HEAD, but git history still has it — rotation recommended, see [[project_mail_client]] for where the app stores mailbox creds.

Full state: `MAIL_MIGRATION_CHECKPOINT.md`. Related: [[project_mail_client]], [[infra_prod_server]].
