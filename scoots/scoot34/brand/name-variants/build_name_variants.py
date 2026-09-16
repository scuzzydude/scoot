#!/usr/bin/env python3
"""
Full legal-name lockup variants for The Dream Laboratory.

Builds on build_wordmark.build(). Adds a stacked composer: the primary
scooter lockup with a letterspaced subline beneath it, centred, with the
subline optically tuned to the primary's width.
"""

import sys
sys.path.insert(0, "/home/claude")

from PIL import Image, ImageDraw, ImageFont
from build_wordmark import build, FONTS, size_for_cap, cap_metrics, CAP_PX

SUB_FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def subline(text, cap_px, tracking_ratio, color=(0, 0, 0)):
    """Letterspaced caps rendered as its own transparent strip."""
    pt = size_for_cap(SUB_FONT, cap_px)
    f = ImageFont.truetype(SUB_FONT, pt)
    cap_h, cap_top, cap_bot = cap_metrics(f)
    track = int(round(cap_h * tracking_ratio))

    widths = [f.getbbox(c)[2] - f.getbbox(c)[0] if c != " " else int(cap_h * 0.55)
              for c in text]
    advances = [f.getlength(c) for c in text]
    W = int(sum(advances) + track * (len(text) - 1)) + 4
    H = cap_h + 4
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 2.0
    for c in text:
        d.text((x, 2 - cap_top), c, font=f, fill=color + (255,))
        x += advances[c and 0 or 0] if False else f.getlength(c) + track
    return img


def stack(primary, sub, gap_ratio=0.55, fit=None):
    """Centre `sub` beneath `primary`. `fit` = fraction of primary width to
    scale the subline to (None keeps its natural size)."""
    if fit:
        target = int(primary.width * fit)
        sub = sub.resize((target, max(1, int(sub.height * target / sub.width))),
                         Image.LANCZOS)
    gap = int(round(sub.height * gap_ratio))
    W = max(primary.width, sub.width)
    H = primary.height + gap + sub.height
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(primary, ((W - primary.width) // 2, 0))
    out.alpha_composite(sub, ((W - sub.width) // 2, primary.height + gap))
    return out


def variants(color=(0, 0, 0)):
    v = {}

    # 1 — short mark, as locked
    v["1_short"] = build(color=color)

    # 2 — full name on one line, scooter as the pivot
    v["2_fullline"] = build(color=color, left_txt="THE DREAM",
                            right_txt="LABORATORY")

    # 3 — no article, scooter as the pivot
    v["3_noarticle"] = build(color=color, left_txt="DREAM",
                             right_txt="LABORATORY")

    # 4 — short mark over the full legal name, letterspaced
    primary = build(color=color)
    sub = subline("THE DREAM LABORATORY", int(CAP_PX * 0.30), 0.34, color)
    v["4_stacked"] = stack(primary, sub, gap_ratio=0.60, fit=0.86)

    # 5 — short mark over the full name AND the domain, two decks
    sub2 = subline("THE DREAM LABORATORY", int(CAP_PX * 0.28), 0.34, color)
    d1 = stack(primary, sub2, gap_ratio=0.55, fit=0.84)
    sub3 = subline("THEDREAMLABORATORY.ORG", int(CAP_PX * 0.17), 0.30, color)
    v["5_stacked_url"] = stack(d1, sub3, gap_ratio=0.65, fit=0.58)

    return v


if __name__ == "__main__":
    lab = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    titles = {
        "1_short": "1   DREAM ^ LAB   (locked short mark, 5.61:1)",
        "2_fullline": "2   THE DREAM ^ LABORATORY   (one line)",
        "3_noarticle": "3   DREAM ^ LABORATORY   (one line, no article)",
        "4_stacked": "4   short mark over the legal name",
        "5_stacked_url": "5   short mark, legal name, domain",
    }
    v = variants()
    TW = 1450
    rows = []
    for k in ["1_short", "2_fullline", "3_noarticle", "4_stacked", "5_stacked_url"]:
        im = v[k]
        im.save(f"/home/claude/out/var_{k}.png")
        rows.append((k, im.resize((TW, int(im.height * TW / im.width)), Image.LANCZOS),
                     im.width / im.height))

    H = sum(r[1].height + 118 for r in rows) + 50
    sheet = Image.new("RGB", (1650, H), "white")
    d = ImageDraw.Draw(sheet)
    y = 30
    for k, im, asp in rows:
        d.text((55, y), titles[k] if k != "1_short" else titles[k], font=lab, fill="black")
        y += 46
        sheet.paste(im, (110, y), im)
        y += im.height + 72
    sheet.save("/home/claude/out/name_variants.png")
    print(sheet.size)
    for k, im, asp in rows:
        print(f"{k:16s} aspect {asp:6.3f} : 1   -> at 5.00in wide = {5.0/asp:.3f}in tall")
