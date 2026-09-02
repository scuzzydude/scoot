# Email Server Migration — Handoff Spec

## Session Objective
Complete self-hosted mail server setup for `brandon@thedreamlaboratory.org` migration from Zoho to dreamlab (Azure VM 13.64.77.78).

**Constraint:** Same-day availability required. Use for cutover only after full validation.

---

## Current State (Session End: 2026-09-02 13:03 UTC)

### ✅ Completed
1. **Email organization workflow** (all Gmail accounts):
   - awbreybrandon@gmail.com: 39 emails archived
   - fonde.brotherhood@gmail.com: 63 emails archived
   - brandon.mdcon@gmail.com: 2,714 emails digested (219 critical)
   - brandon@thedreamlaboratory.org: 26 emails archived

2. **Mail server software installed on dreamlab:**
   - Postfix 3.8.6 (SMTP)
   - Dovecot 2.3.21 (IMAP/POP3)
   - OpenSSL / certbot (certificate management)

3. **Infrastructure ready:**
   - Mail directories created: `/var/lib/mail/brandon@thedreamlaboratory.org/{cur,new,tmp}`
   - SSL certificate available: `/etc/letsencrypt/live/thedreamlaboratory.org/` (existing from web)
   - Mail user created: `mail:mail` with UID 112, GID 117

### ⚠️ In Progress (Needs Completion)
1. **Dovecot protocol listeners not enabled** 
   - Issue: "starting up without any protocols" warning
   - Status: Configuration partially applied, needs debugging
   - Ports needed: 143 (IMAP), 993 (IMAPS/SSL), 110 (POP3), 995 (POP3S/SSL)

2. **Postfix configuration incomplete**
   - Default config set during install
   - Needs: Domain routing, virtual mailbox mapping for thedreamlaboratory.org

3. **Email backup not started**
   - Source: Zoho IMAP (imappro.zoho.com:993)
   - Method: `imapsync` or manual `doveadm backup`
   - Target: `/var/lib/mail/brandon@thedreamlaboratory.org/`

### ❌ Not Started
1. DNS MX record update (Phase 3 cutover only)
2. Testing: IMAP/SMTP connectivity validation
3. User password setup (current: temp123 via doveadm)

---

## Next Steps (Resume Session)

### Phase 2a: Fix Dovecot Listener Issue
**Problem:** Dovecot master.conf IMAP listeners not enabling protocols

**Approach:**
```bash
# 1. Check current listener config:
sudo doveconf -n protocols
sudo grep -A 20 "service imap-login" /etc/dovecot/conf.d/10-master.conf

# 2. Ensure listeners are uncommented and enabled:
#    - /etc/dovecot/conf.d/10-master.conf service imap-login:
#      port = 143 (IMAP)
#      port = 993 (IMAPS, ssl = yes)
#    - /etc/dovecot/conf.d/10-ssl.conf:
#      ssl = required
#      ssl_cert = </etc/letsencrypt/live/thedreamlaboratory.org/fullchain.pem
#      ssl_key = </etc/letsencrypt/live/thedreamlaboratory.org/privkey.pem

# 3. Restart and verify:
sudo systemctl restart dovecot
sudo ss -tlnp | grep -E "imap|:143|:993"  # Should show listening on 143 & 993
```

### Phase 2b: Configure Postfix for Virtual Domains
```bash
# Update /etc/postfix/main.cf:
# - myhostname = mail.thedreamlaboratory.org
# - mydomain = thedreamlaboratory.org
# - virtual_mailbox_domains = thedreamlaboratory.org
# - virtual_mailbox_maps = hash:/etc/postfix/virtual_mailboxes
# - virtual_uid_maps = static:112 (mail UID)
# - virtual_gid_maps = static:117 (mail GID)
# - virtual_mailbox_base = /var/lib/mail

# Create virtual mailbox map:
echo "brandon@thedreamlaboratory.org brandon@thedreamlaboratory.org/" | sudo tee /etc/postfix/virtual_mailboxes
sudo postmap /etc/postfix/virtual_mailboxes
sudo systemctl reload postfix
```

