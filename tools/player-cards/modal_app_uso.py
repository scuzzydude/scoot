"""Scoot(34) player-card facial likeness -- Tier 3 pilot (PLAN_facial_likeness.md).

ByteDance USO (Unified Style-Subject Optimization) on FLUX.1-dev, evaluated
after Tier 1 (checkpoint swap), Tier 2 (per-subject LoRA), and two pose
ControlNet tests all came back negative on the SDXL/ControlNet stack in
modal_app.py. USO is purpose-built to take a STYLE reference image and a
SUBJECT reference image in one pass and is natively supported in ComfyUI --
the closest published architecture to this exact problem (one locked style
reference + one subject photo per card). See
https://github.com/bytedance/USO and
https://blog.comfy.org/p/uso-available-in-comfyui.

Separate app/image from modal_app.py, not a modification of it -- totally
different base model (FLUX vs SDXL), different conditioning mechanism (no
ControlNet pose/lineart at all), so nothing here risks the working SDXL
pipeline. If USO doesn't pan out either, this file is simply unused; the
SDXL app stays exactly as it is.

Node graph reverse-engineered from ComfyUI's own official reference
workflow (not guessed): fetched
https://raw.githubusercontent.com/Comfy-Org/workflow_templates/refs/heads/main/templates/flux1_dev_uso_reference_image_gen.json
directly and traced its "USO Character Reference" subgraph -- every
class_type and link below matches that template exactly, flattened out of
ComfyUI's subgraph format into a plain API-format graph. Confirmed the
nodes this needs (USOStyleReference, ModelPatchLoader,
FluxKontextMultiReferenceLatentMethod) are already in the currently-pinned
ComfyUI commit (b963f4ad210a42841ab23dfc28a84143a0cce227, 2026-08-16) --
USO support was merged into ComfyUI core 2025-09-02
(comfy_extras/nodes_model_patch.py, commit 3412d53b1d69e4dfedf7e86c3092cea085094053),
long before that pin. No new custom-node repos to clone at all, unlike the
SDXL pipeline's PuLID/IPAdapter dependency set -- USO's nodes are all core
ComfyUI.

Key architectural difference from modal_app.py that matters here: USO
conditions on the subject photo via VAE-encoding it into a reference
LATENT (ReferenceLatent + FluxKontextMultiReferenceLatentMethod), not via
a ControlNet pose/lineart skeleton extracted from a full-body cutout. That
sidesteps the whole pose-reliability problem PLAN_facial_likeness.md's
last two tests ran into -- a clean, well-lit face-forward photo can be fed
directly, no rembg cutout or OpenPose extraction needed.

**Licensing, flag before any production use:** flux1-dev-fp8.safetensors
is FLUX.1 [dev], Black Forest Labs' Non-Commercial License -- same class
of open question already flagged for InsightFace in MODEL_PINS.md (does
Scoot(34) card generation count as commercial use). Fine for this
evaluation pilot; needs a real decision before this becomes the deployed
default.

    modal deploy tools/player-cards/modal_app_uso.py
    modal run tools/player-cards/modal_app_uso.py
"""

import json
import os
import socket
import subprocess
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Pinned versions
# ---------------------------------------------------------------------------

# Same commit as modal_app.py -- USO's nodes are already present (see
# module docstring), no need to track a newer one.
COMFYUI_COMMIT = "b963f4ad210a42841ab23dfc28a84143a0cce227"

# Same torch/cuda combo already proven working on this exact Modal
# infra for the SDXL pipeline -- de-risks one axis on a first-ever FLUX
# run in this repo, same reasoning as train_lora.py's pin.
TORCH_VERSION = "2.13.0"
TORCHVISION_VERSION = "0.28.0"
TORCHAUDIO_VERSION = "2.11.0"
TORCH_INDEX_URL = "https://download.pytorch.org/whl/cu129"

# Model files -- repo/filename/revision straight from ComfyUI's own
# reference workflow template (see module docstring), not guessed.
FLUX_REPO = "Comfy-Org/flux1-dev"
FLUX_FILENAME = "flux1-dev-fp8.safetensors"
FLUX_REVISION = "40a8a3d745c7d7adb077cb19879a975aa19c847b"  # ~16.1 GiB

