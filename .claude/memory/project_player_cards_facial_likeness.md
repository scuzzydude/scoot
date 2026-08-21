---
name: project-player-cards-facial-likeness
description: "Player-card pipeline CONFIRMED at scale (23-person batch, zero failures). ART STYLE PILOT DONE: anime shows a real repeated whitewashing bias (wrong eye colors, lightened skin, dropped accessories) across most subjects tested; comic/graphic-novel held accurate skin+eyes on every subject, recommended. Correction technique (mask+real-photo-reference) proven but needs 2 sequential passes, not 1. Style choice not yet confirmed by Brandon; full 92-gen batch not started."
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-21T13:34:09.998Z
---

Scoot(34) player-card generation (`tools/player-cards/`, Modal + ComfyUI,
SDXL `animagine-xl-4.0`) is deployed and stable — cel-shaded style is
solved and locked. Facial likeness is not: 10 real identity-preservation
combinations (IP-Adapter FaceID, PuLID weight/method sweep, dedicated
face crop, a hand-built face-detailer compositing pass) all plateaued at
"real facial features, not confidently recognizable as the subject,"
plus an 11th (Tier 1, checkpoint swap to Animagine "Zero") — also
negative, see below.

**Why:** researched via Perplexity (2026-08-18) — PuLID/FaceID were
trained with cross-attention layers calibrated against frozen base
SDXL/SDXL-Lightning. Animagine XL 4.0 is a full-parameter finetune far
from that distribution, so the adapters fight the checkpoint. This is a
documented, citable mechanism (PuLID's own paper), not bad luck or bad
tuning.

**Also found:** the InsightFace models underlying the current PuLID/
FaceID pipeline (`buffalo_l`, `antelopev2`, `inswapper_128`) are licensed
non-commercial-research-only — a real constraint on the deployed
pipeline today, independent of the likeness question. Needs a decision
on whether Scoot(34) cards count as commercial use.

**Tier 1 result (2026-08-19): negative.** Swapped checkpoint to Zero,
identical seed/PuLID settings — broke ControlNet pose-following entirely
(figure faced away from camera). Reverted to Opt (main release, already
redeployed and confirmed working). This also settles Tier 2's checkpoint
choice: train the LoRA against Opt, not Zero — LoRA edits UNet weights
directly rather than injecting foreign conditioning, so it doesn't carry
PuLID/FaceID's distribution-mismatch problem and has no reason to
inherit Zero's pose regression.

**Tier 2 (per-subject LoRA) — design started, paused on data
2026-08-19.** Trainer/approach confirmed: HuggingFace diffusers'
`train_dreambooth_lora_sdxl.py`, driven via Modal's own official example
pattern (`modal-labs/modal-examples`,
`06_gpu_and_ml/dreambooth/diffusers_lora_finetune.py` — current version
targets FLUX, adapt to SDXL). `cagliostrolab/animagine-xl-4.0` confirmed
to have full diffusers-format subfolders, so it can be the
`--pretrained_model_name_or_path` directly.

Source photos: the plan assumed 72 video frames at
`~/Nick/work/people/09_BRANDON/` would give enough training data.
Inspection found otherwise — frames past `f_0293` are a different
person ("Donnie"), and nearly the whole Brandon range has a burned-in
"BRANDON" name-card graphic overlapping the face. After filtering, only
6 clean frames survived, collapsing to 2 real distinct moments (same
angle/lighting/shirt throughout — one continuous phone clip) — too thin.
Asked Brandon; he sent 6 more photos via the share drive (mostly group
shots). Pulled his face out of 5 of them (1 dropped — sunglasses
occluded his eyes), deleted the source photos after cropping. **Final
set: 7 images, 7 distinct real moments** — studio flash, window
daylight, warm tungsten night, low-angle selfie, 2 video frames — real
variation in lighting/angle/outfit now, still thin vs. the 10-20
community norm but no longer degenerate. Staged in
`tools/player-cards/art/lora_training/brandon/` (gitignored, not
committed — personal photos; see that folder's README.txt for the exact
inventory).

**Trained and tested, 2026-08-19: result negative.** `train_lora.py`
(new Modal app, diffusers' `train_dreambooth_lora_sdxl.py` via Modal's
own official dreambooth example pattern) ran clean — 500 steps, rank 16,
against Opt (not Zero), ~24.5 min, loss 0.0306, no errors. First deploy
attempt pinned diffusers main HEAD and hit a real pip conflict
(0.40.0.dev0 needs huggingface-hub>=1.23, transformers 4.x caps it
<1.0) — repinned to the stable v0.39.0 tag, resolved clean.

Wired into `modal_app.py` as an opt-in `lora_test` flag on `generate()`
(swaps PuLID for `LoraLoaderModelOnly` on the same style branch, so only
the identity mechanism changes). Ran the identical `34-TEST-BRANDON-v6`
conditions. Logs confirm the LoRA substantially loaded (1113/1120 keys
matched). **Result: no legible eyes/nose/mouth structure at all —
blanker than the PuLID baseline, no Brandon-recognizable signal.** Real
negative result, not a bug.

**Pose isolation test, 2026-08-19: negative, and surprising.** Tested
the confound above directly — swapped to a level, camera-facing source
photo (`f_0287.jpg`, same video), same PuLID settings/seed/style ref as
v6, only the pose input changed. Result: **worse**, not better — the
figure's head turned almost entirely away from camera, no face visible
at all, same structural failure as Tier 1's checkpoint swap but with
the checkpoint unchanged this time. This *weakens* the pose-confound
theory rather than confirming it: a cleaner source photo produced a
less camera-facing result, suggesting the pose ControlNet itself may be
unreliable at pinning head orientation for this composition (OpenPose's
skeleton only coarsely encodes head yaw/pitch), independent of which
photo drives it, or its fixed strength (0.6) is too weak to override
the checkpoint's own pull toward three-quarter/looking-away angles.

**Pose ControlNet strength test, 2026-08-19: also negative, worse.**
Directly tested whether 0.6 was just too weak — pushed to 1.0, same
setup. Result: not just the face, the *entire image* collapsed into a
dark muddy mass with no cel-shading or lineart at all. Same
over-strength coherence-collapse pattern as FaceID/PuLID weight bumps
earlier in the project (1.0→1.8, 1.0→1.6) — pushing any single
conditioning input hard on this checkpoint/composition breaks the whole
render, not just the targeted thing. Rules out "just too weak."

**14 real combinations tried, all negative — then Tier 3 (USO on FLUX)
broke through, same day.** Built `tools/player-cards/modal_app_uso.py`
(separate from `modal_app.py`, zero shared risk). USO conditions
identity via a VAE-encoded reference latent, not ControlNet pose/
lineart -- sidesteps the pose-reliability problem entirely. Node graph
reverse-engineered from ComfyUI's own official reference workflow
template (fetched directly, every class_type/input verified against
ComfyUI source, not guessed). USO's nodes were already in the pinned
ComfyUI commit (merged core 2025-09-02) -- no version bump, no
third-party custom nodes needed at all.

**Result: first legible, recognizable face in 15 total attempts.**
Real eyes/nose/mouth, genuinely reads as Brandon. Not yet card-ready --
headshot crop not full-body, style leans "smooth CG render" not
cartoon -- but this is tuning on a working mechanism now, not a search.

**Style direction also pivoted same session:** Brandon tried Meta AI's
cartoonifier on his photo and preferred its 3D-Pixar-style result over
this project's locked flat 2D cel-shaded anime look. That image (cropped
from the comparison screenshot) is now the style reference for Tier 3
testing -- a real, deliberate style change for the edition, not fully
resolved yet (need to confirm this is the final direction and re-derive
a proper full-body-capable style reference).

