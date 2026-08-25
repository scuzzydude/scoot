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

# Real Fonde crest (basketball + "FONDE REC CENTER SENIOR BASKETBALL" +
# stars), extracted from photos of the actual jersey Brandon provided
# 2026-08-19 -- white ink isolated from the mesh fabric via brightness
# threshold + morphological cleanup.
CREST_ASSET_BLOB = "card-art/assets/fonde_crest_white.png"

# Mesh weave texture, extracted from a plain (no ink) patch of the same
# real jersey photo, 2026-08-20 -- a grayscale MULTIPLIER map (128 =
# 1.0x/neutral, clamped to 0.65x-1.45x). Rescaled way down (see
# MESH_STRENGTH) before use -- the native swing is far too strong once
# tiled over a large area.
MESH_TEXTURE_BLOB = "card-art/assets/mesh_texture_mult.png"

MESH_STRENGTH = 0.10
CREST_W_FRAC = 0.30
# Crest top margin as a fraction of the jersey mask's own bbox height.
# The mask's bottom edge is always the AI render's own photo-frame
# cutoff (there's no real garment hem), consistent across the roster's
# locked framing, so this stays clear of "SENIOR BASKETBALL" getting
# clipped without needing per-subject tuning.
CREST_TOP_FRAC = 0.14

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pillow", "numpy", "httpx", "azure-storage-blob", "opencv-python-headless",
    )
)

app = modal.App(name="scoot34-jersey-test", image=image)


def _find_jersey_mask(raw_img):
    """Boolean mask of THIS subject's own jersey -- largest solid-black
    connected region in the lower part of the frame. Traces whatever
    shape the AI actually drew, so it always matches (no distortion,
    no borrowed shape)."""
    import cv2
    import numpy as np

    arr = np.array(raw_img.convert("RGB"))
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    dark = (lum < 60).astype(np.uint8) * 255

    # Restrict to the lower 58% of the frame so hair/eyebrows/pupils
    # (also near-black) can't be picked up as "the jersey" -- tuned
    # against the roster's consistent waist-up framing.
    H = dark.shape[0]
    dark[: int(H * 0.42), :] = 0

    kernel = np.ones((9, 9), np.uint8)
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    if n <= 1:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == largest


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

    # Crest, centered on the mask's own bbox.
    ys, xs = np.where(mask_bool)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    bw, bh = x1 - x0, y1 - y0

    crest_bytes = container.download_blob(CREST_ASSET_BLOB).readall()
    crest = Image.open(__import__("io").BytesIO(crest_bytes)).convert("RGBA")
    cw = int(bw * CREST_W_FRAC)
    scale = cw / crest.width
    ch = int(crest.height * scale)
    crest_r = crest.resize((cw, ch), Image.LANCZOS)
    cx = x0 + (bw - cw) // 2
    cy = y0 + int(bh * CREST_TOP_FRAC)
    out_img.alpha_composite(crest_r, (cx, cy))

    buf = __import__("io").BytesIO()
    out_img.save(buf, format="PNG")

    figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_figure.png"
    container.upload_blob(figure_blob, buf.getvalue(), overwrite=True)

    mask_buf = __import__("io").BytesIO()
    mask_img.save(mask_buf, format="PNG")
    mask_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_mask.png"
    container.upload_blob(mask_blob, mask_buf.getvalue(), overwrite=True)

    return {"serial": serial, "figure_path": f"{AZURE_CONTAINER}/{figure_blob}",
            "mask_path": f"{AZURE_CONTAINER}/{mask_blob}"}
