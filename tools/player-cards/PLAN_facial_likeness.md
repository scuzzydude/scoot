# Plan of attack — facial likeness fix

Written 2026-08-18 after `FACIAL_LIKENESS_RESEARCH.md` came back.
Tier 1 (negative), Tier 2 (negative), two pose tests (both negative),
Tier 3/USO (worked in headshot framing, failed on every full-body
variation tried, 5 tests), and **Tier 4/FLUX.1 Kontext (real
breakthrough — likeness + full body + muscular build all worked in one
shot)** all executed 2026-08-19 — see each section below. Current
status (2026-08-20): pipeline is feature-complete and confirmed on two
subjects (Brandon, Cleo) — likeness, full body, cartoon style, correct
hair, and a brand-accurate, correctly-textured, correctly-centered
jersey with the real Fonde crest all confirmed working end to end.
Cleo's run surfaced and fixed two real generalization bugs (hair-color
drift, segformer garment-class inconsistency) — see "Second subject"
below. Not yet wired into one call, not yet run on the rest of the
roster, licensing questions still open.

## Licensing — two open items now, decide before production use

The research surfaced a real blocker independent of whether tuning
continues: **InsightFace's `buffalo_l`/`antelopev2`/`inswapper` models —
the face encoders inside the pipeline's current PuLID and FaceID passes
— are licensed for non-commercial research use only.** This is already
true of the deployed pipeline today, not just future work. Moot for
Tier 3 specifically (USO needs no face encoder), but still a real
question for the currently-deployed SDXL/PuLID default path.

**Second item, added with Tier 3:** `flux1-dev-fp8.safetensors` is
FLUX.1 [dev], Black Forest Labs' **Non-Commercial License**. Same class
of question as InsightFace's — is Scoot(34) card generation
"commercial" in a sense that matters here. Fine for evaluation/piloting,
needs a real decision before USO/FLUX becomes the deployed default.

**Third item, added with Tier 4:** `flux1-dev-kontext_fp8_scaled.safetensors`
is also in the FLUX.1 [dev] Non-Commercial License family. Same open
question as the other two — and Tier 4 is currently the strongest
result, so this is the most load-bearing of the three to actually
resolve before production use.

Needs a decision either way: is Scoot(34) card generation "commercial"
in a sense that matters here? If yes, all three items above apply and
need resolving (or an alternative licensed-for-commercial-use model
swapped in) before production use.

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

**Result: negative, executed 2026-08-19.** Swapping to Zero (same seed
340034, same PuLID fidelity/weight=1.0, only the checkpoint changed)
broke ControlNet pose-following entirely — generated a figure facing
away from camera, no face visible, where Opt reliably produces a
face-forward pose. Zero is too raw/unrefined to follow ControlNet
conditioning precisely. Reverted to Opt (main release); see
`MODEL_PINS.md` for the full writeup. **This also resolves Tier 2 step 3
below** — LoRA should train against Opt (the main release), not Zero.
Unlike PuLID/FaceID, LoRA edits UNet weights directly rather than
injecting a foreign cross-attention signal, so it doesn't carry the
distribution-mismatch problem that motivated trying Zero in the first
place — no reason to inherit Zero's pose-fidelity regression along with
it.

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

**Pilot per-subject LoRA training on Animagine XL 4.0 Opt** (the main
release already deployed — see Tier 1 result above for why not Zero).

Why: this is the only approach in the whole research pass with a clear
mechanism for not fighting the checkpoint — it edits UNet weights
directly instead of injecting a cross-attention signal a divergent
checkpoint's distribution rejects. ACE++'s own docs independently
confirm the pattern (their LoRA variant beats their full-finetune variant
on consistency). It also sidesteps the InsightFace licensing question
entirely.

Steps, with status as of 2026-08-19:
1. **Done.** Trainer chosen: HuggingFace `diffusers`' own
   `train_dreambooth_lora_sdxl.py`, driven the way Modal's own official
   example does it (`modal-labs/modal-examples`,
   `06_gpu_and_ml/dreambooth/diffusers_lora_finetune.py` — that exact
   file now targets FLUX, but its `App`/`Volume`/`accelerate launch
   subprocess` pattern is a direct, proven template; only the training
   script target and its args need to change from Flux's to SDXL's).
   Not kohya-ss — the diffusers script needs no separate toolchain and
   the pattern is already Modal-native. Confirmed
   `cagliostrolab/animagine-xl-4.0` has full diffusers-format subfolders
   (`unet/`, `vae/`, `text_encoder/`, `text_encoder_2/`, `tokenizer*/`,
   `scheduler/`, `model_index.json`), so `--pretrained_model_name_or_path`
   can point at it directly — same checkpoint already deployed, no
   separate conversion step.
2. **Done, for the pilot subject.** Original assumption — 72 video
   frames at `~/Nick/work/people/09_BRANDON/` give enough distinct
   angles/expressions — turned out wrong on inspection: frames past
   `f_0293.jpg` are a different person ("Donnie"), and nearly the whole
   Brandon range has a burned-in "BRANDON" name-card graphic overlapping
   the face. Only 6 clean frames survived, collapsing to 2 real distinct
   moments — too thin on its own. Brandon supplied 6 additional photos
   via the share drive (2026-08-19), mostly group shots; pulled his face
   out of 5 of them (1 dropped — mirrored sunglasses fully occluded his
   eyes). Final set, **7 images, 7 distinct real moments** (one
   representative frame kept from the video's near-duplicate burst, the
   other 4 near-dupes deleted so they don't outweigh the rest 5-to-1):
   studio flash (2 crops, different distance/framing), window daylight,
   warm tungsten night, low-angle home selfie, plus the 2 video frames.
   Real variation now in lighting, angle, and outfit — thin by the usual
   10-20-image community norm but no longer the same-lighting/angle/
   outfit degenerate case it started as. Source photos deleted after
   cropping (both from the share drive and not retained elsewhere).
   Sitting in `tools/player-cards/art/lora_training/brandon/` (gitignored,
   not committed) — see that folder's README.txt for the exact inventory.
3. **Done.** Trained via `train_lora.py` (2026-08-19): 500 steps, rank 16,
   against Opt, instance_prompt `"a photo of brandon34person, a man"`, no
   prior preservation, hyperparameters straight from diffusers' own
   README_sdxl.md example. Ran clean — no OOM, no errors, 500/500 steps in
   ~24.5 min, final loss 0.0306. Output uploaded to
   `media/card-art/lora/brandon34person_lora.safetensors`.
4. **Done, result: negative.** Wired into `modal_app.py`'s `generate()` as
   an opt-in `lora_test` payload flag (node 29, `LoraLoaderModelOnly`,
   sourcing from the same style branch node 27/PuLID used, so only the
   identity mechanism changed) — see that method's comment. Ran the exact
   `34-TEST-BRANDON-v6` conditions (same cutout, style ref, seed 340034),
   trigger token prepended to the positive prompt, `strength_model=1.0`.
   Container logs confirm the LoRA substantially loaded (only 7 of 1120
   keys unmatched, all from one out-of-range transformer block index --
   not a wiring failure). Result: **the face has no legible eyes, nose,
   or mouth structure at all** -- blanker than v6's own baseline, no
   Brandon-recognizable signal. This is a real negative result, not a
   bug -- the mechanism ran as designed and still didn't produce
   likeness.
   **Confound worth noting:** v6's baseline face (no identity mechanism
   active at all) is *also* weak on this exact pose -- downward-tilted
   head, partially self-occluding the eyes. Every likeness test in this
   project (PuLID, FaceID, this LoRA) has used the same pose/seed, so
   there's no data yet on whether a more front-facing pose would do
   better regardless of identity mechanism. Worth isolating before
   concluding LoRA itself failed, not just this specific pose+LoRA
   combination.
