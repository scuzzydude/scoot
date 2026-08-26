#!/usr/bin/env python3
"""Build the "FONDE" wordmark asset by rendering real type, not
extracting it from a jersey photo.

Supersedes the photo-extracted version (cropped out of
fonde_crest_white.png -- see modal_app_jersey.py's git history around
2026-08-26 for that approach). Brandon caught a real defect in the
extracted version: a stray white artifact just under the "F", a relic
of the ball-outline/seam crop that never fully isolated the letters.
His call: guess the font and just render it clean instead.

Bevan (Google Fonts, OFL license -- assets/Bevan-Regular.ttf) is a
close match to the real jersey's slab-serif athletic block lettering:
same flared serif "feet," same bold weight and letterform proportions,
confirmed by side-by-side comparison against the extracted original.

    python3 make_fonde_wordmark.py

Writes assets/fonde_wordmark_white.png. After changing this, re-upload
it to Blob (card-art/assets/fonde_wordmark_white.png) so
modal_app_jersey.py picks up the new version -- see that file's
CREST_ASSET_BLOB.
"""
import os

from PIL import Image, ImageDraw, ImageFont
import numpy as np

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
FONT_PATH = os.path.join(ASSETS, "Bevan-Regular.ttf")
OUT = os.path.join(ASSETS, "fonde_wordmark_white.png")

TEXT = "FONDE"
FONT_SIZE = 400
CANVAS = (2400, 600)  # generously oversized, cropped tight to content after


def make(text=TEXT, font_path=FONT_PATH, font_size=FONT_SIZE, out_path=OUT):
    font = ImageFont.truetype(font_path, font_size)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.text((50, 50), text, font=font, fill=(255, 255, 255, 255))

    arr = np.array(canvas)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 10)
    pad = 10
    box = (max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad),
           int(xs.max()) + pad, int(ys.max()) + pad)
    tight = canvas.crop(box)
    tight.save(out_path)
    print(f"wrote {out_path} ({tight.size[0]}x{tight.size[1]})")


if __name__ == "__main__":
    make()
