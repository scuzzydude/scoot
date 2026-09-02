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

| Item | Value | Notes |
|------|-------|-------|
| Dovecot passwd file | `/etc/dovecot/passwd` | SHA512-CRYPT, readable by dovecot |
| Dovecot user | `brandon@thedreamlaboratory.org` | UID 8, GID 8 (mail system user) |
| Temp password | `temp123` | Hash: `$6$wqVkeVBTjgEmYpv3$...` |
| IMAP host | `localhost` or `thedreamlaboratory.org` | Ports: 143 (plain), 993 (SSL) |
| SSL cert | `/etc/letsencrypt/live/thedreamlaboratory.org/` | Via Let's Encrypt |

---

## Next Steps (For Resume Session)

### Phase 2c (continued): Backup from Zoho IMAP

**Approach:** Since imapsync is not available as standard Ubuntu package, use manual export/import:

```bash
# Option 1: Using Thunderbird or mail client to export from Zoho
# Export as MBOX from Zoho webmail, then import to Dovecot

# Option 2: Using doveadm to back up directly (requires upstream Zoho IMAP setup)
# Set up upstream=yes in dovecot config temporarily

# Option 3: Manual IMAP copy using offlineimap or similar
# (Would need to install additional tools)
```

**Recommendation:** Use Zoho webmail MBOX export → Dovecot import via doveadm.

### Phase 3: Pre-Cutover Validation

1. **Test inbound mail:** Send test email to `brandon@thedreamlaboratory.org` and verify receipt
2. **Test outbound mail:** Verify SMTP acceptance and queuing
3. **Check mailbox quota:** No quota limits currently set (check dovecot.conf)
4. **Verify DNS/SPF:** Will be needed for mail acceptance

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
