#!/usr/bin/env python3
"""
Scoot(34) player card generator
===============================

Builds print-ready, 6-up imposed PDFs from a roster CSV plus silhouette art.

    python3 build_cards.py --roster roster.csv --art art/ --out cards_2026.pdf

Geometry
    trim        2.500 x 3.500 in   (standard trading card)
    bleed       0.125 in on all four sides
    chip band   6 pt (approx 1/12 in) around the perimeter
    art slot    168 x 240 pt  ->  700 x 1000 px at 300 dpi

Cards are butted edge to edge so adjacent cards share a cut line.
Crop marks sit outside the block. Six cards per letter sheet.
"""

import argparse
import csv
import hashlib
import io
import os
import sys

from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------- geometry ---

IN = 72.0
TRIM_W, TRIM_H = 2.5 * IN, 3.5 * IN          # 180 x 252 pt
BLEED = 0.125 * IN                            # 9 pt
BAND = 6.0                                    # chip band thickness
ART_W, ART_H = TRIM_W - 2 * BAND, TRIM_H - 2 * BAND   # 168 x 240 pt

STRIPE, GAP, KEEPOUT = 13.0, 13.0, 14.0       # chip edge rhythm

COLS, ROWS = 3, 2                             # 6-up on letter
PAGE_W, PAGE_H = letter

# ------------------------------------------------------------------ palette ---

INK = HexColor("#1A1A18")
PAPER = HexColor("#FFFFFF")
GHOST = HexColor("#F4F1E8")
GHOST_RULE = HexColor("#E8E4D8")
MUTED = HexColor("#8A8880")
SUBTLE = HexColor("#5F5E5A")
HAIR = HexColor("#D3D1C7")
SLATE = HexColor("#6B6960")

# tier -> (field colour, ink-on-field colour)
TIERS = {
    # Fields stay light enough that a solid black silhouette always reads.
    "Rookie":     ("#E3DFD2", "#1A1A18"),   # bone
    "55+":        ("#E3DFD2", "#1A1A18"),   # bone -- general roster age tier
    "Brother":    ("#79C2AE", "#1A1A18"),   # teal
    "Sister":     ("#79C2AE", "#1A1A18"),
    "OG":         ("#EF9F27", "#1A1A18"),   # amber
    "Double OG":  ("#E9764F", "#1A1A18"),   # coral
    "Triple OG":  ("#A79BE0", "#1A1A18"),   # periwinkle
    "Legend":     ("#C9B037", "#1A1A18"),   # antique gold
    "Starter":    ("#FFFFFF", "#1A1A18"),   # bare token white
}
DEFAULT_TIER = ("#E3DFD2", "#1A1A18")


def tier_colors(tier):
    field, on_field = TIERS.get((tier or "").strip(), DEFAULT_TIER)
    return HexColor(field), HexColor(on_field)


def fit_font_size(text, font, max_size, max_width, min_size=11):
    """Largest size <= max_size at which `text` fits `max_width` in `font`,
    never going below min_size. 2026-08-27: the nameplate handle was drawn
    at a fixed size regardless of length -- a long handle ("The Nightmare")
    runs into the tier label sharing the same bar. stringWidth scales
    linearly with font size, so one measurement at max_size gives the exact
    scale factor needed, no search loop required."""
    if not text:
        return max_size
    w = pdfmetrics.stringWidth(text, font, max_size)
    if w <= max_width:
        return max_size
    return max(min_size, max_width / w * max_size)


def tint(hex_color, amount=0.12):
    """Darken a colour slightly, for the ghosted 34 behind the figure."""
    c = HexColor(hex_color) if isinstance(hex_color, str) else hex_color
    return HexColor("#%02X%02X%02X" % (
        int(max(0, c.red * (1 - amount)) * 255),
        int(max(0, c.green * (1 - amount)) * 255),
        int(max(0, c.blue * (1 - amount)) * 255),
    ))


# -------------------------------------------------------------------- fonts ---

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONTS = {
    "Cond":     "DejaVuSansCondensed.ttf",
    "CondBold": "DejaVuSansCondensed-Bold.ttf",
    "Mono":     "DejaVuSansMono.ttf",
    "MonoBold": "DejaVuSansMono-Bold.ttf",
}


