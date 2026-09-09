---
name: feedback_version_print_pdfs
description: "Print-file PDFs (card sheets, test sheets) must carry the card-review number in the filename, e.g. cards_six_landscape_longflip-35.pdf, so Brandon can't mix versions on the share"
metadata:
  type: feedback
---

Brandon, 2026-09-09: "next time, name the pdf -35 as well so I don't get them mixed up."

**Why:** the share accumulates several generations of the same sheet; identical filenames overwritten in place made it impossible to tell which PDF matched which review page.

**How to apply:** every PDF that goes on the share or a review page gets `-<review number>` before `.pdf`, matching the `card-review-N` page it belongs to. Never overwrite an earlier number's file. Pairs with [[feedback_increment_card_reviews]] and [[feedback_archive_share_after_use]].
