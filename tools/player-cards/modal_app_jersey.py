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

# Standalone flat jersey texture -- base color + subtle baked-in mesh
# weave + centered Fonde crest, built once by make_jersey_texture.py
# and authored/previewed on its own (see that script's docstring).
# Stamped into the "dark" side's garment-mask bbox below instead of
# per-pixel recoloring the AI art in place: a 2026-08-25 fix after the
# old approach's tiled mesh multiplier read as an uneven shadow once
# applied over a curved, already-segmented silhouette, and the crest's
# mask-geometry-derived position/size kept looking off. No equivalent
# texture exists yet for "light" (the back-of-card reverse jersey,
# not yet built) -- that side still falls back to the old per-pixel
# luminance recolor further down.
JERSEY_TEXTURE_BLOB = "card-art/assets/jersey_texture_dark.png"

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

    # Intersect with a darkness check -- found 2026-08-22 running the full
    # roster: segformer's garment classification alone regularly bled into
    # adjacent skin (head, neck, arms), which the later recolor/mesh-
    # texture steps then darkened right along with the actual jersey,
    # reading as a muddy shadow, AND corrupted the crest's size/position
    # (derived from this same mask's bounding box). The base generation
    # always renders the jersey as a "solid dark charcoal-black" garment,
    # so real jersey pixels are reliably much darker than any skin tone --
    # this is the same principle that fixed Cleo's mask by hand that day
    # (a pure luminance threshold), now applied generally instead of
    # trusting segformer's boundary alone. Threshold picked generously
    # below "dark charcoal" so cel-shaded highlights on the jersey itself
    # survive; only true skin-brightness pixels get excluded.
    src_arr = np.array(src_img)
    lum_all = 0.299 * src_arr[..., 0] + 0.587 * src_arr[..., 1] + 0.114 * src_arr[..., 2]
    raw_mask = np.where((raw_mask > 0) & (lum_all < 110), 255, 0).astype(np.uint8)

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

    # Clip anything above the collar line -- found 2026-08-22 running the
    # full roster in the comic/graphic style: segformer's garment
    # classification bled into the head/neck region for 16 of 23
    # subjects (up to 66% of the head-region pixels on the worst case),
    # which the mesh-texture multiplier then darkened along with the
    # actual jersey, reading as a muddy half-face shadow. Reuses the
    # exact neckline-detection method already proven for crest placement
    # below: the deepest dip in the mask's own top-edge profile, within
    # the central 50% of width, is the true collar notch by garment
    # construction -- independent of pose and of whatever segformer
    # misclassified above it.
    ys0, xs0 = np.where(raw_mask > 127)
    if len(xs0) > 0:
        jx0c, jx1c = int(xs0.min()), int(xs0.max())
        jwc = jx1c - jx0c
        order0 = np.argsort(xs0)
        xs0_sorted, ys0_sorted = xs0[order0], ys0[order0]
        uniq_x0, first_idx0 = np.unique(xs0_sorted, return_index=True)
        top_y_per_x0 = np.minimum.reduceat(ys0_sorted, first_idx0)
        cx_lo0, cx_hi0 = jx0c + int(jwc * 0.25), jx0c + int(jwc * 0.75)
        central0 = (uniq_x0 >= cx_lo0) & (uniq_x0 <= cx_hi0)
        neck_y0 = int(np.max(top_y_per_x0[central0])) if central0.any() else int(ys0.min())
        # 0.05 -> 0.09 (2026-08-25, fixing a couple stray neck-bleed
        # pixels on Kevin) then back to 0.05 same day: 0.09 turned out
        # too aggressive for Cleo's deeper collar V -- it cut into real
        # collar fabric at the center, leaving a visible rectangular
        # notch under the chin once the flat-recolor/stamped-texture
        # approach made any mask error obvious. 0.05 is the better
        # tradeoff between the two failure modes until this becomes a
        # per-column contour clip instead of one flat cutoff line.
        clip_y = max(0, neck_y0 - int(0.05 * raw_mask.shape[0]))
        raw_mask[:clip_y, :] = 0

    # Light feather so the recolor blends at the edge instead of a hard
    # segmentation-boundary seam -- same spirit as jersey_variant()'s
    # source mask, which is itself pre-feathered by the ComfyUI
    # segmentation node upstream in the SDXL pipeline.
    from PIL import ImageFilter
    mask_img = Image.fromarray(raw_mask, "L").filter(ImageFilter.GaussianBlur(radius=3))

    a = np.array(src_img.convert("RGBA")).astype(np.float32)
    m = (np.array(mask_img).astype(np.float32) / 255.0)[..., None]

    blob_service = BlobServiceClient(
        account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
        credential=os.environ["AZURE_STORAGE_KEY"],
    )
    container = blob_service.get_container_client(AZURE_CONTAINER)

    if side == "dark":
        # Stamp the standalone jersey texture (base color + baked-in
        # mesh + centered crest) into the mask's own bounding box,
        # instead of per-pixel recoloring the AI art -- see
        # JERSEY_TEXTURE_BLOB's comment above.
        ys_b, xs_b = np.where(raw_mask > 127)
        if len(xs_b) > 0:
            bx0, bx1 = int(xs_b.min()), int(xs_b.max())
            by0, by1 = int(ys_b.min()), int(ys_b.max())
            bw, bh = bx1 - bx0 + 1, by1 - by0 + 1

            texture_bytes = container.download_blob(JERSEY_TEXTURE_BLOB).readall()
            texture = Image.open(__import__("io").BytesIO(texture_bytes)).convert("RGBA")
            texture_r = texture.resize((bw, bh), Image.LANCZOS)
            tex_full = Image.new("RGBA", (a.shape[1], a.shape[0]), (0, 0, 0, 0))
            tex_full.paste(texture_r, (bx0, by0))
            tex_arr = np.array(tex_full).astype(np.float32)

            a[..., 0:3] = a[..., 0:3] * (1 - m) + tex_arr[..., 0:3] * m
    else:
        # "light" (back-of-card reverse jersey) has no standalone
        # texture asset yet -- fall back to the old per-pixel
        # luminance-based recolor until that side is actually built.
        def _hex_rgb(h):
            h = h.lstrip("#")
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

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

    out_img = Image.fromarray(a.astype(np.uint8), "RGBA")

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
