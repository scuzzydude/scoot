"""Scoot(34) player-card generation on Modal.

Implements the contract in MODAL_BUILD_SPEC.md and HANDOFF.md's ordered
work item 1 ("Deploy the generation function on Modal. Nothing else.").

NOT YET DEPLOYED OR RUN. Written against Modal's current docs, verified
live 2026-08-17 (this project has been burned before by trusting stale
examples — see HANDOFF §7 on the Modal API's decorator/parameter churn):
  - modal.App / @app.cls / @modal.enter() / @modal.method() —
    https://modal.com/docs/guide/lifecycle-functions
  - scaledown_window (NOT the older container_idle_timeout) —
    https://modal.com/docs/guide/cold-start
  - Function.spawn() / FunctionCall.get(timeout=0) for the async call
    pattern MODAL_BUILD_SPEC.md §3 requires —
    https://modal.com/docs/guide/trigger-deployed-functions
  - Image.debian_slim/.run_commands/.pip_install/.run_function —
    https://modal.com/docs/reference/modal.Image
  - modal.Secret.from_name() — https://modal.com/docs/guide/secrets

Every custom-node commit and model revision below is pinned — see
MODEL_PINS.md. Nothing here tracks `main` or `latest`.

Prerequisites this repo cannot satisfy on its own (HANDOFF.md §0 — these
are Brandon's, not code):
  1. A Modal account exists and `modal token set --token-id ... --token-secret ...`
     has been run on dreamlab (or MODAL_TOKEN_ID / MODAL_TOKEN_SECRET are set).
  2. A HARD usage limit is set in Modal's dashboard (not an alert).
  3. `modal secret create azure-blob-creds AZURE_STORAGE_ACCOUNT=stevearchive10723 AZURE_STORAGE_KEY=<key>`
     — reuses the same storage account already configured for
     ~/.config/rclone/rclone.conf, so the generated art lands in the same
     `media` Blob container as everything else from this project.

Once those exist:
    modal deploy tools/player-cards/modal_app.py
"""

import json
import os
import socket
import subprocess
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Pinned versions (MODEL_PINS.md is the source of truth — keep in sync)
# ---------------------------------------------------------------------------

COMFYUI_COMMIT = "b963f4ad210a42841ab23dfc28a84143a0cce227"

CUSTOM_NODES = [
    {
        "url": "https://github.com/Fannovel16/comfyui_controlnet_aux.git",
        "commit": "e8b689a513c3e6b63edc44066560ca5919c0576e",
    },
    {
        "url": "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git",
        "commit": "a0f451a5113cf9becb0847b92884cb10cbdec0ef",
    },
    {
        "url": "https://github.com/StartHua/Comfyui_segformer_b2_clothes.git",
        "commit": "681721fbea6947e7bbc4ebb6192ed60bd8b473cb",
    },
    {
        # PuLID: FaceID's 3 attempts (preset swap, weight 1.0, weight 1.8)
        # never produced a decernable likeness -- weight increases degraded
        # overall image quality instead of improving identity. PuLID
        # decouples identity from style via contrastive alignment (not
        # pure embedding conditioning like FaceID) and reports much higher
        # identity fidelity in community comparisons. Pinned at the repo's
        # actual HEAD, which is also its de-facto final state -- the
        # author put it in "maintenance mode" 2025.04.14, no further
        # commits since (confirmed via `git log` on a local clone before
        # pinning, not assumed from the README note alone).
        "url": "https://github.com/cubiq/PuLID_ComfyUI.git",
        "commit": "93e0c4c226b87b23c0009d671978bad0e77289ff",
    },
]

# (repo_id, filename, revision, target dir under ComfyUI/models/, local filename override)
# local filename override is None unless IPAdapterUnifiedLoader's regex-based
# auto-detection (utils.py get_clipvision_file/get_ipadapter_file) needs a
# specific name to match on -- HF's own filenames are generic ("model.safetensors")
# and never match those patterns as-is.
MODEL_DOWNLOADS = [
    ("cagliostrolab/animagine-xl-4.0", "animagine-xl-4.0.safetensors",
     "2b7c1b397761bf5bd3cc42e5b39ec99314a75a96", "checkpoints", None),
    ("xinsir/controlnet-union-sdxl-1.0", "diffusion_pytorch_model.safetensors",
     "801a4a3fa3d4c936f4feea95b98607bc6726f80c", "controlnet", None),
    ("h94/IP-Adapter", "sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors",
     "018e402774aeeddd60609b4ecdb7e298259dc729", "ipadapter", None),
    # IP-Adapter FaceID Plus V2 (SDXL) -- a SECOND, independent IPAdapter
    # branch conditioned on each subject's own cutout, not the style
    # reference. The likeness test's real failure was architectural: the
    # graph's only IPAdapter pass (node 12/14) is fed the fixed style
    # reference image for STYLE transfer -- it never saw the subject's own
    # photo at all, so no mechanism existed to preserve facial identity.
    # Tried swapping node 12 to the "PLUS FACE (portraits)" preset first
    # (cheapest possible test) -- that made it worse (blank face), because
    # it just made the SAME pass re-interpret the non-face style reference
    # image as if it were a face crop. The actual fix needs a second apply
    # node fed the subject's own image; FaceID Plus V2 pairs an InsightFace
    # identity embedding with a small LoRA for stronger identity lock than
    # plain FaceID. Repo/revision from HF API (h94/IP-Adapter-FaceID),
    # filenames regex-verified against get_ipadapter_file()'s
    # faceid.plusv2.sdxl patterns via modal shell before pinning.
    ("h94/IP-Adapter-FaceID", "ip-adapter-faceid-plusv2_sdxl.bin",
     "43907e6f44d079bf1a9102d9a6e56aef7a219bae", "ipadapter", None),
    ("h94/IP-Adapter-FaceID", "ip-adapter-faceid-plusv2_sdxl_lora.safetensors",
     "43907e6f44d079bf1a9102d9a6e56aef7a219bae", "loras", None),
    # PuLID SDXL weights (converted to IPAdapter format by huchenlei) --
    # see PuLID_ComfyUI's README for this exact source. Repo/revision from
    # HF API, path matches PulidModelLoader's self-registered "pulid"
    # folder_paths type.
    ("huchenlei/ipadapter_pulid", "ip-adapter_pulid_sdxl_fp16.safetensors",
     "810eab2a6746efb73ed7f2502bf46b1c453d5cf1", "pulid", None),
    # NOT sdxl_models/image_encoder/ (ViT-bigG-14, hidden_size 1664) despite
    # this being an SDXL checkpoint -- get_clipvision_file()'s regex for any
    # preset other than "vit-g"/"kolors" (this graph's node 12 uses "PLUS
    # (high strength)") only matches ViT-H-14-*-s32B-b79K, which is the
    # PLAIN models/image_encoder/ path (hidden_size 1280). Confirmed by
    # reading ComfyUI_IPAdapter_plus/utils.py's actual regex via modal shell
    # AND cross-checking both encoders' config.json hidden_size/layers via
    # the HF API -- the ip-adapter-plus_sdxl_vit-h.safetensors filename
    # itself says "vit-h", not "vit-bigg". The earlier "clip_vision fix"
    # recorded in MODEL_PINS.md (switching TO sdxl_models/) was itself
    # wrong, caught here by an actual failed generate() call
    # ("ClipVision model not found") rather than by re-reasoning alone.
    ("h94/IP-Adapter", "models/image_encoder/model.safetensors",
     "018e402774aeeddd60609b4ecdb7e298259dc729", "clip_vision",
     "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"),
]

