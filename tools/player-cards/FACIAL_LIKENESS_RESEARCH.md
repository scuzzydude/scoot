# Facial Likeness in Cel-Shaded Anime Card Art — Research Findings

**Prepared:** August 18, 2026 · **For:** Fairchild Labs trading-card pipeline (ComfyUI on Modal, SDXL / `cagliostrolab/animagine-xl-4.0`, ControlNet lineart+openpose, IPAdapter style transfer)

**Scope:** Answers the five research questions in the brief. Every claim is traced to a primary source fetched during this research pass; inferences and thin-evidence claims are explicitly flagged as such. Written to be actionable by someone picking the project up cold.

---

## Executive summary

The plateau is not a settings problem, and the evidence points to a specific, documented mechanism rather than bad luck. PuLID was trained with the base model's weights held **frozen against SDXL and 4-step SDXL-Lightning**, and its own paper states directly that *"disruptions caused by ID insertion are more noticeable when testing other base models rather than SDXL-Lightning, our training base model"* ([PuLID, arXiv:2404.16022](https://arxiv.org/html/2404.16022v2)). Animagine XL 4.0 is a **full-parameter finetune of vanilla SDXL 1.0** across 8.4M images and roughly 2,650 GPU-hours ([Animagine XL 4.0 model card](https://huggingface.co/cagliostrolab/animagine-xl-4.0)), meaning every cross-attention key/value projection that PuLID's `K_id`/`V_id` layers were calibrated against has moved substantially. IP-Adapter FaceID shares the same cross-attention-injection mechanism and therefore the same failure mode. Ten combinations converging on one ceiling is the expected outcome of an adapter whose conditioning space no longer matches the checkpoint it is being asked to steer.

Compounding this, the same PuLID paper concedes a second, more fundamental tension: *"notable style degradation occurs when compared with images before ID insertion… methods with higher ID fidelity tend to induce more severe style degradation."* Heavy cel-shading and high ID fidelity are pulling against each other by design, not by misconfiguration.

Three conclusions follow, in priority order. First, **per-subject LoRA is the only approach reviewed with a clear mechanism for not fighting the checkpoint** — it edits weights directly rather than injecting a foreign conditioning signal, and at roughly $2–9 and 15–45 minutes per subject on Modal it is plausibly viable for a per-member card product. Second, **the face-detailer experiment failed for identifiable, fixable reasons** (denoise 0.6 is past the replace threshold, ControlNet almost certainly was not carried into the crop, and PuLID has no documented img2img support at all) — but even fixed, the evidence says a detailer is a resolution tool, not an identity tool. Third, **hosted APIs do not rescue this**: no vendor combines demonstrated anime identity fidelity, transparent pricing, and an explicit no-training commitment, and the two with the cleanest data terms have no anime-specific evidence.

One finding outside the brief's scope deserves front-page treatment: **InsightFace's pretrained models — `buffalo_l`, `antelopev2`, and `inswapper_128` — are licensed for non-commercial research use only**. These sit inside the current pipeline (PuLID and IP-Adapter FaceID both use them as the face encoder) and inside nearly every face-swap alternative. See the licensing section below.

---

## Q1 — Current best-in-class identity methods for stylized/anime generation

### What is actually available today

