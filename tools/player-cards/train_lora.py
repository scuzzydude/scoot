"""Scoot(34) player-card facial likeness -- Tier 2 pilot (PLAN_facial_likeness.md).

Per-subject DreamBooth LoRA training on Modal, so a subject's own face
can condition generation directly (editing UNet weights) instead of via
PuLID/FaceID's cross-attention identity injection, which
FACIAL_LIKENESS_RESEARCH.md documented as fighting a full-parameter-
finetuned checkpoint like Animagine XL 4.0.

Trainer/pattern: HuggingFace diffusers' own train_dreambooth_lora_sdxl.py,
driven the way Modal's own official example does it --
modal-labs/modal-examples, 06_gpu_and_ml/dreambooth/diffusers_lora_finetune.py
(that file currently targets FLUX; App/Volume/`accelerate launch subprocess`
pattern reused here, script target and args swapped for SDXL). Checked for
an existing Modal-native SDXL LoRA template before writing this from
scratch, per PLAN_facial_likeness.md Tier 2 step 1.

Checkpoint: animagine-xl-4.0 (Opt, the main release already deployed in
modal_app.py) -- NOT "Zero". Tier 1 (see MODEL_PINS.md, 2026-08-19) proved
Zero breaks ControlNet pose-following. LoRA edits UNet weights directly
rather than injecting a foreign cross-attention signal, so it doesn't
carry PuLID/FaceID's distribution-mismatch problem and has no reason to
inherit Zero's regression -- train against Opt.

Hyperparameters below are diffusers' own sourced example command in
examples/dreambooth/README_sdxl.md (checked 2026-08-19), not guessed:
resolution=1024, train_batch_size=1, gradient_accumulation_steps=4,
learning_rate=1e-4, constant scheduler, no warmup, mixed_precision=fp16,
the madebyollin/sdxl-vae-fp16-fix VAE (SDXL's own VAE has known fp16
numerical-instability issues), no prior-preservation/class images for a
simple single-subject identity LoRA. rank=16 (Modal's own dreambooth
example's default; enough capacity for identity without overfitting the
7-image pilot set harder than a higher rank would).

Training data: tools/player-cards/art/lora_training/brandon/ (gitignored,
not in the repo -- personal photos, images only). 7 images, 7 distinct
real moments, see art/lora_training/brandon_README.txt (one level up --
NOT inside brandon/ itself, since train_dreambooth_lora_sdxl.py's
DreamBoothDataset does Image.open() on every file in instance_data_dir
with no extension filter and would crash on a stray .txt) for
provenance. Baked into the image at build time via add_local_dir, same
pattern modal_app.py uses for workflow_player_card.json.

Caption note: train_dreambooth_lora_sdxl.py's local-folder path
(--instance_data_dir) applies ONE --instance_prompt to every image --
per-image captions are only possible via --dataset_name pointed at a
HuggingFace `datasets` imagefolder with a caption column, a separate,
less-proven code path in the script. Chose the simple, standard,
well-documented single-prompt path for this first pilot rather than an
unverified local-metadata.jsonl route.

NOT YET RUN as of writing. First real run may need pin corrections --
same discipline as modal_app.py's own history (see its torch 2.5.1->2.13.0
note): pins here are the best-available choice given the docs, not yet
execution-verified.

    modal run tools/player-cards/train_lora.py
"""

import subprocess
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Pinned versions
# ---------------------------------------------------------------------------

# Tagged v0.39.0, NOT main HEAD -- first attempt pinned today's main
# commit (ac56fa2...) and the build failed for real: that commit is
# 0.40.0.dev0, which requires huggingface-hub>=1.23.0,<2.0, a constraint
# transformers 4.57.6 (latest 4.x -- see below) can't satisfy
# (transformers caps huggingface-hub<1.0). Confirmed via pip's own
# ResolutionImpossible error, not guessed. v0.39.0 is the latest tagged
# release and only requires huggingface-hub>=0.34.0,<2.0 -- compatible
# with the whole rest of this stack. Same lesson as modal_app.py's own
# pin history: a moving-target `main` bit this project before too.
DIFFUSERS_COMMIT = "a3608b512ed7248499a44c61d954965ed9bdae4d"  # tag v0.39.0