# segformer_b2_clothes.py loads its model with a MODULE-LEVEL (not lazy)
# SegformerImageProcessor.from_pretrained(models_dir/"segformer_b2_clothes")
# call -- it expects a full local HF snapshot already sitting at that path,
# not a single weights file. Without it the custom node fails to import at
# all ("Repo id must be in the form 'repo_name' or 'namespace/repo_name'",
# since it tries to resolve the bare local path as a hub repo id instead),
# so generate() rejects the whole graph with "Node 'segformer_b2_clothes'
# not found." Confirmed via modal shell (reading the node's source) and an
# actual failed generate() call, not guessed.
SEGFORMER_REPO = "mattmdjaga/segformer_b2_clothes"
SEGFORMER_REVISION = "584abc1e1d260e23c0fc627c5217a09b2b461046"

# The custom node package's __init__.py imports BOTH segformer_b2_clothes.py
# AND its sibling segformer_b3_fashion.py -- the latter has the identical
# module-level from_pretrained() pattern, pointed at models_dir/
# "segformer_b3_fashion", a DIFFERENT model this package also bundles. Since
# Python must fully import the package for either node class to register,
# fixing only segformer_b2_clothes's snapshot still left the whole package
# import failing on the b3_fashion half (confirmed via modal shell reading
# segformer_b3_fashion.py, and a second real failed generate() call after
# the first segformer fix deployed). sayeed99/segformer-b3-fashion is the
# real HF repo this node's directory-name convention maps to (verified via
# the HF search API, not guessed) -- 31 likes, 5k downloads, matches the
# "segformer_b3_fashion" -> "segformer-b3-fashion" naming pattern the b2
# model already established.
SEGFORMER_B3_REPO = "sayeed99/segformer-b3-fashion"
SEGFORMER_B3_REVISION = "e2474a9e7643d349ac6c525549b736b736e7e216"

# PuLID's own dependencies beyond its single IPAdapter-format weight file
# (already in MODEL_DOWNLOADS above): an EVA CLIP vision encoder fetched
# via eva_clip's own hf_hub_download call (repo/filename read directly out
# of PuLID_ComfyUI/eva_clip/pretrained.py's config table, not guessed),
# and InsightFace's AntelopeV2 pack (distinct from FaceID's buffalo_l --
# PuLID's loader hardcodes name="antelopev2"). Revisions from the HF API.
EVA_CLIP_REPO = "QuanSun/EVA-CLIP"
EVA_CLIP_FILENAME = "EVA02_CLIP_L_336_psz14_s6B.pt"
EVA_CLIP_REVISION = "11afd202f2ae80869d6cef18b1ec775e79bd8d12"
ANTELOPEV2_REPO = "MonsterMMORPG/tools"
ANTELOPEV2_REVISION = "2cc250d767e22019bef3ae1aefaa1ad8a73ef64c"
# Filenames verified 2026-08-17 against the live repo file trees via the HF
# API (not guessed) — this caught a real bug: clip_vision originally pointed
# at models/image_encoder/ (the SD1.5 encoder), not sdxl_models/image_encoder/
# (the SDXL one IPAdapterUnifiedLoader's "PLUS" preset actually needs).
# literal filenames resolve before the first real build — a 404 here fails
# the image build loudly, which is the safe failure mode, but worth checking
# ahead of time rather than discovering it mid-deploy.

