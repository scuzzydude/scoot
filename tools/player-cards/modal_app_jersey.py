"""Scoot(34) player-card jersey compositing (PLAN_facial_likeness.md's
"Jersey -- proof of concept works, mask quality is the open item").

Replaces the quick color-threshold jersey mask (hand-tuned against one
image, left a visible seam near the collar) with a real segmentation
model: `mattmdjaga/segformer_b2_clothes`, the exact same pinned model
already deployed in `modal_app.py`'s SDXL pipeline (same repo/revision --
SEGFORMER_REPO/SEGFORMER_REVISION there). Class 4 ("Upper-clothes") in
that model's 18-class label set is the jersey/tank-top region.

Recolor logic is a direct port of `build_cards.py`'s `jersey_variant()`
-- same JERSEY hex dict, same luminance-preserving blend, so a subject's
AI-generated shading survives the recolor to the precise Fonde brand
colors instead of being flattened to a solid fill.

CPU-only, no GPU needed -- segformer_b2 inference on one 1024x1024
image is a few seconds on CPU, and this is a post-generation step, not
part of the expensive Kontext/USO/SDXL generation pipelines themselves.
Separate app from all three of those (modal_app.py, modal_app_uso.py,
modal_app_kontext.py) -- this only ever consumes an already-generated
figure image, doesn't care which pipeline produced it.

    modal deploy tools/player-cards/modal_app_jersey.py
"""

import os
from pathlib import Path

import modal

SEGFORMER_REPO = "mattmdjaga/segformer_b2_clothes"
SEGFORMER_REVISION = "584abc1e1d260e23c0fc627c5217a09b2b461046"  # same pin as modal_app.py

UPPER_CLOTHES_CLASS_ID = 4  # confirmed via the model card's label table, not guessed
# Second run (Cleo, 2026-08-20) surfaced a real classifier flakiness:
# debug histogram showed only 837/1,046,784 px landed in class 4, with
# 131,200 landing in class 7 ("Dress") instead -- this label set's
# "Dress" vs "Upper-clothes" boundary is apparently ambiguous for a
# sleeveless tank cropped waist-up with no visible waistline to signal
# "this is a top, not a one-piece." Brandon's own mask WAS clean class-4
# only, so this isn't a bug in that pass -- it's the classifier being
# inconsistent across different photos of the same style of garment.
# Union both candidate classes rather than picking one.
DRESS_CLASS_ID = 7

# Same hex dict as build_cards.py's JERSEY -- source of truth stays there;
# duplicated here (not imported) since this runs in a separate Modal
# container with no access to the repo's other files at runtime.
JERSEY = {
    "dark": ("#2E2E2A", "#121210"),
    "light": ("#F4F1E8", "#BFBBAD"),
}

AZURE_ACCOUNT = "stevearchive10723"
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art/jersey-test"

# Real Fonde crest (basketball + "FONDE REC CENTER SENIOR BASKETBALL" +
# stars), extracted from photos of the actual jersey Brandon provided
# 2026-08-19 -- white ink isolated from the mesh fabric via brightness
# threshold + morphological cleanup (blur before threshold to average
# out the weave's per-thread brightness spikes, open to strip
# background speckle, close to fill letter-interior gaps). White fill
# so it reads on the "dark" jersey side; would need a black-ink version
# for the "light" side, not yet made.
CREST_ASSET_BLOB = "card-art/assets/fonde_crest_white.png"

# Mesh weave texture, extracted from a plain (no ink) patch of the same
# real jersey photo, 2026-08-20 -- a grayscale MULTIPLIER map (128 =
# 1.0x/neutral, clamped to 0.65x-1.45x so it can't blow out highlights
# or crush shadows), not a color swatch. Tiled and multiplied onto the
# recolored jersey so the fine dot-weave texture shows through while
# the exact brand hex colors and AI-generated shading stay intact.
MESH_TEXTURE_BLOB = "card-art/assets/mesh_texture_mult.png"

def _download_segformer():
    from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

    AutoModelForSemanticSegmentation.from_pretrained(SEGFORMER_REPO, revision=SEGFORMER_REVISION)
    SegformerImageProcessor.from_pretrained(SEGFORMER_REPO, revision=SEGFORMER_REVISION)
    print(f"pinned {SEGFORMER_REPO}@{SEGFORMER_REVISION}")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.13.0",  # CPU build -- no --index-url override, pip resolves the CPU wheel by default off the main index
        "transformers==4.57.6",  # same pin as train_lora.py, already proven compatible with this torch line
        "pillow", "numpy", "httpx", "azure-storage-blob", "opencv-python-headless",
    )
    .run_function(_download_segformer)
)

app = modal.App(name="scoot34-jersey-test", image=image)


