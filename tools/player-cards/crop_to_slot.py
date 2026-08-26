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

    mx = int(w * 0.08)
    my_top_min = int(h * 0.02)   # minimum headroom above the head

    # In practice the content bbox (torso+arms) is always much WIDER,
    # relative to its own height, than TARGET_ASPECT allows (a portrait
    # card slot), so hitting the target aspect always means extending
    # well above the head -- the "respect minimum headroom" branch
    # below dominates every subject tested. Given that, final canvas
    # height comes out to approximately h + my_top_min + my_bot, so
    # solve directly for the my_bot that gives the bottom margin its
    # required NAMEPLATE_FRAC share of that final height, rather than
    # estimating from a pre-headroom-branch height that the branch then
    # invalidates (confirmed: using the pre-branch estimate under-
    # padded the bottom, and the crest ended up hidden under the bar).
    my_bot = int(NAMEPLATE_FRAC * (h + my_top_min) / (1.0 - NAMEPLATE_FRAC))

    natural_w = (x1 + mx) - (x0 - mx)
    cx0, cx1 = head_cx - natural_w / 2.0, head_cx + natural_w / 2.0
    cy1 = y1 + my_bot

    cw = natural_w
    ch = cw / TARGET_ASPECT
    cy0 = cy1 - ch

    # Respect the minimum headroom -- if the aspect-driven height
    # doesn't reach it, extend further upward (bottom stays anchored).
    if cy0 > y0 - my_top_min:
        cy0 = y0 - my_top_min
        ch = cy1 - cy0
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