def register_fonts():
    for name, filename in FONTS.items():
        path = os.path.join(FONT_DIR, filename)
        if not os.path.exists(path):
            print(f"warning: missing font {path}, falling back to Helvetica",
                  file=sys.stderr)
            return False
        pdfmetrics.registerFont(TTFont(name, path))
    return True


# ------------------------------------------------------------- chip band -----

def stripe_starts(length, stripe=STRIPE, gap=GAP, keepout=KEEPOUT):
    """Evenly spaced stripe origins along one edge, corners kept solid."""
    usable = length - 2 * keepout
    period = stripe + gap
    n = int((usable + gap) // period)
    if n < 1:
        return []
    total = n * stripe + (n - 1) * gap
    start = keepout + (usable - total) / 2.0
    return [start + i * period for i in range(n)]


def draw_band(c, x, y, band_color, stripe_color):
    """Chip perimeter: solid band with stripes, extended into the bleed."""
    c.setFillColor(band_color)
    c.rect(x - BLEED, y - BLEED,
           TRIM_W + 2 * BLEED, TRIM_H + 2 * BLEED, stroke=0, fill=1)

    c.setFillColor(stripe_color)
    for sx in stripe_starts(TRIM_W):
        c.rect(x + sx, y - BLEED, STRIPE, BAND + BLEED, stroke=0, fill=1)
        c.rect(x + sx, y + TRIM_H - BAND, STRIPE, BAND + BLEED, stroke=0, fill=1)
    for sy in stripe_starts(TRIM_H):
        c.rect(x - BLEED, y + sy, BAND + BLEED, STRIPE, stroke=0, fill=1)
        c.rect(x + TRIM_W - BAND, y + sy, BAND + BLEED, STRIPE, stroke=0, fill=1)


# ------------------------------------------------------------- scoot glyph ---

# Reversible jersey. The pipeline delivers one cel-shaded figure plus a jersey
# mask; the card recolours that mask rather than generating two illustrations.
# Front shows the dark side, back shows the light side. base = lit tone,
# shadow = cel shadow tone; the figure's own luminance drives the blend so the
# original shading survives the recolour.
JERSEY = {
    "dark":  ("#2E2E2A", "#121210"),
    "light": ("#F4F1E8", "#BFBBAD"),
}
_JERSEY_CACHE = {}

# Full display name for the back card's vitals line -- "home" in the
# roster CSV is the short gym key ("Fonde", "Judson"), not what gets
# printed.
HOME_LABELS = {
    "Fonde": "Fonde Rec Center",
}


def _hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def jersey_variant(serial, art_dir, side):
    """Composite {serial}_figure.png + {serial}_jersey_mask.png into a figure
    wearing the requested side of the jersey. Returns a path, or None."""
    key = (serial, side)
    if key in _JERSEY_CACHE:
        return _JERSEY_CACHE[key]

    fig = os.path.join(art_dir, f"{serial}_figure.png")
    msk = os.path.join(art_dir, f"{serial}_jersey_mask.png")
    if not (os.path.exists(fig) and os.path.exists(msk)):
        _JERSEY_CACHE[key] = None
        return None

    # "dark" side: the art pipeline (modal_app_jersey.py's composite_jersey)
    # already delivers brand-hex-correct jersey color AND the real Fonde
    # crest baked in as true-white pixels -- pass it through unchanged.
    # Recoloring here used to remap the WHOLE masked region by luminance
    # (simulating fabric shading for a blank AI-generated jersey, the
    # original spec before the crest got baked in), which treated the
    # crest's white ink as just the brightest highlight on the fabric and
    # remapped it down to the dark base tone -- confirmed via direct pixel
    # sampling: crest read true white (~254) in the source figure.png but
    # ~46 (JERSEY["dark"][0], #2E2E2A) after this recolor. Only "light"
    # (the back-of-card reverse jersey, not yet built) still needs the
    # recolor -- there's no brand-correct pre-colored source for that side.
    if side == "dark":
        _JERSEY_CACHE[key] = fig
        return fig

    from PIL import Image
    import numpy as np

    im = Image.open(fig).convert("RGBA")
    mk = Image.open(msk).convert("L").resize(im.size, Image.LANCZOS)
    a = np.array(im).astype(np.float32)
    m = (np.array(mk).astype(np.float32) / 255.0)[..., None]

    # Flat fill, no luminance-based shading -- 2026-08-27 feedback: the
    # mesh/shading blend doesn't read at the back panel's small size,
    # just a flat light jersey with the figure's own ink linework
    # providing the only shading.
    base = np.array(_hex_rgb(JERSEY[side][0]), np.float32)
    a[..., 0:3] = a[..., 0:3] * (1 - m) + base[None, None, :] * m

    out_dir = os.path.join(art_dir, ".variants")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{serial}_{side}.png")
    Image.fromarray(a.astype(np.uint8), "RGBA").save(out)
    _JERSEY_CACHE[key] = out
    return out


def player_art(serial, art_dir, side, legacy_suffix):
    """Prefer the figure+mask pipeline; fall back to pre-rendered art."""
    if not art_dir:
        return None
    v = jersey_variant(serial, art_dir, side)
    if v:
        return v
    legacy = os.path.join(art_dir, f"{serial}_{legacy_suffix}.png")
    return legacy if os.path.exists(legacy) else None


_HEAD_CROP_CACHE = {}


def head_crop(serial, art_dir, side, panel_w, panel_h):
    """Tight head-and-shoulders crop of the jersey_variant art, for the
    back card's small side panel -- headshot framing with the jersey
    just visible at the shoulders, not the same waist-up front pose
    shrunk down. Crops relative to the figure's own alpha-content bbox
    (not fixed pixels) so it generalizes across the roster's real,
    if small, per-subject scale variation."""
    src = jersey_variant(serial, art_dir, side)
    if not src:
        return None
    key = (serial, side, panel_w, panel_h)
    if key in _HEAD_CROP_CACHE:
        return _HEAD_CROP_CACHE[key]

    from PIL import Image
    import numpy as np

    im = Image.open(src).convert("RGBA")
    alpha = np.array(im)[..., 3]
    ys, xs = np.where(alpha > 10)
    if len(ys) == 0:
        _HEAD_CROP_CACHE[key] = None
        return None
    y0, y1 = int(ys.min()), int(ys.max())
    content_h = y1 - y0

    # head_cx from just the top band (head only, not the wider
    # shoulders/arms below) -- more reliable than the full-figure
    # bbox center on an asymmetric pose.
    head_band_bottom = y0 + int(content_h * 0.35)
    band_xs = np.where(alpha[y0:head_band_bottom].max(axis=0) > 10)[0]
    head_cx = (band_xs.min() + band_xs.max()) / 2.0 if len(band_xs) else im.width / 2.0

    crop_top = max(0, y0 - int(content_h * 0.02))
    crop_bottom = min(im.height, y0 + int(content_h * 0.50))
    crop_h = crop_bottom - crop_top
    crop_w = crop_h * (panel_w / panel_h)
    x0 = int(round(head_cx - crop_w / 2.0))
    x1 = int(round(head_cx + crop_w / 2.0))

    out_dir = os.path.join(art_dir, ".variants")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{serial}_{side}_head.png")
    im.crop((x0, crop_top, x1, crop_bottom)).save(out)
    _HEAD_CROP_CACHE[key] = out
    return out


ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
GLYPH_PNG = os.path.join(ASSETS, "scoot_glyph_black_transparent.png")
GLYPH_WHITE_PNG = os.path.join(ASSETS, "scoot_glyph_white_transparent.png")
GHOST_PNG = os.path.join(ASSETS, "scoot_glyph_ghost.png")
GLYPH_ASPECT = 0.5337                 # w/h of the official mark

# ---------------------------------------------------------- card lookup code ---
# Short, typeable code for the QR/manual-entry corner mark. Not the serial
# itself -- the serial's sequential 34-DRAFT-NN pattern would let anyone who
# sees one card guess the rest. Derived, not stored: with a fixed ~25-member
# roster, resolving a code back to its player is just checking it against
# every known serial's own derived code (no separate mapping table needed).
# Placeholder resolver URL -- no /c/<code> route exists yet, see PLACEHOLDER
# note in draw_front().
CARD_CODE_SECRET = "scoot34-card-v1"     # not a real secret -- obfuscation only
CARD_CODE_BASE_URL = "https://thedreamlaboratory.org/c/"


def short_code(serial):
    """6-char uppercase hex code, deterministic per serial. Hex avoids the
    0/O/1/I ambiguity a human has to resolve when typing a code by hand."""
    digest = hashlib.sha256(f"{serial}{CARD_CODE_SECRET}".encode()).hexdigest()
    return digest[:6].upper()


def edition_label(row):
    """What's PRINTED where the serial used to show -- the QR/hash code is
    now the card's actual unique identifier, so the visible small-print
    label is just "34-<edition>" (same on every card in a print run), not
    the per-card serial. Printing the real 34-DRAFT-NN serial defeated the
    whole point of hashing it for the QR: anyone holding one card could
    read the next sequential serial straight off the card face."""
    return f"34-{row.get('edition', '').strip() or '2026'}"


def draw_glyph(c, cx, cy, r, disc_color, ink_color, invert=False):
    """The scoot token mark, inside a disc.

    Uses the official mark from assets/. Falls back to a drawn stand-in if
    the asset is absent.
    """
    c.setFillColor(disc_color)
    c.circle(cx, cy, r, stroke=0, fill=1)

    src = GLYPH_WHITE_PNG if invert else GLYPH_PNG
    if os.path.exists(src):
        gh = r * 1.46
        gw = gh * GLYPH_ASPECT
        c.drawImage(src, cx - gw / 2.0, cy - gh / 2.0,
                    width=gw, height=gh, mask="auto")
        return

    s = r / 17.0                      # fallback: drawn stand-in
    c.saveState()
    c.translate(cx, cy)
    c.scale(s, s)
    c.setFillColor(ink_color)
    c.setStrokeColor(ink_color)

    c.circle(3, 9, 3, stroke=0, fill=1)                     # head
    p = c.beginPath()                                        # torso
    p.moveTo(0, 6); p.lineTo(7, 8); p.lineTo(9, 0); p.lineTo(2, -2)
    p.close(); c.drawPath(p, stroke=0, fill=1)
    p = c.beginPath()                                        # trailing leg
    p.moveTo(2, -1); p.lineTo(8, -6); p.lineTo(11, -4); p.lineTo(5, 2)
    p.close(); c.drawPath(p, stroke=0, fill=1)

    c.setLineWidth(2); c.setLineCap(1)
    c.line(-6, -7, -4, 3)                                    # stem
    c.line(-9, 4, -2, 5)                                     # handlebar
    c.line(-8, -9, 4, -9)                                    # deck
    c.circle(-7, -12, 2.2, stroke=0, fill=1)                 # wheels
    c.circle(3, -12, 2.2, stroke=0, fill=1)
    c.restoreState()


_qr_cache = {}


def draw_qr(c, right_x, top_y, size, url, ink_color):
    """QR code with its top-right corner pinned at (right_x, top_y) --
    mirrors draw_glyph's top-left placement. Cached per URL since the
    same 24-person roster is rendered front+back, twice (fronts, then
    mirrored backs) per build."""
    import qrcode
    from reportlab.lib.utils import ImageReader

    if url not in _qr_cache:
        qr = qrcode.QRCode(border=1, error_correction=qrcode.constants.ERROR_CORRECT_M)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#%02x%02x%02x" % (
            int(ink_color.red * 255), int(ink_color.green * 255), int(ink_color.blue * 255)),
            back_color="white").convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        _qr_cache[url] = ImageReader(buf)

    c.drawImage(_qr_cache[url], right_x - size, top_y - size,
                width=size, height=size)