# Reuse the exact torch/cuda combo already proven working on this same
# Modal L4/A10G infra (modal_app.py, MODEL_PINS.md) -- de-risks one whole
# axis of a first-ever training run in this repo by not introducing a
# second untested torch pin alongside a brand-new toolchain.
TORCH_VERSION = "2.13.0"
TORCHVISION_VERSION = "0.28.0"
TORCH_INDEX_URL = "https://download.pytorch.org/whl/cu129"

# Latest-4.x transformers, not the current 5.x line -- diffusers v0.39.0's
# SDXL training code is far more proven against the 4.x API; a
# major-version jump is exactly the kind of untested-compatibility risk
# this project has already been burned by once (see modal_app.py's torch
# pin note).
TRANSFORMERS_VERSION = "4.57.6"
ACCELERATE_VERSION = "1.14.0"
PEFT_VERSION = "0.20.0"
DATASETS_VERSION = "5.0.1"  # imported at module level by the training script even on the instance_data_dir path
# Latest release still on the pre-1.0 line every other pin here requires
# (transformers caps it <1.0; diffusers v0.39.0/peft/datasets/accelerate
# all accept it) -- exact-pinned so the later pip_install layer can't
# silently drift it, same reasoning as the conflict this replaced above.
HF_HUB_VERSION = "0.36.2"

# Checkpoint: Opt (main release), not Zero -- see module docstring.
BASE_MODEL_REPO = "cagliostrolab/animagine-xl-4.0"
BASE_MODEL_REVISION = "2b7c1b397761bf5bd3cc42e5b39ec99314a75a96"  # same pin as modal_app.py

VAE_REPO = "madebyollin/sdxl-vae-fp16-fix"
VAE_REVISION = "207b116dae70ace3637169f1ddd2434b91b3a8cd"

TRAINING_IMAGES_DIR = Path(__file__).parent / "art" / "lora_training" / "brandon"

# ---------------------------------------------------------------------------
# Image
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        f"torch=={TORCH_VERSION}", f"torchvision=={TORCHVISION_VERSION}",
        extra_options=f"--index-url {TORCH_INDEX_URL}",
    )
    .run_commands(
        "git clone https://github.com/huggingface/diffusers /root/diffusers && "
        f"cd /root/diffusers && git checkout {DIFFUSERS_COMMIT} && "
        "pip install -e ."
    )
    .pip_install(
        f"transformers=={TRANSFORMERS_VERSION}",
        f"accelerate=={ACCELERATE_VERSION}",
        f"peft=={PEFT_VERSION}",
        f"datasets=={DATASETS_VERSION}",
        # Exact-pinned, not left open -- diffusers' own `pip install -e .`
        # (previous layer) pulled in huggingface_hub 1.28.0 to satisfy its
        # own >=1.23.0,<2.0 requirement; leaving this unpinned let THIS
        # layer's resolver silently downgrade it to 0.36.2 to satisfy
        # transformers/datasets instead, which pip itself then flagged as
        # incompatible with diffusers (confirmed via an actual build's
        # printed dependency-conflict warning, not caught by re-reasoning).
        # Pinning forces the resolver to either keep it consistent across
        # every package or fail the build loudly instead of shipping a
        # broken combination silently.
        f"huggingface_hub=={HF_HUB_VERSION}",
        "sentencepiece", "ftfy", "tensorboard", "Jinja2",
        "azure-storage-blob",
        # NOT `pip install -r requirements_sdxl.txt` -- it exact-pins
        # peft==0.7.0, which would silently clobber the newer peft pinned
        # above. Same class of bug modal_app.py's constraints.txt already
        # exists to prevent for the ComfyUI custom nodes; here the fix is
        # simpler since this file only introduces two packages beyond what's
        # already pinned above (tensorboard, Jinja2), both added directly.
    )
    .add_local_dir(str(TRAINING_IMAGES_DIR), "/root/training_images", copy=True)
)

app = modal.App(name="scoot34-lora-training", image=image)

volume = modal.Volume.from_name("scoot34-lora-training-vol", create_if_missing=True)
MODEL_DIR = "/vol/base_model"
VAE_DIR = "/vol/vae"
OUTPUT_DIR = "/vol/output"

