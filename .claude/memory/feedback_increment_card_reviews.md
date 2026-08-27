---
name: feedback-increment-card-reviews
description: "Always publish a NEW card-review-N page for each round of changes, never overwrite an existing one in place"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cd96f0f9-30dc-43a1-9570-e939a94424ad
  modified: 2026-08-27T19:41:57.871Z
---

Every round of card changes gets its own new `fairchildlabs.org/card-review-N/`
directory and URL, incrementing N each time — never republish an existing
`card-review-N` in place with new content.

**Why:** Brandon said directly (2026-08-27), "you should increment the
card review-xx each time," after a couple of rounds where the back-of-card
polish was republished in place under the same `card-review-26` URL
across three iterations (jersey/panel v1, v2, v3 all overwrote the same
page). Each round should be its own addressable page/URL — likely so
past states stay comparable/linkable rather than being silently
overwritten.

**How to apply:** in the player-cards project (and by extension any
other numbered-review-page workflow), always create a fresh
`/var/www/html/card-review-N/` directory for the next available N when
publishing a new round of changes, even for a quick fix within the same
work session — don't reuse the last N. See
[[project_player_cards_facial_likeness]] for the full round-by-round
history this convention applies to.
