"""Scoot(34) player-card jersey compositing.

Stamps a pre-built, garment-shaped jersey "sticker" (base color + mesh
weave + centered Fonde crest, all baked into one asset by
make_jersey_sticker.py) onto a subject's torso.

This replaces an earlier segformer-based approach (`mattmdjaga/
segformer_b2_clothes` classifying "Upper-clothes" pixels, then
recoloring them in place + separately deriving crest position from the
mask's own geometry). That approach fought itself across many rounds
2026-08-19 through 2026-08-25 -- classifier bleed into skin/neck/arms,
a runtime mesh-multiplier that read as an uneven shadow once tiled over
a curved silhouette, and crest placement math that never quite
centered right. Brandon's fix, 2026-08-25: build the shirt+mesh+logo as
ONE unit, authored and previewed on its own, and just place it on top
of the figure -- see make_jersey_sticker.py's docstring for the full
asset-build story.

Positioning no longer needs a garment classifier at all: the raw noir
art always renders the jersey as pure solid black, so a plain darkness
threshold + largest-connected-component in the lower part of the frame
robustly finds the torso. The sticker's OWN alpha channel (a real
garment silhouette -- collar notch, shoulder straps, sleeve width) is
what gives the composited edge its shape; the bbox is only used to
scale/position it.

CPU-only, no GPU needed, and no ML model at all now -- this is a few
numpy/PIL operations, seconds on CPU. Separate app from the generation
pipelines (modal_app.py, modal_app_uso.py, modal_app_kontext.py,
modal_app_kontext_pulid.py) -- this only ever consumes an
already-generated figure image.

    modal deploy tools/player-cards/modal_app_jersey.py
"""

import os

import modal

AZURE_ACCOUNT = "stevearchive10723"
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art/jersey-test"

# Garment-shaped sticker -- base color + baked-in mesh + centered crest,
# with alpha matching a real tank-top silhouette (not a rectangle).
# Built by make_jersey_sticker.py from a known-clean subject's own mask
# shape (see that script). Only a "dark" side exists -- "light" (the
# back-of-card reverse jersey) is still handled separately by
# build_cards.py's own jersey_variant(), which recolors from
# {serial}_figure.png + {serial}_jersey_mask.png rather than calling
# this app a second time.
JERSEY_STICKER_BLOB = "card-art/assets/jersey_sticker_dark.png"


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pillow", "numpy", "httpx", "azure-storage-blob", "opencv-python-headless",
    )
)

app = modal.App(name="scoot34-jersey-test", image=image)


def _find_torso_bbox(raw_img):
    """Largest solid-black connected region in the lower part of the
    frame. The AI art always renders the jersey as pure solid black
    (confirmed by direct pixel sampling across the roster), so this is
    a robust, model-free way to find where the torso is -- no
    classifier bleed into skin/neck/arms to fight anymore."""
    import cv2
    import numpy as np

    arr = np.array(raw_img.convert("RGB"))
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    dark = (lum < 60).astype(np.uint8) * 255

    # Restrict to the lower 58% of the frame so hair/eyebrows/pupils
    # (also near-black) can't be picked up as "the torso" -- tuned
    # against the roster's consistent waist-up framing.
    H = dark.shape[0]
    dark[: int(H * 0.42), :] = 0

    kernel = np.ones((9, 9), np.uint8)
    closed = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    if n <= 1:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    ys, xs = np.where(labels == largest)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


@app.function(timeout=120, secrets=[modal.Secret.from_name("azure-blob-creds")])
def composite_jersey(payload: dict) -> dict:
    """payload: {serial, image_url, side}. side must be "dark" (the
    only side with a sticker asset -- see JERSEY_STICKER_BLOB).
    Returns the Blob path of the composited figure."""
    import httpx
    import numpy as np
    from PIL import Image
    from azure.storage.blob import BlobServiceClient

    serial = payload["serial"]
    side = payload.get("side", "dark")
    if side != "dark":
        raise NotImplementedError(
            f"composite_jersey only handles side='dark' (no sticker asset "
            f"exists for side={side!r} yet) -- got side={side!r}"
        )

    r = httpx.get(payload["image_url"], timeout=60)
    r.raise_for_status()
    src_img = Image.open(__import__("io").BytesIO(r.content)).convert("RGBA")

    bbox = _find_torso_bbox(src_img)
    if bbox is None:
        raise RuntimeError(f"{serial}: no torso found (darkness threshold found nothing)")
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    blob_service = BlobServiceClient(
        account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
        credential=os.environ["AZURE_STORAGE_KEY"],
    )
    container = blob_service.get_container_client(AZURE_CONTAINER)

    sticker_bytes = container.download_blob(JERSEY_STICKER_BLOB).readall()
    sticker = Image.open(__import__("io").BytesIO(sticker_bytes)).convert("RGBA")
    sticker_r = sticker.resize((bw, bh), Image.LANCZOS)

    sticker_full = Image.new("RGBA", src_img.size, (0, 0, 0, 0))
    sticker_full.paste(sticker_r, (x0, y0))

    out_img = Image.alpha_composite(src_img, sticker_full)

    buf = __import__("io").BytesIO()
    out_img.save(buf, format="PNG")

    figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_figure.png"
    container.upload_blob(figure_blob, buf.getvalue(), overwrite=True)

    # Downstream (finalize_card.py) only needs a mask for its own
    # rembg re-matte + hard-threshold step; the sticker's own alpha,
    # pasted at the same bbox, is the right shape for that.
    mask_full = Image.new("L", src_img.size, 0)
    mask_full.paste(sticker_r.split()[-1], (x0, y0))
    mask_buf = __import__("io").BytesIO()
    mask_full.save(mask_buf, format="PNG")
    mask_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_mask.png"
    container.upload_blob(mask_blob, mask_buf.getvalue(), overwrite=True)

    return {"serial": serial, "figure_path": f"{AZURE_CONTAINER}/{figure_blob}",
            "mask_path": f"{AZURE_CONTAINER}/{mask_blob}"}