**New licensing flag:** flux1-dev-fp8 is FLUX.1[dev]'s Non-Commercial
License -- same class of open question as InsightFace's, now two items
to resolve before production use, tracked at the top of
PLAN_facial_likeness.md.

Full writeup + images: PLAN_facial_likeness.md's Tier 3 section and the
review page, now hosted at **https://fairchildlabs.org/likeness-review/**
(plain HTTP on fairchildlabs.org's `/var/www/html/`, same convention as
the existing `nick-review/` roster page there) -- moved off the Claude
Artifact per Brandon's request 2026-08-19, "whatever is better and
easier." Source: `build_review.py` +
`review_images*.py` in this session's scratchpad; republish by copying
the built `review.html` to `/var/www/html/likeness-review/index.html`
(sudo chown www-data:www-data after).

**Follow-up tuning, same day: THREE tests pushing full-body all lost
identity identically.** v2 (doubled style pass), v3 (single pass,
softer prompt), v4 (genuine waist-up subject photo instead of
headshot) -- each varied a different lever, each produced the same
generic-child-character failure with zero likeness. This rules out the
style-pass, the prompt wording, AND the subject-photo-framing theories
individually. What's constant across all three failures and absent
from the one working test: asking for a full head-to-toe composition
at all.

**Working hypothesis, now well-evidenced across 3 independent probes:**
identity signal ties to how much of the OUTPUT frame the face occupies,
not to any specific setting or input. Matches the SDXL/PuLID work's
identical theory earlier in this project (same "face is a small
fraction of the composition, signal diluted" pattern), now showing up
on a completely different mechanism too -- suggests this may be a
general property of identity-conditioning methods on this class of
model, not a bug specific to either pipeline.

**v5 also negative:** waist-up/chest-up framing instead of full
head-to-toe (the "next step" above) -- also lost identity completely,
same as v2-v4. This falsifies the frame-share theory itself, not just
specific levers under it. 5 USO tests total: 1 success (headshot), 4
failures (every framing/prompt/photo variation), none isolate cleanly.
Stopped chasing USO parameters at this point.

**TIER 4 BREAKTHROUGH, same day: FLUX.1 Kontext.** Brandon's question
after watching USO fail 5 times: "How was Meta able to do this so
quickly? Can't we use a HuggingFace model geared for exactly this kind
of work?" -- the real answer is architectural: Meta's cartoonifier is
an IMAGE-EDITING model (denoise from the actual photo's own latent,
trained end-to-end for "preserve everything except what's asked"), not
generate-from-scratch-with-conditioning like USO. FLUX.1 Kontext is the
open equivalent, same FLUX lineage, already using the same ComfyUI
toolchain.

Built `tools/player-cards/modal_app_kontext.py` (3rd separate app, zero
shared risk with the other two). Graph reverse-engineered from
ComfyUI's own reference workflow the same rigorous way as USO's was.
Also corrected the jersey prompt to use REAL Fonde colors from
`arch/player-cards.md` (dark charcoal/black or cream, no numbers, no
crest) instead of the orange/blue placeholder every earlier test used.

**Result, first attempt: genuine likeness, full body, AND the requested
muscular superhero style, all in one shot.** Dramatically more
recognizable than anything USO produced. Leans more "realistic CG
render" than the exaggerated cartoon look Brandon wants (Meta's
Response 2), not yet fully styled, but the actual hard problem --
identity surviving full-body -- is solved. This is style tuning now,
not a mechanism search. **Caution for next tuning pass:** USO's
identity broke the one time style was pushed hard on multiple fronts
at once (v2) -- change one variable at a time this round.

