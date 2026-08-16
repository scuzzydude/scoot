#!/usr/bin/env python3
"""Post-processing step for the player-card pipeline (arch/player-cards.md v1.1).

ComfyUI's raw output is NOT the deliverable. This script:
  1. Re-mattes the alpha with rembg's anime-tuned model (isnet-anime — the
     comic illustration isn't a real photo anymore, so the human-photo model
     used for source-frame cutouts is the wrong tool here) so the background
     is genuinely transparent, not just "prompted away."
  2. Hard-thresholds the alpha (no anti-aliased fringe).
  3. Verifies true RGBA before writing anything — a prior batch shipped
     RGB-flattened files with the alpha channel silently destroyed (one
     came out white-on-white). This script refuses to write a file that
     fails the check instead of silently producing a bad one.
  4. Cleans up the jersey mask to pure black/white and confirms it matches
     the figure's dimensions.

Usage:
    python finalize_card.py <serial> <raw_figure.png> <raw_jersey_mask.png> <out_dir>

Writes <out_dir>/<serial>_figure.png and <out_dir>/<serial>_jersey_mask.png.
"""
import sys
import os
from rembg import remove, new_session
from PIL import Image
import numpy as np

_session = None


def get_session():
    global _session
    if _session is None:
        _session = new_session("isnet-anime")
    return _session


def verify_rgba(img: Image.Image, label: str) -> None:
    if img.mode != "RGBA":
        raise ValueError(f"{label}: expected RGBA, got {img.mode} — alpha channel would be lost")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    if alpha.min() == alpha.max():
        raise ValueError(
            f"{label}: alpha channel is flat ({alpha.min()}) — no real transparency, "
            f"this is the white-on-white failure mode, refusing to write"
        )


def finalize_figure(raw_path: str, out_path: str) -> None:
    with open(raw_path, "rb") as f:
        input_bytes = f.read()
    result = remove(input_bytes, session=get_session())

    img = Image.open(__import__("io").BytesIO(result)).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    hard_alpha = np.where(alpha > 100, 255, 0).astype(np.uint8)
    arr[:, :, 3] = hard_alpha

    out_img = Image.fromarray(arr, mode="RGBA")
    verify_rgba(out_img, out_path)
    out_img.save(out_path)


def finalize_jersey_mask(raw_mask_path: str, figure_size: tuple, out_path: str) -> None:
    mask = Image.open(raw_mask_path).convert("L")
    if mask.size != figure_size:
        mask = mask.resize(figure_size, Image.LANCZOS)
    arr = np.array(mask)
    hard = np.where(arr > 127, 255, 0).astype(np.uint8)
    Image.fromarray(hard, mode="L").save(out_path)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    serial, raw_figure, raw_mask, out_dir = sys.argv[1:5]
    os.makedirs(out_dir, exist_ok=True)

    figure_out = os.path.join(out_dir, f"{serial}_figure.png")
    mask_out = os.path.join(out_dir, f"{serial}_jersey_mask.png")

    finalize_figure(raw_figure, figure_out)
    fig_size = Image.open(figure_out).size
    finalize_jersey_mask(raw_mask, fig_size, mask_out)

    print("wrote", figure_out)
    print("wrote", mask_out)