5. Compare against `34-TEST-BRANDON-v6` — done (see above), ideally also
   with a quantitative metric (ArcFace cosine similarity between source
   photo and generated face) since the research found no such comparison
   exists publicly and this would be new, useful information for the
   project. Not yet built.

## Pose isolation test (2026-08-19) — result: negative, and surprising

Tested the confound from Tier 2 step 4: pulled a different source frame
from the same video (`f_0287.jpg`) where Brandon's head is level and
facing the camera directly, eyes open -- unlike the downward-tilted
frame every prior test used. New rembg cutout + matching tight face
crop, uploaded to Blob. Ran PuLID at the known-best settings
(fidelity/1.0, no LoRA, no touchup) -- same seed (340034), same style
reference, same everything else as `34-TEST-BRANDON-v6`. Only the pose
source photo changed.

**Result: worse, not better.** The generated figure's head turned almost
entirely away from camera, hair covering where the face should be -- no
facial features at all. Structurally the same failure mode as Tier 1's
Zero-checkpoint test (head turned away), but from an entirely different
cause (checkpoint unchanged this time, only the pose input changed).

**This weakens rather than confirms the pose-confound theory.** A
cleaner, more camera-facing source photo didn't produce a cleaner,
more camera-facing figure -- it produced a worse one. Two candidate
explanations, neither confirmed yet:
- OpenPose's body25 skeleton only coarsely encodes head yaw/pitch (a
  handful of nose/eye/ear keypoints, not a real orientation signal) --
  it may be systematically unreliable at pinning head orientation for
  this composition, regardless of which source photo drives it. The
  original downward-tilted photo may have "worked" (in the sense of at
  least facing forward) somewhat by chance, not because that skeleton
  was more reliable.
- The pose ControlNet's fixed strength (0.6) may be too weak to
  override the checkpoint's own strong prior toward three-quarter/
  looking-away angles in this style of illustration, and different
  input skeletons expose that instability differently rather than
  fixing it.

Not chasing this further without checking in first -- two real,
GPU-costing negative results back to back on two different hypotheses
(identity mechanism, then pose) is a natural checkpoint, not a place to
keep unilaterally spending. See "Where this stands" below for the
options this actually leaves open.

## Pose ControlNet strength test (2026-08-19) — result: negative, worse

Directly tested the "strength too weak" candidate above: re-ran the
same pose-isolation setup (`f_0287.jpg`, level/camera-facing) with
node 11's (openpose ControlNetApplyAdvanced) strength pushed from 0.6
to 1.0 -- everything else identical (PuLID fidelity/1.0, seed 340034,
style ref). Added as a one-off `pose_strength` payload override in
`generate()`, not a template change, so it's fully reversible.

**Result: substantially worse, not better.** Not just the face -- the
*entire image* collapsed into a dark, muddy, low-contrast mass with no
cel-shading, no bold lineart, nothing readable at all. This is the same
over-strength failure pattern already seen twice before in this
project: FaceID's weight bump (1.0→1.8) and PuLID's weight bump
(1.0→1.6) both degraded overall image coherence instead of adding
identity signal. Pushing ANY single conditioning input hard on this
checkpoint/composition seems to reliably break the whole render, not
just improve the thing being pushed. Reverted (test-only override,
nothing to undo in the deployed template).

**This rules out "pose strength is simply too low" as the fix.** Combined
with the pose-swap result above, three separate levers (identity
mechanism, pose source, pose strength) have all failed to produce a
recognizable face, with two of them making a full body of coherence
worse, not just failing narrowly. Stopping here again -- three
consecutive negative GPU tests is well past "quick things to try,"
this now looks like it needs either a smaller/more surgical intervention
(e.g. tune strength in a narrower band like 0.7-0.8 rather than jumping
to max) or the bigger Tier 3 swap.

**Operational math for the full roster:** if the pilot works, 34
members × ~$5-9 × ~30 min ≈ **$170-300 and a few hours of Modal compute,
one time per edition.** Very plausibly viable given the effort already
sunk into just getting the base pipeline working — worth stating
explicitly since "per-subject retraining" can sound more expensive than
it actually is at this scale.

## Tier 3 — USO on FLUX (2026-08-19): first real breakthrough

Greenlit after Tier 2 (LoRA) plus two pose-related tests all came back
negative on the SDXL/ControlNet stack -- three consecutive costly
failures on three different hypotheses justified the bigger swap.

**Build.** New, separate file: `modal_app_uso.py` (does not touch
`modal_app.py` -- different base model, different conditioning
mechanism, zero shared risk). Node graph reverse-engineered from
ComfyUI's own official reference workflow
(`Comfy-Org/workflow_templates`' `flux1_dev_uso_reference_image_gen.json`),
not guessed -- fetched it directly, traced every class_type/link through
its nested subgraphs, verified every node's actual input names against
ComfyUI's source (`comfy_extras/nodes_model_patch.py`,
`comfy_extras/nodes_flux.py`, `comfy_extras/nodes_edit_model.py`) before
writing the flattened API-format graph. Confirmed USO's nodes
(`USOStyleReference`, `ModelPatchLoader`, `FluxKontextMultiReferenceLatentMethod`)
were already in the pinned ComfyUI commit (merged into core 2025-09-02,
long before the 2026-08-16 pin) -- no ComfyUI version bump needed, and
no third-party custom-node repos to clone at all (unlike the SDXL
pipeline's PuLID/IPAdapter dependency set).

Model files, all pinned by HF revision: `flux1-dev-fp8.safetensors`
(Comfy-Org/flux1-dev, ~16.1GiB), `sigclip_vision_patch14_384.safetensors`
(Comfy-Org/sigclip_vision_384), `uso-flux1-dit-lora-v1.safetensors` +
`uso-flux1-projector-v1.safetensors` (Comfy-Org/USO_1.0_Repackaged).
A10G GPU (24GB) -- fp8 12B-param FLUX + LoRA + projector fit with
headroom.

Two real bugs hit and fixed during the first live run (both logged the
same way as every other bug in this project -- actual failure, not
guessed):
- Graph referenced the LoRA/projector by their repo-relative path
  (`split_files/loras/...`) instead of the basename
  `_download_pinned_models` actually saves to disk -- same class of bug
  MODEL_PINS.md already documents for `clip_vision` in `modal_app.py`.
- Redeployed code didn't take effect until the warm container was
  explicitly killed (`modal container stop`) -- the same "stale warm
  container" gotcha this project's `modal_app.py` history already
  flagged, now confirmed on a second app too.

**Style pivot, same session:** Brandon tried Meta AI's cartoonifier on
his own photo and preferred its 3D-Pixar-style result over this
project's locked flat 2D cel-shaded anime look. That image (cropped
directly out of the comparison screenshot, no regeneration) became the
style reference for this test instead of the SDXL-era
`style_reference.png` -- a real, deliberate style change for the
edition, not yet fully executed (see "Where this stands" below).