### Phase 2c: Backup Emails from Zoho
```bash
# Option 1: Use imapsync (if available):
imapsync \
  --host1 imappro.zoho.com --port1 993 --ssl1 \
  --user1 brandon@thedreamlaboratory.org --password1 [ZOHO_PASSWORD] \
  --host2 localhost --port2 993 --ssl2 --nossl2 \
  --user2 brandon@thedreamlaboratory.org --password2 temp123 \
  --all

# Option 2: Use Dovecot doveadm backup (from Zoho → local):
# This requires setting up a second IMAP connection to Zoho, more complex

# Simpler approach: Export from Zoho webmail → MBOX, then import to Dovecot
```

### Phase 3: Validation (Before Cutover)
```bash
# Test IMAP connection:
openssl s_client -connect localhost:993

# Test with mail client or telnet:
telnet localhost 143
# LOGIN brandon@thedreamlaboratory.org temp123

# Check mail directories:
sudo ls -la /var/lib/mail/brandon@thedreamlaboratory.org/

# Verify Postfix acceptance:
echo "test" | sudo postfix-install | mail -s "test" brandon@thedreamlaboratory.org
```

### Phase 4: Cutover (Day-of, Low-Traffic Window)
```bash
# 1. Update DNS MX records to point to dreamlab (13.64.77.78)
#    Replace Zoho MX records

# 2. Update Scoot mail_accounts table:
#    UPDATE mail_accounts 
#    SET imap_host='localhost', imap_port=993,
#        smtp_host='localhost', smtp_port=25
#    WHERE email_address='brandon@thedreamlaboratory.org';

# 3. Verify app can connect and fetch mail

# 4. Monitor for delivery failures
```

---

## Configuration Files Reference

| File | Status | Purpose |
|------|--------|---------|
| `/etc/dovecot/dovecot.conf` | ✓ Default | Main Dovecot config |
| `/etc/dovecot/conf.d/10-ssl.conf` | ⚠️ Partial | SSL/TLS cert paths |
| `/etc/dovecot/conf.d/10-mail.conf` | ⚠️ Partial | Mail directory routing |
| `/etc/dovecot/conf.d/10-auth.conf` | ⚠️ Partial | Auth method (passwd-file) |
| `/etc/dovecot/conf.d/10-master.conf` | ⚠️ Partial | Listener ports (NEEDS FIX) |
| `/etc/dovecot/passwd` | ✓ Created | User password: brandon@... = temp123 |
| `/etc/postfix/main.cf` | ⚠️ Default | Postfix config (needs domain update) |
| `/etc/postfix/virtual_mailboxes` | ❌ Missing | Virtual domain routing |

---

## Credentials & Access

| Item | Value | Notes |
|------|-------|-------|
| Dreamlab Host | 13.64.77.78 | Azure VM, SSH access available |
| Mail User | mail (UID 112) | System user, nologin shell |
| Temp Password | temp123 | Change before cutover |
| Domains | thedreamlaboratory.org, mail.thedreamlaboratory.org | Both registered, pointing to 13.64.77.78 |
| SSL Cert | `/etc/letsencrypt/live/thedreamlaboratory.org/` | Valid, auto-renew enabled |
| Zoho Creds | [in user's Zoho account] | IMAP: imappro.zoho.com:993, SMTP: smtppro.zoho.com:465 |

---

## Rollback Plan (If Issues)
1. Keep Zoho MX records in place until fully validated
2. If mail delivery fails, revert DNS MX to Zoho
3. Dovecot/Postfix can be stopped without data loss
4. Emails backed up locally before cutover

---

## Key Learnings from This Session
- Dovecot protocol listeners require explicit enabling in master.conf (not auto-enabled)
- Postfix requires non-interactive install (`DEBIAN_FRONTEND=noninteractive`)
- Certificate already exists (web server reuses for mail)
- Email digest on mdcon found 2,714 entries with 219 critical items (account numbers, codes, etc.)

---

## Commit Info
**Last commit:** `5ed5702` - "cleanup: remove test scripts from email workflow session"  
**Repo:** `/home/brandon/scoot` on dreamlab (13.64.77.78)  
**Branch:** main (up-to-date with origin)
