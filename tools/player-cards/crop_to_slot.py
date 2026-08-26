#!/usr/bin/env python3
"""Crop rembg-cutout figure+mask to the card art slot's 0.7 (168x240pt)
aspect ratio.

Rewritten 2026-08-26: the old version centered on the FULL alpha
content's bbox (arms included) and added symmetric top+bottom padding
to hit the target aspect. Two real bugs from that, found running the
first 5-person batch:
  1. Asymmetric arm/shoulder poses pull the full-bbox center away from
     the true head/chin line -- E-Dub's card read "off center" because
     of this, even though the jersey/crest compositing itself was
     correctly centered on his chin.
  2. Symmetric aspect-padding adds height both above AND below the
     figure to reach the target aspect -- a subject with a wider bbox
     (relative to height, e.g. arms held out) gets padded more on both
     sides, which dilutes how much of the final frame their figure
     actually fills. Anthony's card read "too much headroom, torso not
     extended" from exactly this.

Fixed by: (1) centering horizontally on the HEAD region's own center
(top 40% of the content bbox), not the full bbox: consistent with how
composite_jersey already centers the crest, so face+crest+crop all
agree. (2) anchoring the crop's BOTTOM at the figure's own bottom edge
(plus a small fixed margin) and extending upward ONLY as needed to
reach the target aspect, instead of padding both directions -- keeps
the figure's bottom (and therefore its apparent scale) consistent
across subjects.

Rewritten again 2026-08-26 (same day): Brandon wanted every subject's
own head-top vertically aligned to the same reference line -- the
BOTTOM EDGE of the scoot glyph disc build_cards.py draws in the card's
top-left corner (a fixed position, independent of the art). That disc
sits at 15% down the art slot (see GLYPH_BOTTOM_FRAC below, derived
directly from build_cards.py's own geometry constants). The old
"extend upward until the aspect ratio is satisfied" approach gave each
subject WHATEVER headroom the math happened to produce (varies with
how wide their arm span is relative to their content height), which is
why some subjects (Donnie, Mike, Bo, Kobe -- narrower content bboxes)
already looked right while wider-armed subjects didn't. Now the crop's
vertical placement is solved directly from the target line instead of
being a side effect of the aspect fit -- see the head-top math below.
This also drops the "natural_w" arm-margin sizing entirely: width is
now purely derived from the required height, centered on head_cx, so
a wide arm span may get cropped rather than dictating extra headroom.
"""
import sys
import os
from PIL import Image
import numpy as np

TARGET_ASPECT = 168.0 / 240.0  # w/h
OUT_W, OUT_H = 700, 1000

# build_cards.py's nameplate bar covers the bottom bar_h/ART_H = 34/240
# = 14.2% of the art slot, drawn OVER the art rather than as a separate
# crop region -- so anything in the bottom 14.2% of this crop's output
# is invisible on the finished card regardless of content. Padding
# below the figure needs to clear that zone, or the crest (anchored
# near the figure's own bottom edge -- see modal_app_jersey.py's
# CREST_BOTTOM_MARGIN_FRAC) ends up hidden under the bar.
NAMEPLATE_FRAC = 34.0 / 240.0

# The scoot glyph disc's bottom edge, as a fraction down the art slot --
# draw_glyph(x+BAND+22, y+TRIM_H-BAND-22, r=14) in build_cards.py, so:
#   art_top = BAND + ART_H (top of the art slot, in points from the card's own bottom)
#   glyph_bottom = (TRIM_H - BAND - 22) - 14
#   GLYPH_BOTTOM_FRAC = (art_top - glyph_bottom) / ART_H
# Recompute this if build_cards.py's glyph geometry constants change.
GLYPH_BOTTOM_FRAC = 0.15


def crop_one(serial, art_in, art_out):
    fig_path = os.path.join(art_in, f"{serial}_figure.png")
    mask_path = os.path.join(art_in, f"{serial}_jersey_mask.png")
    fig = Image.open(fig_path).convert("RGBA")
    mask = Image.open(mask_path).convert("L")

    arr = np.array(fig)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 10)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    w, h = x1 - x0, y1 - y0

    # Prefer the EXACT head_cx composite_jersey used to center the
    # crest (returned in its result dict, written here as a sidecar by
    # the calling script) over recomputing our own from the rembg
    # cutout's alpha -- 2026-08-26: even though both methods measure
    # "the same thing," they run on different image versions (raw vs.
    # post-cutout) and can disagree by ~10px, enough for the crest to
    # visibly drift off the crop's own center. Reusing the identical
    # value guarantees crest and crop agree exactly.
    head_cx_path = os.path.join(art_in, f"{serial}_head_cx.txt")
    if os.path.exists(head_cx_path):
        head_cx = float(open(head_cx_path).read().strip())
    else:
        head_y1 = y0 + int(h * 0.40)
        hys, hxs = np.where(alpha[y0:head_y1, :] > 10)
        head_cx = (int(hxs.min()) + int(hxs.max())) / 2.0 if len(hxs) else (x0 + x1) / 2.0

    # Solve directly for the crop that puts head-top (y0) at
    # GLYPH_BOTTOM_FRAC down the output AND gives the bottom margin its
    # required NAMEPLATE_FRAC share, simultaneously:
    #   cy0 = head_top - GLYPH_BOTTOM_FRAC * ch        (head-top target)
    #   cy1 = y1 + NAMEPLATE_FRAC * ch                  (bottom margin target)
    #   ch  = cy1 - cy0
    # Substituting and solving for ch directly:
    head_top = y0
    ch = (y1 - head_top) / (1.0 - NAMEPLATE_FRAC - GLYPH_BOTTOM_FRAC)
    cy1 = y1 + NAMEPLATE_FRAC * ch
    cy0 = cy1 - ch
    cw = ch * TARGET_ASPECT
    cx0, cx1 = head_cx - cw / 2.0, head_cx + cw / 2.0

    # PIL's crop() fills any out-of-bounds region with transparent (RGBA)
    # / zero (L) automatically, so the box can extend past the source
    # image's real edges (e.g. for extra headroom) with no separate
    # letterbox step needed -- the resulting crop is already exactly
    # TARGET_ASPECT by construction.
    box = (int(round(cx0)), int(round(cy0)), int(round(cx1)), int(round(cy1)))
    fig_c = fig.crop(box)
    mask_c = mask.resize(fig.size, Image.LANCZOS).crop(box)

    fig_out = fig_c.resize((OUT_W, OUT_H), Image.LANCZOS)
    mask_out = mask_c.resize((OUT_W, OUT_H), Image.LANCZOS)

    os.makedirs(art_out, exist_ok=True)
    fig_out.save(os.path.join(art_out, f"{serial}_figure.png"))
    mask_out.save(os.path.join(art_out, f"{serial}_jersey_mask.png"))
    print(f"{serial}: bbox {w}x{h}, head_cx={head_cx:.0f} -> crop {box} -> {OUT_W}x{OUT_H}")


if __name__ == "__main__":
    art_in, art_out = sys.argv[1], sys.argv[2]
    for serial in sys.argv[3:]:
        crop_one(serial, art_in, art_out)