Review page moved off Claude Artifacts to
**https://fairchildlabs.org/likeness-review/** (plain HTTP, Brandon's
preference -- see [[feedback_prefer_server_hosting]]).

**Tuning round 2, same day, per Brandon's direct feedback** ("more
cartoony on the face, too much muscle... needs to be waist up, you have
the crotch in the sample"): v2 fixed framing (explicit "waist-up,
cropped above the waist") and muscle (toned down language) cleanly --
no identity regression. Face still photoreal though, and jersey
drifted to a generic cape/collar. v3 pushed face-cartoon language much
harder (flat cel-shaded skin, simplified eyes/nose/mouth, explicitly
"NOT photorealistic") and recovered the jersey specificity -- real
cartoon face achieved, correct jersey, framing/muscle held. Identity
reads a bit softer than v1's more photoreal face, an expected tradeoff,
not yet resolved which is "right" -- Brandon's call.

**Notable: Kontext did not exhibit USO's fragility.** Every USO tuning
attempt that pushed style harder broke identity outright. None of
Kontext's prompt-only tuning changes did -- suggests the edit-model
mechanism is substantially more robust to style pressure, not just
better at the baseline task.

**Real cost, measured not estimated:** ComfyUI's own log reported
77.82s for one generation (55s of that the actual 20-step sampler).
At Modal's published A10G rate: **~$0.02-0.03/card, ~$0.81 for the
full 34-member roster** in one batch run. No per-subject training --
the real economic advantage over Tier 2's LoRA approach ($170-300 for
the roster before any generation).

**Hair regression found, 3 prompt fixes all failed.** Brandon's read on
v3: "right idea," but caught that his hair (correct short/buzzed in
v1/v2) drifted to a longer styled look once the cartoon-face push
landed. v4 (explicit preserve instruction), v5 (hair described first +
explicit negatives), v6 (simplified wording + guidance lowered
2.5→1.8 to favor the photo over text) all produced the SAME wrong
hairstyle. Rules out under-specification -- persistent model bias
toward a "styled protagonist" archetype under cartoon-style pressure,
not fixable via prompting.

**Conclusion, validates Brandon's own proposal for the jersey:** needs
pixel-level compositing (mask the region, paste real content back in),
not more prompting -- exactly what `build_cards.py`'s existing
`jersey_variant()` already does for jersey color.

