---
name: share-drive-location
description: Share drive path for exchanging files with Claude Code
metadata: 
  node_type: memory
  type: reference
  originSessionId: ecda33cf-286c-4828-a502-508e37b5fe68
  modified: 2026-09-02T15:10:21.531Z
---

## Share Drive Location

**Path:** `/var/www/shared/`

**Purpose:** Exchange files between user and Claude Code sessions (screenshots, configs, etc.)

**Access:** Readable/writable by www-data, can be accessed via Read tool with full path

**Example:** `/var/www/shared/dns_azure_1.jpg`

This is the canonical location for file exchanges. Always check here first before asking the user for file locations.
