# Plan of attack — facial likeness fix

Written 2026-08-18 after `FACIAL_LIKENESS_RESEARCH.md` came back.
Tier 1 (negative), Tier 2 (negative), two pose tests (both negative),
Tier 3/USO (worked in headshot framing, failed on every full-body
variation tried, 5 tests), and **Tier 4/FLUX.1 Kontext (real
breakthrough — likeness + full body + muscular build all worked in one
shot)** all executed 2026-08-19 — see each section below. Current
status: identity + full-body composition both work via Kontext; art
style needs a pass toward more cartoon/less realistic-CG before this is
card-ready.

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
6. **Next, not yet started:** build the compositing step Brandon proposed
   for the jersey, extended to also cover hair — mask the hair and
   jersey regions on the Kontext output, paste in the real hair and the
   correct Fonde jersey color deterministically. Reuse
   `build_cards.py`'s existing `jersey_variant()` pattern (already does
   exactly this for jersey recoloring) rather than building something
   new. Needs a segmentation source for the masks (segformer, reused
   from the SDXL pipeline, or a simpler technique).
7. Once card-ready, decide the licensing question (InsightFace,
   FLUX.1-dev/Kontext non-commercial — three items now) before this
   becomes the deployed default — independent of how good results look.
8. Tier 2's per-subject LoRA and Tier 3's USO path are both
   deprioritized given Tier 4's result — not abandoned, just no longer
   the leading approach.
