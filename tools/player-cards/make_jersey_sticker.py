#!/usr/bin/env python3
"""Build the garment-shaped jersey sticker used by
modal_app_jersey.py's composite_jersey() -- base color + subtle
baked-in mesh + centered crest, with alpha matching a real tank-top
silhouette (collar notch, shoulder straps, sleeve width), not a plain
rectangle.

Supersedes an earlier rectangular-texture version (make_jersey_texture.py,
removed 2026-08-25). Brandon's reads across that day's iteration:
round 3's flat rectangle still read as a shadow on the sleeves/neck and
never looked centered on non-square torsos; his direct suggestion --
"make the shirt+mesh+logo one unit and just add it on top of their
torso" -- meant the STICKER needed the actual garment shape baked in,
not a box that gets alpha-masked separately at runtime.

assets/jersey_shape_template.png is the alpha silhouette this stamps
color+mesh+crest into. It's Cleo's own already-clean garment mask
(2026-08-25, margin=0.05, no segformer bleed) cropped to its bounding
box -- a real jersey silhouette, not hand-drawn, and generic enough to
reuse as a template since the roster shares a locked pose/framing.
Regenerating that template needs a fresh clean per-subject mask (there
is currently no committed script for that -- see the modal_app_jersey.py
git history around 2026-08-25 for the segformer-based version that
produced it); the template itself is what's committed here.

    python3 make_jersey_sticker.py

Writes assets/jersey_sticker_dark.png. After changing this, re-upload
it to Blob (card-art/assets/jersey_sticker_dark.png) so
modal_app_jersey.py picks up the new version -- see that file's
JERSEY_STICKER_BLOB.
"""
import os

from PIL import Image
import numpy as np

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SHAPE_SRC = os.path.join(ASSETS, "jersey_shape_template.png")
MESH_SRC = os.path.join(ASSETS, "mesh_texture_mult.png")
CREST_SRC = os.path.join(ASSETS, "fonde_crest_white.png")
OUT = os.path.join(ASSETS, "jersey_sticker_dark.png")

BASE = (0x2E, 0x2E, 0x2A)

# Mesh multiplier's native swing is 0.65x-1.45x (see
# assets/mesh_texture_mult.png's origin story in the old
# modal_app_jersey.py git history) -- rescaled way down since this is
# authored once and eyeballed here, not applied blind at runtime over a
# curved, already-segmented silhouette.
MESH_STRENGTH = 0.06
CREST_W_FRAC = 0.34
# Crest top margin, as a fraction of the shape's own height. Kept well
# clear of the BOTTOM too -- the shape template's bottom edge is the
# raw AI render's own photo-frame cutoff (there's no real garment hem),
# consistent across subjects given the locked framing, so leaving a
# generous margin here means "SENIOR BASKETBALL" never runs into that
# cutoff line on any subject, not just the one the template came from.
CREST_TOP_FRAC = 0.20


def make(shape_path=SHAPE_SRC, mesh_path=MESH_SRC, crest_path=CREST_SRC,
         out_path=OUT, mesh_strength=MESH_STRENGTH,
         crest_w_frac=CREST_W_FRAC, crest_top_frac=CREST_TOP_FRAC):
    shape_alpha = Image.open(shape_path).convert("L")
    W, H = shape_alpha.size

    mesh = Image.open(mesh_path).convert("L")
    mesh_arr = np.array(mesh).astype(np.float32) / 128.0
    mesh_arr = 1.0 + (mesh_arr - 1.0) * (mesh_strength / 0.45)
    tiles_y = H // mesh_arr.shape[0] + 2
    tiles_x = W // mesh_arr.shape[1] + 2
    tiled = np.tile(mesh_arr, (tiles_y, tiles_x))[:H, :W]

    rgb = np.zeros((H, W, 3), np.float32)
    rgb[..., 0] = BASE[0] * tiled
    rgb[..., 1] = BASE[1] * tiled
    rgb[..., 2] = BASE[2] * tiled
    rgb = np.clip(rgb, 0, 255)

    sticker_arr = np.dstack([rgb, np.array(shape_alpha)]).astype(np.uint8)
    sticker = Image.fromarray(sticker_arr, "RGBA")

    crest = Image.open(crest_path).convert("RGBA")
    cw = int(W * crest_w_frac)
    scale = cw / crest.width
    ch = int(crest.height * scale)
    crest_r = crest.resize((cw, ch), Image.LANCZOS)
    cx = (W - cw) // 2
    cy = int(H * crest_top_frac)
    sticker.alpha_composite(crest_r, (cx, cy))

    sticker.save(out_path)
    print(f"wrote {out_path} ({W}x{H}), crest bottom at {cy + ch} of {H} "
          f"({(cy + ch) / H:.0%} down, {H - (cy + ch)}px margin to the bottom edge)")


if __name__ == "__main__":
    make()
