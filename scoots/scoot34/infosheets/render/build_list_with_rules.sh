#!/bin/sh
# Two-sided print piece: page 1 = the next-up list (as provided), page 2 = both
# rules pages stacked and scaled onto one sheet. Print double-sided, flip on the
# long edge — list on the front, rules on the back.
# usage: render/build_list_with_rules.sh DRAFT_NUMBER [LIST_PDF]
set -e
N=${1:?draft number}
LIST=${2:-/var/www/shared/fonde_senior_next_up_list.pdf}
HERE=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)

# Rules pages as images, trimmed of the empty middle band (crop.py logic inline).
python3 "$HERE/render/stack_pages.py" \
  "https://fairchildlabs.org/fonde-rules/rules-$N-p1.jpg" \
  "https://fairchildlabs.org/fonde-rules/rules-$N-p2.jpg" \
  "$TMP/back.pdf"

pdfunite "$LIST" "$TMP/back.pdf" "$TMP/out.pdf"
sudo cp "$TMP/out.pdf" "/var/www/shared/fonde_next_up_with_rules-$N.pdf"
sudo chown www-data:www-data "/var/www/shared/fonde_next_up_with_rules-$N.pdf"
rm -rf "$TMP"
echo "/var/www/shared/fonde_next_up_with_rules-$N.pdf"
