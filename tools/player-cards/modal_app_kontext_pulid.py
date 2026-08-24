"""Scoot(34) player-card facial likeness -- PuLID-FLUX + Kontext pilot.

Two straight rounds of prompt-only + masked-ReferenceLatent correction on
Nick and Rufus plateaued (see PLAN_facial_likeness.md / memory
project_player_cards_facial_likeness.md, 2026-08-24): masked correction
at denoise 0.9 barely changed the output, and pushing to denoise 1.0/
guidance 4.0 introduced artifacts without reading as more recognizable.
Researched why: FLUX.1 Kontext alone is documented to struggle
specifically when the edited output's overall STRUCTURE diverges a lot
from the input (https://github.com/ToTheBeginning/PuLID/blob/main/docs/
pulid_for_flux.md and the "Flux Kontext Pulid" ComfyUI workflow writeup,
runcomfy.com) -- exactly our case, photo -> ink-comic illustration is a
big structural change. PuLID adds a SEPARATE identity-injection
mechanism (dedicated cross-attention layers patched onto the model,
conditioned on a face embedding) that's designed to persist identity
through exactly this kind of transformation, instead of relying solely
on Kontext's own ReferenceLatent edit-instruction conditioning.

Node graph, model files, and exact class names below are all copied from
the upstream repo's own working example
(github.com/balazik/ComfyUI-PuLID-Flux, examples/pulid_flux_16bit_simple.json)
and verified directly against pulidflux.py's source -- not guessed:
  - PulidFluxInsightFaceLoader / PulidFluxEvaClipLoader / PulidFluxModelLoader
    load the three PuLID-side inputs; ApplyPulidFlux patches the base
    UNETLoader MODEL output using a face-reference IMAGE before that
    patched model reaches KSampler. This composes independently of
    whichever conditioning/sampling chain consumes the model afterward,
    so it drops into the existing Kontext generate() graph unchanged --
    same UNETLoader/DualCLIPLoader/VAELoader/ReferenceLatent/KSampler
    nodes as modal_app_kontext.py's generate(), just with ApplyPulidFlux
    spliced between UNETLoader and KSampler.
  - InsightFace: PulidFluxInsightFaceLoader hardcodes
    FaceAnalysis(name="antelopev2", root=INSIGHTFACE_DIR) -- confirmed by
    reading pulidflux.py, not the node's exposed widgets. antelopev2 is
    no longer in insightface's own auto-download zoo (license-pulled),
    so it's fetched here from MonsterMMORPG/tools/antelopev2.zip (a
    known community mirror of the original buffalo/antelope pack) and
    extracted to models/insightface/models/antelopev2/ -- verified the
    zip's internal layout (`antelopev2/*.onnx`, 5 files) before writing
    the extraction code, so no nested-folder surprise.
  - EVA-CLIP: pulidflux.py calls the bundled eva_clip package's
    create_model_and_transforms('EVA02-CLIP-L-14-336', 'eva_clip', ...),
    which resolves (per its own pretrained.py registry) to
    hf_hub_download('QuanSun/EVA-CLIP', 'EVA02_CLIP_L_336_psz14_s6B.pt')
    against the DEFAULT huggingface_hub cache dir -- so pre-warming that
    exact hf_hub_download call at image-build time (not a manual file
    path) is enough for it to be a build-time-cached no-op at runtime.
  - PuLID weights: guozinan/PuLID/pulid_flux_v0.9.0.safetensors, the
    exact filename balazik's own example workflow references.

Licensing: PuLID's adapter code is Apache 2.0. InsightFace's antelopev2
model package requires a commercial license for commercial use -- same
non-commercial-family question already flagged for flux1-dev-kontext
itself. Brandon confirmed 2026-08-24 this is non-profit/non-commercial
use (Fonde Brotherhood / Scoot(34)), so proceeding without that being a
blocker -- not re-litigating per person memory.

Separate app/file from modal_app_kontext.py -- this pulls in a
materially bigger dependency surface (insightface, onnxruntime-gpu,
facexlib, a 360MB antelopev2 zip, a ~1.5GB eva_clip checkpoint, ~2GB
PuLID weights on top of Kontext's own ~12GB fp8 base) and is genuinely
unverified until it's actually run once, same "pins are the
best-available choice given the docs, not yet execution-verified"
discipline as this project's other Modal apps.

    modal run tools/player-cards/modal_app_kontext_pulid.py
"""