def draw_placeholder_figure(c, x, y, w, h, ink_color):
    """Stand-in silhouette used when no art file is present."""
    c.saveState()
    c.setFillColor(ink_color)
    cx = x + w / 2.0
    c.circle(cx, y + h * 0.76, w * 0.155, stroke=0, fill=1)         # head
    p = c.beginPath()                                                # torso
    p.moveTo(cx, y + h * 0.62)
    p.curveTo(cx - w * 0.26, y + h * 0.60, cx - w * 0.36, y + h * 0.42,
              cx - w * 0.40, y)
    p.lineTo(cx + w * 0.40, y)
    p.curveTo(cx + w * 0.36, y + h * 0.42, cx + w * 0.26, y + h * 0.60,
              cx, y + h * 0.62)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.setLineWidth(w * 0.085); c.setLineCap(1)                       # shoulders
    c.setStrokeColor(ink_color)
    c.line(cx - w * 0.24, y + h * 0.50, cx - w * 0.33, y + h * 0.26)
    c.line(cx + w * 0.24, y + h * 0.50, cx + w * 0.33, y + h * 0.26)
    c.restoreState()


# -------------------------------------------------------------- card faces ---

def draw_front(c, x, y, row, art_dir):
    field, on_field = tier_colors(row.get("tier"))
    serial = row.get("serial", "").strip()

    draw_band(c, x, y, INK, PAPER)

    # blank white field behind the figure
    c.setFillColor(PAPER)
    c.rect(x + BAND, y + BAND, ART_W, ART_H, stroke=0, fill=1)

    # silhouette
    art = player_art(serial, art_dir, "dark", "front")
    if art:
        c.drawImage(art, x + BAND, y + BAND, width=ART_W, height=ART_H,
                    mask="auto", preserveAspectRatio=False, anchor="c")
    else:
        draw_placeholder_figure(c, x + BAND, y + BAND + 34, ART_W, ART_H - 34,
                                INK)

    # nameplate
    bar_h = 34.0
    c.setFillColor(INK)
    c.rect(x + BAND, y + BAND, ART_W, bar_h, stroke=0, fill=1)
    c.setFillColor(field)
    c.rect(x + BAND, y + BAND + bar_h - 1.6, ART_W, 1.6, stroke=0, fill=1)

    handle = row.get("handle", "").strip()
    tier_text = row.get("tier", "").strip()
    tier_x = x + TRIM_W - BAND - 8
    tier_w = pdfmetrics.stringWidth(tier_text, "Cond", 7.5) if tier_text else 0
    handle_x = x + BAND + 8
    handle_avail = (tier_x - tier_w - 10) - handle_x
    handle_size = fit_font_size(handle, "CondBold", 19, handle_avail)

    c.setFillColor(PAPER)
    c.setFont("CondBold", handle_size)
    c.drawString(handle_x, y + BAND + 14, handle)

    c.setFillColor(field)
    c.setFont("Cond", 7.5)
    c.drawRightString(tier_x, y + BAND + 19, tier_text)
    c.setFillColor(MUTED)
    c.setFont("Mono", 6)
    c.drawRightString(x + TRIM_W - BAND - 8, y + BAND + 8, edition_label(row))

    # token mark
    draw_glyph(c, x + BAND + 22, y + TRIM_H - BAND - 22, 14, INK, PAPER,
               invert=True)

    # lookup QR, mirrored top-right of the glyph -- PLACEHOLDER: encodes
    # https://thedreamlaboratory.org/c/<code>, no /c/<code> resolver route
    # exists yet. Code is also printed as text so it can be typed into a
    # screen if scanning isn't practical (small print size, bad lighting).
    code = short_code(serial)
    qr_right = x + TRIM_W - BAND - 8
    qr_top = y + TRIM_H - BAND - 8
    qr_size = 28.0
    draw_qr(c, qr_right, qr_top, qr_size, CARD_CODE_BASE_URL + code, INK)
    c.setFillColor(INK)
    c.setFont("MonoBold", 5.5)
    c.drawRightString(qr_right, qr_top - qr_size - 7, code)


