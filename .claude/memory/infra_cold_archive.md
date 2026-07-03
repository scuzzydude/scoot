---
name: infra_cold_archive
description: "steve /var/www archived to Azure Cold blob (azarchive remote); local bulk deleted, restore on demand"
metadata: 
  node_type: memory
  type: reference
  originSessionId: e0188e1f-d820-46a3-a539-4550075074c5
---

steve's `/var/www` bulk static content is backed up to Azure Blob **Cold tier** and the local copies were deleted to reclaim root disk (2026-07-03: 92%→70%, ~6.3G freed).

- **Remote:** `azarchive` (rclone, backend azureblob), account `stevearchive10723` container `archive`, RG `FAIRCHILDLABS1`/westus. Config at `~/.config/rclone/rclone.conf` (NOT root's — sudo rclone needs `--config /home/brandon/.config/rclone/rclone.conf`). Use `/usr/local/bin/rclone` v1.71+ (apt 1.60 can't do Cold).
- **Mapping 1:1:** `/var/www/<x>` ⇄ `azarchive:archive/var-www/<x>`.
- **Deleted locally (restore-on-demand):** `/var/www/html/{1995,scoot,Lab2,Lab1,SeasonOne,logos,logos.zip}`. `fairchildlabs.org` (default vhost, DocumentRoot `/var/www/html`) now 404s those paths until restored. `thedreamlaboratory.org` is a proxy to the Scoot app and was unaffected; `/privacy`+`/terms` static aliases kept.
- **Restore:** `rclone copy azarchive:archive/var-www/html/1995 /var/www/html/1995 -P` (Cold = instant read, no rehydration).
- **Key rotation:** account key1 was rotated 2026-07-03 after it surfaced in chat; if `rclone lsd azarchive:` 403s, allow ~60s data-plane propagation after a renew. Redactor now masks 88-char Azure keys (see [[feedback_transcript_redaction]]).

Full record: `ri/physical/cold-archive.md`. Prod host context: [[infra_prod_server]], [[infra_claude_runs_on_steve]].