**Hair fix built and confirmed working, same day.** Brandon clarified
the spec: cartoon-style rendering matching his REAL HAIR SHAPE via a
mask, not literal photo-hair pixels pasted in. Built two mechanisms in
`modal_app_kontext.py`:
1. `inpaint_region()` -- standard ComfyUI `SetLatentNoiseMask`
   inpainting on a face-detected, feathered hair-region mask, text
   prompt only. **Confirmed the mask itself works perfectly** (face/
   jersey/everything outside came back pixel-identical) but hair inside
   the mask was STILL wrong -- 4th straight failure, conclusively
   ruling out "not following instructions."
2. `inpaint_with_reference()` -- same mask, PLUS a real photo crop of
   the correct hair (from v2) fed through `ReferenceLatent` (same node
   Kontext's edit instruction uses, pointed at an image instead of
   text). **Fixed immediately, first attempt.** Real lesson: this model
   needs to be shown correct content for something this specific, not
   told about it in words.

**Jersey compositing, built and FINISHED same day.** First pass reused
`jersey_variant()`'s exact recolor logic (luminance-preserving blend to
brand hex values) on a hand-tuned color-threshold mask -- proved the
recolor mechanism (exact Fonde hex values, shading preserved) but left
a visible seam near the collar. Second pass: new standalone CPU-only
app `modal_app_jersey.py`, real `segformer_b2_clothes` segmentation
(same pinned model as the SDXL pipeline, run via `transformers`
directly rather than ComfyUI's node wrapper). Class 4 ("Upper-clothes")
is the jersey region. Mask cleanup took 3 real diagnostic iterations --
a fixed morphological close shrank but didn't fix a defect near the
armhole; a flood-fill hole-check left it untouched, which proved it was
a channel connected to the background, not a sealed hole; a stronger
close (51x51) to physically bridge the channel, kept alongside the
flood-fill check as a safety net, got it down to a tiny residual patch.

**Status: pipeline is feature-complete for a single subject.**
Likeness, full-body framing, cartoon art style, correct hair, and
brand-accurate jersey all confirmed working end to end, across 3
separate Modal apps (`modal_app_kontext.py` generation + hair inpaint,
`modal_app_jersey.py` jersey composite). Not yet wired into one
pipeline call, and not yet tried on any roster member besides Brandon
-- natural next step whenever this resumes, along with the licensing
decision (3 non-commercial-license items now: InsightFace, FLUX.1-dev,
FLUX.1-Kontext-dev).

**Jersey crest, added same day: real Fonde branding, not AI text.**
Brandon provided real jersey photos -- getting the COLOR right wasn't
the whole spec, the actual crest ("FONDE REC CENTER SENIOR BASKETBALL"
+ basketball graphic + stars) needed to be on it. Extracted it
deterministically (not via AI reference-matching) since it's real text
that has to stay legible and correctly spelled -- diffusion models are
unreliable at precise text rendering. Isolated the white ink from the
jersey photo's mesh fabric texture (blur-before-threshold + morphological
open/close), uploaded as a reusable asset
(`media/card-art/assets/fonde_crest_white.png`), composited via a new
`add_crest` step in `composite_jersey()` with position/scale derived
from the segmentation mask's own bounding box (generalizes across
subjects, not hand-placed). Confirmed the generalized pipeline result
matches manual tuning closely. **This really is the final piece** --
crisp, correctly-spelled, brand-accurate crest on a card that also
nails likeness, body, style, and hair.

**Jersey polish, added 2026-08-20: neck-bleed fixed, real mesh texture
added.** Brandon caught two remaining flaws in the crest result: it
bled into his neck skin above the collar, and the jersey looked flat
next to the real garment's visible weave. Root cause of the bleed: the
crest's top margin was measured from the mask's GLOBAL topmost pixel
(shoulder/strap peak), not the V-neck collar depth where the crest
actually sits -- fixed by measuring `neck_y` from a narrow band at the
horizontal center column instead, plus a bumped margin ratio
(0.13→0.18) as a buffer. Texture: extracted a real fabric swatch from
`fonde_jersey_black.jpg`, built a normalized grayscale multiplier map
(128=1.0x, clamped 0.65-1.45x, `media/card-art/assets/mesh_texture_mult.png`),
tiled and multiplied onto the already-recolored jersey pixels (not a
color paste) so exact brand hex + AI shading + weave texture all
survive together. Confirmed via a real generation run. Committed
`cdc8aa5`. Full diagnostic writeup: PLAN_facial_likeness.md's "Jersey,
take 4" section.