@app.function(timeout=300, secrets=[modal.Secret.from_name("azure-blob-creds")])
def composite_jersey(payload: dict) -> dict:
    """payload: {serial, image_url, side}. side in JERSEY (default "dark").
    Returns the Blob path of the recolored figure."""
    import httpx
    import numpy as np
    import torch
    import torch.nn as nn
    from PIL import Image
    from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor
    from azure.storage.blob import BlobServiceClient

    serial = payload["serial"]
    side = payload.get("side", "dark")

    r = httpx.get(payload["image_url"], timeout=60)
    r.raise_for_status()
    src_img = Image.open(__import__("io").BytesIO(r.content)).convert("RGB")

    processor = SegformerImageProcessor.from_pretrained(SEGFORMER_REPO, revision=SEGFORMER_REVISION)
    model = AutoModelForSemanticSegmentation.from_pretrained(SEGFORMER_REPO, revision=SEGFORMER_REVISION)
    model.eval()

    inputs = processor(images=src_img, return_tensors="pt")
    with torch.no_grad():
        logits = model(**inputs).logits
    upsampled = nn.functional.interpolate(
        logits, size=src_img.size[::-1], mode="bilinear", align_corners=False,
    )
    pred = upsampled.argmax(dim=1)[0].numpy()
    raw_mask = np.isin(pred, [UPPER_CLOTHES_CLASS_ID, DRESS_CLASS_ID]).astype(np.uint8) * 255

    if payload.get("debug"):
        vals, counts = np.unique(pred, return_counts=True)
        hist = {int(v): int(c) for v, c in sorted(zip(vals, counts), key=lambda t: -t[1])}
        print(f"DEBUG class histogram: {hist}")
        print(f"DEBUG raw_mask nonzero px: {int((raw_mask > 0).sum())} / {raw_mask.size}")

    # Cleanup pass -- first real run showed two artifacts: a couple of
    # stray misclassified specks well outside the garment, and a defect
    # near the armhole visible as a streak in the recolored output.
    # Diagnosed properly across three attempts, not guessed:
    #  1. A 31x31 morphological close shrank the streak but didn't fully
    #     close it.
    #  2. Suspected an enclosed hole -- tried flood-filling the inverse
    #     mask from the frame's outer edge (fills anything reachable
    #     from true background; whatever's left unreached is a sealed
    #     hole). That left the defect COMPLETELY unfilled, which is
    #     actually the useful diagnostic result: it proves the defect
    #     is NOT a sealed hole -- it's a narrow channel/notch connected
    #     to the background near the armhole, so the flood fill reaches
    #     straight through it. Confirmed by inspecting the mask's own
    #     shape (the defect sits right at the armhole edge).
    #  3. Correct fix for a channel (not a hole): a morphological close
    #     strong enough to physically bridge the channel's width, THEN
    #     the flood-fill hole check as a secondary safety net for any
    #     genuinely enclosed gaps elsewhere.
    import cv2
    kernel = np.ones((51, 51), np.uint8)
    closed = cv2.morphologyEx(raw_mask, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    if n > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        garment = np.where(labels == largest, 255, 0).astype(np.uint8)
    else:
        garment = closed

    inv = cv2.bitwise_not(garment)
    flood = inv.copy()
    ff_mask = np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8)
    cv2.floodFill(flood, ff_mask, (0, 0), 0)
    holes = flood
    raw_mask = cv2.bitwise_or(garment, holes)

    # Light feather so the recolor blends at the edge instead of a hard
    # segmentation-boundary seam -- same spirit as jersey_variant()'s
    # source mask, which is itself pre-feathered by the ComfyUI
    # segmentation node upstream in the SDXL pipeline.
    from PIL import ImageFilter
    mask_img = Image.fromarray(raw_mask, "L").filter(ImageFilter.GaussianBlur(radius=3))

    def _hex_rgb(h):
        h = h.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

    a = np.array(src_img.convert("RGBA")).astype(np.float32)
    m = (np.array(mask_img).astype(np.float32) / 255.0)[..., None]

    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) / 255.0
    if (m[..., 0] > 0.5).any():
        lo, hi = np.percentile(lum[m[..., 0] > 0.5], [10, 90])
    else:
        lo, hi = 0.0, 1.0
    t = np.clip((lum - lo) / max(hi - lo, 1e-3), 0.0, 1.0)[..., None]

    base = np.array(_hex_rgb(JERSEY[side][0]), np.float32)
    shade = np.array(_hex_rgb(JERSEY[side][1]), np.float32)
    recol = shade + (base - shade) * t

    a[..., 0:3] = a[..., 0:3] * (1 - m) + recol * m

    blob_service = BlobServiceClient(
        account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
        credential=os.environ["AZURE_STORAGE_KEY"],
    )
    container = blob_service.get_container_client(AZURE_CONTAINER)

    # Mesh texture -- OFF by default (payload.get) like the crest. Real
    # fabric weave extracted from a plain patch of the jersey photo (see
    # MESH_TEXTURE_BLOB comment), tiled across the canvas and applied as
    # a MULTIPLIER (not a paste) so it modulates the existing recolored
    # pixels -- brand color and AI-generated shading both survive, just
    # with the fine dot-weave pattern showing through, same relationship
    # to the recolor step that a real screen-printed mesh jersey has to
    # its own fabric.
    if payload.get("add_mesh_texture", True):
        mesh_bytes = container.download_blob(MESH_TEXTURE_BLOB).readall()
        mesh_img = Image.open(__import__("io").BytesIO(mesh_bytes)).convert("L")
        mesh_arr = np.array(mesh_img).astype(np.float32) / 128.0  # 128 stored as 1.0x, see MESH_TEXTURE_BLOB comment
        H, W = a.shape[0], a.shape[1]
        tiles_y = H // mesh_arr.shape[0] + 2
        tiles_x = W // mesh_arr.shape[1] + 2
        tiled = np.tile(mesh_arr, (tiles_y, tiles_x))[:H, :W][..., None]
        a[..., 0:3] = np.clip(a[..., 0:3] * (1 - m) + (a[..., 0:3] * tiled) * m, 0, 255)

    out_img = Image.fromarray(a.astype(np.uint8), "RGBA")

    # Crest overlay -- OFF by default (payload.get, not required) so
    # this stays optional per-call, same gating pattern as the other
    # apps' test flags. Position derived from the jersey mask's own
    # shape (not fixed pixel coordinates) so it generalizes across
    # different subjects' body sizes/framing, not just Brandon's.
    #
    # First version anchored the top margin to jy0 = the mask's GLOBAL
    # topmost pixel (shoulder/strap peak, not the neckline) -- crest bled
    # into neck skin. Second version centered on a top-10%-of-height
    # band's x-extent -- still off-center on a real run, because on a
    # 3/4-turned, flexed pose the near shoulder/arm reads foreshortened
    # wider than the far one, so ANY bbox- or band-extent measurement
    # (min/max of x) gets pulled toward whichever side is posed bigger,
    # not the true sternum line.
    #
    # Fixed by finding the collar's actual V-notch instead of measuring
    # extents at all: for each column, the topmost mask pixel traces the
    # garment's top edge -- two peaks at the shoulder straps, with a dip
    # between them at the neckline. That dip's x position is the true
    # chest centerline by garment construction (a symmetric tank top's
    # V-cut is sewn centered), independent of how the arms/shoulders
    # happen to be posed or foreshortened. Search is restricted to the
    # central 50% of the mask's width so a strap peak can't be mistaken
    # for the notch.
    if payload.get("add_crest", True) and side == "dark":
        ys, xs = np.where(garment > 127)
        if len(xs) > 0:
            jx0, jx1 = int(xs.min()), int(xs.max())
            jy0, jy1 = int(ys.min()), int(ys.max())
            jw = jx1 - jx0

            order = np.argsort(xs)
            xs_sorted, ys_sorted = xs[order], ys[order]
            uniq_x, first_idx = np.unique(xs_sorted, return_index=True)
            top_y_per_x = np.minimum.reduceat(ys_sorted, first_idx)

            cx_lo, cx_hi = jx0 + int(jw * 0.25), jx0 + int(jw * 0.75)
            central = (uniq_x >= cx_lo) & (uniq_x <= cx_hi)
            if central.any():
                cand_x, cand_y = uniq_x[central], top_y_per_x[central]
                notch_idx = int(np.argmax(cand_y))  # deepest dip = notch
                jcx, neck_y = int(cand_x[notch_idx]), int(cand_y[notch_idx])
            else:
                jcx, neck_y = (jx0 + jx1) // 2, jy0
            jh = jy1 - neck_y

            # media is a private container -- needs the authenticated SDK
            # client, not a bare httpx GET (confirmed via an actual failed
            # run: PIL.UnidentifiedImageError, the anonymous fetch got an
            # XML access-denied body back instead of image bytes).
            crest_bytes = container.download_blob(CREST_ASSET_BLOB).readall()
            crest = Image.open(__import__("io").BytesIO(crest_bytes)).convert("RGBA")

            target_w = max(1, int(jw * 0.54))
            scale = target_w / crest.width
            target_h = max(1, int(crest.height * scale))
            crest_resized = crest.resize((target_w, target_h), Image.LANCZOS)
            alpha = crest_resized.split()[3].point(lambda p: int(p * 0.92))
            crest_resized.putalpha(alpha)

            left = jcx - target_w // 2
            # Margin bumped 0.13 -> 0.18 of the (now correctly-measured
            # collar-to-hem) height, as a deliberate small safety buffer
            # on top of the structural fix above -- better a touch more
            # gap between collar and crest than risk it still touching
            # neck skin on a different subject's slightly different neckline.
            top = neck_y + int(jh * 0.18)
            out_img.alpha_composite(crest_resized, (left, top))

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
