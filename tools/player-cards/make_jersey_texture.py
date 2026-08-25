#!/usr/bin/env python3
"""Build the standalone flat jersey texture (base color + subtle
baked-in mesh + centered crest) used by modal_app_jersey.py's
composite_jersey() dark-side stamp.

Replaces the earlier approach of recoloring each subject's AI-generated
jersey pixels in place, then tiling a strong mesh multiplier and pasting
the crest onto that per-subject segmentation. Brandon's read on Cleo's
card 2026-08-25: the tiled multiplier read as an uneven "shadow" once
applied over a curved, already-segmented silhouette, and the crest's
position/size (computed from mask geometry each time) kept looking off.
Baking mesh + crest into ONE flat texture, authored and previewable
here on its own before it's ever stamped onto a person, fixes both --
the mesh intensity is tuned once at a sane strength, and the crest is
correctly centered by construction rather than re-derived per subject.

    python3 make_jersey_texture.py

Writes assets/jersey_texture_dark.png. After changing this, re-upload
it to Blob (card-art/assets/jersey_texture_dark.png) so
modal_app_jersey.py picks up the new version -- see that file's
JERSEY_TEXTURE_BLOB.
"""
import os

from PIL import Image
import numpy as np

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
MESH_SRC = os.path.join(ASSETS, "mesh_texture_mult.png")
CREST_SRC = os.path.join(ASSETS, "fonde_crest_white.png")
OUT = os.path.join(ASSETS, "jersey_texture_dark.png")

# ~1.5:1 -- matches a typical garment-mask bbox aspect (shoulder-to-
# shoulder width vs. collar-to-hem height) so the crest doesn't get
# stretched into an oval when the texture is later fit to a subject's
# actual bbox in composite_jersey().
W, H = 1200, 800
BASE = (0x2E, 0x2E, 0x2A)

# Mesh multiplier's native swing is 0.65x-1.45x (see MESH_TEXTURE_BLOB's
# own comment in modal_app_jersey.py) -- rescaled way down since this is
# authored once and eyeballed here, not applied blind at runtime over a
# curved, already-segmented silhouette.
MESH_STRENGTH = 0.06
CREST_W_FRAC = 0.34
CREST_Y_FRAC = 0.24


def make(mesh_path=MESH_SRC, crest_path=CREST_SRC, out_path=OUT,
         mesh_strength=MESH_STRENGTH, crest_w_frac=CREST_W_FRAC,
         crest_y_frac=CREST_Y_FRAC):
    canvas = Image.new("RGBA", (W, H), BASE + (255,))

    mesh = Image.open(mesh_path).convert("L")
    mesh_arr = np.array(mesh).astype(np.float32) / 128.0
    mesh_arr = 1.0 + (mesh_arr - 1.0) * (mesh_strength / 0.45)
    tiles_y = H // mesh_arr.shape[0] + 2
    tiles_x = W // mesh_arr.shape[1] + 2
    tiled = np.tile(mesh_arr, (tiles_y, tiles_x))[:H, :W][..., None]

    base_arr = np.array(canvas).astype(np.float32)
    base_arr[..., 0:3] = np.clip(base_arr[..., 0:3] * tiled, 0, 255)
    canvas = Image.fromarray(base_arr.astype(np.uint8), "RGBA")

    crest = Image.open(crest_path).convert("RGBA")
    cw = int(W * crest_w_frac)
    scale = cw / crest.width
    ch = int(crest.height * scale)
    crest_r = crest.resize((cw, ch), Image.LANCZOS)
    cx = (W - cw) // 2
    cy = int(H * crest_y_frac)
    canvas.alpha_composite(crest_r, (cx, cy))

    canvas.save(out_path)
    print(f"wrote {out_path} ({W}x{H}, mesh_strength={mesh_strength}, "
          f"crest_w_frac={crest_w_frac}, crest_y_frac={crest_y_frac})")


if __name__ == "__main__":
    make()