**New standing behavioral rule from this thread:** when Brandon hands
off files via the `/var/www/shared/` WebDAV share, archive them to
cold storage (`azarchive:archive/var-www/shared/<date>/`) once used
rather than leaving them on the live share -- see
[[feedback_archive_share_after_use]].

**Crest centering fixed + FIRST SECOND-SUBJECT TEST, 2026-08-20.**
Brandon: vertical crest position was right, horizontal wasn't centered.
Root cause was the same class of bug as the neck-bleed fix -- measuring
an x-extent (bbox, then a top band) gets pulled off-center on a
3/4-turned, flexed pose since the near/foreshortened shoulder reads
wider. Fixed by detecting the collar's actual V-notch (per-column top
profile, deepest dip in the central 50% of width) instead of measuring
any extent -- that point is the true chest centerline by garment
construction, pose-independent. Confirmed centered on a real run,
committed `9b16a7b`.

Then ran the full pipeline (generation, hair fix, jersey composite) on
a roster member besides Brandon for the first time, per Brandon's
direct request: Cleo (`01_CLEO/f_0008.jpg`, gray hair/mustache).
**Framing, cartoon style, and jersey base color all generalized
correctly on the first attempt.** Two real bugs surfaced and were
fixed, not silently ignored:
1. Hair rendered black instead of Cleo's real gray/white -- same class
   of model bias as Brandon's earlier hair-SHAPE regression, this time
   on color. Fixed with the identical mechanism already built for
   Brandon (masked region + `ReferenceLatent` on a real photo crop).
   Verified via pixel diff that only the masked region changed (2.4
   mean diff outside the mask vs. 24.6 inside).
2. Segformer classified Cleo's sleeveless tank as "Dress" (class 7),
   not "Upper-clothes" (class 4) -- a debug class-histogram (new
   `debug` flag on `composite_jersey()`) showed only 837/1,046,784
   pixels landed in class 4. Brandon's own mask was clean class-4-only,
   so this is real classifier inconsistency across photos for this
   garment style, not a bug in the earlier pass. Fixed by unioning both
   candidate classes instead of assuming one.

**Status: pipeline confirmed working end to end on two independent
subjects now**, with two real generalization bugs found and fixed by
actually testing on a second subject. Natural next roster members to
try if this continues: anyone with notably different hair color/style
or build than Brandon or Cleo, to keep surfacing this class of bug
early. Full diagnostic writeup: PLAN_facial_likeness.md's "Jersey, take
5" and "Second subject -- Cleo" sections.

**VM crash + recovery, 2026-08-20.** Host-level restart (external
power/Azure event, not in-guest — journal for the prior boot just stops
cold with no shutdown/OOM/panic message, matching the exact timestamp
our session's last tool call was cut off) wiped `/tmp` (session
scratchpad) and the system-level `modal`/`rembg`/`pillow`/`reportlab`
pip packages, but NOT the Azure blob storage outputs, Modal app
deployments/auth, or the `~/Nick/work/venv` venv that had these same
packages installed separately — recovered by reinstalling system-wide
via `pip3 install --break-system-packages` and reading the crashed
session's own transcript JSONL (`~/.claude/projects/-home-brandon-scoot/<session-id>.jsonl`)
to reconstruct exactly where work left off, including exact blob paths
for in-flight outputs. Added `~/.local/bin` to PATH in `.bashrc`.
**No swap configured on this VM (Standard_B2s, 2 vCPU/4GB) and disk at
79% used** — not the cause this time, but a real risk for future
crashes given occasional heavy local pip installs (onnxruntime etc.);
worth adding swap.