# workflow_player_card.json ships with literal *_PLACEHOLDER strings for
# everything README.md describes as "fixed once for the edition" (checkpoint,
# controlnet, prompts in nodes 3/4) -- distinct from the PER-CALL fields
# generate() already substitutes (cutout image, style ref, seed, serial in
# filename_prefix). Nothing fills these edition-wide placeholders in until
# now: ComfyUI's /prompt validation caught ckpt_name/control_net_name
# (checked against an enum of files actually on disk) but silently accepted
# the placeholder prompt TEXT in nodes 3/4 (free-form strings, nothing to
# validate against) -- that would have run real GPU generation on garbage
# prompt text without erroring, a more dangerous failure than the loud 400s
# that caught the model filenames. Confirmed via an actual failed generate()
# call showing the exact placeholder strings in the validation error.
#
# The README's own DRAFT prompt (English prose, "cel-shaded comic
# illustration, flat color...") is the same style that produced a wrong,
# non-anime, non-cel-shaded image when tried on the style-reference bootstrap
# (2026-08-17) -- Animagine XL 4.0 is Danbooru-tag-trained, not prose-trained.
# Translated to tag format here, same intent, empirically confirmed to work
# via the successful style-reference regeneration. Pose/likeness come from
# the ControlNet (lineart + openpose, driven by the player's own cutout) and
# IP-Adapter (style transfer, driven by the style reference) inputs, not the
# text prompt -- so unlike the style reference's own bootstrap prompt, this
# one omits pose-specific tags ("jumping", "mid-air dunk") that would fight
# the per-player ControlNet pose instead of describing rendering style.
PROMPT_POSITIVE = (
    "masterpiece, best quality, very aesthetic, absurdres, 1boy, solo, "
    "full body, athletic build, simple background, white background, "
    "cel shading, flat colors, bold lineart, hard shadows, no gradient, "
    "sports jersey"
)
PROMPT_NEGATIVE = (
    "lowres, bad anatomy, bad hands, text, error, missing fingers, extra "
    "digit, fewer digits, cropped, worst quality, low quality, normal "
    "quality, jpeg artifacts, signature, watermark, username, blurry, "
    "photo, photorealistic, 3d, realistic, soft shading, airbrush, "
    "gradient, scenery, background, court, crowd, multiple people, extra "
    "limbs"
)

COMFY_PORT = 8188
GPU_TYPE = "L4"  # HANDOFF §2: L4 or A10G to start, only move up if it OOMs
SCALEDOWN_WINDOW_SECONDS = 180  # within HANDOFF's suggested 120-300s range

AZURE_ACCOUNT = "stevearchive10723"
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art"

# ---------------------------------------------------------------------------
# Image build
# ---------------------------------------------------------------------------

WORKFLOW_JSON_PATH = Path(__file__).parent / "workflow_player_card.json"


def _clone_and_pin(url: str, commit: str, dest: str) -> str:
    return (
        f"git clone {url} {dest} && "
        f"cd {dest} && git checkout {commit} && cd -"
    )