import os
import socket
import subprocess
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Pinned versions -- reuse Kontext's own working pins where the surface
# overlaps (same ComfyUI commit, same torch/cuda combo, same base model).
# ---------------------------------------------------------------------------

COMFYUI_COMMIT = "b963f4ad210a42841ab23dfc28a84143a0cce227"

TORCH_VERSION = "2.13.0"
TORCHVISION_VERSION = "0.28.0"
TORCHAUDIO_VERSION = "2.11.0"
TORCH_INDEX_URL = "https://download.pytorch.org/whl/cu129"

KONTEXT_REPO = "Comfy-Org/flux1-kontext-dev_ComfyUI"
KONTEXT_FILENAME = "split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors"
KONTEXT_REVISION = "6799032a16e9c37154e5474d4a308e378e3359a8"

VAE_REPO = "Comfy-Org/Lumina_Image_2.0_Repackaged"
VAE_FILENAME = "split_files/vae/ae.safetensors"
VAE_REVISION = "5b072540ef86570fecb8249c505f23d5bdeb88cd"

TEXT_ENCODERS_REPO = "comfyanonymous/flux_text_encoders"
TEXT_ENCODERS_REVISION = "6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5"
CLIP_L_FILENAME = "clip_l.safetensors"
T5XXL_FILENAME = "t5xxl_fp8_e4m3fn_scaled.safetensors"

# PuLID-Flux custom node + its model files -- see module docstring for
# how each path/filename below was confirmed against upstream source.
PULID_NODE_REPO = "https://github.com/balazik/ComfyUI-PuLID-Flux.git"
PULID_NODE_COMMIT = "main"  # no tagged release as of writing; pin to a commit on first successful run

PULID_WEIGHTS_REPO = "guozinan/PuLID"
PULID_WEIGHTS_FILENAME = "pulid_flux_v0.9.0.safetensors"

ANTELOPEV2_REPO = "MonsterMMORPG/tools"
ANTELOPEV2_FILENAME = "antelopev2.zip"

EVA_CLIP_REPO = "QuanSun/EVA-CLIP"
EVA_CLIP_FILENAME = "EVA02_CLIP_L_336_psz14_s6B.pt"

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
    import zipfile

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

    # PuLID weights -> models/pulid/
    pulid_dir = models_root / "pulid"
    pulid_dir.mkdir(parents=True, exist_ok=True)
    path = hf_hub_download(repo_id=PULID_WEIGHTS_REPO, filename=PULID_WEIGHTS_FILENAME)
    dest = pulid_dir / PULID_WEIGHTS_FILENAME
    shutil.copy(path, dest)
    assert dest.exists() and dest.stat().st_size > 0
    print(f"pinned {PULID_WEIGHTS_REPO}/{PULID_WEIGHTS_FILENAME} -> {dest}")

    # antelopev2 -> models/insightface/models/antelopev2/*.onnx (verified
    # zip layout: top-level antelopev2/ dir containing 5 .onnx files
    # directly -- no extra nesting).
    insightface_models_dir = models_root / "insightface" / "models"
    insightface_models_dir.mkdir(parents=True, exist_ok=True)
    zip_path = hf_hub_download(repo_id=ANTELOPEV2_REPO, filename=ANTELOPEV2_FILENAME)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(insightface_models_dir)
    onnx_files = list((insightface_models_dir / "antelopev2").glob("*.onnx"))
    assert len(onnx_files) == 5, f"expected 5 antelopev2 onnx files, found {len(onnx_files)}"
    print(f"extracted antelopev2 -> {insightface_models_dir / 'antelopev2'} ({len(onnx_files)} onnx files)")

    # eva_clip -- pulidflux.py resolves this via its OWN hf_hub_download
    # call against the default HF cache at runtime; pre-warming that same
    # call here (default cache_dir, same repo/filename) makes it a cached
    # no-op instead of a runtime download.
    hf_hub_download(repo_id=EVA_CLIP_REPO, filename=EVA_CLIP_FILENAME)
    print(f"pre-warmed {EVA_CLIP_REPO}/{EVA_CLIP_FILENAME} in default HF cache")


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
    .run_commands(
        f"git clone {PULID_NODE_REPO} /root/comfy/ComfyUI/custom_nodes/ComfyUI-PuLID-Flux"
    )
    # PuLID's forward_orig is a full local reimplementation of ComfyUI's
    # FLUX forward pass (not a wrapper around the original), frozen at
    # whatever signature ComfyUI had when the node was last updated. Our
    # pinned COMFYUI_COMMIT's core FLUX model (comfy/ldm/flux/model.py)
    # now calls forward_orig with extra kwargs (timestep_zero_index,
    # transformer_options, attn_mask -- confirmed by reading model.py's
    # _forward directly) that PuLID's copy doesn't accept, so it crashes
    # with a real TypeError, not a config error (first-run finding,
    # 2026-08-24). Those kwargs only refine how Kontext's own
    # reference-latent tokens get a zero-timestep treatment inside the
    # transformer -- the underlying reference-latent conditioning still
    # flows through via the img/img_ids concatenation that happens
    # BEFORE forward_orig is called, so accepting-and-ignoring the extra
    # kwargs is a safe patch, not a silent behavior break.
    .run_commands(
        "sed -i '/^    control=None,$/a\\    **kwargs,' "
        "/root/comfy/ComfyUI/custom_nodes/ComfyUI-PuLID-Flux/pulidflux.py"
    )
    .pip_install(
        "facexlib", "insightface", "onnxruntime-gpu", "ftfy", "timm",
        "huggingface_hub", "azure-storage-blob", "httpx", "pillow", "numpy",
    )
    .run_function(_download_pinned_models)
)