**Head-size bug, real root cause found 2026-08-20 (supersedes the
"source photo framing" theory above).** Brandon's report after the
crash-interrupted reframe attempt: "my head is big, the centering is
good" — this was based on the *stale* published review page, not the
reframed result. Measuring head-width/shoulder-width on the reframed
Brandon vs. Cleo cutouts came back nearly identical (0.44 vs 0.45) —
ruling that out as the metric. Brandon's own suggested diagnostic
(use where Cleo's crest text "SENIOR BASKETBALL" gets cut off at the
frame's bottom edge as a shared reference line) found the real signal:
Brandon's card cut off a full line earlier than Cleo's, meaning his
whole figure was scaled larger within the same canvas — invisible to
a head:shoulder ratio check since that's scale-invariant.

Tested padding the source photo 20% (explicit zoom-out cue) — **no
visible effect**, showing Kontext's own "waist-up, cropped just above
the waist" prompt instruction dominates over input framing/scale cues,
contradicting the earlier "Kontext anchors on input's own composition"
theory, at least for this prompt template. Diffed the two generation
calls directly instead: Brandon's reframe run used a different seed
(552013) than Cleo's (552011) and an extra "keep natural head-to-
shoulder proportions" sentence Cleo's winning prompt never had.
**Matching Brandon's call to Cleo's exact seed + prompt text (same
waist-up source photo, otherwise unchanged) reproduced her framing
almost exactly** — headroom and the crest cutoff line now match.
Confirmed and published as a new section on the review page.

**Real finding for the full 34-member roster:** seed measurably affects
output *scale/framing*, not just stochastic content details, on this
model/prompt combination. Before generating the full roster, lock a
single seed (or a small tested seed set) as the default rather than
letting each subject pick its own — otherwise this exact framing-drift
bug will recur per subject at scale. Not yet decided/implemented.

**Expression as a controllable knob, 2026-08-20.** Brandon's read after
the framing fix: size is right, but both faces are "goofy" — the same
wide-eyed, open-mouth surprised-joy look regardless of the source
photo's actual (neutral, mid-sentence) expression. Confirmed this is a
real, controllable parameter, not baked into the seed/checkpoint:
replaced the old "preserve the same expression" prompt line with an
explicit directive (same locked seed 552011, same source photo) and
got three genuinely distinct results. **BADASS** (confident, subtle
smirk, focused eyes) and **MEAN** (furrowed brow, stern) landed clean
on the first attempt for both Brandon and Cleo. **CHARMING** did not —
still reads too close to the goofy default; the "warm smile" language
doesn't push far enough from the model's default grin/wide-eyes bias.
**Brandon's pick: BADASS.**

**Real bug found applying this to Cleo: hair/mustache regression is
per-generation, not a one-time fix.** Reusing the locked seed with a
modified prompt reintroduced the earlier hair-color regression (gray
hair rendering black) on Cleo — expected, since it's a fresh generation
from scratch. Less expected: **his mustache disappeared entirely**,
something the original hair-only masked fix never had to handle (its
mask only covers the top-of-head hair region). Built a second mask
region for the mustache and pointed both regions at one reference crop
from Cleo's already-correct final card — fixed cleanly, first attempt,
for all three expression variants. **Implication for the roster:** any
change to the generation prompt (expression, style, anything) likely
needs this same hair(+facial hair) touch-up pass re-applied per
subject — it does not carry over automatically from a prior fix. Full
8-card spread (DEFAULT/BADASS/MEAN/CHARMING × Brandon/Cleo) published
on the review page.

**First complete card FRONT assembled, 2026-08-20** — through the real
`build_cards.py` template (chip band, manga speed lines, tier accent,
nameplate, glyph disc), not just a bare portrait. Took the BADASS art
(fixed seed/framing, correct hair/mustache, real crest) through rembg
alpha cutout → crop to the art slot's 0.7 aspect ratio centered on the
figure → `{serial}_figure.png` + `{serial}_jersey_mask.png` in a local
art dir → CSV row → PDF → `pdftoppm` to PNG for review. Brandon's
handle set to "Rocket Man" (his choice); everyone else keeps their real
name/nickname from the roster. All other fields (tier, position, stats,
profile lines) still placeholder — this pass is art-only, data deferred
per Brandon's explicit call ("let's work on art, just card with filler
data").

Two things flagged, not yet resolved: **Starter tier's accent stripe is
invisible against white card stock** (matches spec's "bare token white"
by design, but worth confirming Brandon wants that for his own card);
and the **crest reads slightly softer at full card resolution** than in
the standalone portrait — tested removing an unnecessary intermediate
PIL upscale in the art-prep crop, no visible change, so this is most
likely the crest's own intentional distressed/worn texture (matches the
real jersey photos it was extracted from), not a resolution bug.
Published on the review page's "Complete card front" section.

**Card art fixes, same day** — Brandon's blunt read on the first
assembled front: "name is cutoff, arms cut off the figure, edge stripes
misaligned, cards don't look good. Also fonde and basketball logo on
jersey is grey, not white enough." Checked each claim individually
rather than guessing:
1. **Crest grey — real bug, fixed.** Direct pixel sampling found the
   crest's brightest pixels topped out at RGB 236, not 255, even though
   the source crest asset itself is pure white — traced to a 92%-opacity
   alpha blend in `modal_app_jersey.py`'s crest compositing step.
   Removed it, redeployed, brightest pixels now ~254.