def draw_back(c, x, y, row, art_dir):
    field, _ = tier_colors(row.get("tier"))
    serial = row.get("serial", "").strip()

    draw_band(c, x, y, PAPER, INK)

    ix, iy = x + BAND, y + BAND
    c.setFillColor(PAPER)
    c.rect(ix, iy, ART_W, ART_H, stroke=0, fill=1)

    # ghosted token behind everything
    c.saveState()
    clip = c.beginPath()
    clip.rect(ix, iy, ART_W, ART_H)
    c.clipPath(clip, stroke=0, fill=0)
    if os.path.exists(GHOST_PNG):
        gh = ART_H * 0.86
        gw = gh * GLYPH_ASPECT
        c.drawImage(GHOST_PNG, x + TRIM_W * 0.60 - gw / 2.0,
                    y + TRIM_H * 0.40 - gh / 2.0,
                    width=gw, height=gh, mask="auto")
    else:
        c.setFillColor(GHOST)
        c.circle(x + TRIM_W / 2.0, y + TRIM_H * 0.44, ART_W * 0.55,
                 stroke=0, fill=1)
    c.restoreState()

    top = iy + ART_H
    L, R = ix + 8, ix + ART_W - 8

    # header
    hdr_h = 22.0
    c.setFillColor(INK)
    c.rect(ix, top - hdr_h, ART_W, hdr_h, stroke=0, fill=1)
    handle = row.get("handle", "").strip()
    tier_text = row.get("tier", "").strip()
    tier_w = pdfmetrics.stringWidth(tier_text, "Cond", 8) if tier_text else 0
    handle_avail = (R - tier_w - 10) - L
    handle_size = fit_font_size(handle, "CondBold", 13, handle_avail, min_size=8)

    c.setFillColor(PAPER)
    c.setFont("CondBold", handle_size)
    c.drawString(L, top - hdr_h + 7, handle)
    c.setFillColor(field)
    c.setFont("Cond", 8)
    c.drawRightString(R, top - hdr_h + 7.5, tier_text)

    # vitals -- real first name + home gym (position data isn't real
    # yet, and the handle's already up in the header)
    c.setFillColor(SUBTLE)
    c.setFont("Cond", 7)
    home_label = HOME_LABELS.get(row.get("home", "").strip(), row.get("home", "").strip())
    vitals = " · ".join(v for v in [row.get("name", "").strip(), home_label] if v)
    c.drawString(L, top - hdr_h - 12, vitals)

    # side-pose panel -- headshot crop, jersey just visible at the
    # shoulders. Slate background (not black, not white) so the flat
    # light jersey/ink linework actually has contrast to read against
    # (2026-08-27 feedback -- plain white let it disappear).
    pw, ph = 52.0, 62.0
    px, py = L, top - hdr_h - 20 - ph
    c.setFillColor(SLATE)
    c.rect(px, py, pw, ph, stroke=0, fill=1)
    side = head_crop(serial, art_dir, "light", pw, ph)
    if side:
        c.drawImage(side, px, py, width=pw, height=ph,
                    mask="auto", preserveAspectRatio=False, anchor="c")
    else:
        draw_placeholder_figure(c, px, py, pw, ph, PAPER)
    c.setStrokeColor(INK); c.setLineWidth(1.2)
    c.rect(px, py, pw, ph, stroke=1, fill=0)

    # detail rows beside the panel -- "aka" replaces "signature" (not
    # used); blank for most people, populated for anyone with a real
    # known nickname beyond their card handle (e.g. KennyG -> "The
    # Snake", Black -> "B1").
    dx = px + pw + 10
    dy = top - hdr_h - 28
    for label, value in (("Aka", row.get("aka", "")),
                         ("Joined", row.get("joined", ""))):
        c.setFillColor(MUTED); c.setFont("Cond", 6.5)
        c.drawString(dx, dy, label.lower())
        c.setFillColor(INK); c.setFont("CondBold", 9)
        c.drawString(dx, dy - 11, value.strip())
        dy -= 26

    # season table
    ty = py - 12
    th = 40.0
    c.setFillColor(HexColor("#E3DFD2"))
    c.rect(ix, ty - th, ART_W, th, stroke=0, fill=1)
    cols = [L, ix + ART_W * 0.50, ix + ART_W * 0.68, ix + ART_W * 0.86]
    heads = ["season", "g", "win %", "+/-"]
    c.setFillColor(SUBTLE); c.setFont("Cond", 6.5)
    for cx_, head in zip(cols, heads):
        if head == "season":
            c.drawString(cx_, ty - 10, head)
        else:
            c.drawCentredString(cx_, ty - 10, head)
    c.setStrokeColor(HexColor("#B4B2A9")); c.setLineWidth(0.5)
    c.line(L, ty - 14, R, ty - 14)

    rows = [(row.get("edition", ""), row.get("g", "—"),
             row.get("winpct", "—"), row.get("plusminus", "—")),
            ("career", row.get("g_career", "—"),
             row.get("winpct_career", "—"), row.get("pm_career", "—"))]
    ry = ty - 24
    for i, r in enumerate(rows):
        c.setFillColor(INK if i == 0 else SUBTLE)
        c.setFont("CondBold" if i == 0 else "Cond", 8)
        c.drawString(cols[0], ry, str(r[0]).strip() or "—")
        for cx_, val in zip(cols[1:], r[1:]):
            c.drawCentredString(cx_, ry, str(val).strip() or "—")
        if i == 0:
            c.setStrokeColor(HAIR); c.setLineWidth(0.4)
            c.line(L, ry - 5, R, ry - 5)
        ry -= 13

    # profile
    py2 = ty - th - 12
    c.setFillColor(MUTED); c.setFont("Cond", 6.5)
    c.drawString(L, py2, "profile")
    c.setFillColor(INK); c.setFont("Cond", 7.5)
    for i in (1, 2, 3):
        line = row.get(f"profile_{i}", "").strip()
        if line:
            c.drawString(L, py2 - 10 * i, line)

    # edition (not the per-card serial -- see edition_label())
    c.setFillColor(MUTED); c.setFont("Mono", 6)
    c.drawRightString(R, iy + 8, edition_label(row))
    c.setFont("Cond", 6.5)
    c.drawString(L, iy + 8, "thedreamlaboratory.org")


