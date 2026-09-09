#!/usr/bin/env python3
"""Printer / cutter calibration sheet: the exact 6-up front+back imposition of
build_cards.py, but every card is one flat colour edge to edge. Default mix is
2 black, 2 white, 1 red, 1 yellow. Page 1 = fronts, page 2 = backs (mirrored
for a long-edge flip, like the real build), crop marks identical to the real
sheet so registration and cut accuracy can be checked against known colours.

    python3 solid_test_sheet.py --out cards_test_print_solid.pdf [--no-mirror]
        [--colors black,black,white,white,red,yellow]

Fills bleed 0.125 in past the trim only on the block's OUTER edges; at the
internal shared cut lines each card stops exactly on the line (a bleed there
would just paint over the neighbour).
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import build_cards as bc
from build_cards import (TRIM_H, TRIM_W, cell_origin, draw_crop_marks, register_fonts, sheet_label)

COLORS = {
    "black": "#000000", "white": "#FFFFFF", "red": "#FF0000", "yellow": "#FFFF00",
    "cyan": "#00FFFF", "magenta": "#FF00FF", "green": "#00FF00", "blue": "#0000FF",
}
DEFAULT_MIX = {4: "black,white,red,yellow", 6: "black,black,white,white,red,yellow"}


def solid_card(c, index, color_hex, mirror=False):
    x, y = cell_origin(index, mirror=mirror)
    # Cards don't touch (gutter = two bleeds), so bleed every side.
    b = bc.BLEED if bc.GUTTER > 0 else 0.0
    c.setFillColor(HexColor(color_hex))
    c.rect(x - b, y - b, TRIM_W + 2 * b, TRIM_H + 2 * b, stroke=0, fill=1)


def build(out_path, names, mirror_backs=True):
    n = bc.COLS * bc.ROWS
    if names is None:
        names = DEFAULT_MIX[n].split(",")
    if len(names) != n:
        sys.exit(f"need exactly {n} colours for this layout, got {len(names)}")
    for nm in names:
        if nm not in COLORS:
            sys.exit(f"unknown colour {nm!r}; choose from {', '.join(COLORS)}")
    register_fonts()
    c = canvas.Canvas(out_path, pagesize=(bc.PAGE_W, bc.PAGE_H))
    mix = " ".join(names)

    for i, nm in enumerate(names):
        solid_card(c, i, COLORS[nm])
    draw_crop_marks(c)
    sheet_label(c, f"Scoot(34) · SOLID COLOUR TEST · FRONTS · {mix} · trim 2.5x3.5in · print at 100%, no scaling")
    c.showPage()

    c.saveState()
    if mirror_backs and bc.back_rotation():
        c.translate(bc.PAGE_W, bc.PAGE_H)
        c.rotate(180)
    for i, nm in enumerate(names):
        solid_card(c, i, COLORS[nm], mirror=mirror_backs)
    draw_crop_marks(c)
    c.restoreState()
    sheet_label(c, f"Scoot(34) · SOLID COLOUR TEST · BACKS{' (mirrored for long-edge flip)' if mirror_backs else ''} · same colour as front")
    c.showPage()
    c.save()
    print(f"wrote {out_path}  ({n} cards, 2 pages: {mix})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="cards_test_print_solid.pdf")
    ap.add_argument("--colors", default=None, help="comma-separated names, one per card, reading order left→right, top→bottom")
    ap.add_argument("--no-mirror", action="store_true", help="do not mirror the back sheet (manual duplex)")
    ap.add_argument("--layout", choices=sorted(bc.LAYOUTS), default=bc.DEFAULT_LAYOUT)
    ap.add_argument("--flip", choices=["long", "short"], default="long")
    a = ap.parse_args()
    bc.set_layout(a.layout, a.flip)
    build(a.out, [s.strip().lower() for s in a.colors.split(",")] if a.colors else None, mirror_backs=not a.no_mirror)