2. **Arms cut off — real bug, fixed.** The art-prep crop width was
   narrower than the figure's actual shoulder/arm span (542-610px vs a
   526px crop), slicing through both biceps. Fixed by padding the
   canvas at the bottom (hidden under the nameplate bar, which already
   covers the bottom ~14% of the art slot per spec) to earn a wider
   crop at the same 0.7 portrait aspect without touching the arms.
3. **Edge stripes "misaligned" — the chip band itself was never broken.**
   Confirmed by re-rendering with a different fake serial and watching
   the "misaligned" pattern move — it's `draw_manga_bg()`'s
   serial-seeded screentone wedge (small halftone dots, intentionally
   anchored to a bottom corner) landing close enough to the true edge
   to blur visually into the band's checker rhythm. Real readability
   problem even though not a band bug — inset the wedge 16pt from its
   anchor edge in `build_cards.py` so it no longer crowds the band.
4. **Name cutoff — not a card bug at all.** Measured actual PDF text
   width for "Rocket Man" (112.8pt) against the 168pt art slot — comfortable
   margin. What looked cut off was my own earlier zoomed review
   screenshot, which had cropped the bottom of the nameplate bar out of
   frame, not a defect in the actual card.

Published on the review page's "Card art fixes" section. Real source
changes committed to `build_cards.py` (wedge inset) and
`modal_app_jersey.py` (crest opacity) — not just art-prep script tweaks
in scratchpad.