# ------------------------------------------------------------- imposition ---

def block_origin():
    bw, bh = COLS * TRIM_W, ROWS * TRIM_H
    return (PAGE_W - bw) / 2.0, (PAGE_H - bh) / 2.0


def cell_origin(index, mirror=False):
    ox, oy = block_origin()
    col, rowi = index % COLS, index // COLS
    if mirror:
        col = COLS - 1 - col
    return ox + col * TRIM_W, oy + (ROWS - 1 - rowi) * TRIM_H


def draw_crop_marks(c):
    ox, oy = block_origin()
    bw, bh = COLS * TRIM_W, ROWS * TRIM_H
    c.setStrokeColor(HexColor("#000000"))
    c.setLineWidth(0.35)
    reach, off = 12.0, BLEED + 3.0
    for i in range(COLS + 1):
        gx = ox + i * TRIM_W
        c.line(gx, oy - off, gx, oy - off - reach)
        c.line(gx, oy + bh + off, gx, oy + bh + off + reach)
    for j in range(ROWS + 1):
        gy = oy + j * TRIM_H
        c.line(ox - off, gy, ox - off - reach, gy)
        c.line(ox + bw + off, gy, ox + bw + off + reach, gy)


def sheet_label(c, text):
    c.setFillColor(HexColor("#999999"))
    c.setFont("Cond", 7)
    c.drawString(36, 24, text)


