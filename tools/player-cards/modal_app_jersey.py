"""Scoot(34) player-card jersey compositing.

Finds THIS subject's own jersey outline directly -- the AI always
renders it as pure solid black, so a plain darkness threshold + largest
connected component in the lower part of the frame traces the exact
garment shape the model already drew -- and bakes mesh weave + the
Fonde crest onto it in place. No borrowed shape, no per-subject
recolor beyond a flat base-color fill (the source has no shading to
preserve, it really is flat black), no ML classifier.

History, 2026-08-19 through 2026-08-25 -- three earlier approaches, all
replaced:
  1. segformer_b2_clothes classifying "Upper-clothes" pixels, recolored
     in place, mesh/crest layered on with runtime geometry math.
     Classifier bled into skin/neck/arms repeatedly; crest position
     never quite centered.
  2. A flat rectangular texture (base+mesh+crest baked into one asset)
     stamped into the classifier's mask bbox. Fixed the crest centering
     but the mesh still read as an uneven shadow on the sleeves/neck,
     and stretching a rectangle into an arbitrary bbox distorted the
     crest into an oval.
  3. A garment-SHAPED sticker (real alpha silhouette) built from one
     subject's own mask, stretched to fit each new subject's detected
     bbox. Brandon's read: this still distorted and "overwrote" arms/
     torso on subjects whose proportions didn't match the donor shape,
     and didn't look like a real jersey once stretched.

Brandon's diagnosis that led here: "the original (pre fonde/mesh)
jerseys fitted well, it start[ed] to get messed up after you add the
other stuff" -- the AI's own jersey shape was never the problem. This
version touches nothing about the shape at all; it just finds it (per
subject, every time, via darkness thresholding) and layers texture on
top of exactly what's already there.

CPU-only, no GPU, no ML model -- a few numpy/PIL/opencv operations,
seconds on CPU. Separate app from the generation pipelines
(modal_app.py, modal_app_uso.py, modal_app_kontext.py,
modal_app_kontext_pulid.py) -- this only ever consumes an
already-generated figure image.

    modal deploy tools/player-cards/modal_app_jersey.py
"""

import os

import modal

AZURE_ACCOUNT = "stevearchive10723"
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art/jersey-test"

JERSEY_DARK_BASE = (0x2E, 0x2E, 0x2A)

# "FONDE" wordmark-only asset -- cropped down from the original circular
# crest (basketball + "REC CENTER"/"SENIOR BASKETBALL" + stars, extracted
# from real jersey photos 2026-08-19) to just the "FONDE" lettering,
# 2026-08-26. Brandon's call after the circular badge kept fighting size/
# position across the roster: a single wide text line is much easier to
# align uniformly than a tall multi-line circular badge, confirmed on
# Cleo and Kiwi (deepest collar in the roster) before committing the
# whole roster to it.
CREST_ASSET_BLOB = "card-art/assets/fonde_wordmark_white.png"

# Mesh weave texture, extracted from a plain (no ink) patch of the same
# real jersey photo, 2026-08-20 -- a grayscale MULTIPLIER map (128 =
# 1.0x/neutral, clamped to 0.65x-1.45x). Rescaled way down (see
# MESH_STRENGTH) before use -- the native swing is far too strong once
# tiled over a large area.
MESH_TEXTURE_BLOB = "card-art/assets/mesh_texture_mult.png"

MESH_STRENGTH = 0.10

# CREST_W_FRAC is a fraction of the JERSEY MASK's own bbox width, not
# the whole image's width -- 2026-08-26, Brandon's explicit call after
# the fixed-image-width version (0.30, then 0.25) still read
# inconsistently sized across the roster: "you need some kind of
# scaling rule for Fonde... keep the same scaling of fonde size to the
# jersey width." The old circular badge avoided bbox-relative sizing
# because segformer/darkness-threshold classification errors (e.g.
# Kiwi's chin-shadow stippling touching the jersey with no gap)
# inflated the detected bbox width -- but the current `_find_jersey_mask`
# is the same one already used for the mesh/recolor itself and has
# proven stable enough per-subject; 0.42 chosen empirically against
# the full 11-subject roster (auto-scales down for narrow-torso
# subjects like Donnie/Mike MP3/E-Dub that were previously "too wide"
# at a fixed absolute size).
CREST_W_FRAC = 0.42

# Vertical position: a FIXED gap below the true collar line, not
# centered in the available chest space. Centering pushed subjects
# with a lot of visible chest (shallow collar -- Bo, Kobe, Mike MP3)
# too far down, since centering in a bigger available range puts the
# midpoint further from the collar. 145px calibrated directly from
# Cleo's confirmed-"perfect" render (collar=366, wordmark top=511).
CREST_GAP_FROM_COLLAR = 145