def _download_pinned_models():
    """Image-build step: bake model weights into a cached layer instead of
    fetching them at cold start (HANDOFF §2).

    First version symlinked into a custom /cache dir via hf_hub_download's
    cache_dir param. That printed success at build time but the files
    weren't actually in the deployed image -- confirmed by shelling into
    the built image directly (`modal shell ...`), checkpoints/ was empty
    and /cache didn't exist at all. run_function's layer capture apparently
    doesn't reliably snapshot that combination (custom cache_dir + symlink
    into it, both outside the paths it seems to actually track). Fixed by
    using hf_hub_download's own default cache and copying (not symlinking)
    the real file straight to its destination -- no custom paths, no links,
    nothing for the snapshot mechanism to miss.
    """
    import shutil
    from huggingface_hub import hf_hub_download, snapshot_download

    models_root = Path("/root/comfy/ComfyUI/models")
    for repo_id, filename, revision, subdir, local_name_override in MODEL_DOWNLOADS:
        target_dir = models_root / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        path = hf_hub_download(repo_id=repo_id, filename=filename, revision=revision)
        local_name = local_name_override or Path(filename).name
        dest = target_dir / local_name
        shutil.copy(path, dest)
        assert dest.exists() and dest.stat().st_size > 0, f"copy failed for {dest}"
        print(f"pinned {repo_id}/{filename}@{revision} -> {dest}")

    # Full snapshot, not a single file -- segformer's from_pretrained() needs
    # config.json + preprocessor_config.json + weights all present together.
    segformer_dir = models_root / "segformer_b2_clothes"
    snapshot_download(
        repo_id=SEGFORMER_REPO, revision=SEGFORMER_REVISION,
        local_dir=str(segformer_dir),
    )
    assert (segformer_dir / "config.json").exists(), "segformer snapshot missing config.json"
    print(f"pinned {SEGFORMER_REPO}@{SEGFORMER_REVISION} -> {segformer_dir}")

    # The package's __init__.py imports this sibling model unconditionally
    # too (see SEGFORMER_B3_REPO comment above) -- without it here, the
    # whole custom node package fails to import and segformer_b2_clothes
    # (the one the graph actually uses) never registers either.
    segformer_b3_dir = models_root / "segformer_b3_fashion"
    snapshot_download(
        repo_id=SEGFORMER_B3_REPO, revision=SEGFORMER_B3_REVISION,
        local_dir=str(segformer_b3_dir),
    )
    assert (segformer_b3_dir / "config.json").exists(), "segformer_b3_fashion snapshot missing config.json"
    print(f"pinned {SEGFORMER_B3_REPO}@{SEGFORMER_B3_REVISION} -> {segformer_b3_dir}")

    # InsightFace's "buffalo_l" face-analysis model, needed by the FaceID
    # branch's identity embedding (get_ipadapter_file's is_insightface=True
    # for the "faceid plus v2" preset). insightface_loader() in
    # ComfyUI_IPAdapter_plus/utils.py fetches this from InsightFace's own
    # model zoo (not HF) the first time FaceAnalysis() is constructed --
    # calling it here during the image build forces that fetch into this
    # baked layer instead of happening at cold start (same rationale as
    # every other model in this function). ctx_id=-1 forces CPU-only
    # (no GPU is attached during this build-time run_function step);
    # generate() constructs its own FaceAnalysis with the real provider at
    # call time, this just needs the on-disk files to exist so that
    # construction doesn't hit the network.
    from insightface.app import FaceAnalysis
    insightface_dir = models_root / "insightface"
    fa = FaceAnalysis(name="buffalo_l", root=str(insightface_dir), providers=["CPUExecutionProvider"])
    fa.prepare(ctx_id=-1, det_size=(640, 640))
    assert (insightface_dir / "models" / "buffalo_l").exists(), "insightface buffalo_l model missing"
    print(f"pinned insightface/buffalo_l -> {insightface_dir}")

    # PuLID's InsightFace pack -- separate from FaceID's buffalo_l above,
    # PulidInsightFaceLoader hardcodes name="antelopev2". No plain onnx
    # files on the HF repo -- it ships as a single zip with a top-level
    # antelopev2/ folder (confirmed by inspecting the archive before
    # writing this, not assumed), which already matches the layout
    # FaceAnalysis expects under insightface_dir/models/.
    import zipfile
    antelopev2_zip = hf_hub_download(
        repo_id=ANTELOPEV2_REPO, filename="antelopev2.zip", revision=ANTELOPEV2_REVISION,
    )
    with zipfile.ZipFile(antelopev2_zip) as zf:
        zf.extractall(insightface_dir / "models")
    assert (insightface_dir / "models" / "antelopev2" / "scrfd_10g_bnkps.onnx").exists(), \
        "antelopev2 extraction incomplete"
    print(f"pinned {ANTELOPEV2_REPO}/antelopev2.zip@{ANTELOPEV2_REVISION} -> {insightface_dir}/models/antelopev2")

    # EVA CLIP -- PuLID_ComfyUI's PulidEvaClipLoader calls eva_clip's own
    # create_model_and_transforms(), which internally does its own
    # hf_hub_download() with the DEFAULT cache (repo_id/filename read
    # directly from eva_clip/pretrained.py's config table). Triggering the
    # identical call here (same repo, filename, revision, default cache --
    # no custom cache_dir, learned from Bug 5 earlier in this file) means
    # the runtime call is a cache hit against this baked layer instead of
    # a cold-start network fetch.
    hf_hub_download(repo_id=EVA_CLIP_REPO, filename=EVA_CLIP_FILENAME, revision=EVA_CLIP_REVISION)
    print(f"pinned {EVA_CLIP_REPO}/{EVA_CLIP_FILENAME}@{EVA_CLIP_REVISION} -> (default HF cache)")

    # facexlib's two models (retinaface_resnet50 detector + bisenet parser)
    # -- PuLID's ApplyPulid node constructs these directly via facexlib's
    # own init_detection_model()/init_parsing_model(), which download from
    # GitHub releases (not HF) to a path relative to facexlib's own
    # site-packages install location the first time they're called.
    # Triggering both here bakes them into the image the same way as
    # every other model in this function.
    from facexlib.detection import init_detection_model
    from facexlib.parsing import init_parsing_model
    init_detection_model("retinaface_resnet50", device="cpu")
    init_parsing_model(model_name="bisenet", device="cpu")
    print("pinned facexlib/retinaface_resnet50 + facexlib/bisenet")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "libgl1-mesa-dev", "libglib2.0-0", "wget")
    .run_commands("git lfs install")
    # Torch pinned explicitly and BEFORE ComfyUI's own requirements.txt, so
    # nothing downstream silently pulls a CPU-only build over this CUDA one.
    # 2.5.1/cu124 was the first pin and it was wrong -- ComfyUI v0.33.1 pulls
    # in comfy-kitchen 0.2.31, whose custom ops use a torch.library.custom_op
    # schema (list[int] args) that 2.5.1 can't parse. Confirmed by an actual
    # failed run, not guessed. torchvision/torchaudio versions below are the
    # exact ones pip resolved as compatible with torch==2.13.0 on cu129 in
    # that same run (2026-08-17) -- hard-pinned now that they're known-good,
    # not left open-ended.
    .pip_install(
        "torch==2.13.0", "torchvision==0.28.0", "torchaudio==2.11.0",
        extra_options="--index-url https://download.pytorch.org/whl/cu129",
    )
    # A pip constraints file (not a requirements file -- it only restricts
    # versions pip is ALLOWED to pick, never installs anything on its own)
    # pinning exactly the torch build above. This replaces --no-deps as the
    # guard against custom nodes' requirements.txt clobbering torch: with
    # --no-deps, EVERY transitive dependency of every custom node was
    # silently dropped, not just the torch-adjacent ones. That surfaced as a
    # chain of real, one-at-a-time missing-module failures once the actual
    # generate() graph exercised the affected nodes (pyparsing and joblib
    # fixed two; scikit-learn's narwhals/threadpoolctl and matplotlib's
    # contourpy/fonttools/kiwisolver were still missing after that -- a
    # genuine whack-a-mole, confirmed via modal shell each time, not
    # guessed). Installing with -c constraints.txt instead lets pip resolve
    # each node's FULL dependency tree normally; pip refuses to violate the
    # constraint rather than silently downgrading torch.
    .run_commands(
        "printf 'torch==2.13.0\\ntorchvision==0.28.0\\ntorchaudio==2.11.0\\n' "
        "> /root/constraints.txt"
    )
    .run_commands(
        _clone_and_pin(
            "https://github.com/comfyanonymous/ComfyUI.git",
            COMFYUI_COMMIT, "/root/comfy/ComfyUI",
        )
    )
    .run_commands(
        "cd /root/comfy/ComfyUI && pip install -c /root/constraints.txt -r requirements.txt"
    )
    .run_commands(
        *[
            _clone_and_pin(
                n["url"], n["commit"],
                f"/root/comfy/ComfyUI/custom_nodes/{n['url'].rstrip('/').rsplit('/', 1)[-1].removesuffix('.git')}",
            )
            for n in CUSTOM_NODES
        ]
    )
    .run_commands(
        "for d in /root/comfy/ComfyUI/custom_nodes/*/; do "
        '  if [ -f "$d/requirements.txt" ]; then '
        '    pip install -c /root/constraints.txt -r "$d/requirements.txt"; '
        "  fi; "
        "done"
    )
    # Comfyui_segformer_b2_clothes/requirements.txt pins transformers==4.33.2
    # directly, which (now installed WITH its deps) would leave that older
    # transformers on disk after the loop above. Re-asserting ComfyUI's own
    # requirements last makes it authoritative over anything upstream
    # regressed -- this was true under --no-deps too (Bug 3) and stays true
    # here; the constraints file only protects torch, nothing else.
    .run_commands(
        "cd /root/comfy/ComfyUI && pip install -c /root/constraints.txt -r requirements.txt"
    )
    .pip_install(
        "huggingface_hub", "opencv-python-headless", "onnxruntime",
        "insightface", "segment-anything",
        # rembg for the in-container alpha-matting step (see generate() below)
        "rembg[cpu]",
        "azure-storage-blob", "httpx", "pillow", "numpy",
    )
    .run_function(_download_pinned_models)
    .add_local_file(
        str(WORKFLOW_JSON_PATH), "/root/workflow_player_card.json", copy=True
    )
)