# -------------------------------------------------------------------- main ---

def build(roster_path, art_dir, out_path, mirror_backs=True):
    with open(roster_path, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh)
                if (r.get("serial") or "").strip()]
    if not rows:
        sys.exit("roster is empty")

    c = canvas.Canvas(out_path, pagesize=letter)
    per_sheet = COLS * ROWS

    for start in range(0, len(rows), per_sheet):
        chunk = rows[start:start + per_sheet]
        sheet_no = start // per_sheet + 1

        for i, row in enumerate(chunk):
            cx, cy = cell_origin(i)
            draw_front(c, cx, cy, row, art_dir)
        draw_crop_marks(c)
        sheet_label(c, f"Scoot(34) · sheet {sheet_no} · FRONTS · "
                       f"trim 2.5x3.5in · print at 100%, no scaling")
        c.showPage()

        for i, row in enumerate(chunk):
            cx, cy = cell_origin(i, mirror=mirror_backs)
            draw_back(c, cx, cy, row, art_dir)
        draw_crop_marks(c)
        sheet_label(c, f"Scoot(34) · sheet {sheet_no} · BACKS"
                       f"{' (mirrored for long-edge flip)' if mirror_backs else ''}")
        c.showPage()

    c.save()
    print(f"wrote {out_path}  ({len(rows)} cards, "
          f"{-(-len(rows) // per_sheet) * 2} pages)")


def main():
    ap = argparse.ArgumentParser(description="Build Scoot(34) player cards.")
    ap.add_argument("--roster", default="roster.csv")
    ap.add_argument("--art", default="art",
                    help="folder of {serial}_figure.png + {serial}_jersey_mask.png")
    ap.add_argument("--out", default="scoot34_cards.pdf")
    ap.add_argument("--no-mirror", action="store_true",
                    help="do not mirror back sheets (use for manual duplex)")
    args = ap.parse_args()

    register_fonts()
    build(args.roster, args.art, args.out, mirror_backs=not args.no_mirror)


if __name__ == "__main__":
    main()
