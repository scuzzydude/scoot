---
name: project_card_release_set1
description: "Card set #1 = 34-2026-1, frozen 2026-09-14: 34 player cards (review 42) + 12 write-in guest cards (review 43); release folder on the share + blob; manifest pins serial→code→art sha256"
metadata:
  type: project
---

**Set #1 (34-2026-1) frozen 2026-09-14.** Contents: the 34 player cards exactly as built for card-review-42 (art set `roster-r25-crop`) plus 12 guest cards `34-GUEST-01..12` (rows in `player_cards`, tier "Guest", blank plate + big lookup code in the picture slot, `guest=1` roster column drives `build_cards.py`).

**Where:** share `release/34-2026-1/` = `cards_34-2026-1_set1.pdf`, `cards_34-2026-1_guest.pdf`, `manifest.csv`; mirrored to `azarchive:media/card-art/release/34-2026-1/`; manifest also committed at `tools/player-cards/releases/34-2026-1/manifest.csv` (serial, handle, code, tier, figure/mask sha256, app front URL, source review).

**Rules:** a release is never edited in place — a changed card or new member is set #2 (`--series 2`, label 34-2026-2) with its own folder. Guest cards are claimed by texting the code (claim-by-code already handles them); the owner writes their name on the plate by hand. Related: [[project_player_cards_facial_likeness]], [[feedback_increment_card_reviews]], [[feedback_version_print_pdfs]].
