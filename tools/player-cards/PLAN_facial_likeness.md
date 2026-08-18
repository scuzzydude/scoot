# Plan of attack — facial likeness fix

Written 2026-08-18 after `FACIAL_LIKENESS_RESEARCH.md` came back. Not yet
executed — this is the plan to review and greenlight next session.

## The one thing to decide before any of this: licensing

The research surfaced a real blocker independent of whether tuning
continues: **InsightFace's `buffalo_l`/`antelopev2`/`inswapper` models —
the face encoders inside the pipeline's current PuLID and FaceID passes
— are licensed for non-commercial research use only.** This is already
true of the deployed pipeline today, not just future work.

Needs a decision: is Scoot(34) card generation "commercial" in a sense
that matters here? If yes, everything below still applies, but Tier 2
(per-subject LoRA) becomes doubly attractive since it needs no face
encoder at all — it sidesteps the licensing question entirely, not just
the quality problem.

## Tier 1 — cheap, run first (~1 afternoon, ~$5-10 Modal spend)

**Swap the checkpoint from Animagine XL 4.0 "Opt" to "Zero", change
nothing else, re-run the exact same test.**

Why: PuLID's paper states plainly that ID-insertion disruption is worse
on any base model other than the one it was trained against
(SDXL/SDXL-Lightning). Animagine XL 4.0 Opt is a full-parameter finetune
far from that distribution. Zero is the earlier pretraining-stage
checkpoint cagliostrolab explicitly positions as the base for
finetune/adapter work — i.e., closer to what PuLID was actually
calibrated against.

Steps:
1. Find Zero's exact HF filename/revision in `cagliostrolab/animagine-xl-4.0` (need to check the repo file tree — Zero may be a separate `.safetensors` file in the same repo, not just a different pin).
2. Add it as a second `MODEL_DOWNLOADS` entry (or swap the existing checkpoint entry), pinned the same way as everything else in `modal_app.py`.
3. Re-run the identical test: Brandon, seed 340034, PuLID fidelity/weight=1.0, no touchup.
4. Compare directly against `34-TEST-BRANDON-v6` (current best, on Opt).

This is nearly free to test and directly falsifies or confirms the
report's central hypothesis. If Zero doesn't help either, that's a real,
useful negative result — it means the checkpoint-divergence theory isn't
the (whole) story, and Tier 2 becomes more urgent rather than optional.

**Secondary, same tier:** if the face-detailer touchup is worth keeping
at all, it needs a real fix, not more identity tuning inside it — per
the research, it should be a sharpening pass only:
- Real anime-capable face detector (`face_yolov9c.pt` via
  `ComfyUI-Impact-Subpack`'s `UltralyticsDetectorProvider`), not
  InsightFace at `det_thresh=0.05` (out-of-domain, confirmed by the
  research as the wrong tool for stylized art).
- Denoise 0.35–0.45, not 0.6 (0.6 was past the "replace, not refine"
  threshold — confirmed root cause of the erased eyebrows).
- No PuLID inside the refine pass at all — identity stays in the base
  generation only.
- Re-run the lineart ControlNet preprocessor **on the crop** and feed it
  into the refine pass (it was never carried into the crop before —
  confirmed root cause of the garbled mouth).
This is lower priority than the checkpoint swap since the research is
clear detailers are a resolution tool, not an identity tool — worth
doing for card sharpness eventually, not expected to fix likeness.

## Tier 2 — the real fix (~1-2 weeks, ~$2-9 + 15-45 min per subject)

**Pilot per-subject LoRA training on Animagine XL 4.0 Zero.**

Why: this is the only approach in the whole research pass with a clear
mechanism for not fighting the checkpoint — it edits UNet weights
directly instead of injecting a cross-attention signal a divergent
checkpoint's distribution rejects. ACE++'s own docs independently
confirm the pattern (their LoRA variant beats their full-finetune variant
on consistency). It also sidesteps the InsightFace licensing question
entirely.

Steps:
1. Pick a Modal-compatible LoRA trainer (kohya-ss sd-scripts is the
   community standard; check for an existing Modal example/template
   before building one from scratch).
2. Pilot on one subject — Brandon is the obvious choice, already has the
   most source material (72 frames in `~/Nick/work/people/09_BRANDON/`).
   Community practice is 10-30 photos; may need to pull more frames or
   supplement from other photos if 72 video frames don't give enough
   distinct angles/expressions.
3. Train against Zero (not Opt) with the actual card style prompts baked
   into training captions.
4. Generate a test card the same way as before (same ControlNet pose
   pipeline, style reference, seed) but with the subject's own LoRA
   active instead of any FaceID/PuLID branch.
5. Compare against `34-TEST-BRANDON-v6` — ideally with a quantitative
   metric (ArcFace cosine similarity between source photo and generated
   face) since the research found no such comparison exists publicly and
   this would be new, useful information for the project.

**Operational math for the full roster:** if the pilot works, 34
members × ~$5-9 × ~30 min ≈ **$170-300 and a few hours of Modal compute,
one time per edition.** Very plausibly viable given the effort already
sunk into just getting the base pipeline working — worth stating
explicitly since "per-subject retraining" can sound more expensive than
it actually is at this scale.

## Tier 3 — only if Tier 2 turns out operationally unacceptable (~2-4 weeks)

**Evaluate USO on FLUX** (Apache-2.0, ~16GB FP8, native ComfyUI support,
purpose-built to take identity and style references in one pass — the
closest published architecture to this exact use case). Requires
re-locking the style reference against a FLUX backbone instead of SDXL —
real work, but the original brief explicitly allowed a checkpoint swap
if that's what it takes.

Skip DreamO despite its identity claims — its style task is documented
as unstable and not combinable with other conditioning, which is exactly
what a style-locked card pipeline needs.

## Monitor, no action needed

**AnimeAdapter** ([arXiv:2605.20237](https://arxiv.org/html/2605.20237))
is architecturally the best match to this exact problem — anime-native,
zero-shot, no per-subject tuning — but code isn't released yet ("upon
acceptance"). Worth a periodic check on the repo, not worth blocking on.

## Suggested order for next session

1. Read this doc + `FACIAL_LIKENESS_RESEARCH.md` together.
2. Decide the licensing question (even if the answer is "revisit later,"
   it should be a conscious decision, not a default).
3. Run Tier 1's checkpoint swap test — cheap, fast, directly informs
   whether Tier 2 is worth the bigger investment.
4. Based on that result, decide whether to greenlight the Tier 2 LoRA
   pilot.