app = modal.App(name="scoot34-kontext-pulid-test", image=image)


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
          secrets=[modal.Secret.from_name("azure-blob-creds")], timeout=900)
class PulidKontextGenerator:
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

    def _submit_and_wait(self, prompt: dict, timeout: int = 600) -> dict:
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
                entry = hist[prompt_id]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI prompt {prompt_id} failed: {status}")
                return entry
            time.sleep(1.0)
        raise TimeoutError(f"ComfyUI prompt {prompt_id} did not finish within {timeout}s")

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {serial, subject_photo_url, identity_photo_url, prompt,
        seed, guidance, pulid_weight, pulid_start_at, pulid_end_at}.
        subject_photo_url is the Kontext edit source (what gets restyled).
        identity_photo_url is the face reference PuLID conditions on --
        can be the same photo, or a cleaner/closer face crop of the same
        person for a stronger face-embedding read.
        """
        import httpx
        from azure.storage.blob import BlobServiceClient

        serial = payload["serial"]
        seed = payload["seed"]
        guidance = payload.get("guidance", 2.5)
        text = payload["prompt"]
        pulid_weight = payload.get("pulid_weight", 1.0)
        pulid_start_at = payload.get("pulid_start_at", 0.0)
        pulid_end_at = payload.get("pulid_end_at", 1.0)

        comfy_input = Path("/root/comfy/ComfyUI/input")
        comfy_input.mkdir(parents=True, exist_ok=True)
        subject_name = f"{serial}_subject.png"
        identity_name = f"{serial}_identity.png"
        for url, name in [
            (payload["subject_photo_url"], subject_name),
            (payload["identity_photo_url"], identity_name),
        ]:
            r = httpx.get(url, timeout=60)
            r.raise_for_status()
            (comfy_input / name).write_bytes(r.content)

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
            # -- PuLID identity branch --
            "20": {"class_type": "LoadImage", "inputs": {"image": identity_name}},
            "21": {"class_type": "PulidFluxInsightFaceLoader", "inputs": {"provider": "CPU"}},
            "22": {"class_type": "PulidFluxEvaClipLoader", "inputs": {}},
            "23": {"class_type": "PulidFluxModelLoader", "inputs": {"pulid_file": PULID_WEIGHTS_FILENAME}},
            "24": {"class_type": "ApplyPulidFlux",
                   "inputs": {"model": ["1", 0], "pulid_flux": ["23", 0], "eva_clip": ["22", 0],
                              "face_analysis": ["21", 0], "image": ["20", 0],
                              "weight": pulid_weight, "start_at": pulid_start_at, "end_at": pulid_end_at}},
            "11": {"class_type": "KSampler",
                   "inputs": {"model": ["24", 0], "positive": ["10", 0], "negative": ["8", 0],
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
