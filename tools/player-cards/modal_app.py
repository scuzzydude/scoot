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
]

# (repo_id, filename, revision, target dir under ComfyUI/models/)
MODEL_DOWNLOADS = [
    ("cagliostrolab/animagine-xl-4.0", "animagine-xl-4.0.safetensors",
     "2b7c1b397761bf5bd3cc42e5b39ec99314a75a96", "checkpoints"),
    ("xinsir/controlnet-union-sdxl-1.0", "diffusion_pytorch_model.safetensors",
     "801a4a3fa3d4c936f4feea95b98607bc6726f80c", "controlnet"),
    ("h94/IP-Adapter", "sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors",
     "018e402774aeeddd60609b4ecdb7e298259dc729", "ipadapter"),
    ("h94/IP-Adapter", "models/image_encoder/model.safetensors",
     "018e402774aeeddd60609b4ecdb7e298259dc729", "clip_vision"),
]
# NOTE: exact filenames inside xinsir/controlnet-union-sdxl-1.0 and the
# h94/IP-Adapter repo layout were not re-verified against the live repo file
# tree at write time (only the repo-level revision sha was). Confirm the
# literal filenames resolve before the first real build — a 404 here fails
# the image build loudly, which is the safe failure mode, but worth checking
# ahead of time rather than discovering it mid-deploy.

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
    fetching them at cold start (HANDOFF §2)."""
    from huggingface_hub import hf_hub_download

    models_root = Path("/root/comfy/ComfyUI/models")
    for repo_id, filename, revision, subdir in MODEL_DOWNLOADS:
        target_dir = models_root / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        path = hf_hub_download(
            repo_id=repo_id, filename=filename, revision=revision,
            cache_dir="/cache",
        )
        local_name = Path(filename).name
        dest = target_dir / local_name
        if dest.exists() or dest.is_symlink():
            dest.unlink()
        os.symlink(path, dest)
        print(f"pinned {repo_id}/{filename}@{revision} -> {dest}")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "libgl1-mesa-dev", "libglib2.0-0", "wget")
    .run_commands("git lfs install")
    # Torch pinned explicitly and BEFORE ComfyUI's own requirements.txt, so
    # nothing downstream silently pulls a CPU-only build over this CUDA one.
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1",
        extra_options="--index-url https://download.pytorch.org/whl/cu124",
    )
    .run_commands(
        _clone_and_pin(
            "https://github.com/comfyanonymous/ComfyUI.git",
            COMFYUI_COMMIT, "/root/comfy/ComfyUI",
        )
    )
    .run_commands("cd /root/comfy/ComfyUI && pip install -r requirements.txt")
    .run_commands(
        *[
            _clone_and_pin(
                n["url"], n["commit"],
                f"/root/comfy/ComfyUI/custom_nodes/{n['url'].rstrip('/').rsplit('/', 1)[-1].removesuffix('.git')}",
            )
            for n in CUSTOM_NODES
        ]
    )
    # Each custom node's own requirements, --no-deps so none of them can
    # clobber the pinned torch build above.
    .run_commands(
        "for d in /root/comfy/ComfyUI/custom_nodes/*/; do "
        '  if [ -f "$d/requirements.txt" ]; then '
        '    pip install --no-deps -r "$d/requirements.txt"; '
        "  fi; "
        "done"
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
            self.workflow_template = json.load(f)

    @modal.exit()
    def stop_comfyui(self):
        proc = getattr(self, "proc", None)
        if proc is not None:
            proc.terminate()

    def _submit_and_wait(self, prompt: dict, timeout: int = 300) -> dict:
        import httpx

        base = f"http://127.0.0.1:{COMFY_PORT}"
        resp = httpx.post(f"{base}/prompt", json={"prompt": prompt}, timeout=30)
        resp.raise_for_status()
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
        """payload: {serial, photo_url, pose, seed, style_ref} per
        MODAL_BUILD_SPEC.md §4. Returns {figure_path, jersey_mask_path} —
        Azure Blob paths, matching the interface contract.
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

        for url, name in [(payload["photo_url"], cutout_name), (payload["style_ref"], style_name)]:
            r = httpx.get(url, timeout=60)
            r.raise_for_status()
            (comfy_input / name).write_bytes(r.content)

        prompt = json.loads(json.dumps(self.workflow_template))  # deep copy
        prompt = {k: v for k, v in prompt.items() if not k.startswith("_")}
        prompt["1"]["inputs"]["image"] = cutout_name
        prompt["13"]["inputs"]["image"] = style_name
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
        figure_file = outputs["19"]["images"][0]["filename"]
        mask_file = outputs["21"]["images"][0]["filename"]
        out_dir = Path("/root/comfy/ComfyUI/output")

        # Alpha creation: SDXL/ComfyUI's own output is plain RGB, not RGBA —
        # diffusion models don't emit an alpha channel on their own no matter
        # how the prompt asks for "transparent background." This rembg pass
        # is what actually produces the delivered transparent PNG, mirroring
        # finalize_card.py's technique exactly (same isnet-anime model) so
        # dreamlab's copy of that script is a genuine defense-in-depth
        # re-check, not a second independent implementation to keep in sync.
        session = new_session("isnet-anime")
        raw_bytes = (out_dir / figure_file).read_bytes()
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

        mask_img = Image.open(out_dir / mask_file).convert("L")
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


# ---------------------------------------------------------------------------
# How dreamlab (or anything else) calls this — spawn/poll, never blocking.
# This function is NOT what BigMo's webhook calls directly; it documents the
# pattern MODAL_BUILD_SPEC.md §3 requires. Not run automatically.
# ---------------------------------------------------------------------------

def spawn_example(payload: dict) -> str:
    """Returns a call_id immediately. Caller polls modal.FunctionCall
    .from_id(call_id).get(timeout=0) later — never blocks waiting on GPU
    generation, which is the whole reason this isn't a synchronous endpoint."""
    fn = modal.Function.from_name("scoot34-player-cards", "CardGenerator.generate")
    call = fn.spawn(payload)
    return call.object_id
