#!/bin/sh
# Render the working draft to fairchildlabs.org/cards-infosheet/
# usage: render/build_draft_page.sh DRAFT_NUMBER
set -e
N=${1:?draft number}
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT=/var/www/html/cards-infosheet
TMP=$(mktemp -d)
python3 - "$HERE/../brand/name-variants/the_dream_laboratory_oneline_black.png" "$TMP/logo.png" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]); im=im.crop(im.getbbox()); im.resize((800,round(im.height*800/im.width))).save(sys.argv[2])
PY
cat > "$TMP/footer.html" <<HTML
<footer><div><img src="logo.png" alt="The Dream Laboratory">thedreamlaboratory.org</div>
<div class="c"><b>Fonde Brotherhood</b><br>Text BigMo: (361) 423-2253</div>
<div class="r"><b>WORKING DRAFT $N — $(date +%F)</b><br><a href="draft-$N.md">markdown source</a></div></footer>
HTML
pandoc "$HERE/cards_infosheet_draft.md" -f markdown -t html5 -s \
  --metadata pagetitle="Cards Info Sheet" --css draft.css \
  -V header-includes='<meta name="viewport" content="width=device-width,initial-scale=1">' \
  -A "$TMP/footer.html" -o "$TMP/body.html"
# pandoc's default template has its own max-width styles; wrap the body in <main>
python3 - "$TMP/body.html" <<'PY'
import re,sys; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'<style>.*?</style>','',s,flags=re.S)
s=s.replace('<body>','<body><main>',1).replace('</body>','</main></body>',1)
open(p,'w').write(s)
PY
sudo mkdir -p "$OUT"
sudo cp "$TMP/body.html" "$OUT/index.html"
sudo cp "$HERE/render/draft.css" "$TMP/logo.png" "$OUT/"
sudo cp "$HERE/cards_infosheet_draft.md" "$OUT/draft-$N.md"
rm -rf "$TMP"
echo "https://fairchildlabs.org/cards-infosheet/"