SIGCLIP_REPO = "Comfy-Org/sigclip_vision_384"
SIGCLIP_FILENAME = "sigclip_vision_patch14_384.safetensors"
SIGCLIP_REVISION = "5421dab31229df19801c8e3af446b5a8bc71a3bc"  # ~817 MiB

USO_REPO = "Comfy-Org/USO_1.0_Repackaged"
USO_REVISION = "ecc2f4f664cbbe7cb1b710a4cabac27eb0952204"
USO_LORA_FILENAME = "split_files/loras/uso-flux1-dit-lora-v1.safetensors"  # ~456 MiB
USO_PROJECTOR_FILENAME = "split_files/model_patches/uso-flux1-projector-v1.safetensors"  # ~21 MiB

AZURE_ACCOUNT = "stevearchive10723"  # same account as modal_app.py
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art/uso-test"

COMFY_PORT = 8188
GPU_TYPE = "A10G"  # 24GB -- fp8 12B-param FLUX + LoRA + projector fits with headroom; same "start reasonable" philosophy as train_lora.py
SCALEDOWN_WINDOW_SECONDS = 180


def _clone_and_pin(url: str, commit: str, dest: str) -> str:
    return f"git clone {url} {dest} && cd {dest} && git checkout {commit} && cd -"


def _download_pinned_models():
    from huggingface_hub import hf_hub_download
    import shutil

    models_root = Path("/root/comfy/ComfyUI/models")
    downloads = [
        (FLUX_REPO, FLUX_FILENAME, FLUX_REVISION, "checkpoints"),
        (SIGCLIP_REPO, SIGCLIP_FILENAME, SIGCLIP_REVISION, "clip_vision"),
        (USO_REPO, USO_LORA_FILENAME, USO_REVISION, "loras"),
        (USO_REPO, USO_PROJECTOR_FILENAME, USO_REVISION, "model_patches"),
    ]
    for repo_id, filename, revision, subdir in downloads:
        target_dir = models_root / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        path = hf_hub_download(repo_id=repo_id, filename=filename, revision=revision)
        dest = target_dir / Path(filename).name
        shutil.copy(path, dest)
        assert dest.exists() and dest.stat().st_size > 0, f"copy failed for {dest}"
        print(f"pinned {repo_id}/{filename}@{revision} -> {dest}")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "libgl1-mesa-dev", "libglib2.0-0", "wget")
    .run_commands("git lfs install")
    .pip_install(
        f"torch=={TORCH_VERSION}", f"torchvision=={TORCHVISION_VERSION}", f"torchaudio=={TORCHAUDIO_VERSION}",
        extra_options=f"--index-url {TORCH_INDEX_URL}",
    )
    .run_commands(
        "printf 'torch==2.13.0\\ntorchvision==0.28.0\\ntorchaudio==2.11.0\\n' > /root/constraints.txt"
    )
    .run_commands(_clone_and_pin(
        "https://github.com/comfyanonymous/ComfyUI.git", COMFYUI_COMMIT, "/root/comfy/ComfyUI",
    ))
    .run_commands(
        "cd /root/comfy/ComfyUI && pip install -c /root/constraints.txt -r requirements.txt"
    )
    .pip_install("huggingface_hub", "azure-storage-blob", "httpx", "pillow", "numpy")
    .run_function(_download_pinned_models)
)

app = modal.App(name="scoot34-uso-test", image=image)


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
    subfolder = image_info.get("subfolder", "")
    if subfolder:
        return out_dir / subfolder / image_info["filename"]
    return out_dir / image_info["filename"]


@app.cls(gpu=GPU_TYPE, scaledown_window=SCALEDOWN_WINDOW_SECONDS,
          secrets=[modal.Secret.from_name("azure-blob-creds")], timeout=600)
