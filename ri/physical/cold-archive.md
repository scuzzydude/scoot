# /var/www Cold-Storage Archive — Record & Cleanup Handoff

- **Host:** steve (Ubuntu 24.04, Azure VM, RG `FAIRCHILDLABS1`, region `westus`)
- **Reason:** root disk pressure. `/var/www` archival content uploaded to Azure Blob (Cold tier), verified, and the local bulk reclaimed on-box.
- **Path mapping is 1:1:** `/var/www/<x>` → `azarchive:archive/var-www/<x>`

---

## Part 1 — What was uploaded (the record)

| Field | Value |
|---|---|
| Source | `/var/www/` on steve |
| Destination | `azarchive:archive/var-www/` |
| Storage account | `stevearchive10723` (container `archive`) |
| Resource group / region | `FAIRCHILDLABS1` / `westus` (same region as VM → no egress on VM↔blob) |
| SKU / redundancy | `Standard_LRS` |
| Min TLS | `TLS1_2` |
| Access tier | **Cold** (instant read, no rehydration; 90-day min retention) |
| rclone remote | `azarchive` (backend `azureblob`); config at `~/.config/rclone/rclone.conf` |
| rclone binary | `/usr/local/bin/rclone`, v1.71+ (Cold-tier capable; apt build 1.60 is not) |
| Verified | 2026-07-03: `rclone check --one-way` → 0 differences, 196 files, 6.329 GiB |
| Blob tier spot-check | first 5 blobs confirmed Cold |
| Est. cost | ~6.3 GB × $0.0045/GB ≈ $0.03/month |

## Part 2 — Disk reclaim (EXECUTED 2026-07-03)

Pre-delete gate: `rclone check --one-way /var/www azarchive:archive/var-www` → **0 differences, 196 matching files** (everything local proven present in archive). Delete targets confirmed real dirs (no symlinks into the repo).

Deleted from `/var/www/html/` (all recoverable via Part 3):
`1995` (4.9G), `scoot` (1.3G), `Lab2` (211M), `Lab1` (6.9M), `SeasonOne` (6.0M), `logos` (1.2M), `logos.zip` (1.1M).

Result: **root `/` 92% → 70%, free 2.3G → 8.6G (~6.3G reclaimed).** Site plumbing kept: `/var/www/html/index.html` + small files, `/var/www/thedreamlaboratory.org/html/{privacy,terms}.html`, `/var/www/support`. Post-delete verification: fairchildlabs http→https 301; dreamlaboratory.org root 200 (app proxy), `/privacy` & `/terms` 200; `apache2ctl configtest` OK.

> Note: the default vhost (`fairchildlabs.org`) DocumentRoots `/var/www/html`, so the deleted subpaths now 404 until restored. Access logs showed zero traffic to them prior to deletion.

## Part 3 — Restore procedure (Cold = instant, no rehydration wait)

Whole archive:
```bash
rclone copy azarchive:archive/var-www /var/www -P
```
A specific subtree (e.g. bring 1995 back):
```bash
rclone copy azarchive:archive/var-www/html/1995 /var/www/html/1995 -P
```

## Part 4 — Account key rotation (EXECUTED 2026-07-03)

The storage-account key (primary/`key1`) had surfaced in conversation. Renewed and repointed rclone in place:
```bash
az storage account keys renew --account-name stevearchive10723 --resource-group FAIRCHILDLABS1 --key key1
NEWKEY=$(az storage account keys list --account-name stevearchive10723 --resource-group FAIRCHILDLABS1 --query "[?keyName=='key1'].value | [0]" -o tsv)
rclone config update azarchive key="$NEWKEY"   # suppress output; never echo the key
rclone lsd azarchive:                           # verify (allow ~30–60s data-plane propagation)
```
Old key invalidated; `rclone lsd azarchive:` confirmed working with the new key. Transcript redactor hardened separately (`scripts/save-session.cjs` now masks 88-char Azure storage keys).