# Same seed used throughout the earlier likeness testing (34-TEST-BRANDON-v6
# etc.) -- not load-bearing for training itself, kept for consistency with
# the rest of this project's convention of pinning every seed explicitly.
SEED = 340034

INSTANCE_PROMPT = "a photo of brandon34person, a man"

GPU_TYPE = "A10G"  # 24GB, well inside SDXL LoRA's footprint at rank 16/batch 1; HANDOFF's "start small, move up if it OOMs" philosophy applies here too


@app.function(volumes={"/vol": volume}, timeout=1200)
def download_base_model():
    from huggingface_hub import snapshot_download

    # The repo's two top-level standalone checkpoints (animagine-xl-4.0.safetensors,
    # animagine-xl-4.0-opt.safetensors) are the single-file ComfyUI format
    # already baked into modal_app.py's image -- training needs the
    # diffusers-format subfolders (unet/, vae/, text_encoder*/, ...) instead,
    # so skip both top-level files and save the download.
    snapshot_download(
        BASE_MODEL_REPO, revision=BASE_MODEL_REVISION, local_dir=MODEL_DIR,
        ignore_patterns=["animagine-xl-4.0.safetensors", "animagine-xl-4.0-opt.safetensors", "*.bin"],
    )
    snapshot_download(VAE_REPO, revision=VAE_REVISION, local_dir=VAE_DIR)
    volume.commit()


@app.function(gpu=GPU_TYPE, volumes={"/vol": volume}, timeout=5400)
def train(
    instance_prompt: str = INSTANCE_PROMPT,
    rank: int = 16,
    max_train_steps: int = 500,
    learning_rate: float = 1e-4,
    seed: int = SEED,
):
    from accelerate.utils import write_basic_config

    write_basic_config(mixed_precision="fp16")
    volume.reload()

    def _exec_subprocess(cmd: list[str]):
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        with process.stdout as pipe:
            for line in iter(pipe.readline, b""):
                print(line.decode(), end="")
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, " ".join(cmd))

    _exec_subprocess(
        [
            "accelerate", "launch",
            "/root/diffusers/examples/dreambooth/train_dreambooth_lora_sdxl.py",
            f"--pretrained_model_name_or_path={MODEL_DIR}",
            f"--pretrained_vae_model_name_or_path={VAE_DIR}",
            "--instance_data_dir=/root/training_images",
            f"--output_dir={OUTPUT_DIR}",
            "--mixed_precision=fp16",
            f"--instance_prompt={instance_prompt}",
            "--resolution=1024",
            "--train_batch_size=1",
            "--gradient_accumulation_steps=4",
            f"--learning_rate={learning_rate}",
            "--lr_scheduler=constant",
            "--lr_warmup_steps=0",
            f"--max_train_steps={max_train_steps}",
            f"--rank={rank}",
            f"--seed={seed}",
        ]
    )
    volume.commit()


@app.function(volumes={"/vol": volume}, timeout=600, secrets=[modal.Secret.from_name("azure-blob-creds")])
def upload_result():
    import os
    from azure.storage.blob import BlobServiceClient

    volume.reload()  # pick up train()'s commit from its own container

    AZURE_ACCOUNT = "stevearchive10723"  # same account as modal_app.py
    AZURE_CONTAINER = "media"
    AZURE_BLOB_PATH = "card-art/lora/brandon34person_lora.safetensors"

    lora_path = Path(OUTPUT_DIR) / "pytorch_lora_weights.safetensors"
    if not lora_path.exists():
        raise FileNotFoundError(f"{lora_path} missing -- training did not produce output")

    blob_service = BlobServiceClient(
        account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
        credential=os.environ["AZURE_STORAGE_KEY"],
    )
    container = blob_service.get_container_client(AZURE_CONTAINER)
    with open(lora_path, "rb") as f:
        container.upload_blob(AZURE_BLOB_PATH, f, overwrite=True)

    return f"{AZURE_CONTAINER}/{AZURE_BLOB_PATH}"


@app.local_entrypoint()
def main(max_train_steps: int = 500, rank: int = 16):
    print("downloading base model + VAE into the training volume")
    download_base_model.remote()
    print("training")
    train.remote(max_train_steps=max_train_steps, rank=rank)
    print("uploading result to Blob")
    path = upload_result.remote()
    print("done:", path)
