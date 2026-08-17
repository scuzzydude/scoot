# Pinned versions — player-card generation

Recorded 2026-08-17 per `HANDOFF.md` §3's non-negotiable: every custom node
repo at an explicit commit, every model weight at an explicit revision, so
this reproduces in 2029 as faithfully as it runs today. Nothing here tracks
`main`/`latest`.

## ComfyUI core

| | |
|---|---|
| Repo | `https://github.com/comfyanonymous/ComfyUI` |
| Commit | `b963f4ad210a42841ab23dfc28a84143a0cce227` |
| Date | 2026-08-16 |

## PyTorch (Modal container only — not needed for prep_cutout.py/finalize_card.py/build_cards.py, those stay torch-free per HANDOFF §5)

| Package | Version | Index | Note |
|---|---|---|---|
| torch | `2.13.0` | `download.pytorch.org/whl/cu129` | First pin was `2.5.1`/cu124 — wrong, ComfyUI v0.33.1 bundles `comfy-kitchen==0.2.31`, whose compiled ops use a `torch.library.custom_op` schema 2.5.1 can't parse. Found by an actual failed deploy (container crashed on import), not caught by any structural check. |
| torchvision | `0.28.0` | same | Version pip actually resolved as compatible with torch 2.13.0/cu129 in the run that fixed the above — hard-pinned from that observed-good combination, not guessed independently. |
| torchaudio | `2.11.0` | same | Same as torchvision. |

## Custom nodes

| Node pack | Repo | Commit | Date |
|---|---|---|---|
| `comfyui_controlnet_aux` (LineArt + Openpose preprocessors) | `Fannovel16/comfyui_controlnet_aux` | `e8b689a513c3e6b63edc44066560ca5919c0576e` | 2026-04-13 |
| `ComfyUI_IPAdapter_plus` | `cubiq/ComfyUI_IPAdapter_plus` | `a0f451a5113cf9becb0847b92884cb10cbdec0ef` | 2025-04-14 |
| `Comfyui_segformer_b2_clothes` (jersey mask pass) | `StartHua/Comfyui_segformer_b2_clothes` | `681721fbea6947e7bbc4ebb6192ed60bd8b473cb` | 2024-07-23 |

These are the exact commits already cloned and structurally verified against
`workflow_player_card.json` on `dreamlab` (2026-08-16) — every `class_type`
in that graph was checked against this exact code, not a newer or older
version of it.

## Model weights (Hugging Face)

Pinned via the HF API's `sha` field (`GET /api/models/<repo_id>`), checked
2026-08-17.

| Role | Repo | File | Revision (sha) |
|---|---|---|---|
| SDXL checkpoint (anime/comic) | `cagliostrolab/animagine-xl-4.0` | `animagine-xl-4.0.safetensors` | `2b7c1b397761bf5bd3cc42e5b39ec99314a75a96` |
| SDXL Union ControlNet (lineart + openpose, one file) | `xinsir/controlnet-union-sdxl-1.0` | `diffusion_pytorch_model.safetensors` | `801a4a3fa3d4c936f4feea95b98607bc6726f80c` |
| IP-Adapter SDXL Plus | `h94/IP-Adapter` | `sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors` | `018e402774aeeddd60609b4ecdb7e298259dc729` |
| Matching CLIP vision encoder | `h94/IP-Adapter` | `sdxl_models/image_encoder/model.safetensors` (NOT `models/image_encoder/` — that's the SD1.5 encoder, a real bug this repo shipped with briefly on 2026-08-17 until checked against the live file tree) | `018e402774aeeddd60609b4ecdb7e298259dc729` |
| Jersey-mask segmentation | `mattmdjaga/segformer_b2_clothes` | (loaded by the segformer node directly) | `584abc1e1d260e23c0fc627c5217a09b2b461046` |

**Checkpoint choice — Animagine XL 4.0, not Illustrious-XL.** Both are real,
pinnable options (`OnomaAIResearch/Illustrious-xl-early-release-v0`,
sha `dca0dac303e6dc4b0c31d8001bc685b89b5d0204`, kept here as the documented
fallback if Animagine's likeness/style results don't hold up in the
three-card test). Animagine XL 4.0 was chosen first for stronger, more
consistent flat cel-shading with less painterly drift, which matters more
here than raw versatility.

## What still needs a version pin once chosen

- **Style reference image** — not yet generated (needs GPU; will be the
  first Modal call once deployed, a zero-shot text-only generation with the
  pinned checkpoint above, no conditioning). Once produced, it gets
  committed to Blob storage at a fixed path and referenced by URL, not
  regenerated per run.
- **`comfy-cli` version** — pin at image-build time in `modal_app.py`
  (`COMFY_VER` — see that file). Not yet run, so not yet fixed to a real
  observed-working value beyond what's written there.