| Method | Repo | Release | License | VRAM | Base model | ComfyUI node | Stylization evidence |
|---|---|---|---|---|---|---|---|
| **USO** (Unified Style-Subject) | [bytedance/USO](https://github.com/bytedance/USO) | 2025-08-27; native ComfyUI 2025-09-03 | Apache-2.0 | ~16GB (FP8) | FLUX-dev-fp8 | Native ComfyUI templates | Purpose-built to take **identity and style references in one pass** — architecturally the closest published match to a trading-card use case. No anime cel-shading benchmark found. |
| **InfiniteYou** | [bytedance/InfiniteYou](https://github.com/bytedance/InfiniteYou) | ICCV 2025 Highlight; code Mar 2025 | Code Apache-2.0; **weights CC-BY-NC-4.0 (non-commercial)** | ~43GB bf16; ~16GB with `--cpu_offload --quantize_8bit` | FLUX.1-dev | Official `bytedance/ComfyUI_InfiniteYou`; forks incl. [katalist-ai/ComfyUI-InfiniteYou](https://github.com/katalist-ai/ComfyUI-InfiniteYou) | Community reports it beating PuLID on identity ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1uwl84a/whats_currently_the_best_approach_for_a_native/)); its own paper flags PuLID-FLUX's "face copy-paste" and weak text-image alignment, implying better editability retention. |
| **DreamO** | [bytedance/DreamO](https://github.com/bytedance/DreamO) | v1.1 2025-06-24; SIGGRAPH Asia 2025 | Apache-2.0 | 24GB; ~6.5GB with Nunchaku quant | FLUX | Native `ComfyUI-DreamO` | Claims higher facial fidelity than PuLID/InstantID but "more model contamination." **Critical limitation: the style task is documented as unstable and cannot currently be combined with other conditioning tasks** — so identity+style in one pass is explicitly unreliable. |
| **Qwen-Image-Edit-2509 / 2511** | [Qwen/Qwen-Image-Edit-2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509) | Sept 2025; 2511 update per comfy.org | Apache-2.0 | 20B params, BF16 | Qwen-Image (not SDXL/FLUX) | Native since ComfyUI v0.3.60 ([blog.comfy.org](https://blog.comfy.org/p/wan22-animate-and-qwen-image-edit-2509)) | Model card claims "better preservation of facial identity" across "various portrait styles" including cartoon characters. Vendor-reported, not independently benchmarked for anime. |
| **ACE++** | [ali-vilab/ACE_plus](https://github.com/ali-vilab/ACE_plus) | 2025-01-06 | Follows FLUX.1-dev license | ~38–40GB for LoRA training | FLUX.1-Fill-dev | `ComfyUI-ACE_Plus` | Recommends a portrait LoRA for character-ID consistency, and notably states its **full-fine-tune variant "may decline compared to the LoRA model across various tasks"** — independent corroboration of the divergence mechanism in Q2. |
| **UNO** | [bytedance/UNO](https://github.com/bytedance/UNO) | ICCV 2025, Apr 2025 | Code Apache-2.0; weights CC-BY-NC-4.0 | ~16GB fp8+offload | FLUX.1-dev | Unofficial nodes only | No anime-specific statements found. |
| **UMO** | [bytedance-research/UMO](https://huggingface.co/bytedance-research/UMO) | 2026 | — | — | OmniGen2-class | Not confirmed | Adds multi-identity via RL matching-reward. Very new, thin independent verification. |
| **PuLID-FLUX v0.9.1** | [ToTheBeginning/PuLID](https://github.com/ToTheBeginning/PuLID) | v0.9.1, Oct 31 2024 (+5pp ID fidelity) | — | ~16GB optimized | FLUX.1-dev | [lldacing/ComfyUI_PuLID_Flux_ll](https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_v1.1.md) | Same paper-level style-degradation caveat as SDXL PuLID — backbone change does not remove the ID-vs-style tension. |
| **FLUX.1 Kontext[-dev]** | Black Forest Labs ([arXiv:2506.15742](https://arxiv.org/abs/2506.15742)) | 2025 | BFL dev license | — | FLUX DiT | Native ComfyUI | Strong character-consistency marketing claims; frequently chained with PuLID in community workflows. Vendor claims unverified independently. |
| **HiDream-E1 / E1.1** | [HiDream-ai/HiDream-E1](https://github.com/HiDream-ai/HiDream-E1) | E1 2025-04-28; E1.1 2025-07-16 | MIT | — | HiDream-I1 | Not confirmed | Third-party review claims detail preservation "even when drastically changing style"; no anime benchmark located. |
| **FastFace** | [ControlGenAI/FastFace](https://github.com/ControlGenAI/FastFace) ([arXiv:2505.21144](https://huggingface.co/papers/2505.21144)) | May 2025 | — | — | Adapter-agnostic, targets distilled models | Not confirmed | Training-free adaptation of PuLID/InstantID to distilled/few-step models via CFG redesign. Doesn't solve stylization but makes iteration cheaper. |
| **AnimeAdapter** | [arXiv:2605.20237](https://arxiv.org/html/2605.20237) (NUS) | ~May/June 2026 | Code "upon acceptance" — **not released** | N/A | SD | **None** | The single most on-point 2026 paper: anime-native identity via CLIP emergent local spatialization, semantic-selective local attention, pose-aware disentanglement on curated Danbooru data, zero-shot with no per-subject tuning. **Not deployable — monitor for code release.** |
| PhotoMaker V2 | [TencentARC/PhotoMaker](https://github.com/TencentARC/PhotoMaker) | July 2024 | — | — | SDXL | `shiimizu/ComfyUI-PhotoMaker-Plus` | Stacked ID embeddings; legacy option, no anime-specific evidence. Notably its Replicate deployment exposes a "style strength 30–50" dial that explicitly trades ID fidelity for stylization ability ([Replicate](https://replicate.com/tencentarc/photomaker)). |
| Arc2Face | [foivospar/Arc2Face](https://github.com/foivospar/Arc2Face) | ECCV 2024 | — | — | Custom SD | None found | Trained on WebFace42M — photoreal-oriented, no stylization angle. |
| ConsisID | [PKU-YuanGroup/ConsisID](https://github.com/PKU-YuanGroup/ConsisID) | CVPR 2025 | — | — | DiT video | — | Video identity preservation; not an image tool. |

### Per-subject LoRA / DreamBooth — the assessment the brief asked for

This is the classic high-fidelity answer, and on the evidence gathered it is also the **most mechanistically sound fix for this specific failure**, because it bakes identity into UNet weights rather than injecting a cross-attention signal that a divergent checkpoint's distribution rejects.

- **Data:** 10–30 photos per subject is standard community practice for SDXL character LoRAs.
- **Time:** roughly 15 minutes to 4 hours depending on steps, resolution, and rank.
- **Cost on Modal:** at approximate on-demand rates (A100 40GB ≈ $2.10/hr, A100 80GB ≈ $2.50/hr, H100 ≈ $3.95/hr), a 15–45 minute run is roughly **$2–$9 per subject** ([character-LoRA cost breakdown](https://aibadgr.com/run/lora-training/character-lora) — third-party estimate; validate against actual Modal billing before committing to unit economics).
- **Why it should work where adapters didn't:** ACE++'s own documentation independently confirms the pattern — their LoRA variant outperforms their own full-fine-tune variant on consistency tasks ([ali-vilab/ACE_plus](https://github.com/ali-vilab/ACE_plus)). Training on the target checkpoint means there is no distribution mismatch to fight.
- **The real cost:** retraining per subject adds latency and per-card compute that a zero-shot adapter avoids. For a one-card-per-member product this is an operational decision, not a technical blocker.

**Recommended pilot:** train a LoRA directly on Animagine XL 4.0 **Zero** (see Q2) using the actual trading-card style prompts, and evaluate against the current best PuLID `fidelity`@1.0 result on the same test subjects. This is the highest-expected-value next experiment in the entire report.

---

## Q2 — Anime checkpoints and identity-adapter compatibility

### The mechanism, stated plainly

PuLID's paper is explicit about its training base:

> "We build our PuLID model based on SDXL and the 4-step SDXL-Lightning… SDXL-Lightning is effective in retaining the style and layout of SDXL, allowing our model to generalize to community models based on SDXL during testing. **However, disruptions caused by ID insertion are more noticeable when testing other base models rather than SDXL-Lightning, our training base model.**" ([arXiv:2404.16022v2](https://arxiv.org/html/2404.16022v2))

The v1.1 documentation names only three community checkpoints it was validated against — **Juggernaut-XL, RealVisXL, and DreamShaper-XL-Lightning** ([pulid_v1.1.md](https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_v1.1.md), [guozinan/PuLID](https://huggingface.co/guozinan/PuLID)). All three are general-purpose or photoreal-leaning SDXL finetunes. Not one anime or tag-trained checkpoint appears on that list.

The causal chain:

1. PuLID and IP-Adapter FaceID both learn new MLP layers and `K_id`/`V_id` cross-attention projections **calibrated against a frozen SDXL/SDXL-Lightning attention key/value distribution**.
2. Animagine XL 4.0, Illustrious, and NoobAI are full-parameter finetunes — the exact projections those adapters key off of have moved.
3. The Illustrious paper confirms the mechanism independently on the text side: *"instability in the CLIP text encoder when handling character details can lead to less effective performance in embedding similarity calculations"* ([arXiv:2409.19946v1](https://arxiv.org/html/2409.19946v1)).
4. ACE++ reports the same pattern in the FLUX ecosystem (LoRA beats full-finetune for consistency), making this a cross-ecosystem finding rather than an SDXL quirk.
5. **v-prediction is a separate compounding issue** on NoobAI's v-pred build and Illustrious v3.x-vpred: v-pred requires specific samplers (Euler/DDIM only) and CFG-rescale ≈0.2 ([Laxhar/noobai-XL-1.1](https://huggingface.co/Laxhar/noobai-XL-1.1/blob/main/README.md)), a structurally different denoising trajectory from the epsilon-prediction regime these adapters were calibrated in. *Flag: this is a mechanistically sound inference from documented sampler requirements, not a source stating "v-pred breaks PuLID."*

### Checkpoint-by-checkpoint

| Checkpoint | Divergence from base SDXL | Prediction | Adapter compatibility evidence |
|---|---|---|---|
| **Animagine XL 4.0** (current) | Explicitly a **"full finetune of SDXL (not based on Pony, Illustrious, Noob"** — 8.4M images, ~2,650 GPU-hours from vanilla SDXL 1.0 ([model card](https://huggingface.co/cagliostrolab/animagine-xl-4.0), [release thread](https://www.reddit.com/r/StableDiffusion/comments/1icblk9/animagine_40_full_finetune_of_sdxl_not_based_on/)) | eps | No direct PuLID-on-Animagine issue found, but the family pattern applies directly and matches the observed plateau. Ships as **Zero** (earlier pretraining-stage checkpoint, explicitly positioned for LoRA/finetune work) and **Opt** (refined general-use release) ([cagliostrolab blog](https://cagliostrolab.net/posts/optimizing-animagine-xl-40-in-depth-guideline-and-update), [Zero/Opt release](https://www.reddit.com/r/StableDiffusion/comments/1ip1ghl/animagine_xl_40_opt_and_zero_have_been_released/)). |
| **Illustrious-XL** (v0.1 → v3.x) | SDXL architecture "without changes" per the [Illustrious paper](https://arxiv.org/html/2409.19946v1), but progressively larger training (7.5M → 20M images, batch up to 512, up to 1536×1536 native) | Epsilon (paper explicit) | Direct report: PuLID gives "decent results even with non realistic models with sdxl" but "with illustrious results arent that good"; another commenter says standard IP-Adapter "has its limitations" there and FaceID would face "similar challenges" ([r/StableDiffusion](https://www.reddit.com/r/StableDiffusion/comments/1irgbq6/does_puliid_or_any_other_faceid_works_with/)). **Same plateau you already have — not an upgrade.** |
| **NoobAI-XL** | Finetune of Illustrious on full Danbooru + e621 (~12.7M images) | **Both eps and v-pred variants** ([model card](https://huggingface.co/Laxhar/noobai-XL-1.1/blob/main/README.md)) | No direct PuLID pass/fail report found. Inferred from Illustrious lineage. The v-pred build has a strong mechanistic reason to be worse. *Flag: inferential.* |
| **Pony Diffusion V6 XL** | Aggressive full finetune, very far from base | eps (assumed) | **Most consistently reported incompatible — do not switch to it.** "pony is incompatible with the ip adapters… horrible results" ([r/StableDiffusion](https://www.reddit.com/r/StableDiffusion/comments/1ck3fn1/how_effective_is_using_ipadapter_with_pony/)); "I was unable to get acceptable results on face IP-Adapter with PonyXL" ([h94/IP-Adapter discussion #31](https://huggingface.co/h94/IP-Adapter/discussions/31)); "Pony diffusion is incompatible with IPadapter" ([greenzorro/comfyui-workflow-versatile](https://github.com/greenzorro/comfyui-workflow-versatile)). One commercial blog contradicts this ([lewdly.ai](https://lewdly.ai/blog/ipadapter-faceid-consistent-nsfw-characters)) — treat the multi-source community/maintainer reports as higher trust. |
| **WAI-NSFW-illustrious** | Illustrious finetune, described in community discussion as the benchmark among them | Not confirmed | No adapter-compatibility report found either way. *Genuine gap.* |
| **Animagine XL 3.1** | Prior generation, 870K curated images, ~350 GPU-hours ([model card](https://huggingface.co/cagliostrolab/animagine-xl-3.1)) | eps | 4.0 used ~7.5× the compute and ~10× the images, i.e. 4.0 is the **more** diverged model — if anything 3.1 should be friendlier to adapters. *Flag: inferential, untested.* |

### The cheap experiment to run first

If the pipeline is on Animagine XL 4.0 **Opt** (the default most users pull), **switch to Zero and re-run the PuLID `fidelity`@1.0 sweep**. Zero is the earlier pretraining-stage checkpoint cagliostrolab explicitly recommends as the base for finetuning and adapter work — i.e. the variant closest to the distribution PuLID's cross-attention layers were actually calibrated against ([cagliostrolab optimization guide](https://cagliostrolab.net/posts/optimizing-animagine-xl-40-in-depth-guideline-and-update)). This costs one afternoon and tests the central hypothesis of this report directly.

Also worth noting: **`cubiq/PuLID_ComfyUI` entered maintenance-only mode on 2025-04-14** ([repo](https://github.com/cubiq/PuLID_ComfyUI)) — the exact node already tried is no longer actively developed.

---

## Q3 — Why the crop → refine → paste-back detailer made the face worse

This was a **compounding failure**, not one bug. Ranked by strength of supporting evidence:

### 1. Denoise 0.6 is past the "replace" threshold (strong, primary-source)

FaceDetailer's default is 0.5, and the node documentation is blunt about the consequence of going higher: *"High values give you a new face that ignores the original; drop it to roughly 0.35–0.45 so you refine rather than replace. This is the number people get wrong."* ([Comfy.ICU FaceDetailer](https://comfy.icu/node/FaceDetailer)). `DetailerForEachPipe`'s docs say the same independently: *"High denoise re-invents the face and drifts the style; drop it to 0.3–0.4"* ([Comfy.ICU DetailerForEachPipe](https://comfy.icu/node/DetailerForEachPipe)). A detailed workflow guide gives an explicit tier table — **0.6–0.7 = "major face changes… risks character drift"**, 0.4–0.45 = "maintains character identity — best for production" — recommending 0.42 as a default ([FaceDetailer workflow guide](https://lewdly.ai/blog/comfyui-face-detailer-nsfw-workflow)). Community two-pass consensus is 0.35–0.4 then 0.3–0.35 ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1mlfw7o/best_face_detailer_settings_to_keep_same_input/)).

Critically, the Impact Pack maintainer explains why 0.6 does real damage rather than merely doing less:

> "Lowering the denoise parameter does not reduce the number of steps; instead, it reduces the amount of denoising applied… if the denoise value decreases, the total steps will [effectively] increase to align with the required number of steps to be performed." ([ltdrdata/ComfyUI-Impact-Pack#338](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/338))

At 0.6 with a typical ~20 steps, the sampler walks roughly 12 effective denoising steps — enough to substantially regenerate the crop, not polish it. This alone explains "erased facial structure."

### 2. ControlNet lineart was almost certainly not carried into the refine pass (strong, primary-source)

ControlNet does **not** automatically propagate into the crop loop. `DetailerForEachPipe`'s `cnet_images` output is *"only populated if you fed in ControlNet via a detailer hook"* ([Comfy.ICU](https://comfy.icu/node/DetailerForEachPipe)), and the Impact Pack team states outright that *"it's not recommended to apply controlnet directly to FaceDetailer"* ([issue #673](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/673)). In a hand-built pipeline this wiring is trivially easy to omit — leaving the refiner sampling with text conditioning only and free to invent new mouth geometry from noise. Mouths are high-frequency, geometrically precise regions and suffer first when structural guidance is absent, which matches the reported garbled-mouth artifact precisely.

### 3. PuLID has zero documented img2img / partial-denoise support (moderate; inference flagged)

Neither `cubiq/PuLID_ComfyUI`, nor `ToTheBeginning/PuLID`, nor the paper mentions img2img, inpainting, or partial denoising at all — no guidance, no warning, nothing ([cubiq/PuLID_ComfyUI](https://github.com/cubiq/PuLID_ComfyUI), [ToTheBeginning/PuLID](https://github.com/ToTheBeginning/PuLID), [arXiv:2404.16022](https://arxiv.org/abs/2404.16022)). What the ecosystem *does* show is that PuLID's ID injection needs trajectory room: the enhanced Flux fork recommends **`start_at` 0.05 "to let structure form first"** before identity insertion begins ([sipie800/ComfyUI-PuLID-Flux-Enhanced](https://github.com/sipie800/ComfyUI-PuLID-Flux-Enhanced)), and community users independently arrived at scheduling PuLID strength across timesteps (0.5 for steps 0–0.25, then 1.0) to stop it fighting existing structure ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1l0rkh4/managed_to_install_pulidi_hate_it/)). Applying it at full strength inside a crop with only 40% of the trajectory remaining is the opposite of that. *Flag: no source states outright "PuLID requires full denoise" — this is inferred from total documentation silence plus convergent community workarounds.*

InstantID, by contrast, **does** document img2img — and its numbers reveal the underlying tension rather than resolving it: recommended `strength` 0.7–0.9 with `ip_adapter_scale` 0.6–0.9 ([InstantID img2img docs](https://deepwiki.com/ashleykleynhans/InstantID/4.3-image-to-image-generation)), i.e. tuned for "transform into a new identity," not "gently refine a face that's already right." A user testing it summarizes the trap exactly: *"With too much denoise, the image gets a bit far from the source… With too little denoise, the image is almost identical to the source, but the InstantID face is not applied"* ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1csccp2/using_instantid_with_a_latent_image_how_do_you/)). **None of these three adapters is designed to be a light touch-up. They impose identity, and imposing identity at partial denoise necessarily competes with the structure already present.**

### 4. `det_thresh` 0.05 is out-of-domain detection, not tuning

InsightFace's detector (RetinaFace/SCRFD under `buffalo_l`/`antelopev2`) is trained and calibrated for photographic faces; its 0.5 default reflects that domain ([InsightFace `face_analysis.py`](https://huggingface.co/spaces/KlingTeam/LivePortrait/blob/refs%2Fpr%2F17/src/utils/dependencies/insightface/app/face_analysis.py)). For comparison, a real-world project lowered the same threshold only 0.5→0.4 to improve webcam reliability, explicitly framed as trading missed detections for reliability ([Deep-Live-Cam commit](https://gitlab.zodioo.com/diaojiaolou/Deep-Live-Cam/commit/0db2d109c8b91d1f0ff022b3f38eeed45dd1eacf)). A 10× reduction is far outside normal tuning range — a signal the detector is fundamentally out of domain, and a route to loose or off-target bounding boxes feeding a bad crop into the sampler.

### 5. Resolution / effective-step mismatch (well documented, very relevant to the mouth)

The garbled-mouth signature has a documented pixel-budget cause: *"No amount of speed will resolve this issue; it stems from the limited pixel count. To address it, you should… select the section containing your 200 pixels of teeth, and then regenerate that area by replacing it with 1024 pixels"* ([r/StableDiffusion teeth thread](https://www.reddit.com/r/StableDiffusion/comments/1tdnkoc/need_help_fixing_weird_teeth_in_comfyui/)). The maintainer confirms that even with `guide_size` nominally at 1024, if the face occupies a small fraction of the processed crop region the effective working resolution stays far below SDXL's native sweet spot ([issue #419](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/419)).

### 6. Secondary and thin-evidence contributors

`method: neutral` "does not do any normalization" and requires manually lowering weight yourself — consistent with the reported blank faces on `style`/`neutral` ([cubiq/PuLID_ComfyUI](https://github.com/cubiq/PuLID_ComfyUI)). VAE round-trip and feather seams cause real but **boundary-level** distortion, not interior structural loss ([issue #419](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/419)). *Flags: the specific SDXL-PuLID blank-face threshold at weight ≥1.2 is plausible by analogy to Flux-PuLID's documented ~0.85–1.0 ceiling but not independently corroborated; aspect-ratio distortion and mask mismatch as direct causes of the mouth artifact are unverified.*

### Better practice for anime face detailing

The counterintuitive finding: **there is no separate "anime" YOLO face model in the mainstream lineup because the standard ones are already trained on anime.** ADetailer's model card lists `face_yolov8n/s/m.pt` and `face_yolov9c.pt` all targeting **"2D / realistic face"**, with credited training data including **"Anime Face CreateML"** alongside WIDER Face ([Bing-su/adetailer](https://github.com/Bing-su/adetailer), [Bingsu/adetailer README](https://huggingface.co/Bingsu/adetailer/blob/main/README.md)). So `face_yolov8m.pt` (mAP50 0.737) or `face_yolov9c.pt` (mAP50 0.748, newest) should detect flat-color anime faces out of the box — unlike InsightFace's photographic-only backbone. Load them via `ComfyUI-Impact-Subpack`'s `UltralyticsDetectorProvider` (note: since Impact Pack v8.0 the detector provider is no longer bundled in the base pack). Fallbacks: a [civitai anime/furry/realistic face finder](https://civitai.com/models/207406/adetailer-face-finder-furry-anime-realistic-ddetailer) for hard cases, or [hysts/anime-face-detector](https://github.com/hysts/anime-face-detector) (mmdetection + mmpose, 28 landmarks — heavier to integrate but enables mouth-only sub-region masking).

For lineart preservation, **Differential Diffusion** is the most relevant ComfyUI-native option — a built-in node giving **per-pixel denoise strength instead of one global value**, proposed explicitly for soft inpainting ([ComfyUI docs](https://docs.comfy.org/built-in-nodes/DifferentialDiffusion), [comfyanonymous/ComfyUI#2851](https://github.com/comfyanonymous/ComfyUI/issues/2851)). Feeding a gradient mask that is strong in the face interior and fades to zero at the crop edge lets detail regenerate centrally while the inked contour stays anchored — eliminating the hard paste-back seam entirely. A tester reports success at a single 0.7 pass while pairing it **with** ControlNet, not instead of it ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1b69z27/testing_differential_diffusion/)).

### Does post-hoc detailing make sense for identity at all?

The evidence says no — detailers are resolution tools. The node's own documentation frames it that way: *"The face is already big and sharp. Then skip [FaceDetailer]. A second pass on an adequately-resolved face changes it without improving it… FaceDetailer is for small faces, not every face"* ([Comfy.ICU](https://comfy.icu/node/FaceDetailer)). Practitioners describe detailer-based identity correction as unreliable and having "a face-swap vibe" ([r/comfyui](https://www.reddit.com/r/comfyui/comments/1mlfw7o/best_face_detailer_settings_to_keep_same_input/)), and current consistent-character guidance treats identity as something injected at generation time — *"ControlNet locks composition… it does not carry identity on its own. Pair it with a LoRA or IPAdapter"* — with no post-hoc detailer step in the recommended stack at all ([2026 consistent-character guide](https://www.picovix.app/blog/consistent-character-stable-diffusion)). *Flag: no controlled ArcFace-cosine-similarity study comparing base-pass vs detailer-pass identity was found; this rests on tool-author framing and practitioner consensus.*

### Corrected settings, if the detailer is kept as a sharpening pass

| Parameter | Current (failing) | Recommended | Basis |
|---|---|---|---|
| Detector | InsightFace, `det_thresh` 0.05 | `face_yolov8m.pt` or `face_yolov9c.pt` via `UltralyticsDetectorProvider` | [Bing-su/adetailer](https://github.com/Bing-su/adetailer) |
| Refine denoise | 0.6 | **0.35–0.45** single pass, or 0.4 → 0.3 two-pass | [Comfy.ICU](https://comfy.icu/node/FaceDetailer), [r/comfyui](https://www.reddit.com/r/comfyui/comments/1mlfw7o/best_face_detailer_settings_to_keep_same_input/) |
| Identity in refine pass | PuLID at scale, weight ≥1.2, style/neutral | **Remove entirely** — keep identity in the base generation | [cubiq/PuLID_ComfyUI](https://github.com/cubiq/PuLID_ComfyUI) (no img2img support documented) |
| ControlNet in refine pass | Not carried into crop | Re-run the lineart preprocessor **on the crop** and feed it as crop-scoped ControlNet via detailer hook, or use Differential Diffusion with a graduated mask | [issue #673](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/673), [ComfyUI docs](https://docs.comfy.org/built-in-nodes/DifferentialDiffusion) |
| `guide_size` / `max_size` | Unknown, likely low | ~768–1024 / ~1024 for SDXL; verify the **face** fills the box, not just the crop region | [issue #419](https://github.com/ltdrdata/ComfyUI-Impact-Pack/issues/419) |
| `crop_factor` | Unknown | 2.0–3.0 (more context reduces twisting at higher denoise) | [r/comfyui](https://www.reddit.com/r/comfyui/comments/1hzyoz7/facedetailer_at_high_resolution_using_a_different/) |

---

## Q4 — Hosted APIs for identity-preserving stylized generation

All pricing and terms below were fetched directly on **August 18, 2026**.

| Service | Model / endpoint | Anime identity capability | Price/image | Self-hostable equivalent | Data retention / training |
|---|---|---|---|---|---|
| **Google Gemini** | `gemini-2.5-flash-image` ("Nano Banana") | Multimodal generation/editing widely used for character consistency; no anime-specific guarantee published | **$0.039** standard; $0.0195 batch/flex; $0.0702 priority ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) | No (closed) | **Sharp free/paid split.** Free tier: "Content used to improve our products." **Paid tier: "Content not used to improve our products,"** covering prompts, files/images, responses; paid logs retained briefly only for abuse/safety/legal ([Gemini API terms](https://ai.google.dev/gemini-api/terms), eff. Mar 23 2026) |
| **Scenario.gg** | Custom character/style model training (Multi-LoRA) | 5–15 images per character model; Multi-LoRA merges character + style. Game-art oriented, not anime-specific | Credits: Starter $15/mo (1,500), Pro $45/mo (5,000, adds custom training), Max $75/mo (10,000) ([pricing](https://www.scenario.com/pricing)); per-training credit cost not published | Comparable to open LoRA pipelines | **Best stance found.** "Everything is private to the organization by default"; **"User data is never used to train Scenario's models"**; not shared with third parties; SOC 2 Type II ([pricing](https://www.scenario.com/pricing)) |
| **OpenAI** | `gpt-image-1` edits, `input_fidelity: high` | High input fidelity preserves faces/logos; docs warn it "may occasionally struggle to maintain visual consistency for recurring characters." No anime claim ([guide](https://platform.openai.com/docs/guides/image-generation)) | $0.011 low / $0.042 medium / $0.167 high (1024²) ([pricing](https://platform.openai.com/docs/pricing)) | No | API explicitly carved out of the consumer privacy policy ([privacy policy](https://openai.com/policies/privacy-policy/)); **"We do not train our models on your data by default"** for API/Business/Enterprise ([enterprise privacy](https://openai.com/enterprise-privacy/)). Exact image retention window not stated. |
| **fal.ai** | [`fal-ai/pulid`](https://fal.ai/models/fal-ai/pulid), [`flux-pro/kontext`](https://fal.ai/models/fal-ai/flux-pro/kontext), [`ideogram/character`](https://fal.ai/models/fal-ai/ideogram/character) | Kontext: multi-turn character consistency, no named face-ID mechanism. Ideogram Character: "maintain facial features, proportions, and distinctive traits," general-purpose | Kontext Pro **$0.04**; Ideogram Character $0.10/$0.15/$0.20; PuLID endpoint price not published ([pricing](https://fal.ai/pricing)) | PuLID yes (open weights); Kontext-dev yes; Ideogram no | **Not stated anywhere** on model or pricing pages — no retention or training language found. Treat as a red flag, not a green light. |
| **Replicate** | [`zsxkib/instant-id`](https://replicate.com/zsxkib/instant-id), [`tencentarc/photomaker`](https://replicate.com/tencentarc/photomaker) | InstantID explicitly claims better flexibility "integrating face and background in **non-realistic styles**" — the strongest stylization claim found anywhere. PhotoMaker exposes a style-strength dial trading ID for stylization | Hardware-second billing (A100 80GB $5.04/hr, H100 $5.49/hr) ([pricing](https://replicate.com/pricing)) | Yes for both — but see licensing warning below | **Trains on your data.** ToS licenses Customer Data to "train and generate Customer Derivative Models"; aggregated Resultant Data may improve Replicate's products ([terms](https://replicate.com/terms)) |
| **Leonardo.ai** | Character Reference (Image Guidance) | "References the likeness of a subject," single reference image, works across SDXL/Phoenix/Flux presets | Tokens: SDXL 2/use; Phoenix 12 base + 2/option; Flux 12 base ([help article](https://intercom.help/leonardo-ai/en/articles/8497988-image-guidance)) | Base models yes; the conditioning itself is proprietary | **Unverified** — privacy/terms page not retrievable this pass |
| **Astria.ai** | LoRA/fine-tune-as-a-service | Per-subject LoRA, usable with any anime checkpoint at inference | **Unverified** — pricing page returned a client error | Yes, trivially (kohya-ss, OneTrainer) | Personal Information "may be used to conduct research, which may remain internal or may be shared with third parties, published, or made generally available"; **does not exclude uploaded photos from that language**; states it does not sell PI ([privacy](https://www.astria.ai/privacy), mod. Mar 22 2026) |
| **Midjourney** | Omni Reference (`--oref`, replaces `--cref` in V7) | Recognizes "hair color, clothes, and facial traits" across scenes and painterly styles ([docs](https://docs.midjourney.com/hc/en-us/articles/32162917505293-Character-Reference)) | **No official API exists** — Discord subscription $10–$120/mo; any "Midjourney API" is an unofficial reseller | No | **Unsuitable.** No first-party API means no first-party data terms; resellers mean uploading member photos to an unaudited third party |
| **Civitai** | On-site generation + community LoRAs | Primary discovery route for open anime/character LoRAs | Buzz points; no per-image rate published | **Yes, strongly** — this is where you find open anime checkpoints/LoRAs to run yourself | Broad content license ("reproduce, modify… create derivative works… distribute"); **ToS is silent on whether uploads train Civitai's models** — a gap, not a denial. "Private" content gets only "commercially reasonable measures," "subject to Civitai's rights to access and use" ([ToS](https://civitai.com/content/tos)) |
| **RunDiffusion** | Hosted ComfyUI/A1111 | You run your own PuLID/InstantID nodes — effectively your pipeline on their cloud | Free tier 100 daily tokens, 10GB storage kept **72 hours**; paid $8.79–$179.99/mo ([pricing](https://www.rundiffusion.com/pricing)) | This *is* self-hosting, relocated | Free-tier 72-hour retention stated; paid-tier retention unverified |
| **Segmind** / **PiAPI** / **Higgsfield** / **Freepik (Magnific)** | Marketplaces + a dedicated PiAPI Faceswap Image API | No anime identity mechanism or evidence published on any fetched page | Segmind Pro $39/mo → Scale $599/mo, H100 $9/hr ([pricing](https://www.segmind.com/pricing)); PiAPI $0–$100/mo + PAYG ([pricing](https://piapi.ai/pricing)); Higgsfield not stated ([pricing](https://higgsfield.ai/pricing)); Freepik credit-only, pay-per-usage being discontinued June 30 ([pricing](https://www.freepik.com/api/pricing)) | Underlying models often open | **None state a retention or training policy.** Unverified across the board |

**Bottom line:** no vendor combines demonstrated anime/cel-shaded identity fidelity, transparent per-image pricing, and an explicit no-training commitment. Gemini paid tier and Scenario.gg have the cleanest data terms but no anime-specific fidelity evidence; Replicate has the strongest stylization claim (InstantID) and the **worst** data terms. Given the brief's stated privacy posture with real member photos, **none of these clearly beats self-hosting** open-weights PuLID / InstantID / PhotoMaker on your own Modal infrastructure. A hosted API only earns its place if you need a capability the current stack cannot reach at all — e.g. Nano Banana's multimodal editing.

---

## Q5 — Face-swap and post-process compositing for cel-shaded output

### The photoreal-patch risk is real and repeatedly documented

The concern raised in the brief is confirmed across independent threads. On anime targets: *"I experimented with them and found that they performed effectively with realistic images, but when it comes to anime, the results don't appear to be as impressive"* ([r/StableDiffusion](https://www.reddit.com/r/StableDiffusion/comments/1g2sdnp/is_it_possible_to_face_swap_anime_style_images/)). A user combining Pyracanny ControlNet with a face swap reports the swapped face "retains standard colors" instead of matching the illustrated palette, and the community answer is to **restylize the entire composite** — *"use pyracanny/cpds for the whole image since the details of the face won't really matter that much… also using a non photo model like Cheyenne can help"* ([r/fooocus](https://www.reddit.com/r/fooocus/comments/1dlxksr/face_swap_doesnt_respect_the_style/)).

### Tool status, licensing, and anime evidence

| Tool | Status | License / commercial note | Anime evidence |
|---|---|---|---|
| **InsWapper (`inswapper_128.onnx`)** | Official HF model page **disabled at the author's request** ([deepinsight/inswapper](https://huggingface.co/deepinsight/inswapper)); survives via community mirrors | InsightFace pretrained models are **"available for non-commercial research purposes only"** ([ReActor disclaimer](https://codeberg.org/Gourieff/comfyui-reactor-node)) | None; photorealistic general-purpose |
| **ReActor / ComfyUI-ReActor** | Original GitHub repo **taken down**; a filtered duplicate restored on GitHub; **the maintained fork now lives on Codeberg** ([codeberg.org/Gourieff/comfyui-reactor-node](https://codeberg.org/Gourieff/comfyui-reactor-node), timeline via [r/comfyui](https://www.reddit.com/r/comfyui/comments/1i3294w/comfyui_reactor_nodeby_gourieff_s_repo_has_been/)) | Ships InsWapper (non-commercial); now also supports ReSwapper and HyperSwap | This is the baseline the "doesn't work on anime" threads were using |
| **ReSwapper** | Active alternative to InsWapper, in ReActor since v0.5.2 ([somanchiu/ReSwapper](https://github.com/somanchiu/ReSwapper)) | Built specifically to escape the non-commercial restriction; ReActor's own notes say "Inswapper still has the best similarity, but ReSwapper is evolving" — **currently lower fidelity** | None found |
| **HyperSwap** | FaceFusion Labs models in ReActor v0.6.2 (`hyperswap_1a/1b/1c_256.onnx`) | **License unverified** | Unverified |
| **facefusion** | Actively maintained through 2025–2026 ([facefusion/facefusion](https://github.com/facefusion/facefusion)) | Open, self-hostable | None found on the primary repo |
| **SimSwap / SimSwapPlus** | Both live; SimSwapPlus accepted to TPAMI ([neuralchen/simswap](https://github.com/neuralchen/simswap)) | Research code | Demos are all photorealistic; **no anime example in the official repo** |
| **DeepFaceLab / DeepFaceLive** | **Discontinued** — DeepFaceLive "was archived by the owner on Nov 13, 2024. It is now read-only" ([iperov/DeepFaceLive](https://github.com/iperov/DeepFaceLive)) | GPL-3.0, but needs a trained model per face pair | Structurally unsuited to on-demand per-member cards |
| **GHOST / GHOST 2.0** | Active ([ai-forever/ghost-2.0](https://github.com/ai-forever/ghost-2.0)) | Research code, IEEE-published | Its **Blender module** "transfers skin color and inpaints mismatched regions" — architecturally aimed at exactly the style-break problem, but demonstrated only on photoreal heads. **Untested on anime.** |
| **ACE++** | Active ([ali-vilab/ACE_plus](https://github.com/ali-vilab/ACE_plus)) | Built on FLUX.1-Fill-dev — BFL non-commercial dev license unless separately licensed | Repo lists face swap as a supported task and a community workflow titled "ace++ face swap in different styles" exists. Being **diffusion inpainting rather than a discrete pixel-swap GAN**, it is structurally better positioned to blend into stylized art. No maintainer anime benchmark. |
| **InstantID** | Active, Apache-licensed code | InsightFace face encoder restricted (see below) | **Strongest documented stylization claim of anything reviewed** — explicitly marketed for "non-realistic styles" ([Replicate](https://replicate.com/zsxkib/instant-id)) |
| **face2face (SocAIty)** | Active ([SocAIty/face2face](https://github.com/SocAIty/face2face)) | Open-source | *"It should work for all kinds of content, also for anime"* — **the only explicit maintainer anime claim found in this entire research pass**, but self-reported with no benchmark or example verified. Noteworthy lead, unverified. |
| **"AnimeFaceSwap"** | Does not appear to exist as an identity-transfer model. The nearest hits are anime face **detection** domain-adaptation models such as [kanosawa/anime-face-faster-rcnn-da.pytorch](https://github.com/kanosawa/anime-face-faster-rcnn-da.pytorch) | Research code | Confirms anime face *detection* is a solved prerequisite; no dedicated anime swapper found |

### What the evidence actually recommends

The strongest documented mitigation is **not to composite at all** — condition the generation on identity instead. The working community recipe is *"a flux img2img workflow… add PuLID for the face and add an anime lora for the style"* ([r/FluxAI](https://www.reddit.com/r/FluxAI/comments/1g2scui/is_there_any_good_way_to_face_swap_on_anime_style/)), which is architecturally the same family as the existing IPAdapter approach. Where a literal swap is used, the documented fix is **swap → restylize the whole composite** with ControlNet on the full image and a non-photoreal checkpoint — directionally validated but with **no published denoise/CFG numbers**, so treat it as qualitative guidance.

The uncomfortable conclusion: no reviewed tool demonstrates benchmarked anime-specific swap fidelity except one unverified maintainer claim. That is meaningful evidence that the existing embedding-conditioned architecture is already the more defensible one, and that the missing piece is a **better identity signal inside the generation step** — not a post-hoc swap node.

---

## Licensing: a blocker the brief did not ask about but needs to know

**InsightFace's pretrained models — `buffalo_l`, `antelopev2`, and `inswapper_128` — are restricted to non-commercial research use only** ([stated in the ReActor repo's disclaimer](https://codeberg.org/Gourieff/comfyui-reactor-node); the [inswapper HF page](https://huggingface.co/deepinsight/inswapper) is disabled at the author's request).

This matters because those models are the face encoder inside the current pipeline's PuLID (`antelopev2`) and IP-Adapter FaceID (`buffalo_l`) passes, inside InstantID, and inside nearly every ComfyUI face-swap node. If the trading-card product is commercial in any sense, the options are: obtain a commercial license directly from InsightFace, substitute a commercially-licensed face-embedding model, or route around embedding-based identity entirely — which per-subject LoRA does, since it needs no face encoder at all.

Two further license notes: **InfiniteYou and UNO ship Apache-2.0 code but CC-BY-NC-4.0 weights** (non-commercial), and **ACE++ inherits FLUX.1-dev's non-commercial license** absent a separate commercial agreement from Black Forest Labs. Of the strongest candidates in Q1, **USO (Apache-2.0) and DreamO (Apache-2.0) are the cleanest commercially**.

---

## Recommended sequence

**Tier 1 — cheap, high-information, run first (days)**

1. **Swap Animagine XL 4.0 Opt → Zero** and re-run the PuLID `fidelity`@1.0 sweep. Zero is the pretraining-stage checkpoint cagliostrolab positions for adapter/finetune work, i.e. closest to the distribution PuLID was calibrated against. This directly tests the central hypothesis for the price of one afternoon.
2. **Retire the face detailer as an identity mechanism.** If kept at all, use it as a sharpening pass only: `face_yolov9c.pt` detector, denoise 0.35–0.45, no PuLID inside it, crop-scoped lineart ControlNet re-supplied, `guide_size` ~1024.

**Tier 2 — the mechanistically sound fix (1–2 weeks)**

3. **Pilot per-subject LoRA on Animagine XL 4.0 Zero**, 10–30 photos, trained with the actual card style prompts. ~$2–9 and 15–45 min per subject on Modal. Evaluate against the current best result on a fixed test set — ideally with ArcFace cosine similarity as a quantitative metric, since no such comparison exists publicly and you would be generating genuinely new information. This is the only reviewed approach that stops fighting the checkpoint, and it also sidesteps the InsightFace licensing problem.

**Tier 3 — if per-subject LoRA is operationally unacceptable (2–4 weeks)**

4. **Evaluate USO on FLUX**, which is Apache-2.0, ~16GB in FP8, natively supported in ComfyUI, and purpose-built to accept identity and style references in one pass. This requires re-locking style against a FLUX backbone — real work, but the brief explicitly allows a checkpoint swap. **InfiniteYou** is the identity-strength alternative but its weights are non-commercial.
5. **Skip DreamO for now** despite its identity claims — its style task is documented as unstable and not combinable with other conditioning, which is precisely what a style-locked card pipeline needs.

**Monitor**

6. **AnimeAdapter** ([arXiv:2605.20237](https://arxiv.org/html/2605.20237)) is architecturally the best match to this exact problem — anime-native, zero-shot, no per-subject tuning — with code promised on acceptance. Worth a standing watch on the repo.

---

## Explicit evidence gaps

These are inferences or unverified items, not established facts, and should be treated accordingly by anyone acting on this report.

- No source states outright that PuLID requires a full noise-to-image trajectory or is incompatible with img2img. That conclusion is inferred from complete documentation silence across both repos and the paper, plus convergent community `start_at`-scheduling workarounds.
- The SDXL-PuLID blank-face threshold at weight ≥1.2 is plausible by analogy to Flux-PuLID's documented ~0.85–1.0 ceiling but is not independently corroborated for SDXL.
- No anime-specific numeric denoise guidance exists in the literature distinct from general SDXL FaceDetailer consensus.
- No controlled study compares base-pass identity fidelity against detailer-pass identity correction; the recommendation rests on tool-author framing and practitioner consensus.
- v-prediction breaking adapter compatibility is a mechanistically sound inference from NoobAI's documented sampler and CFG-rescale requirements, not a cited paper or issue confirming the failure mode.
- NoobAI-specific and WAI-Illustrious adapter compatibility were not directly confirmed either way. Pony incompatibility is multi-sourced but contradicted by one commercial blog.
- Aspect-ratio distortion and mask mismatch as direct causes of the mouth artifact are plausible but unverified.
- Unverified vendor items: Leonardo's data terms, Astria's exact pricing, Higgsfield's mechanism/pricing/policy, Freepik and Segmind and PiAPI retention policies, HyperSwap's license, whether Civitai trains on uploads, and RunDiffusion's paid-tier retention.
- `face2face`'s anime capability, GHOST 2.0's Blender module on cel-shaded targets, and facefusion/SimSwap anime fidelity are all untested by any source found.
