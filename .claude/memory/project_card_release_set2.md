---
name: project_card_release_set2
description: "Card set #2 = 34-2026-2, started 2026-09-16: 12 more guest cards 34-GUEST-13..24 (review 45), rows live in player_cards, release folder on share + blob"
metadata:
  type: project
---

**Set #2 (34-2026-2) started 2026-09-16** with 12 more write-in guest cards `34-GUEST-13..24` (Brandon: "I think I need 12 more guest cards"). Same design as set 1 guests (card-review-44); only the printed series differs. Built with `build_cards.py --series 2` from a throwaway roster CSV (guest=1 rows; the set-1 guest CSV was never kept — regenerate from `player_cards` rows if needed).

**Live:** 12 rows inserted into prod `player_cards` (scoot 34, tier Guest, home Fonde, code = `short_code(serial)`), so the codes are claimable by text immediately.

**Where:** share `release/34-2026-2/` (`cards_34-2026-2_guest.pdf` = long flip, `manifest.csv`), mirrored to `azarchive:media/card-art/release/34-2026-2/`; manifest committed at `tools/player-cards/releases/34-2026-2/manifest.csv`; review page fairchildlabs.org/card-review-45 (long + short flip PDFs).

Set #2 is not frozen yet — further new members/guests can join it until it is printed. Related: [[project_card_release_set1]].
