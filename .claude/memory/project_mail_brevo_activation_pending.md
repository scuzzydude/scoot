---
name: project_mail_brevo_activation_pending
description: "Reminder from 2026-09-03 on — check whether Brevo activated SMTP, then swap Postfix relay off Zoho, update SPF, final Zoho sync, cancel Zoho"
metadata: 
  node_type: memory
  type: project
  originSessionId: ecda33cf-286c-4828-a502-508e37b5fe68
  modified: 2026-09-02T18:48:04.432Z
---

**Ask Brandon on or after 2026-09-03:** has Brevo activated the SMTP account? (No button in the UI; he had to email contact@brevo.com on 2026-09-02.)

**Why:** self-hosted mail on dreamlab is live for inbound (brandon@, hakeem@, lexi@), but Azure blocks outbound :25 so Postfix relays through Zoho. Brandon does not want to pay for Zoho next year. Brevo relay is fully configured but returned `502 Your SMTP account is not yet activated` on first send.

**How to apply — once activated:**
1. `sudo cp /etc/postfix/sasl_passwd.brevo /etc/postfix/sasl_passwd && sudo postmap /etc/postfix/sasl_passwd`
2. `sudo postconf -e "relayhost = [smtp-relay.brevo.com]:587" "smtp_sender_dependent_authentication = no" && sudo postfix reload`
3. Send from brandon@, hakeem@, lexi@ to scuzzydude@hotmail.com; all three must show `status=sent`.
4. Tell Brandon to edit the Azure `@` TXT SPF to `v=spf1 ip4:13.64.77.78 include:spf.brevo.com -all`.
5. Final straggler IMAP sync Zoho → local for brandon@ and hakeem@ (dedupe by Message-ID; the old /tmp script appends blindly).
6. Then Brandon cancels Zoho. Delete this memory when done.

Full state in repo: `MAIL_MIGRATION_CHECKPOINT.md`. Related: [[project_mail_client]], [[infra_prod_server]].