class USOGenerator:
    @modal.enter()
    def start_comfyui(self):
        self.proc = subprocess.Popen(
            ["python", "main.py", "--listen", "0.0.0.0", "--port", str(COMFY_PORT)],
            cwd="/root/comfy/ComfyUI",
        )
        _wait_for_port(COMFY_PORT, timeout=300)

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
            raise RuntimeError(f"ComfyUI /prompt rejected the graph ({resp.status_code}): {resp.text}")
        prompt_id = resp.json()["prompt_id"]

        deadline = time.time() + timeout
        while time.time() < deadline:
            hist = httpx.get(f"{base}/history/{prompt_id}", timeout=30).json()
            if prompt_id in hist:
                return hist[prompt_id]
            time.sleep(1.0)
        raise TimeoutError(f"ComfyUI prompt {prompt_id} did not finish within {timeout}s")

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {serial, subject_photo_url, style_ref_url, prompt, seed,
        width, height, guidance}. Flattened equivalent of ComfyUI's own
        "USO Character Reference" reference-workflow subgraph -- see
        module docstring for where every class_type/link came from.
        """
        import httpx
        from azure.storage.blob import BlobServiceClient

        serial = payload["serial"]
        seed = payload["seed"]
        width = payload.get("width", 1024)
        height = payload.get("height", 1024)
        guidance = payload.get("guidance", 3.5)
        text = payload["prompt"]

        comfy_input = Path("/root/comfy/ComfyUI/input")
        comfy_input.mkdir(parents=True, exist_ok=True)
        subject_name = f"{serial}_subject.png"
        style_name = f"{serial}_style.png"
        for url, name in [(payload["subject_photo_url"], subject_name), (payload["style_ref_url"], style_name)]:
            r = httpx.get(url, timeout=60)
            r.raise_for_status()
            (comfy_input / name).write_bytes(r.content)

        prompt = {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": FLUX_FILENAME}},
            "2": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": SIGCLIP_FILENAME}},
            # _download_pinned_models copies to target_dir/Path(filename).name --
            # basename only, same as MODEL_DOWNLOADS in modal_app.py -- so the
            # graph must reference the basename too, not the repo-relative path
            # (USO_*_FILENAME above), which is what's actually on disk in
            # ComfyUI's models/ dirs. Confirmed via an actual rejected /prompt
            # call ("value_not_in_list"), not guessed -- same class of bug this
            # project already hit once with clip_vision in modal_app.py.
            "3": {"class_type": "ModelPatchLoader", "inputs": {"name": Path(USO_PROJECTOR_FILENAME).name}},
            "4": {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"model": ["1", 0], "lora_name": Path(USO_LORA_FILENAME).name, "strength_model": 1.0}},
            "5": {"class_type": "LoadImage", "inputs": {"image": style_name}},
            "6": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["2", 0], "image": ["5", 0], "crop": "center"}},
            "7": {"class_type": "USOStyleReference",
                  "inputs": {"model": ["4", 0], "model_patch": ["3", 0], "clip_vision_output": ["6", 0]}},
            "8": {"class_type": "LoadImage", "inputs": {"image": subject_name}},
            "9": {"class_type": "ImageScaleToMaxDimension",
                  "inputs": {"image": ["8", 0], "upscale_method": "area", "largest_size": 512}},
            "10": {"class_type": "VAEEncode", "inputs": {"pixels": ["9", 0], "vae": ["1", 2]}},
            "11": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": text}},
            "12": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["11", 0]}},
            "13": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["11", 0], "latent": ["10", 0]}},
            "14": {"class_type": "FluxKontextMultiReferenceLatentMethod",
                   "inputs": {"conditioning": ["13", 0], "reference_latents_method": "uxo/uno"}},
            "15": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["14", 0], "guidance": guidance}},
            "16": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
            "17": {"class_type": "KSampler",
                   "inputs": {"model": ["7", 0], "positive": ["15", 0], "negative": ["12", 0],
                              "latent_image": ["16", 0], "seed": seed, "steps": 20, "cfg": 1.0,
                              "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
            "18": {"class_type": "VAEDecode", "inputs": {"samples": ["17", 0], "vae": ["1", 2]}},
            "19": {"class_type": "SaveImage", "inputs": {"images": ["18", 0], "filename_prefix": f"raw/{serial}"}},
        }

        result = self._submit_and_wait(prompt)
        outputs = result.get("outputs", {})
        out_dir = Path("/root/comfy/ComfyUI/output")
        figure_path = _image_path(out_dir, outputs["19"]["images"][0])

        blob_service = BlobServiceClient(
            account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
            credential=os.environ["AZURE_STORAGE_KEY"],
        )
        container = blob_service.get_container_client(AZURE_CONTAINER)
        figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_figure.png"
        with open(figure_path, "rb") as f:
            container.upload_blob(figure_blob, f, overwrite=True)

        return {"serial": serial, "figure_path": f"{AZURE_CONTAINER}/{figure_blob}"}