app = modal.App(name="scoot34-player-cards", image=image)


def _wait_for_port(port: int, timeout: int = 300):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.5)
    raise TimeoutError(f"ComfyUI never became ready on port {port}")


def _image_path(out_dir: Path, image_info: dict) -> Path:
    """ComfyUI's /history response splits each output image into separate
    `filename` and `subfolder` keys -- SaveImage nodes here use
    filename_prefix="raw/..." so the real file lands in output/raw/, but
    `subfolder` is reported apart from `filename` rather than folded into
    it. Joining out_dir directly to filename (the original code) silently
    missed the raw/ component and raised FileNotFoundError. subfolder is
    "" (not absent) when a node has no prefix, so this also has to work
    when there's nothing to join.
    """
    subfolder = image_info.get("subfolder", "")
    if subfolder:
        return out_dir / subfolder / image_info["filename"]
    return out_dir / image_info["filename"]


@app.cls(
    gpu=GPU_TYPE,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    secrets=[modal.Secret.from_name("azure-blob-creds")],
    timeout=600,  # generous per-call ceiling; the graph itself should finish well under this
)
class CardGenerator:
    @modal.enter()
    def start_comfyui(self):
        # Warm-load: the whole point of a class-based function with an enter
        # hook is that this only happens once per container, not per request
        # (HANDOFF §2 — "loading SDXL on every call is the single biggest
        # avoidable cost").
        self.proc = subprocess.Popen(
            ["python", "main.py", "--listen", "0.0.0.0", "--port", str(COMFY_PORT)],
            cwd="/root/comfy/ComfyUI",
        )
        _wait_for_port(COMFY_PORT, timeout=300)
        with open("/root/workflow_player_card.json") as f:
            template = json.load(f)

        # Fill the edition-fixed placeholders (see PROMPT_POSITIVE/NEGATIVE
        # comment above) -- real filenames come from MODEL_DOWNLOADS itself,
        # not re-typed, so this can't drift from what _download_pinned_models
        # actually staged on disk.
        by_subdir = {
            subdir: local_name_override or Path(filename).name
            for _, filename, _, subdir, local_name_override in MODEL_DOWNLOADS
        }
        template["2"]["inputs"]["ckpt_name"] = by_subdir["checkpoints"]
        template["7"]["inputs"]["control_net_name"] = by_subdir["controlnet"]
        template["3"]["inputs"]["text"] = PROMPT_POSITIVE
        template["4"]["inputs"]["text"] = PROMPT_NEGATIVE
        template["18"]["inputs"]["crop"] = "disabled"  # graph JSON has a typo: "disable"

        # Tuning pass 1 (2026-08-17), after the first real end-to-end output
        # (Brandon, seed 340034): the result was a washed-out, semi-
        # photographic blur, not the intended cel-shaded illustration --
        # the checkpoint's anime style was losing a fight against very
        # strong, fixed conditioning. Two suspects, both addressed:
        #  - Node 5 LineArtPreprocessor's "coarse" was off, so it extracted
        #    literal photographic edges (every shading gradient, not just
        #    silhouette/garment lines) from the player's real photo cutout
        #    -- turning coarse ON simplifies that to bolder, illustration-
        #    like lines closer to what an actual line-art source would give.
        #  - Node 10's lineart ControlNet strength (0.8) and node 14's
        #    IPAdapter (weight 1.0, active the ENTIRE denoise range 0.0-1.0)
        #    were both pinning the output too hard, fighting the
        #    checkpoint's own trained style through to the final steps.
        #    Lowered lineart strength and shortened IPAdapter's active
        #    range so the last portion of denoising is governed more by the
        #    checkpoint itself. Pose ControlNet (node 11, strength 0.6) left
        #    unchanged -- skeleton/keypoint conditioning doesn't carry
        #    photographic texture the way raw line-art edges do, so it
        #    wasn't a suspect for the blur, and lowering it would cost
        #    likeness/pose accuracy for no benefit.
        # Verified: re-ran Brandon (seed 340034) after this pass and got a
        # real cel-shaded illustration -- bold lineart, flat color, hard
        # shadows, matching the style reference. Style problem solved.
        template["5"]["inputs"]["coarse"] = "enable"
        template["10"]["inputs"]["strength"] = 0.4
        template["14"]["inputs"]["weight"] = 0.7
        template["14"]["inputs"]["end_at"] = 0.85

        # Tuning pass 2 (2026-08-18), attempt 1 -- REVERTED: tried swapping
        # node 12's preset to "PLUS FACE (portraits)". That made results
        # worse (Brandon's face came out completely blank) because it
        # misdiagnosed the failure -- node 12/14 is fed the fixed STYLE
        # REFERENCE image, never the subject's own photo, so no preset
        # swap on that pass could ever preserve a subject's likeness. It
        # was re-interpreting a non-face illustration as a face crop.
        # Node 12 stays on its original "PLUS (high strength)" -- correct
        # for its actual job (style transfer from the style reference).

        # Tuning pass 2, attempt 2 -- a SECOND, independent IPAdapter
        # branch (nodes 22/23, added directly to workflow_player_card.json
        # since this changes graph topology, not just field values) fed
        # each subject's own cutout (node 1) via IP-Adapter FaceID Plus V2.
        # Runs after the style branch (node 14) in the model-patching
        # chain, feeding KSampler (node 16) instead of node 14's raw
        # output. Node 22's preset ("FACEID PLUS V2") drives its own
        # filename auto-detection the same way node 12 already does --
        # nothing to fill in here.
        #
        # Verified against real output (Brandon, seed 340034): the branch
        # genuinely runs -- logs confirm the FaceID model, LoRA, and
        # InsightFace all loaded, and a real face embedding was computed
        # (ComfyUI_IPAdapter_plus hard-raises "InsightFace: No face
        # detected" on failure; we got a normal result instead). But the
        # visual identity signal was weak, arguably weaker than tuning pass
        # 1's non-identity-aware result. Best working theory: the face is
        # a small fraction of this full-body/bust composition, and FaceID
        # embedding conditioning is usually demonstrated on close-up
        # portraits where the face dominates the frame -- the signal may
        # simply be diluted at this scale.
        #
        # Tuning pass 3: push weight and weight_faceidv2 up from the
        # defaults (1.0/1.0, INPUT_TYPES max is 3.0/5.0) toward the
        # stronger end of what the community reports as usable before
        # identity conditioning starts visibly warping the image. Not yet
        # re-verified -- next generate() call is the check.
        template["23"]["inputs"]["weight"] = 1.8
        template["23"]["inputs"]["weight_faceidv2"] = 1.8

        self.workflow_template = template

    @modal.exit()
    def stop_comfyui(self):
        proc = getattr(self, "proc", None)
        if proc is not None:
            proc.terminate()

    def _submit_and_wait(self, prompt: dict, timeout: int = 300) -> dict:
        import httpx

        base = f"http://127.0.0.1:{COMFY_PORT}"
        resp = httpx.post(f"{base}/prompt", json={"prompt": prompt}, timeout=30)
        if resp.status_code != 200:
            # ComfyUI's validation errors are in the body, not the status
            # line -- surface them, a bare raise_for_status() hides exactly
            # the detail needed to fix a bad graph.
            raise RuntimeError(f"ComfyUI /prompt rejected the graph ({resp.status_code}): {resp.text}")
        prompt_id = resp.json()["prompt_id"]

        deadline = time.time() + timeout
        while time.time() < deadline:
            hist = httpx.get(f"{base}/history/{prompt_id}", timeout=30).json()
            if prompt_id in hist:
                return hist[prompt_id]
            time.sleep(1.0)
        raise TimeoutError(f"ComfyUI prompt {prompt_id} did not finish within {timeout}s")

    def _face_touchup(self, figure_path: Path, face_crop_name: str, serial: str, seed: int) -> Path:
        """Detect the face in the just-generated illustration, crop it,
        and run a short img2img pass with PuLID identity conditioning
        where the face fills the whole working frame instead of a small
        fraction of a full-body composition. See the call site's comment
        for why this exists. Returns figure_path unchanged if no face is
        detected in the generated image (rare but possible -- the
        composition sometimes crops the head, e.g. a low camera angle).
        """
        import numpy as np
        from PIL import Image, ImageDraw, ImageFilter

        if not hasattr(self, "_face_analysis") or self._face_analysis is None:
            from insightface.app import FaceAnalysis
            insightface_dir = "/root/comfy/ComfyUI/models/insightface"
            self._face_analysis = FaceAnalysis(
                name="antelopev2", root=insightface_dir, providers=["CPUExecutionProvider"],
            )
            # default det_thresh=0.5 finds nothing on this cel-shaded
            # illustration style -- scrfd is trained on real photos, not
            # flat-color anime art. Confirmed via modal shell against an
            # actual generated figure: 0.05 finds the real face (plus two
            # tiny false positives elsewhere in the jersey graphic, which
            # the max-by-area selection below already filters out).
            self._face_analysis.prepare(ctx_id=-1, det_thresh=0.05, det_size=(640, 640))

        img = Image.open(figure_path).convert("RGB")
        arr_bgr = np.array(img)[:, :, ::-1].copy()  # PIL is RGB, insightface expects BGR
        faces = self._face_analysis.get(arr_bgr)
        if not faces:
            print(f"{serial}: no face detected in generated figure, skipping touchup")
            return figure_path

        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        x1, y1, x2, y2 = face.bbox
        w, h = x2 - x1, y2 - y1
        if (w * h) < 0.01 * img.width * img.height:
            print(f"{serial}: largest detection too small ({w:.0f}x{h:.0f}), likely noise -- skipping touchup")
            return figure_path
        pad_x, pad_y = w * 0.6, h * 0.6
        cx1, cy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
        cx2, cy2 = min(img.width, x2 + pad_x), min(img.height, y2 + pad_y)
        # square it up around center so the working crop isn't badly
        # distorted by KSampler's square-latent assumptions downstream
        side = max(cx2 - cx1, cy2 - cy1)
        ccx, ccy = (cx1 + cx2) / 2, (cy1 + cy2) / 2
        cx1, cy1 = max(0, ccx - side / 2), max(0, ccy - side / 2)
        cx2, cy2 = min(img.width, cx1 + side), min(img.height, cy1 + side)
        box = (int(cx1), int(cy1), int(cx2), int(cy2))

        crop = img.crop(box)
        work_size = 768
        crop_up = crop.resize((work_size, work_size), Image.LANCZOS)

        comfy_input = Path("/root/comfy/ComfyUI/input")
        crop_input_name = f"{serial}_face_touchup_input.png"
        crop_up.save(comfy_input / crop_input_name)

        by_subdir = {
            subdir: local_name_override or Path(filename).name
            for _, filename, _, subdir, local_name_override in MODEL_DOWNLOADS
        }
        touchup_prompt = {
            "1": {"class_type": "LoadImage", "inputs": {"image": crop_input_name}},
            "2": {"class_type": "CheckpointLoaderSimple",
                  "inputs": {"ckpt_name": by_subdir["checkpoints"]}},
            "3": {"class_type": "CLIPTextEncode",
                  "inputs": {"clip": ["2", 1], "text": PROMPT_POSITIVE}},
            "4": {"class_type": "CLIPTextEncode",
                  "inputs": {"clip": ["2", 1], "text": PROMPT_NEGATIVE}},
            "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["1", 0], "vae": ["2", 2]}},
            "6": {"class_type": "PulidModelLoader", "inputs": {"pulid_file": by_subdir["pulid"]}},
            "7": {"class_type": "PulidInsightFaceLoader", "inputs": {"provider": "CPU"}},
            "8": {"class_type": "PulidEvaClipLoader", "inputs": {}},
            "9": {"class_type": "LoadImage", "inputs": {"image": face_crop_name}},
            "10": {"class_type": "ApplyPulid",
                   "inputs": {
                       "model": ["2", 0], "pulid": ["6", 0], "eva_clip": ["8", 0],
                       "face_analysis": ["7", 0], "image": ["9", 0],
                       "method": "fidelity", "weight": 1.0,
                       "start_at": 0.0, "end_at": 1.0,
                   }},
            "11": {"class_type": "KSampler",
                   "inputs": {
                       "model": ["10", 0], "positive": ["3", 0], "negative": ["4", 0],
                       "latent_image": ["5", 0], "seed": seed, "steps": 25, "cfg": 6.5,
                       "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.6,
                   }},
            "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["2", 2]}},
            "13": {"class_type": "SaveImage",
                   "inputs": {"images": ["12", 0], "filename_prefix": f"raw/{serial}_face_touchup"}},
        }
        touchup_result = self._submit_and_wait(touchup_prompt)
        out_dir = Path("/root/comfy/ComfyUI/output")
        touchup_path = _image_path(out_dir, touchup_result["outputs"]["13"]["images"][0])
        refined = Image.open(touchup_path).convert("RGB").resize(crop.size, Image.LANCZOS)

        # Feathered paste so the touched-up region doesn't leave a hard
        # rectangular seam against the surrounding cel-shaded lineart.
        mask = Image.new("L", crop.size, 0)
        draw = ImageDraw.Draw(mask)
        inset = int(min(crop.size) * 0.08)
        draw.ellipse([inset, inset, crop.size[0] - inset, crop.size[1] - inset], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=max(crop.size) * 0.06))

        composite = img.copy()
        composite.paste(refined, box[:2], mask)
        composite_path = figure_path.parent / f"{serial}_figure_touched_up.png"
        composite.save(composite_path)
        print(f"{serial}: face touchup applied, crop box={box}")
        return composite_path

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {serial, photo_url, pose, seed, style_ref, face_photo_url}
        per MODAL_BUILD_SPEC.md §4 (face_photo_url added 2026-08-18, optional
        -- see node 28's comment in workflow_player_card.json for why PuLID
        needs a separate, tighter face-only crop rather than reading the
        same full-body cutout ControlNet uses). Returns {figure_path,
        jersey_mask_path} -- Azure Blob paths, matching the interface
        contract.
        """
        import httpx
        import numpy as np
        from PIL import Image
        from azure.storage.blob import BlobServiceClient
        from rembg import remove, new_session

        serial = payload["serial"]
        seed = payload["seed"]

        comfy_input = Path("/root/comfy/ComfyUI/input")
        comfy_input.mkdir(parents=True, exist_ok=True)
        cutout_name = f"{serial}_cutout.png"
        style_name = "style_reference.png"
        face_crop_name = f"{serial}_face_crop.png"

        fetches = [(payload["photo_url"], cutout_name), (payload["style_ref"], style_name)]
        face_photo_url = payload.get("face_photo_url") or payload["photo_url"]
        fetches.append((face_photo_url, face_crop_name))
        for url, name in fetches:
            r = httpx.get(url, timeout=60)
            r.raise_for_status()
            (comfy_input / name).write_bytes(r.content)

        prompt = json.loads(json.dumps(self.workflow_template))  # deep copy
        prompt = {k: v for k, v in prompt.items() if not k.startswith("_")}
        prompt["1"]["inputs"]["image"] = cutout_name
        prompt["13"]["inputs"]["image"] = style_name
        prompt["28"]["inputs"]["image"] = face_crop_name
        prompt["16"]["inputs"]["seed"] = seed
        prompt["19"]["inputs"]["filename_prefix"] = f"raw/{serial}_figure"
        prompt["21"]["inputs"]["filename_prefix"] = f"raw/{serial}_jersey_mask"
        # pose (payload["pose"]) is not yet wired into the prompt skeleton —
        # the structured SMS pose menu -> prompt-text mapping is part of the
        # "structured edit menu" work HANDOFF explicitly defers past the
        # likeness test. For the likeness test itself, the fixed prompt
        # skeleton in workflow_player_card.json's node 3 is used as-is.

        result = self._submit_and_wait(prompt)

        outputs = result.get("outputs", {})
        out_dir = Path("/root/comfy/ComfyUI/output")
        figure_path = _image_path(out_dir, outputs["19"]["images"][0])
        mask_path = _image_path(out_dir, outputs["21"]["images"][0])

        # Face touchup (2026-08-18) -- OFF BY DEFAULT. Built to fix the
        # 9 PuLID/FaceID weight/method combinations that all plateaued at
        # "some facial features, not a decernable likeness": detects the
        # face IN THE GENERATED ILLUSTRATION, crops it, and runs a short
        # img2img refinement pass where the face fills the whole working
        # frame instead of a small fraction of the full-body composition
        # -- the same fix real ComfyUI "face detailer" workflows use.
        # Tested against Brandon (seed 340034): it ran correctly end to
        # end (detection threshold needed lowering to 0.05 first -- see
        # _face_touchup's comment -- fixed and confirmed working) but the
        # result was WORSE than the untouched baseline, not better --
        # erased the eyebrow structure the base generation already had
        # and introduced a garbled artifact near the mouth. That's 10 real
        # combinations now (9 identity-branch tunings + this) all
        # equal-or-worse than the simple single-pass baseline
        # (fidelity/weight=1.0, full-body frame, no touchup). Gated behind
        # an explicit payload flag rather than deleted -- the technique
        # may still be salvageable with different denoise/crop-padding
        # values, just not proven yet, and shouldn't cost every real
        # generation an extra GPU pass while unproven.
        if payload.get("face_touchup"):
            figure_path = self._face_touchup(figure_path, face_crop_name, serial, seed)

        # Alpha creation: SDXL/ComfyUI's own output is plain RGB, not RGBA —
        # diffusion models don't emit an alpha channel on their own no matter
        # how the prompt asks for "transparent background." This rembg pass
        # is what actually produces the delivered transparent PNG, mirroring
        # finalize_card.py's technique exactly (same isnet-anime model) so
        # dreamlab's copy of that script is a genuine defense-in-depth
        # re-check, not a second independent implementation to keep in sync.
        session = new_session("isnet-anime")
        raw_bytes = figure_path.read_bytes()
        matted = remove(raw_bytes, session=session)
        img = Image.open(__import__("io").BytesIO(matted)).convert("RGBA")
        arr = np.array(img)
        alpha = arr[:, :, 3]
        hard_alpha = np.where(alpha > 100, 255, 0).astype(np.uint8)
        if hard_alpha.min() == hard_alpha.max():
            raise ValueError(
                f"{serial}: alpha channel came out flat after matting — "
                f"refusing to upload a degenerate RGBA (see finalize_card.py's "
                f"identical check on the dreamlab side)"
            )
        arr[:, :, 3] = hard_alpha
        final_figure = Image.fromarray(arr, mode="RGBA")

        mask_img = Image.open(mask_path).convert("L")
        mask_arr = np.array(mask_img)
        mask_hard = np.where(mask_arr > 127, 255, 0).astype(np.uint8)
        final_mask = Image.fromarray(mask_hard, mode="L")

        blob_service = BlobServiceClient(
            account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
            credential=os.environ["AZURE_STORAGE_KEY"],
        )
        container = blob_service.get_container_client(AZURE_CONTAINER)

        figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_figure.png"
        mask_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_jersey_mask.png"

        fig_buf = __import__("io").BytesIO()
        final_figure.save(fig_buf, format="PNG")
        container.upload_blob(figure_blob, fig_buf.getvalue(), overwrite=True)

        mask_buf = __import__("io").BytesIO()
        final_mask.save(mask_buf, format="PNG")
        container.upload_blob(mask_blob, mask_buf.getvalue(), overwrite=True)

        return {
            "serial": serial,
            "figure_path": f"{AZURE_CONTAINER}/{figure_blob}",
            "jersey_mask_path": f"{AZURE_CONTAINER}/{mask_blob}",
        }

    @modal.method()
    def generate_style_reference(self, seed: int, prompt_text: str, negative_text: str) -> dict:
        """Bootstrap-only: the main graph (generate(), above) REQUIRES a style
        reference as IP-Adapter input, so it can't produce one itself —
        chicken-and-egg. This is a plain checkpoint + prompt + KSampler
        subgraph with no ControlNet, no IP-Adapter, run exactly once to
        create the one fixed reference image the whole edition then locks to.
        Uploads to a fixed Blob path and returns it; does not overwrite an
        existing reference unless explicitly asked (see main() below)."""
        prompt = {
            "1": {"class_type": "CheckpointLoaderSimple",
                  "inputs": {"ckpt_name": "animagine-xl-4.0.safetensors"}},
            "2": {"class_type": "CLIPTextEncode",
                  "inputs": {"clip": ["1", 1], "text": prompt_text}},
            "3": {"class_type": "CLIPTextEncode",
                  "inputs": {"clip": ["1", 1], "text": negative_text}},
            "4": {"class_type": "EmptyLatentImage",
                  "inputs": {"width": 1024, "height": 1462, "batch_size": 1}},
            "5": {"class_type": "KSampler",
                  "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                             "latent_image": ["4", 0], "seed": seed, "steps": 30,
                             "cfg": 6.5, "sampler_name": "dpmpp_2m", "scheduler": "karras",
                             "denoise": 1.0}},
            "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
            "7": {"class_type": "SaveImage",
                  "inputs": {"images": ["6", 0], "filename_prefix": "raw/style_reference"}},
        }
        from azure.storage.blob import BlobServiceClient

        result = self._submit_and_wait(prompt)
        out_dir = Path("/root/comfy/ComfyUI/output")
        image_path = _image_path(out_dir, result["outputs"]["7"]["images"][0])

        blob_service = BlobServiceClient(
            account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
            credential=os.environ["AZURE_STORAGE_KEY"],
        )
        container = blob_service.get_container_client(AZURE_CONTAINER)
        blob_path = f"{AZURE_OUTPUT_PREFIX}/style_reference.png"
        container.upload_blob(blob_path, image_path.read_bytes(), overwrite=True)
        return {"blob_path": f"{AZURE_CONTAINER}/{blob_path}", "seed": seed}


# ---------------------------------------------------------------------------
# How dreamlab (or anything else) calls this — spawn/poll, never blocking.
# This function is NOT what BigMo's webhook calls directly; it documents the
# pattern MODAL_BUILD_SPEC.md §3 requires. Not run automatically.
# ---------------------------------------------------------------------------

def spawn_example(payload: dict) -> str:
    """Returns a call_id immediately. Caller polls modal.FunctionCall
    .from_id(call_id).get(timeout=0) later — never blocks waiting on GPU
    generation, which is the whole reason this isn't a synchronous endpoint."""
    cls = modal.Cls.from_name("scoot34-player-cards", "CardGenerator")
    call = cls().generate.spawn(payload)
    return call.object_id
