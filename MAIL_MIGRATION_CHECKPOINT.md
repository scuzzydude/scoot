# Email Migration — Phase 2 Checkpoint

**Date:** 2026-09-02 13:54 UTC  
**Status:** Phase 2 Complete ✅  
**Next Step:** Email backup from Zoho IMAP

---

## Completed Tasks

### Phase 2a: Dovecot Configuration ✅
- Protocols enabled: IMAP on ports 143 (unencrypted) & 993 (IMAPS/SSL)
- Mail storage: Maildir format at `/var/lib/mail/%u`
- Authentication: passwd-file with SHA512-CRYPT hashes
- SSL/TLS: Let's Encrypt certificates configured
- User lookup: Working (UID 8, GID 8 — mail system user)

**Packages installed:**
- dovecot-core
- dovecot-imapd
- dovecot-pop3d

### Phase 2b: Postfix Configuration ✅
- Hostname: `mail.thedreamlaboratory.org`
- Domain: `thedreamlaboratory.org`
- SMTP listening: Port 25 (both IPv4 & IPv6)
- Virtual mailbox routing: Configured for `brandon@thedreamlaboratory.org`
- Virtual mailbox location: `/var/lib/mail/brandon@thedreamlaboratory.org/`

**Config changes:**
- `/etc/postfix/main.cf` — myhostname, mydomain, virtual_* settings
- `/etc/postfix/virtual_mailboxes` — user to maildir mapping

### Phase 2c: IMAP Connectivity Verified ✅
**Test results:**
```
✓ IMAPS handshake & capability negotiation
✓ User login (brandon@thedreamlaboratory.org with temp123)
✓ LIST mailboxes (shows INBOX)
✓ SELECT INBOX (READ-WRITE ready)
✓ Full RFC compliance in use flags & UIDVALIDITY
```

**Mail directory structure:**
```
/var/lib/mail/brandon@thedreamlaboratory.org/
├── cur/     (current messages)
├── new/     (new messages)
└── tmp/     (temporary files)
```

---

## Credentials

| Account | Password | Status | Notes |
|---------|----------|--------|-------|
| brandon@thedreamlaboratory.org | ***REMOVED*** | ✅ Active | Dovecot configured, 64 msgs backed up |
| hakeem@thedreamlaboratory.org | ***REMOVED*** | ✅ Active | Dovecot ready, awaiting IMAP enable in Zoho |

| Item | Value | Notes |
|------|-------|-------|
| Dovecot passwd file | `/etc/dovecot/passwd` | SHA512-CRYPT, readable by dovecot |
| IMAP host | `localhost` or `thedreamlaboratory.org` | Ports: 143 (plain), 993 (SSL) |
| SMTP host | `localhost` / `dreamlab.thedreamlaboratory.org` | Port: 25 (MTA-to-MTA), 465 (submissions, implicit TLS + SASL), 587 (submission, STARTTLS + SASL via Dovecot socket `/var/spool/postfix/private/auth`, PLAIN/LOGIN) |
| SSL cert | `/etc/letsencrypt/live/thedreamlaboratory.org/` | Via Let's Encrypt |
| DKIM private key | `/etc/postfix/dkim_private.pem` | Generated for mail signing |

### Mail client settings (Outlook / iOS / Thunderbird)
- IMAP: `thedreamlaboratory.org` :993 SSL/TLS, user = full email, normal password auth
- SMTP: `thedreamlaboratory.org` :587 STARTTLS, auth required, same creds
- **Do NOT enable SPA** (Outlook "Secure Password Authentication" = NTLM, unsupported)
- 2026-09-02: `mail` A record live; LE cert expanded to apex + www + mail (expires 2026-12-01,
  `renew_hook = systemctl reload apache2 dovecot postfix`). `mail.thedreamlaboratory.org` and the apex both work as server name.

### Outbound relay (interim) — Azure blocks outbound :25
Azure pay-as-you-go VMs can't reach any MX on port 25 (verified 2026-09-02: gmail + hotmail time out; 587 open).
Postfix therefore relays through Zoho: `relayhost = [smtppro.zoho.com]:587`, per-sender SASL creds in
`/etc/postfix/sasl_passwd` (brandon@ and hakeem@ each auth as themselves — Zoho rejects From/auth mismatch).
**This keeps a Zoho dependency.** Replace by either an Azure support ticket ("remove SMTP :25 restriction")
or a transactional relay (Brevo/SendGrid) — just change `relayhost` + `sasl_passwd`.

### App-side wiring (2026-09-02)
- `mail_accounts` row 1 (brandon@) repointed from Zoho to `thedreamlaboratory.org` :993 / :587.
- `.env`: `IMAP_HOST`/`SMTP_HOST=thedreamlaboratory.org`, `SMTP_PORT=587` (BigMo poller + OTP mail).
- Container can't hairpin to the VM public IP, so `ri/physical/docker-compose.yml` maps
  `thedreamlaboratory.org` → `host-gateway` via `extra_hosts`; LE cert validates as normal.
- `ri/src/server/email/smtp.ts` now does STARTTLS on 587 (was hard-coded implicit TLS).