# Small per-subject manual nudges (pixels, raw 1392-wide image space) on
# top of the general 50/50 blend rule -- for cases like Donnie where
# Brandon asked for a "slight" adjustment on that one card specifically,
# not a global rule change (the blend already reads right on everyone
# else tested). Keyed by serial; 0 if absent.
CREST_CX_NUDGE = {
    "34-DRAFT-10": 20,  # Donnie/"The Nightmare" -- "needs to move slight to right"
}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pillow", "numpy", "httpx", "azure-storage-blob", "opencv-python-headless",
    )
)

app = modal.App(name="scoot34-jersey-test", image=image)


def _largest_dark_region(dark):
    import cv2
    import numpy as np

    kernel = np.ones((9, 9), np.uint8)
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    if n <= 1:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == largest


def _find_jersey_mask(raw_img):
    """Boolean mask of THIS subject's own jersey -- largest solid-black
    connected region in the lower part of the frame. Traces whatever
    shape the AI actually drew, so it always matches (no distortion,
    no borrowed shape)."""
    import numpy as np

    arr = np.array(raw_img.convert("RGB"))
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    dark = (lum < 60).astype(np.uint8) * 255

    # Restrict to the lower 58% of the frame so hair/eyebrows/pupils
    # (also near-black) can't be picked up as "the jersey" -- tuned
    # against the roster's consistent waist-up framing.
    H = dark.shape[0]
    dark[: int(H * 0.42), :] = 0

    return _largest_dark_region(dark)


def _find_head_center_x(raw_img):
    """Horizontal center of the hair/head region (largest dark blob in
    the top 42% of the frame) -- used to center the crest under the
    chin. 2026-08-26: Brandon caught that centering on the jersey
    mask's own bbox drifts off the true chin line on an asymmetric
    shoulder/arm pose (confirmed on Cleo -- the jersey bbox center sat
    ~46px right of where his chin actually is); the head/hair blob's
    own center is a much more reliable proxy for a front-facing subject."""
    import numpy as np

    arr = np.array(raw_img.convert("RGB"))
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    dark = (lum < 60).astype(np.uint8) * 255

    H = dark.shape[0]
    dark[int(H * 0.42):, :] = 0

    head = _largest_dark_region(dark)
    if head is None:
        return None
    ys, xs = np.where(head)
    return (int(xs.min()) + int(xs.max())) / 2.0


def _find_true_collar_y(mask_bool, x0, x1, y0, y1):
    """The jersey mask's own y0 can be contaminated by dark neck-shadow
    stippling that touches the jersey with no gap in the source art
    (confirmed on Kiwi -- see CREST_W_FRAC's comment). The true collar
    is where the mask's row width transitions from "narrow neck" to
    "wide torso": scan upward from the bottom (least likely to be
    contaminated) and stop at the first row whose width drops below
    half the torso's own typical width."""
    import numpy as np

    row_counts = mask_bool[:, x0:x1 + 1].sum(axis=1)
    bh = y1 - y0
    torso_rows = row_counts[y0 + int(bh * 0.7): y1 + 1]
    if len(torso_rows) == 0 or torso_rows.max() == 0:
        return y0
    threshold = torso_rows.max() * 0.5
    true_y0 = y0
    for y in range(y1, y0 - 1, -1):
        if row_counts[y] < threshold:
            true_y0 = y
            break
    return true_y0