**Second crest-greying bug found and fixed, same day.** Brandon, after
the first fix: "the last cards still had the fonde logo greyed too
much." Pixel-sampled the ACTUAL final PDF-rendered card (not just the
Modal-side composite I'd already fixed) and found the crest still
dimmed there specifically. Root cause: `build_cards.py`'s own
`jersey_variant()` runs a SECOND, independent recolor pass — a
luminance-based blend across the whole jersey mask, originally written
for the spec's "blank AI jersey, recolor everything" design, before the
crest got baked into the source art. It has no concept of "this bright
region is real branding, not fabric shading" — it just remaps every
luminance level in the masked region toward the base/shade tones,
which took the crest's true-white pixels (correct at the Modal stage)
and pulled them down to `JERSEY["dark"][0]` (#2E2E2A, ~46 not 255).
Confirmed via direct pixel sampling at each pipeline stage: white in
`{serial}_figure.png` (the Modal output), grey in
`.variants/{serial}_dark.png` (build_cards.py's own cache). Fixed by
skipping the recolor entirely for `side == "dark"`, since the art
pipeline already delivers brand-correct color there — only `"light"`
(the back-of-card reverse jersey, not yet built) still needs it.

**First full-roster batch, same day — 23 fronts, zero failures.**
Brandon: "give me sample cards (front) for all the remaining players
you have photos for." Built a quick local contact sheet (middle frame
per person) from the already-local `~/Nick/work/people/` folders (all
22 people's source frames were local, no cold-storage restore needed)
to pick a usable photo per person, manually upgrading 4 picks whose
default middle-frame was unusable (04_EDUB — no waist-up frame exists
in that clip at all, picked the least-bad closeup and let the
now-locked seed handle scale as it did for Brandon originally;
09b_DONNIE and 10_BO — picked frames facing camera instead of
mid-action/distant; 17_FRANK — only 3 source frames total, picked the
one where he's actually looking at the camera). Ran all 21 through one
batched Modal script (upload → Kontext BADASS generation, locked seed
552011 → jersey composite) sequentially in the background, then a
second batch pass for rembg cutout + the arm-safe padded crop. **Zero
failures across 21 generations.** Result generalized well: distinct
likenesses, personal details preserved correctly from source photos
(E-Dub's du-rag, Kiwi's backwards cap, Rick's cap, McGhee's beard/
hairline), good variety of skin tones and ages, crest reads true white
on every card (validates both crest fixes above at scale). Two isolated
issues flagged, not fixed: Chef's raised-hand-near-chin source pose
confused the framing (tighter crop, jersey/crest mostly hidden behind
his own arm); Anthony's eyes rendered an unusually pale/light color.
Neither looks pipeline-wide — both isolated to their own source photo.
Handles are placeholder nicknames guessed from the footage's own
name-card overlays, not real roster data. Published as "Full roster
sample" on the review page.

**Where to pick this up:**
- `tools/player-cards/FACIAL_LIKENESS_RESEARCH.md` — full research,
  sourced, with an explicit evidence-gaps section.
- `tools/player-cards/PLAN_facial_likeness.md` — prioritized plan, now
  has Tier 1's result and Tier 2's paused status inline.
  Tier 3 (bigger, only if Tier 2 is unacceptable): USO on FLUX.
- See [[scoot_currency_ledger]] and [[project_plan]] for where this sits
  relative to the main Phase 5 ledger work — player-cards is a parallel
  track, not blocking Phase 5b.

**Art style under real reconsideration, 2026-08-21.** Brandon's read on
the full 23-person roster sample: "most of the men featured are black
men and that style 'white-washes' it a bit" — the locked Pixar/
DreamWorks 3D style (chosen a session earlier, comparing against Meta
AI's cartoonifier) tends to round and soften every subject toward the
same generic "cute movie mascot" look, which reads as a real flattening
effect on Black subjects specifically, not just an aesthetic quibble.

Tested 3 alternatives against the Pixar default: same subject ("Black"),
same source photo, same locked seed (552011), only the style language
changed, plus an explicit "preserve accurate skin tone, do not lighten
or wash out" instruction added to all three (not present in the Pixar
default prompt — worth adding there too regardless of which style wins).
**Anime** (flat cel-shaded, bold ink outlines) and **comic/graphic-novel**
(dramatic ink shading, realistic stylized proportions) both read as
sharper, more specific to the actual person, and kept true skin tone.
**Classic comic book** (halftone Ben-Day dots, primary colors, heroic
proportions) also read well but ignored the "simple plain background"
instruction (kept a stylized dotted background instead — not a problem
for the pipeline since rembg strips backgrounds regardless).
**No style has been chosen yet — Brandon is reviewing the comparison.**
Published on the review page's "Style test" section. If a new style is
picked, the entire roster (this pass's 23 subjects, all now BADASS/
locked-seed) will need regenerating, and both the hair/mustache fix
mechanism and the crest-compositing step should still work unchanged
since they operate on the composited jersey mask, not the base style.

**4-person pilot + style verdict, 2026-08-21.** Brandon: "let's do the
full roster, all 4 styles, but add something that rechecks with the
original photo for facial resemblance and tries to vector in." Piloted
on Rufus, McGhee, Kiwi, Rodney before committing to the full
23x4=92-generation batch.

Built an automated reference-crop tool for the correction step: OpenCV
Haar cascade face detection on the local source photos (had to hand-
install the cascade XML -- the venv's opencv-python build shipped
without `cv2.data.haarcascades` populated; needed OpenCV 4.x pinned too,
since 5.0.0 doesn't expose `CascadeClassifier` at all in this build).
Worked automatically for 3/4 pilot subjects; failed on McGhee (false-
positived on his own name-card text graphic instead of his face) --
confirms per-subject visual spot-checking of any auto-crop is still
required, not fully trustworthy standalone.

**Correction mechanism confirmed to work, but is NOT one-shot.** Rufus's
anime version didn't just get his hair wrong -- his real dark brown
skin and dark eyes came out lightened with BLUE eyes. A single combined
mask+reference correction pass (skin+eyes+hair together) fixed skin and
eyes cleanly but left hair wrong; a second, hair-only pass on top
finished the job. Two targeted sequential passes, same technique both
times, not one broad pass.

**Bigger finding: the drift is style-dependent and repeats across
subjects, not random.** Checked all 4 pilot subjects x 3 alternative
styles:
- **ANIME: real, repeated whitewashing pattern.** Rufus got blue eyes +
  lightened skin. Kiwi got purple eyes. McGhee got lighter skin AND
  lost his glasses and beard entirely. 3 of 4 subjects affected, not a
  one-off.
- **COMIC/GRAPHIC NOVEL: held accurate skin tone and eye color on
  EVERY pilot subject, zero exceptions.** Only recurring issue was hair
  STATE (wrong style/color, e.g. Rufus still had hair instead of bald)
  -- not skin or eye color drift. The proven hair-only correction pass
  handles this reliably.
- **CLASSIC COMIC: least predictable.** Nailed Rufus perfectly (bald,
  correct skin tone, no correction needed) but rendered McGhee as an
  unrecognizable different person entirely -- no cap, no beard, no
  glasses, wrong build.

**Recommendation given to Brandon: COMIC/GRAPHIC NOVEL style for the
full roster.** Lightest correction burden (hair-state only, not full
skin/eye correction), most consistent across subjects tested so far.
Decision on which style to commit to for the full 92-generation batch
is Brandon's -- not yet confirmed. Published as "4-person pilot" on the
review page.

**Review page is now ~37MB** (embedded base64 images accumulating
across many sections this session) -- still serves fine over plain
HTTP but worth flagging if it keeps growing; may want to prune older
superseded sections or split into multiple pages eventually.