### Azure NSG (steve-nsg, rg FairchildLabs1) — opened 2026-09-02
Inbound originally allowed only 80/443/22, so no SMTP/IMAP ever reached the VM (Hotmail tests silently
never arrived, Outlook couldn't connect). Added rule `Mail` pri 360: TCP 25, 465, 587, 993 from `*`.
Managed via `az network nsg rule ...` (az CLI is logged in on dreamlab).

### DNS (Azure DNS zone thedreamlaboratory.org) — state 2026-09-02 16:15 UTC
- ✅ A `mail` → 13.64.77.78 (MX target)
- ✅ single SPF record: `v=spf1 ip4:13.64.77.78 -all`
- ⚠️ TODO while outbound relays via Zoho: SPF must be `v=spf1 ip4:13.64.77.78 include:zohomail.com -all`,
  otherwise receivers see mail from Zoho IPs failing SPF `-all`. Drop the include again once the relay moves off Zoho.

---

## Backup from Zoho IMAP ✅

**Completed:** Python IMAP sync script successfully backed up 64 messages.

### Brandon@thedreamlaboratory.org: 64 messages backed up
- **INBOX:** 26 messages
- **Sent:** 9 messages
- **Spam:** 2 messages
- **Notification:** 8 messages
- **Newsletter:** 11 messages
- **Archive:** 7 messages
- **Google_non_profit:** 1 message

**Storage:** 2.5MB in `/var/lib/mail/brandon@thedreamlaboratory.org/`
**Status:** All emails imported with folder structure intact. Ready for Phase 3.

### Hakeem@thedreamlaboratory.org: Ready (IMAP disabled in Zoho)
**Status:** IMAP not yet enabled in Zoho account.
- Dovecot directory created: `/var/lib/mail/hakeem@thedreamlaboratory.org/`
- User credentials in passwd file: ***REMOVED***
- Ready to receive emails once IMAP is enabled in Zoho

**To complete:**
1. Log into Hakeem's Zoho account
2. Enable IMAP access in account settings
3. Run backup script: `python3 /tmp/zoho_backup_final.py`
4. Backup will sync all emails from Zoho to local Dovecot

### Phase 3: Mail Deliverability Setup (CRITICAL for non-spam)

Before cutover, add DNS records to prevent emails from being flagged as spam:

#### 1. SPF Record (Sender Policy Framework)
```
thedreamlaboratory.org IN TXT "v=spf1 ip4:13.64.77.78 -all"
```
Tells receiving servers only mail from 13.64.77.78 is legitimate.

#### 2. DKIM (DomainKeys Identified Mail)
Generate keys on server:
```bash
openssl genrsa -out /etc/postfix/dkim_private.pem 2048
openssl rsa -in /etc/postfix/dkim_private.pem -pubout -out /etc/postfix/dkim_public.pem
```
Add to DNS:
```
default._domainkey.thedreamlaboratory.org IN TXT "v=DKIM1; k=rsa; p=<public-key-here>"
```
Configure Postfix to sign outgoing messages (requires milter integration).

#### 3. DMARC (Domain-based Message Authentication)
```
_dmarc.thedreamlaboratory.org IN TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@thedreamlaboratory.org"
```
Tells servers how to handle auth failures, receive policy reports.

#### 4. Reverse DNS (PTL Record)
Verify Azure has reverse DNS set up for 13.64.77.78:
```bash
dig +short -x 13.64.77.78
```
Should resolve to dreamlab or mail.thedreamlaboratory.org.

### Phase 3b: Pre-Cutover Validation

1. **Test inbound mail:** Send test email to `brandon@thedreamlaboratory.org` and verify receipt on Dovecot
2. **Test outbound mail:** Verify Postfix accepts & queues mail from localhost
3. **Check mailbox quota:** No quota limits currently set (fine for migration)
4. **Verify DNS records:** Ensure SPF/DKIM/DMARC are live before MX cutover

### Phase 4: Cutover (DNS MX Update)

When ready, update DNS MX records from Zoho to dreamlab:
```
MX 10 mail.thedreamlaboratory.org (13.64.77.78)
```

And update Scoot app config:
```sql
UPDATE mail_accounts 
SET imap_host='localhost', imap_port=993,
    smtp_host='localhost', smtp_port=25
WHERE email_address='brandon@thedreamlaboratory.org';
```

---

## Configuration Files (System-level, not in repo)

| File | Purpose | Key Settings |
|------|---------|--------------|
| `/etc/dovecot/dovecot.conf` | Main config | Includes conf.d/*.conf |
| `/etc/dovecot/conf.d/10-mail.conf` | Mail storage | protocols = imap, mail_location, first_valid_uid = 0 |
| `/etc/dovecot/conf.d/10-ssl.conf` | SSL/TLS | ssl_cert/ssl_key paths |
| `/etc/dovecot/conf.d/10-auth.conf` | Authentication | passwdfile source |
| `/etc/dovecot/conf.d/10-master.conf` | Listeners | imap on 143/993 |
| `/etc/dovecot/conf.d/auth-passwdfile.conf.ext` | Passwd auth | Scheme=SHA512-CRYPT, /etc/dovecot/passwd |
| `/etc/dovecot/passwd` | User database | Email, hash, uid:gid:home |
| `/etc/postfix/main.cf` | Postfix config | Domain routing, virtual settings |
| `/etc/postfix/virtual_mailboxes` | User mappings | brandon@... → path |

---

## Notes

- **first_valid_uid = 0**: Set to allow mail system user (UID 8). In production, consider limiting to reasonable range like 100+.
- **SSL/TLS**: Using existing Let's Encrypt cert from web server. Auto-renewal enabled.
- **Capacity**: Mail dir is 36KB, ready for email import from Zoho.
- **Logging**: Check `sudo journalctl -xeu dovecot` for troubleshooting.
- **Postfix "exited" status**: Normal for mail servers — process runs independently, systemd reports "exited" after initialization.

---

## Testing Commands

```bash
# Test IMAPS connection
openssl s_client -connect localhost:993

# Test IMAP login
doveadm auth test brandon@thedreamlaboratory.org temp123

# Test mail delivery
echo "Test body" | mail -s "Test subject" brandon@thedreamlaboratory.org

# Monitor IMAP
sudo journalctl -xeu dovecot -f

# Monitor Postfix
sudo tail -f /var/log/mail.log
```

---

**Resume:** Continue from Phase 2c (backup) in next session if needed.
