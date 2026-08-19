---
name: feedback-archive-share-after-use
description: "After using a file Brandon hands off via the /var/www/shared share drive, move it to cold archive (dated) instead of leaving it there"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-19T18:58:49.633Z
---

Whenever Brandon uploads something to the share drive
(`/var/www/shared/`, WebDAV-accessible) for a task, once it's been
viewed/used, move it out to cold archive rather than leaving it there.

**Where:** reuse the existing `azarchive` rclone remote (see
[[infra_cold_archive]]) rather than inventing a new location. The
established 1:1 mapping is `/var/www/<x>` ⇄
`azarchive:archive/var-www/<x>`, so `shared/` follows the same pattern:
`azarchive:archive/var-www/shared/<YYYY-MM-DD>/<filename>`, dated by the
day it was archived. Confirmed working 2026-08-19 with
`rclone move /var/www/shared/ azarchive:archive/var-www/shared/<date>/ --exclude ".DAV/**"`.

**Ownership gotcha:** files uploaded via the WebDAV share are owned by
`www-data`; deleting them (even after a successful `rclone move`, which
uploads fine but then fails on the source-delete step with permission
denied) needs `sudo rm`. Verify the archive copy exists first
(`rclone lsf azarchive:archive/var-www/shared/<date>/`) before deleting
originals, same "verify before delete" discipline as everything else.

**Why:** Brandon asked directly (2026-08-19), "when I hand off stuff on
the share drive, you should move it somewhere else after you've looked
at it... just keep the share clean." He suggested cold storage archived
by date as one option, which matches infrastructure that already
exists — no new setup needed.

**How to apply:** After a task that involved fetching something from
the share drive is done (or clearly no longer needs the file live
there), archive and remove it as a matter of course — don't wait to be
asked again. Do this for files Claude fetched/used, not files Brandon
may still be actively working with via the share — if in doubt whether
a file is still needed, it's fine to ask once rather than assume.
