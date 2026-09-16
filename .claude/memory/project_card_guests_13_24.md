---
name: project_card_guests_13_24
description: "12 more guest cards 34-GUEST-13..24 added 2026-09-16, printed 34-2026-1 to match set 1 guests (card-review-46); rows live in player_cards; own release folder beside the frozen set-1 folder"
metadata:
  type: project
---

**Guests 13–24 added 2026-09-16** (Brandon: "I think I need 12 more guest cards"). Same design as set-1 guests (card-review-44). First built as set #2 (`34-2026-2`, card-review-45); Brandon said "make them match set 1", so they were rebuilt with `--series 1` as card-review-46. Review 45 is superseded, and its share/blob copies were archived to `azarchive:archive/var-www/shared/2026-09-16/`.

**Why a separate folder:** the set-1 folder is frozen, so these sit beside it in `release/34-2026-1-guests-13-24/` (`cards_34-2026-1_guest_13-24.pdf` = long flip, `manifest.csv`), mirrored to `azarchive:media/card-art/release/34-2026-1-guests-13-24/`. The manifest is committed at `tools/player-cards/releases/34-2026-1-guests-13-24/`. The set-1 guest roster CSV was never kept, so rebuild it from `player_cards` rows (guest=1, tier Guest, home Fonde, joined/edition 2026).

**Live:** 12 rows are in prod `player_cards` (scoot 34, code = `short_code(serial)`), so the codes can be claimed by text. No set #2 exists yet. Related: [[project_card_release_set1]].
