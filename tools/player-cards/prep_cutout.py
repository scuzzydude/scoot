#!/usr/bin/env python3
"""Preprocessing step for the player-card pipeline (arch/player-cards.md v1.1).

Cuts a player out of a source gym photo/video frame with rembg, so
ComfyUI's LineArtPreprocessor and OpenposePreprocessor get a clean subject
without gym clutter behind them. This cutout is a ControlNet conditioning
INPUT, never the deliverable — see workflow_player_card.json node 1.

Usage:
    python prep_cutout.py <source.jpg> <out_cutout.png>
"""
import sys
from rembg import remove, new_session

_session = None


def get_session():
    global _session
    if _session is None:
        _session = new_session("u2net_human_seg")
    return _session


def prep_cutout(src_path: str, out_path: str) -> None:
    with open(src_path, "rb") as f:
        input_bytes = f.read()
    result = remove(input_bytes, session=get_session())
    with open(out_path, "wb") as f:
        f.write(result)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    prep_cutout(sys.argv[1], sys.argv[2])
    print("wrote", sys.argv[2])
