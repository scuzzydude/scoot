"""Scoot(34) player-card facial likeness -- Tier 4 pilot (PLAN_facial_likeness.md).

FLUX.1 Kontext [dev], evaluated after USO on FLUX (Tier 3) hit a real
wall: identity survives cleanly in a headshot-dominant composition but is
lost every time the output is pushed toward full-body/waist-up framing --
confirmed across 4 tests varying every other lever (style-pass strength,
prompt wording, subject-photo framing). Tier 3's mechanism (USO) is
TEXT-TO-IMAGE generation from noise, conditioned on a subject reference --
identity has to survive an entire generation process it's only weakly
steering.

Kontext is architecturally different in the way that matters here: it's
an actual IMAGE-EDITING model. The input photo is VAE-encoded into a
latent that KSampler starts denoising FROM (not empty/random noise, per
ComfyUI's own reference workflow -- traced and confirmed below, not
guessed), with the edit instruction steering what changes. The model
itself was trained end-to-end for "take this photo, apply this text
instruction, preserve everything else" -- not a LoRA/adapter bolted onto
a generic base model the way USO's identity mechanism is. Brandon
independently confirmed the practical version of this: Meta AI's
"cartoonify this photo" feature preserved his likeness instantly and
correctly, almost certainly via the same class of edit-model architecture
(https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev -- reported
to outperform other open edit models AND Gemini-Flash-Image on identity
preservation specifically).

Separate app/image from modal_app.py and modal_app_uso.py -- yet another
distinct checkpoint (flux1-dev-kontext, not flux1-dev), zero shared risk
with either. Node graph reverse-engineered from ComfyUI's own official
reference workflow the same way USO's was: fetched
https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/flux_kontext_dev_basic.json
directly, traced its subgraph, verified every node's actual input names
against ComfyUI source before writing the flattened API-format graph.
Key structural facts confirmed from that trace, not assumed:
  - KSampler's latent_image input is the SAME VAEEncode'd latent as the
    ReferenceLatent conditioning (not EmptySD3LatentImage) -- this is
    what makes it a true edit, not a fresh generation.
  - denoise=1.0 despite starting from a real image's latent -- the edit
    behavior comes from ReferenceLatent conditioning + the model's own
    training, not partial denoising the way classic img2img works.
  - FluxGuidance defaults to 2.5 here (vs USO's 3.5).
  - A single input image is a fully supported, simpler case than the
    template's two-image ImageStitch demo (confirmed via that
    workflow's own MarkdownNote) -- no second reference image needed for
    a single-photo edit instruction.

Prompting follows Kontext's own documented best practices (same
reference workflow's MarkdownNote, quoted directly): be specific, name
what to preserve explicitly ("preserving facial features"), prefer
"change X to Y" over "transform into Y" -- the workflow's own examples
show "transform the person into a Viking" as the WRONG pattern
(identity drifts) vs "change the clothes to be a viking warrior while
preserving facial features" as correct.

**Licensing, same class of question already flagged twice:**
flux1-dev-kontext is also FLUX.1 [dev]'s Non-Commercial License family.
Fine for evaluation; needs the same real decision as the other two
before production use.

    modal deploy tools/player-cards/modal_app_kontext.py
"""

import os
import socket
import subprocess
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Pinned versions
# ---------------------------------------------------------------------------

COMFYUI_COMMIT = "b963f4ad210a42841ab23dfc28a84143a0cce227"  # same as modal_app.py/modal_app_uso.py -- FluxKontextImageScale etc. already present, confirmed the same way as USO's nodes were

TORCH_VERSION = "2.13.0"
TORCHVISION_VERSION = "0.28.0"
TORCHAUDIO_VERSION = "2.11.0"
TORCH_INDEX_URL = "https://download.pytorch.org/whl/cu129"

# Model files -- repo/filename/revision from ComfyUI's own reference
# workflow template (see module docstring), not guessed.
KONTEXT_REPO = "Comfy-Org/flux1-kontext-dev_ComfyUI"
KONTEXT_FILENAME = "split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors"
KONTEXT_REVISION = "6799032a16e9c37154e5474d4a308e378e3359a8"  # ~11.9 GiB

VAE_REPO = "Comfy-Org/Lumina_Image_2.0_Repackaged"
VAE_FILENAME = "split_files/vae/ae.safetensors"
VAE_REVISION = "5b072540ef86570fecb8249c505f23d5bdeb88cd"  # ~335 MiB -- yes, hosted in an unrelated-named repo, that's just where Comfy-Org packaged it