@app.function(timeout=120, secrets=[modal.Secret.from_name("azure-blob-creds")])
def composite_jersey(payload: dict) -> dict:
    """payload: {serial, image_url, side}. side must be "dark" (no
    equivalent texture exists for "light" -- the back-of-card reverse
    jersey, not yet built; that side is still handled separately by
    build_cards.py's own jersey_variant()).
    Returns the Blob path of the composited figure."""
    import httpx
    import numpy as np
    from PIL import Image, ImageFilter
    from azure.storage.blob import BlobServiceClient

    serial = payload["serial"]
    side = payload.get("side", "dark")
    if side != "dark":
        raise NotImplementedError(
            f"composite_jersey only handles side='dark' -- got side={side!r}"
        )

    r = httpx.get(payload["image_url"], timeout=60)
    r.raise_for_status()
    fig = Image.open(__import__("io").BytesIO(r.content)).convert("RGBA")

    mask_bool = _find_jersey_mask(fig)
    if mask_bool is None:
        raise RuntimeError(f"{serial}: no jersey found (darkness threshold found nothing)")

    mask_img = Image.fromarray((mask_bool * 255).astype(np.uint8), "L")
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=2))
    m = (np.array(mask_img).astype(np.float32) / 255.0)[..., None]

    blob_service = BlobServiceClient(
        account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
        credential=os.environ["AZURE_STORAGE_KEY"],
    )
    container = blob_service.get_container_client(AZURE_CONTAINER)

    a = np.array(fig).astype(np.float32)
    H, W = a.shape[0], a.shape[1]

    # Flat base-color fill (not a luminance blend -- the source jersey
    # is literal pure black with no shading to preserve), then mesh
    # multiplied onto THAT non-zero color. Multiplying the AI's actual
    # (0,0,0) pixels by a mesh factor is a no-op -- confirmed this is
    # why an earlier version's mesh was invisible.
    mesh_bytes = container.download_blob(MESH_TEXTURE_BLOB).readall()
    mesh_img = Image.open(__import__("io").BytesIO(mesh_bytes)).convert("L")
    mesh_arr = np.array(mesh_img).astype(np.float32) / 128.0
    mesh_arr = 1.0 + (mesh_arr - 1.0) * (MESH_STRENGTH / 0.45)
    tiles_y = H // mesh_arr.shape[0] + 2
    tiles_x = W // mesh_arr.shape[1] + 2
    tiled = np.tile(mesh_arr, (tiles_y, tiles_x))[:H, :W][..., None]

    base_color = np.array(JERSEY_DARK_BASE, np.float32)
    textured = np.clip(base_color[None, None, :] * tiled, 0, 255)
    a[..., 0:3] = a[..., 0:3] * (1 - m) + textured * m

    out_img = Image.fromarray(a.astype(np.uint8), "RGBA")

    # Crest horizontal center: a 50/50 blend of the head/hair region's
    # own center and the jersey mask's own bbox center. 2026-08-27,
    # Brandon flagged position as off on Donnie/E-Dub/Mike MP3 -- turns
    # out neither single signal works for everyone. Pure head_cx (chin-
    # centered) was confirmed "perfect" on Cleo, but on subjects with a
    # more 3/4-turned pose (Donnie especially -- his near shoulder reads
    # visibly wider/closer than the far one) it reads as off-center
    # relative to the shirt's own asymmetric silhouette, even though
    # it's correctly centered on the face. Pure jersey-bbox-center
    # fixed Donnie/E-Dub/Mike MP3 but visibly overshot on Cleo (whose
    # own head_cx-vs-jersey-center gap is actually the LARGEST in the
    # roster at 44px, yet his face-centered version is the one Brandon
    # approved). The 50/50 blend reads acceptably close to correct on
    # both ends -- no single geometric signal tested does better on the
    # whole roster at once.
    ys, xs = np.where(mask_bool)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    bw, bh = x1 - x0, y1 - y0
    jersey_cx = x0 + bw / 2.0

    head_cx = _find_head_center_x(fig)
    if head_cx is None:
        head_cx = jersey_cx
    head_cx = 0.5 * head_cx + 0.5 * jersey_cx + CREST_CX_NUDGE.get(serial, 0)

    crest_bytes = container.download_blob(CREST_ASSET_BLOB).readall()
    crest = Image.open(__import__("io").BytesIO(crest_bytes)).convert("RGBA")
    cw = int(bw * CREST_W_FRAC)
    scale = cw / crest.width
    ch = int(crest.height * scale)

    true_collar_y = _find_true_collar_y(mask_bool, x0, x1, y0, y1)
    cx = int(head_cx - cw / 2.0)
    cy = int(true_collar_y + CREST_GAP_FROM_COLLAR)
    # Never push fully off-canvas on a very deep collar (Kiwi) -- his
    # source photo doesn't show enough torso for the fixed gap to fit;
    # that needs a source-art regen (flagged separately), this is just
    # a safety floor so the wordmark still shows rather than vanishing.
    cy = min(cy, y1 - ch - int(0.03 * bh))
    out_img.alpha_composite(crest.resize((cw, ch), Image.LANCZOS), (cx, cy))

    buf = __import__("io").BytesIO()
    out_img.save(buf, format="PNG")

    figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_figure.png"
    container.upload_blob(figure_blob, buf.getvalue(), overwrite=True)

    mask_buf = __import__("io").BytesIO()
    mask_img.save(mask_buf, format="PNG")
    mask_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_mask.png"
    container.upload_blob(mask_blob, mask_buf.getvalue(), overwrite=True)

    return {"serial": serial, "figure_path": f"{AZURE_CONTAINER}/{figure_blob}",
            "mask_path": f"{AZURE_CONTAINER}/{mask_blob}", "head_cx": head_cx}