**Result: first legible face in fifteen total attempts.** Subject =
Brandon's studio-closeup photo (clean, well-lit, no pose extraction
needed at all -- USO conditions via a VAE-encoded reference latent, not
ControlNet, sidestepping the pose-reliability problem the last two SDXL
tests ran into entirely). Real eyes, nose, mouth; structure genuinely
reads as Brandon. Not yet card-ready: came out as a headshot crop, not
the full-body athletic-pose card format, and the render leans more
"smooth CG" than the exaggerated big-eyed Pixar look in the reference --
both look like prompt/framing tuning, not a fundamental blocker, but
neither is proven yet.

**Licensing flag, same class as InsightFace's:** flux1-dev-fp8 is FLUX.1
[dev], Black Forest Labs' Non-Commercial License. Fine for this
evaluation; needs a real decision before this becomes the deployed
default -- see the licensing section at the top of this doc, now with a
second open item alongside InsightFace's.

### Tuning pass: pushed for full-body + stronger style -- identity broke

Two follow-up tests, same day, tuning toward a real card (full-body,
stronger cartoon style) from the working headshot result above.

**v2:** three changes at once -- `ImageScaleToMaxDimension` 512→1024
(ComfyUI's own docs: 512 causes "the character taking up too much
space" specifically for headshot-only subject inputs, exactly this
case), a second chained `USOStyleReference` pass on the same style
image (pushing style strength), and a stronger full-body/cartoon
prompt + portrait aspect (832x1216). Result: style transformation
worked great -- genuine full-body cartoon proportions, correct jersey/
pose/background -- but **identity was completely gone**. Generic child
character, wrong hair color, wrong age, wrong build.