TEXT_ENCODERS_REPO = "comfyanonymous/flux_text_encoders"
TEXT_ENCODERS_REVISION = "6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5"
CLIP_L_FILENAME = "clip_l.safetensors"  # ~246 MiB
T5XXL_FILENAME = "t5xxl_fp8_e4m3fn_scaled.safetensors"  # ~5.2 GiB

AZURE_ACCOUNT = "stevearchive10723"
AZURE_CONTAINER = "media"
AZURE_OUTPUT_PREFIX = "card-art/kontext-test"

COMFY_PORT = 8188
GPU_TYPE = "A10G"
SCALEDOWN_WINDOW_SECONDS = 180


def _clone_and_pin(url: str, commit: str, dest: str) -> str:
    return f"git clone {url} {dest} && cd {dest} && git checkout {commit} && cd -"


def _download_pinned_models():
    from huggingface_hub import hf_hub_download
    import shutil

    models_root = Path("/root/comfy/ComfyUI/models")
    downloads = [
        (KONTEXT_REPO, KONTEXT_FILENAME, KONTEXT_REVISION, "diffusion_models"),
        (VAE_REPO, VAE_FILENAME, VAE_REVISION, "vae"),
        (TEXT_ENCODERS_REPO, CLIP_L_FILENAME, TEXT_ENCODERS_REVISION, "text_encoders"),
        (TEXT_ENCODERS_REPO, T5XXL_FILENAME, TEXT_ENCODERS_REVISION, "text_encoders"),
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

app = modal.App(name="scoot34-kontext-test", image=image)


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
class KontextGenerator:
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
        """payload: {serial, subject_photo_url, prompt, seed, guidance}.
        Single-image edit -- see module docstring for why this doesn't
        need a separate style-reference image the way USO's graph did.
        """
        import httpx
        from azure.storage.blob import BlobServiceClient

        serial = payload["serial"]
        seed = payload["seed"]
        guidance = payload.get("guidance", 2.5)
        text = payload["prompt"]

        comfy_input = Path("/root/comfy/ComfyUI/input")
        comfy_input.mkdir(parents=True, exist_ok=True)
        subject_name = f"{serial}_subject.png"
        r = httpx.get(payload["subject_photo_url"], timeout=60)
        r.raise_for_status()
        (comfy_input / subject_name).write_bytes(r.content)

        prompt = {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": Path(KONTEXT_FILENAME).name, "weight_dtype": "default"}},
            "2": {"class_type": "DualCLIPLoader",
                  "inputs": {"clip_name1": CLIP_L_FILENAME, "clip_name2": T5XXL_FILENAME, "type": "flux"}},
            "3": {"class_type": "VAELoader", "inputs": {"vae_name": Path(VAE_FILENAME).name}},
            "4": {"class_type": "LoadImage", "inputs": {"image": subject_name}},
            "5": {"class_type": "FluxKontextImageScale", "inputs": {"image": ["4", 0]}},
            "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
            "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": text}},
            "8": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
            "9": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
            "10": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["9", 0], "guidance": guidance}},
            "11": {"class_type": "KSampler",
                   "inputs": {"model": ["1", 0], "positive": ["10", 0], "negative": ["8", 0],
                              "latent_image": ["6", 0], "seed": seed, "steps": 20, "cfg": 1.0,
                              "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
            "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
            "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": f"raw/{serial}"}},
        }

        result = self._submit_and_wait(prompt)
        outputs = result.get("outputs", {})
        out_dir = Path("/root/comfy/ComfyUI/output")
        figure_path = _image_path(out_dir, outputs["13"]["images"][0])

        blob_service = BlobServiceClient(
            account_url=f"https://{AZURE_ACCOUNT}.blob.core.windows.net",
            credential=os.environ["AZURE_STORAGE_KEY"],
        )
        container = blob_service.get_container_client(AZURE_CONTAINER)
        figure_blob = f"{AZURE_OUTPUT_PREFIX}/{serial}_figure.png"
        with open(figure_path, "rb") as f:
            container.upload_blob(figure_blob, f, overwrite=True)

        return {"serial": serial, "figure_path": f"{AZURE_CONTAINER}/{figure_blob}"}
