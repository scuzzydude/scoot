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
| `PuLID_ComfyUI` (facial identity branch, added 2026-08-18) | `cubiq/PuLID_ComfyUI` | `93e0c4c226b87b23c0009d671978bad0e77289ff` | repo's actual HEAD -- author put it in "maintenance mode" 2025-04-14, no commits since (confirmed via `git log` on a local clone, not assumed from the README note) |

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
| Matching CLIP vision encoder | `h94/IP-Adapter` | `models/image_encoder/model.safetensors`, saved locally as `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` (**NOT** `sdxl_models/image_encoder/` — despite the SDXL checkpoint, `ip-adapter-plus_sdxl_vit-h.safetensors` needs the ViT-H encoder its own filename names, hidden_size 1280/32 layers; `sdxl_models/image_encoder/` is ViT-bigG, hidden_size 1664/48 layers, only for the "VIT-G" preset. This repo briefly had it backwards in the other direction on 2026-08-17 — see git history — caught by an actual failed `generate()` call raising "ClipVision model not found", not by re-reasoning. IPAdapterUnifiedLoader's `get_clipvision_file()` also matches by filename **regex** against the preset, not content — the raw HF filename `model.safetensors` never matches, hence the rename) | `018e402774aeeddd60609b4ecdb7e298259dc729` |
| Jersey-mask segmentation | `mattmdjaga/segformer_b2_clothes` | (loaded by the segformer node directly) | `584abc1e1d260e23c0fc627c5217a09b2b461046` |
| Jersey-mask segmentation, sibling model | `sayeed99/segformer-b3-fashion` | (loaded by the segformer node directly) | `e2474a9e7643d349ac6c525549b736b736e7e216` |
| Facial identity — IP-Adapter FaceID Plus V2 | `h94/IP-Adapter-FaceID` | `ip-adapter-faceid-plusv2_sdxl.bin` | `43907e6f44d079bf1a9102d9a6e56aef7a219bae` |
| Facial identity — matching LoRA | `h94/IP-Adapter-FaceID` | `ip-adapter-faceid-plusv2_sdxl_lora.safetensors` (saved to `models/loras/`, not `models/ipadapter/`) | `43907e6f44d079bf1a9102d9a6e56aef7a219bae` |
| Facial identity — face analysis | InsightFace `buffalo_l` model pack | fetched via `insightface.app.FaceAnalysis`, not HF — baked into the image build the same way, `models/insightface/` | pinned by named release (`buffalo_l`), not a HF sha |

**Checkpoint swap to "Zero", tried and reverted, 2026-08-19.**
`FACIAL_LIKENESS_RESEARCH.md`'s Tier 1 test: swap to
`cagliostrolab/animagine-xl-4.0-zero` (the pretraining-stage checkpoint
cagliostrolab positions as the base for LoRA/adapter work), same prompt,
same PuLID settings (fidelity, weight 1.0), same seed (340034) as the
prior best result (`34-TEST-BRANDON-v6`) — only the checkpoint changed,
to isolate the variable. **Result: negative.** With identical ControlNet
pose/lineart input, Zero generated a figure facing away from camera (no
face at all) where the main release reliably produces a face-forward
pose — Zero is too raw/unrefined to follow ControlNet conditioning
precisely, which matters more here than whatever adapter-compatibility
it might gain. Reverted to the main release (row above). See
`PLAN_facial_likeness.md` Tier 2 (per-subject LoRA) for the next step.

**Second IPAdapter branch, added 2026-08-18.** The three-card likeness test
(Brandon usable, Nick/Rufus lost all facial structure) traced to an
architectural gap, not a tunable parameter: the graph's only IPAdapter pass
(node 12/14) is fed the fixed style-reference image for style transfer — it
never saw a subject's own photo, so nothing in the pipeline was responsible
for preserving identity. First attempt swapped node 12 to the "PLUS FACE
(portraits)" preset (cheapest possible test, no new weights) — that made it
*worse* (a subject's face came out completely blank), because it just made
the same style-transfer pass reinterpret the non-face style reference image
as if it were a face crop. The working fix adds nodes 22/23
(`IPAdapterUnifiedLoaderFaceID` + `IPAdapterFaceID`) as a second, independent
branch conditioned on each subject's own cutout (node 1), chained after the
style branch and feeding KSampler. Researched via web search against
InstantID/PuLID before choosing FaceID Plus V2 as the first thing to try:
cheapest integration (same node pack already installed, `insightface`
already pip-installed), escalate to PuLID (highest reported identity
fidelity, ~88-93% face similarity in comparisons) if this isn't enough.

**FaceID escalation to PuLID, 2026-08-18.** FaceID genuinely worked (real
face embedding computed, confirmed via logs — no silent no-op) but 3
attempts (preset swap, weight 1.0, weight 1.8) never produced a decernable
likeness, and pushing weight past 1.0 degraded overall image coherence
instead of improving identity — not converging. Added PuLID
(`cubiq/PuLID_ComfyUI`) as a replacement identity branch: decouples
identity from style via contrastive alignment rather than pure embedding
conditioning, reports much higher identity fidelity in community
comparisons. New pins beyond the node repo itself:

| Role | Repo | File | Revision |
|---|---|---|---|
| PuLID SDXL weights (IPAdapter-format conversion) | `huchenlei/ipadapter_pulid` | `ip-adapter_pulid_sdxl_fp16.safetensors` | `810eab2a6746efb73ed7f2502bf46b1c453d5cf1` |
| EVA CLIP vision encoder | `QuanSun/EVA-CLIP` | `EVA02_CLIP_L_336_psz14_s6B.pt` (default HF cache, not copied — eva_clip's own runtime code re-resolves the identical repo/filename/revision, so a baked cache hit is enough) | `11afd202f2ae80869d6cef18b1ec775e79bd8d12` |
| InsightFace AntelopeV2 (distinct from FaceID's buffalo_l) | `MonsterMMORPG/tools` | `antelopev2.zip`, extracted to `models/insightface/models/antelopev2/` | `2cc250d767e22019bef3ae1aefaa1ad8a73ef64c` |
| facexlib face detector + parser | GitHub releases (`xinntao/facexlib`), not HF — `retinaface_resnet50` + `bisenet`, triggered via `init_detection_model()`/`init_parsing_model()` during the image build so both bake in instead of fetching at cold start | pinned by facexlib package version (`0.3.0` as of this pin), not a separate sha |

FaceID's nodes (22/23) are left in the graph but unreferenced — node 16
now sources from PuLID (node 27) instead — so they cost nothing at
runtime and stay available for A/B comparison.

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