**v3, isolating:** reverted the double style-reference chain (back to
one pass) and softened the prompt (dropped "exaggerated cartoon
proportions"), kept the 1024 scale fix and full-body framing. **Same
result** -- still a generic child character, no likeness at all. This
rules out the double style-pass as the (sole) cause.

**Working hypothesis, not yet confirmed:** identity signal seems tied
to how much of the frame the face occupies, regardless of mechanism.
The one test that worked (first pilot run, above) was a headshot-
dominant square composition. Both follow-ups pushed toward full-body
framing and both lost identity, even with different specific settings
changed between them. This isn't new to USO -- the SDXL/PuLID work
earlier in this project hit the identical theory
(`modal_app.py`'s node 27 comment: "the face is a small fraction of
this full-body/bust composition... identity-embedding methods are
usually demonstrated on close-up portraits where the face dominates
the frame -- the signal may simply be diluted at this scale"). If
that's the real mechanism, it would mean full-body framing and strong
identity preservation are in real tension across every approach tried
in this whole project, not a settings problem on any one of them.

**v4, testing the untested variable:** swapped the subject reference
from the tight studio headshot to a genuine waist-up rembg cutout (the
same one used for the earlier SDXL pose-isolation test) -- otherwise
identical to v3 (single style pass, 1024 scale, portrait aspect,
full-body prompt). **Same result again** -- still a generic child
character, no likeness. Rules out "headshot-only reference photo" as
the cause too.

**Three full-body attempts, three different levers changed, three
identical failures.** Across v2/v3/v4 the double style-pass, the prompt
wording, and the subject photo's own framing were each varied in turn
-- full-body framing lost identity every single time regardless. The
one thing every failing test shares that the one working test doesn't:
asking for a full head-to-toe composition at all. This converges on the
frame-share theory above being about the OUTPUT composition, not the
input reference photo -- consistent with, and now better-evidenced
than, the original SDXL/PuLID theory it echoes.

**Practical path forward:** stop chasing full head-to-toe framing
specifically. Basketball trading cards conventionally include
waist-up/three-quarter-body compositions, not only full figure --
worth testing a middle ground (e.g. "from the waist up, holding a
basketball" rather than "head to toe, standing pose") before assuming
the card format itself needs to change.

**v5, testing that middle ground:** waist-up/chest-up framing instead
of full head-to-toe, back to the headshot subject photo (proven not to
matter per v4), moderate portrait aspect (1024x1280, not the more
extreme 832x1216). **Same result again** -- still a generic child
character, zero likeness, even in a tighter, more face-dominant crop
than several of the full-body attempts. This falsifies the frame-share
theory itself, not just the specific levers tried under it: five
USO tests now (headshot success, then four framing/prompt/photo
variations, all failed) don't cleanly separate on any variable tried
so far. Stopped chasing USO parameters at this point.

Skip DreamO despite its identity claims — its style task is documented
as unstable and not combinable with other conditioning, which is exactly
what a style-locked card pipeline needs.

## Tier 4 — FLUX.1 Kontext (2026-08-19): real breakthrough, likeness + full body both work

Prompted directly by Brandon after watching USO fail identically 5
times: "How was Meta able to do this so quickly? Can't we use a
HuggingFace model geared for exactly this kind of work?" — a genuinely
better question than continuing to tune USO. The answer: Meta AI's
cartoonifier is almost certainly an *image-editing* model, not a
generate-from-scratch-with-conditioning model like USO. That's the real
architectural reason identity survived instantly for Meta and had been
a fight all day here.

**Why Kontext is different, confirmed by tracing its actual graph (not
assumed):** USO's KSampler denoises from `EmptySD3LatentImage` (pure
noise), steered toward the subject only via `ReferenceLatent`
conditioning. FLUX.1 Kontext's KSampler denoises from the SAME
VAE-encoded latent as its `ReferenceLatent` conditioning input — i.e.
it starts from the real photo's own latent representation, not noise.
Combined with the base model itself being trained end-to-end for
"take this photo + instruction, preserve everything else," this is a
structurally different task than USO's bolted-on subject+style adapter
on a generic base model. Confirmed via
[black-forest-labs/FLUX.1-Kontext-dev](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev),
independently benchmarked ahead of other open edit models AND
Gemini-Flash-Image specifically on identity preservation.

**Build.** New file `modal_app_kontext.py`, separate from both
`modal_app.py` and `modal_app_uso.py` (third distinct checkpoint, zero
shared risk). Node graph reverse-engineered the same way as USO's:
fetched ComfyUI's own official reference workflow
(`Comfy-Org/workflow_templates`' `flux_kontext_dev_basic.json`)
directly, traced its subgraph, verified every node's actual input names
against ComfyUI source before writing the flattened API-format graph.
Model files (all pinned by HF revision): `flux1-dev-kontext_fp8_scaled.safetensors`
(Comfy-Org/flux1-kontext-dev_ComfyUI, ~11.9GiB), `ae.safetensors`
(Comfy-Org/Lumina_Image_2.0_Repackaged — yes, packaged under an
unrelated-sounding repo name, confirmed via the reference workflow's
own note, not guessed), `clip_l.safetensors` + `t5xxl_fp8_e4m3fn_scaled.safetensors`
(comfyanonymous/flux_text_encoders). Same ComfyUI commit as the other
two apps -- `FluxKontextImageScale` already present, confirmed the same
way USO's nodes were. Single input image is fully supported (confirmed
via the reference workflow's own MarkdownNote) -- no separate style
reference image needed the way USO required one.

**Prompting follows Kontext's own documented rules** (quoted directly
from the reference workflow's MarkdownNote): be specific, explicitly
state what to preserve ("preserving facial features"), prefer "change X
to Y" over "transform into Y" (their own example: "transform the person
into a Viking" is the WRONG pattern, "change the clothes to be a viking
warrior while preserving facial features" is correct).

**Real Fonde jersey colors used, not the orange/blue placeholder every
earlier test in this project used.** Checked `arch/player-cards.md`
before writing the prompt rather than guessing "Fonde uniform":
`JERSEY = {"dark": ("#2E2E2A", "#121210"), "light": ("#F4F1E8", "#BFBBAD")}`
— dark charcoal/black or light cream, reversible, no jersey numbers
("everybody is 34"), and the doc explicitly says not to generate the
Fonde crest or chest rider (composited separately downstream) — so the
prompt asks for a blank dark jersey, no logos/text/numbers.

**Result, first attempt: real breakthrough.** Prompt: "Change this into
a 3D Pixar-style cartoon superhero character. Change the clothes to a
solid dark charcoal-black superhero costume with basketball shorts, no
logos, no text, no numbers. Give the character a more muscular,
athletic superhero build. Use soft rounded cartoon shading and a simple
plain background. Preserve the same facial features, hairstyle, and
expression." Same headshot subject photo and seed (340034) as every
other test. **Genuine, clear likeness — dramatically more recognizable
than anything USO produced across 5 attempts — AND full body AND the
muscular superhero build worked, all in one shot, all at once.** Style
leans more "realistic muscular CG render" than the exaggerated Pixar
cartoon Brandon pointed to (Meta's Response 2), not yet fully
cartoon-stylized, but the fundamental problem this whole plan has been
chasing all day -- identity surviving a full-body composition -- is
solved. This is a style-tuning problem now, the same place Tier 3's
headshot result was before pushing it too far broke it.

**Cost, measured from a real call, not estimated.** ComfyUI's own log
reported "Prompt executed in 77.82 seconds" for the v1 generation above
(20-step sampler = 55s of that, confirmed via the progress bar log
line). At Modal's published A10G rate ($0.000306/sec,
https://modal.com/pricing), that's:
- **~$0.02–0.03/card** (77.82s cold + ~15s ComfyUI startup overhead
  ≈ 93s ≈ $0.028; warm calls without the startup overhead ≈ $0.024).
- **~$0.81 for the full 34-member roster** in one batch run (1 cold
  start + 33 warm calls ≈ 44 min total GPU time).
- **No per-subject training at all** -- this is the real economic
  difference from Tier 2's LoRA approach ($170-300 for the roster
  *before* any generation). Kontext runs directly against each
  player's existing photo.
- One-time image-build cost (baking ~17.6GB of model weights into the
  Modal image) is CPU-time only, not GPU-billed, and already sunk.

**Tuning round 2, same day, per Brandon's direct feedback** ("more
cartoony on the face, too much muscle... needs to be waist up, you have
the crotch in the sample"):
- **v2:** explicit "waist-up, cropped just above the waist, no hips/
  legs" + "toned athletic build, not overly bulky" replacing the
  muscular-superhero language. **Framing and muscle both fixed cleanly**
  -- no identity regression, unlike USO's fragility under similar
  pressure. Face still read photoreal, not cartoon, and the jersey
  drifted into a generic caped superhero collar (lost from dropping
  "basketball jersey" specificity when removing "shorts").
- **v3:** pushed face-cartoon language much harder ("flat cel-shaded
  skin, no visible pores or wrinkles, large rounded cartoon eyes,
  simplified nose/mouth, NOT photorealistic") and reinforced "sleeveless
  round-neckline basketball jersey style, no cape, no collar" to recover
  what v2 lost. **Real cel-shaded cartoon face achieved** -- flat
  simplified skin/eyes/nose/mouth, no more photoreal texture. Correct
  jersey style back. Identity reads a bit softer than v1's more
  photoreal face -- an expected tradeoff of pushing toward cartoon, not
  a failure, but worth Brandon's judgment on whether v3 is the right
  balance or needs a middle ground between v1's identity strength and
  v3's cartoon rendering.
- Notably: unlike every USO tuning attempt, **none of these prompt
  changes broke identity or triggered a cascading failure** -- Kontext's
  edit-model mechanism appears substantially more robust to style
  pressure than USO's generate-from-noise conditioning was. Still
  changed one thing at a time as a matter of discipline, but the
  "over-strength conditioning breaks everything" pattern that recurred
  constantly on the SDXL and USO stacks hasn't shown up here yet.

### Hair regression -- three prompt fixes failed, needs compositing instead

Brandon's read on v3: "the right idea," but flagged a real regression --
his hair (correctly short/buzzed in v1 and v2) drifted to a longer,
styled, swept-back look once the face-cartoon push (v3) landed. Also
asked for jersey compositing rather than relying on the model to draw
the exact Fonde jersey.

Three escalating prompt-only attempts to fix the hair, same failure
every time:
- **v4:** added "Keep the EXACT SAME short buzz-cut hairstyle... do not
  lengthen it or change the style" to the existing v3 prompt. Same
  drifted hair.
- **v5:** restructured so hair is the FIRST thing described (before any
  cartoon-style language), with explicit negatives ("do not give him
  longer hair, wavy hair, thick hair, or a styled swept-back haircut").
  Same drifted hair again.
- **v6:** simplified to one directive ("do not change the hair at all")
  and lowered `guidance` from 2.5 to 1.8 (weakens text influence,
  strengthens the input photo's own pull) to test whether the model was
  simply prioritizing text over the reference image. Same drifted hair
  a third time.

**This rules out under-specification.** Three different wording
strategies plus a parameter change all converged on the identical wrong
hairstyle -- a persistent bias toward a "styled cartoon protagonist"
hair archetype when the cartoon-style transformation is strong, not a
prompting problem text can fix.

**Conclusion, and it validates Brandon's own proposal for the jersey:**
this needs pixel-level compositing, not more prompting. Mask the hair
region and paste real hair back in deterministically -- the exact same
pattern as overlaying the precise Fonde jersey rather than trusting the
model to draw it. One compositing system, two uses (hair region, jersey
region), both following the project's own established principle
(`build_cards.py`'s `jersey_variant()` already does exactly this for
jersey color -- AI generates the shape/shading, deterministic
compositing handles what needs to be exact).

**Not yet built:** the actual masking/compositing step for either hair
or jersey. Needs a segmentation approach (reuse `segformer_b2_clothes`
from the SDXL pipeline, or a simpler technique given Kontext's outputs
are consistently posed/framed) to produce hair-region and jersey-region
masks on the Kontext output, then composite in the correct source
pixels/colors the same way `jersey_variant()` already does for jersey
recoloring.

### Hair fix, take 2 -- masked inpainting, then reference-image conditioning

Brandon's actual spec, once asked to clarify: **cartoon-style rendering
matching his real hair shape, constrained by a mask** -- not a literal
pixel-paste of real-photo hair (which would mismatch the surrounding
cartoon rendering).

**Mechanism 1: `SetLatentNoiseMask` (standard ComfyUI inpainting).**
Added `KontextGenerator.inpaint_region()` to `modal_app_kontext.py` --
VAEEncode the existing (wrong-hair) image, apply a feathered hair-region
mask (derived by face-detecting the image and building an ellipse above
the eyebrows, feathered edges for a smooth blend) via
`SetLatentNoiseMask`, regenerate with `denoise=0.9` so only the masked
region can change. Text prompt: "short buzzed hair, cartoon-rendered,
cel-shaded... receding at the temples."

**Result: mask mechanism confirmed working perfectly** (face, jersey,
muscle, everything outside the mask came back pixel-identical -- real
proof `SetLatentNoiseMask` isolates changes correctly), **but the hair
inside the mask was STILL the same wrong styled/swept look.** This is
the 4th consecutive failure on hair (3 full-image text prompts + this
masked one) -- conclusively rules out "the model isn't following
instructions" as the explanation. It's a content problem: even
geometrically constrained to redraw a small region with an explicit
"short buzzed hair" prompt, the model's prior for "cartoon hair"
overrides the instruction.

**Mechanism 2, added on top: `ReferenceLatent` conditioned on an image,
not text.** Built `inpaint_with_reference()` -- same mask constraint as
above, but ALSO feeds a real photo crop of the correct hair (cropped
from v2's already-cartoon-styled, correctly-haired output) through
`FluxKontextImageScale` -> `VAEEncode` -> `ReferenceLatent` into the
positive conditioning, alongside a prompt asking the model to "match the
reference image." This is the exact same node Kontext's own
`generate()` uses for its whole-image edit instruction -- reused here
pointed at a visual reference instead of pure text, composed with the
independent mask constraint (the two mechanisms don't conflict: the
mask still governs WHERE pixels change, the reference now governs WHAT
gets drawn there).

**Result: fixed immediately, first attempt.** Correct short buzzed
hair, rendered in matching cartoon style, receding hairline intact --
everything else (face, jersey, muscle, waist-up framing) unchanged.
**Confirms the real lesson: this model needs to be SHOWN the correct
content for something this specific, not told about it** -- text
description alone failed 4/4 times regardless of wording, specificity,
instruction placement, or guidance value; a visual reference worked on
the first try.

**Practical implication for the jersey work, and for full-roster
production:** the same reference-image pattern (not a hand-authored
mask+recolor like `jersey_variant()`, though that's also on the table)
could plausibly be used for the jersey too -- feed a real Fonde jersey
photo/render as a `ReferenceLatent` image alongside a jersey-region
mask. Worth trying before assuming a from-scratch compositing system is
required. For the full 34-member roster, this also means each member's
own hair reference crop (from their own subject photo) is the natural
source -- no manual reference-authoring needed per person, the pattern
generalizes directly.

### Jersey -- proof of concept works, mask quality is the open item

Unlike hair, jersey has an exact brand spec (`build_cards.py`'s
`JERSEY` dict: hex-precise dark charcoal/light cream, reversible, no
numbers). AI reference-matching risks color drift that's tolerable for
hair shape but not for brand-color consistency across 34 cards -- chose
the deterministic path instead: reuse `jersey_variant()`'s existing
luminance-preserving recolor logic (already proven in the SDXL
pipeline) on a mask applied to the Kontext output.

**Mask:** quick color-threshold heuristic (luminance < 70, restricted
to below the detected face box to avoid merging with hair/face shadow,
morphological close+open, largest connected component, feathered).
Not a real segmentation model -- hand-tuned against this one image.

**Recolor:** exact port of `jersey_variant()`'s logic -- luminance
within the mask drives a blend between the JERSEY dict's base/shadow
hex tones, so the AI-generated shading pattern survives, just recolored
to precise brand values.

**Result: color mechanism works exactly right** -- real Fonde hex
values, shading preserved, confirms the deterministic-recolor approach
generalizes cleanly from the SDXL pipeline to Kontext's output. **Mask
quality is the open problem** -- a visible seam near the collar where
the color-threshold mask has a gap (missed jersey pixels near the
neckline that never got recolored). This is a mask-precision issue, not
a concept issue.

**Recommended fix, not yet built:** reuse `segformer_b2_clothes` (the
clothing-segmentation model already deployed in `modal_app.py`'s SDXL
pipeline) instead of the ad-hoc color threshold -- proper per-pixel
garment segmentation, no per-image hand-tuning, matches the quality bar
the rest of this project already established. Could run as a ComfyUI
node inside a Kontext-pipeline pass, or as a lightweight standalone
post-process step outside Modal entirely.

### Jersey, take 2 -- real segformer mask, done

Built as a new, separate, CPU-only Modal app: `modal_app_jersey.py`.
Same pinned model/revision as `modal_app.py`'s SDXL pipeline
(`mattmdjaga/segformer_b2_clothes`), but run directly via `transformers`
(`AutoModelForSemanticSegmentation` + `SegformerImageProcessor`) instead
of through the ComfyUI custom-node wrapper -- simpler for a standalone
post-process step that doesn't need ComfyUI's graph machinery, and
avoids adding the custom node's dependencies to a whole new Modal image.
Class 4 ("Upper-clothes") in the model's 18-class label set is the
jersey region. Recolor logic is a direct, line-for-line port of
`build_cards.py`'s `jersey_variant()`.

**Two real bugs hit, both the established gotchas from earlier in this
session:** forgot to attach the `azure-blob-creds` secret to the
function decorator (`KeyError: 'AZURE_STORAGE_KEY'`, fixed by adding
`secrets=[...]`); then a redeployed fix didn't take effect until the
warm container was explicitly killed -- same stale-container pattern
hit twice already on the Kontext app.

**Mask cleanup, three real diagnostic iterations, not guessed:**
1. First real run: segformer's raw output had a couple of stray
   misclassified specks and a defect near the armhole (visible as a
   streak in the recolored image, worse than expected from a real
   segmentation model). Largest-connected-component filtering cleanly
   removed the specks.
2. For the armhole defect: tried a 9x9 then 31x31 morphological close
   -- shrank it but never fully closed it.
3. Suspected an enclosed hole, tried flood-filling the mask's inverse
   from the frame's outer edge (anything unreached is a sealed hole,
   fill it). **This left the defect completely untouched** -- the
   useful diagnostic result, since it proves the defect is NOT a sealed
   hole. It's a narrow channel connected to the background right at the
   armhole edge, which the flood-fill reaches straight through.
4. Correct fix for a channel (not a hole): closing strong enough to
   physically bridge it (51x51 kernel) as the primary step, with the
   flood-fill hole-check kept as a secondary safety net for genuinely
   enclosed gaps elsewhere.

**Result: clean collar and armhole edges, exact Fonde hex colors,
shading preserved.** One tiny residual patch remains near the shoulder
strap -- far smaller than the original color-threshold seam, a minor
cosmetic detail rather than a real defect. Real segmentation model
confirmed to generalize the deterministic-recolor approach cleanly from
the SDXL pipeline to Kontext's output.

**Status: every piece of the pipeline now works end to end** --
likeness, full-body framing, cartoon art style, correct hair, and
brand-accurate jersey compositing, all confirmed on real generated
output, not just individually.

### Jersey, take 3 -- the real Fonde crest, not just the right color

Brandon provided real photos of the actual jersey (`fonde_jersey_black.jpg`,
`fonde_jersey_white.jpg` -- reversible mesh, basketball graphic with
"FONDE REC CENTER SENIOR BASKETBALL" text and two stars). Getting the
jersey COLOR right (previous section) wasn't the whole spec -- the
brand crest itself needed to be on it too.

**Chose deterministic extraction over AI regeneration, same reasoning
as the color decision but stronger:** this is real text ("FONDE", "REC
CENTER", "SENIOR BASKETBALL") that has to stay legible and correctly
spelled -- diffusion models are well-documented to be unreliable at
precise text rendering, so even the reference-image technique that
fixed hair would risk garbling words here. Extracted the actual crest
from the jersey photos instead:
1. Cropped tightly around the crest in `fonde_jersey_black.jpg` (best
   contrast: white ink on near-black mesh).
2. Isolated the white ink from the mesh fabric's woven texture --
   Gaussian blur before thresholding (averages out the weave's
   per-thread brightness spikes so the threshold doesn't pick up
   fabric noise), then morphological open (strips background speckle)
   followed by close (fills small gaps inside letter strokes from the
   weave), producing a clean white-on-transparent PNG.
3. Uploaded to `media/card-art/assets/fonde_crest_white.png` as a
   reusable static asset (white ink -- works on the "dark" jersey side
   currently deployed; a black-ink version for "light" isn't made yet).

**Compositing, generalized not hand-placed:** extended
`modal_app_jersey.py`'s `composite_jersey()` with an `add_crest` step
(on by default). Position and scale come from the jersey segmentation
mask's own bounding box (crest width ~54% of jersey width, top margin
~13% of jersey height -- ratios tuned once against this image, not yet
verified on a second subject) rather than fixed pixel coordinates, so
it should generalize across different subjects' body sizes and framing
instead of only working for this exact composition.

**Bug hit and fixed:** first attempt fetched the crest asset via a bare
`httpx.get` on the Blob URL and got `PIL.UnidentifiedImageError` --
`media` is a private container, an anonymous request gets an XML
access-denied body back, not image bytes. Fixed by using the
already-authenticated `BlobServiceClient`/`container.download_blob()`
(moved earlier in the function) instead.

**Result: real, crisp, correctly-spelled "FONDE REC CENTER SENIOR
BASKETBALL" wordmark with the basketball graphic and stars, positioned
and scaled automatically from the segmentation mask.** Confirmed the
generalized (mask-driven) version matches the manually-tuned version
closely -- the auto-positioning logic works, not just the one
hand-placed test.

### Jersey, take 4 -- crest neck-bleed and flat texture, both fixed

Brandon caught two remaining issues in the take-3 result: the crest
bled into the neck skin above the collar, and the jersey looked flat
next to the real jersey's visible mesh weave.

**Crest neck-bleed, root cause:** the vertical top margin was computed
as a ratio of jersey height measured from `jy0 = ys.min()` -- the
mask's GLOBAL topmost pixel, which sits at the shoulder/strap peak, not
the actual collar. A V-neck collar dips well below the shoulder peak,
so the margin (correctly sized against the wrong reference point) left
too little real clearance and the crest overlapped collar-adjacent neck
skin. Fixed by computing `neck_y` from a narrow band around the
horizontal center column only (`center_band = (xs >= jcx-10) & (xs <=
jcx+10)`), i.e. measuring collar depth where the crest is actually
placed, not the shoulder peak; also bumped the margin ratio from 0.13
to 0.18 of this now-correctly-measured height as a deliberate buffer.

**Flat jersey texture, fix:** extracted a clean 200x200 patch of real
mesh fabric from `fonde_jersey_black.jpg`, converted to grayscale,
normalized by its own mean (values >1 = lighter weave holes, <1 =
darker threads), clamped to [0.65, 1.45], stored as an 8-bit PNG
(128 = 1.0x/neutral) at `media/card-art/assets/mesh_texture_mult.png`.
Applied as a new `add_mesh_texture` step in `composite_jersey()`,
inserted after the color-recolor step and before the crest overlay:
tile the multiplier map across the canvas and multiply it onto the
already-recolored jersey RGB channels (not a color paste), so the exact
brand hex colors, the AI's own shading, and the fine dot-weave pattern
all survive together.

**Result, confirmed via a real generation run:** clear collar/neck
fabric separation (no more skin bleed) and a visible mesh-weave texture
across the jersey, with brand colors and crest text/graphic unchanged.
Committed as `cdc8aa5`.

### Jersey, take 5 -- crest horizontal centering

Brandon's next feedback: vertical position was right (take 4), but the
crest wasn't horizontally centered on the jersey.

**Root cause, same class of bug as take 4:** the horizontal center was
computed from an x-extent (first the full mask bbox, then a top-of-mask
band) -- both get pulled off-center on a 3/4-turned, flexed pose, where
the near shoulder/arm reads foreshortened wider than the far one, so
any min/max-of-x measurement is biased toward whichever side the pose
makes bigger.

**Fix:** stop measuring extents; find the collar's actual V-notch
instead. For each column, the topmost mask pixel traces the garment's
top edge -- two peaks at the shoulder straps, with a dip between them
at the neckline. That dip's x position is the true chest centerline by
garment construction (a symmetric tank top's V-cut is sewn centered),
independent of pose. Implemented via `np.minimum.reduceat` over a
per-column top-profile, searched only in the central 50% of the mask's
width so a strap peak can't be mistaken for the notch. This single fix
also now supplies `neck_y` directly (the dip's y-value), replacing the
separate ±10px-band lookup take 4 used.

**Result: confirmed centered on a real run**, verified visually against
the previous off-center output before moving on. Committed as
`9b16a7b`.

### Second subject -- Cleo, generalization test

Per Brandon's request, ran the full pipeline (Kontext generation, hair
fix, jersey composite) on a roster member besides Brandon for the first
time. Chose `01_CLEO/f_0008.jpg` (gray hair, gray mustache, clean
front-facing frame). Reused the take-3-winning style prompt unchanged.

**Result: framing, cartoon style, and jersey base color all
generalized correctly on the first attempt.** Two real issues surfaced,
both root-caused and fixed, not two more mystery failures:

1. **Hair color drifted dark.** Cleo's real hair is gray/white; Kontext
   rendered it black -- the same class of bias as Brandon's earlier
   hair-SHAPE regression, but for hair COLOR this time. Fixed with the
   exact same mechanism already built for Brandon: mask the hair
   region (a feathered ellipse over the top of the head, hand-placed
   via a grid-overlay check, not guessed), condition on a real photo
   crop of the correct hair via `ReferenceLatent`. Confirmed via pixel
   diff that only the masked region changed (mean abs diff 2.4 outside
   the mask vs. 24.6 inside) -- same verification method used to
   validate Brandon's hair fix originally.
2. **Jersey mask came back nearly empty.** `composite_jersey()` looked
   only at segformer's class 4 ("Upper-clothes"). Added a `debug` flag
   to the app (prints the full class histogram) to diagnose --
   confirmed only 837 of 1,046,784 pixels landed in class 4, while
   131,200 landed in class 7 ("Dress") instead. Brandon's own mask WAS
   clean class-4-only, so this isn't a bug in that earlier pass -- it's
   the classifier being genuinely inconsistent across photos for this
   garment style (a sleeveless tank cropped waist-up, with no visible
   waistline to signal "top, not one-piece"). Fixed by unioning both
   candidate classes (`np.isin(pred, [UPPER_CLOTHES_CLASS_ID,
   DRESS_CLASS_ID])`) instead of assuming one. This also validated the
   take-5 centering fix on a second, independent mask shape once the
   mask was actually correct-sized.

**Status: full pipeline now confirmed working end to end on two
different subjects**, including two real generalization bugs found and
fixed by testing on a second subject rather than assumed fixed.
Committed alongside the take-5 fix.

## Monitor, no action needed

**AnimeAdapter** ([arXiv:2605.20237](https://arxiv.org/html/2605.20237))
is architecturally the best match to this exact problem — anime-native,
zero-shot, no per-subject tuning — but code isn't released yet ("upon
acceptance"). Worth a periodic check on the repo, not worth blocking on.

## Suggested order for next session

1. ~~Tier 1, Tier 2, pose tests~~ — all done, all negative, see above.
2. ~~Tier 3: build + USO/FLUX tests~~ — done. Works in headshot framing;
   5 attempts at full-body/waist-up all failed identically, cause not
   isolated. Deprioritized in favor of Tier 4, not abandoned.
3. ~~Tier 4: build + first Kontext test~~ — done, real breakthrough:
   likeness + full body + muscular build all worked in one shot. See
   above.
4. ~~Tune Kontext toward card-ready~~ — done. Crop/muscle fixed cleanly
   (v2); real cartoon face achieved (v3), but Brandon caught a hair
   regression v3 introduced.
5. ~~Fix the hair via prompting~~ — done, negative. 3 attempts (v4/v5/v6)
   all converged on the same wrong hairstyle regardless of wording or
   guidance value — a persistent model bias, not a prompting gap. See
   "Hair regression" above.
6. ~~Fix the hair via masking~~ — done. Masked inpainting alone (4th
   attempt) still failed; adding a visual reference image via
   `ReferenceLatent` fixed it immediately. See "Hair fix, take 2" above.
7. ~~Build the jersey compositing step~~ — done, twice. First pass
   (color-threshold mask) proved the recolor mechanism but left a
   visible seam. Second pass (real `segformer_b2_clothes` segmentation,
   `modal_app_jersey.py`) fixed it down to a tiny residual patch. See
   "Jersey, take 2" above.
8. ~~Fix crest neck-bleed and add real mesh texture~~ — done. Neck-bleed
   was a wrong-reference-point bug (shoulder peak vs. actual collar
   depth), texture added via a real fabric-swatch multiplier map. See
   "Jersey, take 4" above.
8b. ~~Fix crest horizontal centering~~ — done. Same class of bug as
   take 4 (extent measurement biased by pose), fixed via collar V-notch
   detection instead. See "Jersey, take 5" above.
8c. ~~Run the full pipeline on a second roster member~~ — done, Cleo.
   Framing/style/jersey-color generalized cleanly first try; found and
   fixed two real bugs (hair color drift, segformer classifying the
   tank as "Dress" not "Upper-clothes" for this subject). See "Second
   subject -- Cleo" above.
9. **Pipeline is now feature-complete and confirmed on two subjects** —
   likeness, full body, cartoon style, correct hair, and brand-accurate,
   correctly-textured jersey all confirmed working end to end (three
   separate Modal apps: `modal_app_kontext.py` for generation + hair
   inpainting, `modal_app_jersey.py` for jersey compositing). Not yet
   wired together into one pipeline call, and not yet run on any roster
   member besides Brandon.
10. Before production/full roster: decide the licensing question
    (InsightFace, FLUX.1-dev/Kontext non-commercial — three items now)
    — independent of how good results look.
11. Tier 2's per-subject LoRA and Tier 3's USO path are both
    deprioritized given Tier 4's result — not abandoned, just no longer
    the leading approach.

### Framing/scale bug — real root cause, 2026-08-20

VM crashed mid-session (host-level power event, confirmed via
`journalctl` — the previous boot's log just stops with no shutdown/
OOM/panic message, timestamp matching exactly when the running tool
call was cut off). Recovered by reinstalling `modal`/`rembg`/`pillow`/
`reportlab` (system pip packages didn't survive the reboot; Azure blob
outputs, Modal app deployments, and the separate `~/Nick/work/venv`
venv all did) and reading the crashed session's own transcript JSONL to
reconstruct exactly where the work had left off.

Brandon's report on resuming: "my head is big, the centering is good"
— based on the stale published review page (predates the reframe fix
below), not the actual reframed result. Once shown the reframed
version, head-width/shoulder-width measured nearly identical to
Cleo's (0.44 vs 0.45) — that ratio wasn't the bug. Brandon proposed the
real diagnostic himself: use where Cleo's crest text "SENIOR
BASKETBALL" gets cut off at the frame's bottom edge as a shared
reference line for both cards. By that measure, Brandon's card cut off
a full crest line earlier than Cleo's — his whole figure was scaled
larger within the same canvas, a difference invisible to a
scale-invariant head:shoulder ratio check.

Tested padding the source photo 20% (an explicit zoom-out cue) — no
visible effect on output framing, meaning Kontext's own "waist-up,
cropped just above the waist" prompt instruction dominates over input
framing/scale cues (at least for this prompt template — this
contradicts the earlier working assumption that "Kontext anchors on
the input's own composition," which was true for the *original*
extreme-closeup-vs-waist-up bug but not for this finer scale
difference). Diffing the two Modal calls directly found the actual
variable: Brandon's reframe run used a different seed (552013) than
Cleo's (552011), plus an extra "keep natural head-to-shoulder
proportions" sentence Cleo's winning prompt never had. Matching
Brandon's call to Cleo's exact seed + prompt text, same waist-up source
photo otherwise unchanged, reproduced her framing almost exactly —
confirmed via the same crest-cutoff-line check, now matching. Published
as a new section on the review page (`likeness-review/index.html`).

**Real finding for the full 34-member roster:** seed measurably affects
output *scale/framing*, not just stochastic content variation, on this
model/prompt combination. Before generating the full roster, lock a
single seed (or a small tested seed set) as the roster-wide default —
otherwise this exact framing-drift bug will likely recur per subject.
Not yet decided/implemented — next thing to resolve before scaling past
2 subjects.

### Expression control — a real per-subject knob, 2026-08-20

Brandon's feedback on the framing-fixed cards: size is right, but both
faces are "goofy" — same wide-eyed, open-mouth surprised-joy look
regardless of the source photo's actual (neutral) expression. Wants
this adjustable per roster member: charming, bad-ass, mean, serious.

Replaced the "preserve the same expression" prompt line with an
explicit directive, same locked seed (552011) and source photo. Three
distinct results: BADASS (confident, subtle smirk, focused eyes) and
MEAN (furrowed brow, stern) landed clean on the first attempt, for both
Brandon and Cleo. CHARMING did not — still too close to the goofy
default; the "warm smile" wording doesn't push far enough from the
model's grin/wide-eyes bias. **Brandon's pick: BADASS.**

Running these prompts on Cleo surfaced a real bug: the locked seed with
a modified prompt reintroduced the earlier hair-color regression (gray
hair rendering black), and — new, not covered by the original fix —
**dropped his mustache entirely**. The original hair fix's mask only
covers the top-of-head region. Built a second mask for the mustache and
pointed both regions at one reference crop from Cleo's already-correct
final card; fixed cleanly, first attempt, for all three variants.

**Implication for the roster:** any prompt change (expression, style,
anything) likely needs this same hair/facial-hair touch-up re-applied
per subject — it doesn't carry over from a prior fix automatically.
Full 8-card spread (DEFAULT/BADASS/MEAN/CHARMING × Brandon/Cleo)
published on the review page.

**Next:** fix CHARMING's prompt (explicitly negate the open-mouth grin
the same way BADASS/MEAN did), then decide how expression gets chosen
per roster member (a CSV column, most likely, alongside a locked seed)
before generating anyone past these two.

### First complete card FRONT assembled, 2026-08-20

Brandon: "let's create the complete card (front) first, work on how
that looks." First time the art has gone through the real
`build_cards.py` template rather than being reviewed as a bare
portrait. Pipeline: BADASS jersey-composited figure → rembg alpha
cutout → crop to the art slot's 0.7 aspect ratio (700x1000px spec),
centered on the figure's horizontal midpoint from its own alpha mask →
`{serial}_figure.png` + `{serial}_jersey_mask.png` in a local art dir →
placeholder roster CSV row → `build_cards.py` → PDF → `pdftoppm` to PNG
for review.

Per Brandon's instruction this pass is art-only — roster data (tier,
position, stats, profile lines) stays placeholder filler. Handle set
per his direct request: Brandon → "Rocket Man" (his call), everyone
else keeps their real name or database nickname (Cleo → "Cleo").

**Result: reads well.** Likeness/expression clear even at card scale,
crest legible and correctly branded, manga speed-line background gives
real energy without fighting the figure, tier accent shows nicely on
Cleo's OG/amber.

**Two open items, not yet fixed:**
1. Starter tier's accent stripe (bare white per spec) is literally
   invisible against white card stock. Matches the documented design
   intent, not a bug — but worth confirming with Brandon that he
   actually wants that for his own card once tier is real, not
   placeholder.
2. Crest reads slightly softer at full card print resolution than in
   the standalone portrait. Tested removing an unnecessary intermediate
   PIL upscale step in the art-prep crop (was resizing a 526px-wide
   native crop up to 700px before handing it to `build_cards.py`, which
   already does its own scale into the PDF regardless of source pixel
   count) — no visible improvement, so the softness most likely comes
   from the crest's own intentional distressed/worn texture (it was
   extracted from real jersey photos on purpose, see "Jersey crest"
   section above), not a resolution bug. Not chasing further unless
   Brandon flags it as a real problem.

Published on the review page's "Complete card front" section.

### Card art fixes, same day

Brandon: "name is cutoff, arms cut off the figure, edge stripes
misaligned, cards don't look good. Also fonde and basketball logo on
jersey is grey, not white enough." Checked each claim against the
actual render/code rather than assuming — two were real bugs, one was
a real problem with a non-obvious cause, one wasn't a card bug at all:

1. **Crest grey — real bug.** Pixel-sampled the crest region: brightest
   pixels topped out at RGB 236, not 255, despite the source crest
   asset (`fonde_crest_white.png`) being pure 255,255,255. Root cause:
   `modal_app_jersey.py`'s crest compositing applied a 92%-opacity
   alpha blend (`alpha.point(lambda p: int(p * 0.92))`) before
   pasting it onto the jersey. Removed the blend, redeployed
   `scoot34-jersey-test`, re-composited both subjects — brightest
   pixels now ~254.
2. **Arms cut off — real bug.** The art-prep crop (rembg cutout → crop
   to the card's 0.7 portrait aspect) measured 526px wide, but the
   figures' actual shoulder/arm span measured 542px (Brandon) and 610px
   (Cleo) — the crop was slicing through both biceps. Fixed by padding
   the canvas 120px at the bottom before cropping (that padding sits
   exactly where the nameplate bar covers the bottom ~14% of the art
   slot per spec, so it's invisible in the final card) — that extra
   height budget allows a wider width crop (610px) at the same aspect
   ratio without touching the arms.
3. **Edge stripes "misaligned" — the chip band was never broken, but the
   complaint was real.** Verified `draw_band()`'s stripe geometry is
   static and identical on every card by re-rendering with a different
   fake serial number and watching the "misaligned" pattern move to a
   different position — proving it wasn't the band. It's
   `draw_manga_bg()`'s screentone wedge: small halftone dots, seeded
   per-serial, deliberately anchored to a bottom corner (per its own
   docstring) — this particular serial's random placement put it close
   enough to the true edge to blur visually into the band's checker
   rhythm. Inset the wedge 16pt from its anchor edge in
   `build_cards.py` so it can no longer crowd the band, regardless of
   the per-serial random placement.
4. **Name cutoff — not a card bug.** Measured the actual PDF text width
   for "Rocket Man" at the nameplate's font/size via
   `pdfmetrics.stringWidth`: 112.8pt, comfortably inside the 168pt art
   slot with room before the tier text. What looked cut off was my own
   earlier zoomed review screenshot (a fixed pixel crop box that didn't
   extend far enough down to capture the full nameplate bar) — not a
   defect in the actual card.

Real source changes committed to `build_cards.py` (wedge inset) and
`modal_app_jersey.py` (crest opacity), not just scratchpad art-prep
tweaks. Published on the review page's "Card art fixes" section.
