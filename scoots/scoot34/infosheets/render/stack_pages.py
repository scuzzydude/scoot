#!/usr/bin/env python3
"""Stack two page images onto one Letter sheet and write it as a PDF.

usage: stack_pages.py IMG1 IMG2 OUT.pdf      (IMG may be a URL or a path)
Used for the rules back-page of the next-up list print piece.
"""
import sys
from io import BytesIO
from urllib.request import urlopen

from PIL import Image

DPI = 150
W, H = int(8.5 * DPI), int(11 * DPI)
MARGIN = int(0.5 * DPI)
GAP = int(0.28 * DPI)


def load(src):
    if src.startswith("http"):
        return Image.open(BytesIO(urlopen(src).read())).convert("RGB")
    return Image.open(src).convert("RGB")


def main():
    a, b, out = sys.argv[1], sys.argv[2], sys.argv[3]
    page = Image.new("RGB", (W, H), "white")
    target = W - 2 * MARGIN
    scaled = [
        im.resize((target, round(im.height * target / im.width)), Image.LANCZOS)
        for im in (load(a), load(b))
    ]
    total = sum(i.height for i in scaled) + GAP
    if total > H - 2 * MARGIN:
        raise SystemExit(f"stacked pages are {total/DPI:.2f}in — too tall for one sheet")
    y = max(MARGIN, (H - total) // 2)
    for im in scaled:
        page.paste(im, (MARGIN, y))
        y += im.height + GAP
    page.save(out, "PDF", resolution=DPI)
    print(out)


if __name__ == "__main__":
    main()
