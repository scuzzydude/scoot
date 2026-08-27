---
name: project-player-cards-facial-likeness
description: "Player-card pipeline: 25 roster people total, 24 have a clean noir render via PuLID-FLUX+Kontext (modal_app_kontext_pulid.py), 1 (Chef) has an unresolved closed-eyes issue. Full lineup + fixes on likeness-review-2. Key gotchas: ALWAYS say 'he is Black with dark brown skin' explicitly (generic 'preserve ethnicity' keeps failing -- recurred 3x); tight face-crop identity photos beat wide/distant ones for PuLID resemblance; check source photo folders for burned-in captions before using as subject."
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-27T18:06:58.850Z
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

**Review page is now ~42MB** (embedded base64 images accumulating
across many sections this session) -- still serves fine over plain
HTTP but worth flagging if it keeps growing; may want to prune older
superseded sections or split into multiple pages eventually.

**Style decided + full 23-person COMIC/GRAPHIC roster shipped,
2026-08-22.** Brandon: "Go with comic/graphic for the full roster."
Regenerated all 23 (same locked seed/framing/expression, only style
language changed) and found two real bugs running the WHOLE roster
that neither the pilot (4 people) nor the single-subject tests caught:

1. **4 cards rendered black-and-white instead of full color** (Chef,
   John, Sheldon, Shipp) — Shipp's was worse, keeping the full busy
   background and "SHIPP" name-card text baked in instead of a clean
   portrait. Fixed by regenerating those four with an explicit "FULL
   COLOR... remove all scenery/people/text" prompt + fresh seed.
2. **Segformer's jersey mask bled into the head/neck region for 16 of
   23 subjects** (up to 66% of head-region pixels, Cleo worst) — the
   mesh-texture darkening step then applied there too, reading as a
   muddy half-face shadow. **Real fix committed** (`bc63da7`) to
   `modal_app_jersey.py`: clip the garment mask to below the collar's
   V-notch — reusing the exact neckline-detection method already
   proven for crest placement — before recolor/texture ever runs.
   Fixed 15 of 16 outright; Cleo's segmentation was a genuine outlier
   (spilling across a huge swath of background, not just his head),
   got a manually-built mask instead of fighting the detector further.

**Lesson for future style/prompt changes:** pilot-testing on a handful
of subjects is necessary but not sufficient — both bugs above only
showed up once the FULL roster ran, because they were per-subject-photo
failure modes (busy background, unusual pose) with a low individual
hit rate but a high aggregate one. Budget a full-roster verification
pass after any pilot, not just a bigger pilot.

Published as "Full roster in COMIC/GRAPHIC style" on the review page.
Handles are still placeholder nicknames; card data (tier/position/
stats) untouched. Brandon separately asked BigMo to check
thedreamlaboratory.org mail periodically — see [[bigmo_mail_poller]],
unrelated to this track, built the same session.

**Workflow pivot + 2 more real bugs found, 2026-08-23.** Brandon's read
on the shipped comic/graphic roster: ~50% likeness accuracy, some way
off; front/black-jersey card confirmed (shoulder+chest), BACK card
will reuse the SAME face with the light/white jersey recolor (already
supported — `composite_jersey(side="light")` exists, no new generation
needed) but cropped tighter to a headshot. Two more real bugs, found
by his own eye, not caught by the earlier fixes:

1. **Crest still mis-sized/placed on most cards.** Root cause: my
   previous fix (session before) only clipped the mask used for
   *recoloring* — crest position/size is computed from a *different*
   variable (`garment`) that was never touched, still built from
   segformer's raw, contaminated classification. Confirmed via Rick's
   card: crest bounding box was inflated by misclassified head pixels.
2. **Skin below the shoulders reads "shadowed dark"** on every subject
   except Rocket Man and Cleo (both had clean masks already, by
   coincidence/manual fix). Same root cause as #1, just a different
   symptom — the contaminated mask likely bleeds into arms too, not
   just the head.

**Real fix this time (committed `98e093c`):** instead of patching
mask geometry again, fixed at the source — intersect segformer's
classification with actual pixel darkness (the jersey is always
rendered "solid dark charcoal-black," real jersey pixels are reliably
darker than any skin tone). This cleans the mask BEFORE the
morphological cleanup step that both the recolor path and the crest
`garment` variable derive from, so one fix corrects both bugs instead
of two separate patches. Verified on Rick: crest and shoulders both
clean now. Cleo remains a standing exception — his segformer output
bleeds into background, not skin, unrelated failure mode; keeps using
his manually-built mask (already proven, `cleo_manual_final.png`
pattern) rather than chasing segformer further for him specifically.

**Age skew — real gap, fixed.** Brandon: everyone's reading too young;
these are 55+ men and the treatment should be "superhero grandpa," not
obscuring age. The prompt never mentioned age at all before. Added
explicit language (natural gray hair, lined/weathered face, "NOT a
young athlete," don't de-age) plus constrained the chiaroscuro dramatic
shading to the face only (was likely also contributing to the
shadowed-arms complaint independent of the mask bug). Confirmed
working on the first test batch — all 7 read as clearly older men now.

**Major workflow decision: likeness-first, card-later.** Brandon asked
directly which order is better given the plan to iterate with users
over SMS text. Recommended and confirmed: generate the styled bust
ALONE (no jersey compositing, no crest, no card frame) as a fast, cheap
review artifact (~$0.02-0.03, ~90s, one Modal call) that the user
approves/iterates on directly over SMS; only once locked does the
existing jersey+crest+card-layout pipeline run, once, without further
back-and-forth. Rationale: iteration speed (jersey/crest/PDF steps add
real minutes and more failure surface per round), and separation of
concerns (facial likeness is the individual member's call; jersey
color/crest/tier/layout are Scoot-level decisions, not something each
member should need to review). This matches the existing
`MODAL_BUILD_SPEC.md` async spawn/poll pattern already documented for
BigMo's SMS path, built specifically because generation is too slow
for a synchronous SMS reply.

**Batching + new review page.** Brandon: work in batches of ~6-7 "like
independent conversations" (simulating the future per-user SMS
back-and-forth at small scale before wiring real SMS), one consolidated
webpage per round rather than per-person pages. Started a fresh page,
**`/var/www/html/likeness-review-2/`** (`fairchildlabs.org/likeness-
review-2/`) — the original `likeness-review/` page (~43MB by this
point) is kept as-is for history, not appended to further. **Batch 1
(Brandon's picks): Rocket Man, Donnie, Kiwi, Black, Rick, Nick, Chef**
— likeness-only busts (no jersey/crest), published. Confirmed the
age-fix and shadow-fix both hold on this batch. Two open items flagged
on the page itself, not yet fixed: Rick's cap didn't carry through
this generation (had one before), Donnie's basketball has garbled fake
text (diffusion models can't render real text — same reason the jersey
crest is a real extracted image, not AI-drawn text).

**Where this actually is right now:** waiting on Brandon's likeness
verdict on batch 1 (approve/iterate per person) before either (a)
running batch 2 with the next set of names, or (b) building the actual
jersey+crest+card-assembly step for whichever batch-1 people get
approved. The likeness-only generation script is
`run_batch1_likeness.py` in that session's scratchpad — not yet a
permanent repo script; if this pattern continues across many batches,
worth promoting the prompt template (style+age+expression, no jersey
mention needed since jersey color is still baked into the base
generation per current architecture) into `tools/player-cards/` proper
rather than re-deriving it per batch.

**KennyG (Snake) locked, 2026-08-23.** After 5 rounds of prompt-only
iteration (smile fixed round 5, but a stray gray hair fringe and
copper/orange skin tone resisted pure text prompting across 3 rounds),
switched to the masked ReferenceLatent technique: mask the region,
condition on a real photo crop via `inpaint_with_reference()`. First
pass (head-only ellipse mask) fixed the hair completely but skin tone
stayed copper — root cause: the mask stopped at the jaw, leaving the
neck still orange from the original render, so the correction had to
blend into that orange neck and got pulled back toward it. Expanding
the mask to cover head+neck together (no orange anchor left to blend
against) fixed both in one pass. Separately tried to move his
expression from a wide open-toothy smile to a squinty closed-mouth
grin (matching `f_0343.jpg`) — 5 more attempts (masked mouth/eyes
region at various denoise/guidance, full-image edit up to guidance
4.5) all plateaued around a slightly smaller version of the same open
smile; mouth wouldn't fully close, eyes wouldn't squint. This reads as
the same stubborn-attribute resistance as hair/skin, but for
expression — masked/reference-latent correction didn't crack it this
time. **Brandon's final call: use the guidance-4.5 full-image attempt
(closest one), keep the head+neck skin/hair fix, move on** — expression
is close enough, not worth further rounds.

**Batch 2 shipped, 2026-08-23: Shipp, Rufus, EDub, Anthony, Mike MP3,
Bo, Kobe, Reggie.** Real regression found and fixed: first pass came
back badly whitewashed — all people collapsed into the same generic
light-skinned gray-haired man regardless of the source photo, even for
Shipp whose reference was a close, sharp, well-lit shot (ruled out
"photo too small/far" as the cause). Root cause: the batch-2 FRAMING
prompt only said "don't lighten/wash out skin tone" — missing the
stronger "do not change his ethnicity" clause that fixed Nick's
whitewashing earlier in the project. Added that exact phrasing back
and reran all 8 — skin tone/ethnicity corrected across the board.
Two per-person misses needed a second targeted pass after that: Rufus
came out with hair + a beard (he's bald, clean-shaven in every real
reference photo) and EDub was missing his signature do-rag — both
fixed with person-specific FRAMING text emphasizing the missed
attribute, same seed-per-person pattern as the KennyG/Jen fixes.
**Lesson for future batches: the "don't lighten skin tone" phrasing
alone is not reliable — always include the explicit "do not change his
ethnicity/race" clause in the FRAMING block for every batch, not just
for subjects already known to be problem cases.**

**Roster folder data-quality bug found while sourcing batch 2 photos:**
`~/Nick/work/people/11_KOBE/` is mislabeled — every frame in it carries
the video's own "KENNY G" / "The SNAKE" burned-in caption text, i.e.
it's a duplicate/misfiled set of KennyG frames, not a real Kobe. The
actual Kobe photos, plus the real Reggie photos, are both sitting
inside `13_REGGIE/` — that one folder spans three different burned-in
video captions in sequence: "Kobe" (f_0349-0353), "Reggie" (f_0354-
0366ish), and a third person captioned "Kevin" (f_0367+) who isn't on
the 23-person roster at all — a new-person find the same way Jen was.
Used the real Kobe/Reggie frames for batch 2. **Kevin not yet run
through the pipeline — flag for the next batch**, same treatment as
Jen (pull a couple of good reference frames, confirm with Brandon
before generating). Given this mixup, worth spot-checking other
roster folders for the same kind of caption drift before trusting them
blindly.

**PuLID-FLUX + Kontext — real breakthrough on likeness, 2026-08-24.**
Two rounds of pure prompt/masked-ReferenceLatent iteration on Nick and
Rufus plateaued (round 1: face-shape language got the round face/wide
nose/goatee right per-feature but Brandon still called it "not better
resemblance"; round 2: masked real-photo ReferenceLatent correction at
denoise 0.9 barely changed anything, denoise 1.0 introduced artifacts).
Researched alternatives — Meta AI has no developer API (consumer-only,
confirmed dead end); PuLID-FLUX + Kontext is a real documented ComfyUI
pattern ("Flux Kontext Pulid" workflow) purpose-built for keeping
identity through style changes, which is exactly Kontext's known weak
spot (it's documented to struggle specifically when output structure
diverges a lot from input — photo → ink-comic is a big structural
change). Brandon confirmed 2026-08-24 this is non-profit/non-commercial
use, so the InsightFace antelopev2 commercial-license question (same
one flagged back in the original Tier-1/2 SDXL research) is not a
blocker — don't re-litigate this per person.

Built `tools/player-cards/modal_app_kontext_pulid.py`, a new sibling app
(`scoot34-kontext-pulid-test`) to the working Kontext app — adds
balazik/ComfyUI-PuLID-Flux custom node + PuLID weights
(guozinan/PuLID/pulid_flux_v0.9.0.safetensors) + InsightFace antelopev2
(MonsterMMORPG/tools/antelopev2.zip, verified zip layout before writing
extraction code) + EVA02-CLIP-L-14-336 (pre-warmed via the SAME
hf_hub_download call pulidflux.py itself makes, so it's a cached no-op
at runtime, not a manual path guess). Image build succeeded clean on
the first attempt.

**Real bug found and fixed on first run:** `TypeError: forward_orig()
got an unexpected keyword argument 'timestep_zero_index'`. Root cause,
confirmed by reading both sides directly (not guessed): PuLID's
ApplyPulidFlux node REPLACES the model's `forward_orig` method with its
own frozen local reimplementation (pulidflux.py line 65) instead of
wrapping the original — and our pinned ComfyUI commit's actual FLUX
`_forward` (comfy/ldm/flux/model.py) now calls forward_orig with three
extra kwargs (`timestep_zero_index`, `transformer_options`, `attn_mask`)
that PuLID's frozen copy doesn't accept. This is a genuine PuLID/
ComfyUI version-skew bug, not a Kontext-specific problem or a config
mistake — traced `timestep_zero_index` into model.py and confirmed it
only refines how Kontext's reference-latent tokens get zero-timestep
treatment INSIDE the transformer; the actual reference-latent
conditioning happens via img/img_ids concatenation BEFORE forward_orig
is called, so accepting-and-ignoring the extra kwargs (one `sed` patch
appending `**kwargs,` to the signature, baked into the image build) is
a safe fix, not a silent behavior break. Confirmed working after the
patch — no further errors.

**Result, tested on Nick and Rufus (noir style, pulid_weight=1.0):**
clearly the best likeness yet on both — Nick's face is rounder/fuller
with the right wide nose (previous best was still reading too lean/
chiseled), Rufus's forehead creases/hooded eyes/goatee all read closer
AND he spontaneously landed Rufus's characteristic forward-leaning head
tilt from the real photos without being asked for it. Rufus's clothing
didn't fully follow the "solid black sleeveless jersey" instruction
(came out as a textured t-shirt) -- minor, not yet tuned. Published
side-by-side (best-prior vs PuLID) on likeness-review-2. This is the
technique to use going forward for anyone whose likeness isn't landing
on `generate()` alone -- `PulidKontextGenerator.generate()` in the new
app takes the same payload shape as the old app's generate() plus
`identity_photo_url` (a face reference photo -- can be the same subject
photo or a tighter crop) and `pulid_weight`/`pulid_start_at`/
`pulid_end_at` (defaults 1.0/0.0/1.0, untuned beyond the first test).

**Nick locked + full 24-person roster run through PuLID+noir, 2026-08-24
(same day as the PuLID breakthrough above).** Nick vector-down: tested
5 source photos across his two video sets (set 1 = original getwell
shoot 1080p, set 2 = Nick.MP4 hallway shoot, 4K). Brandon's pick: photo
A (set 1, `f_0515.jpg`, `nick_a_subject.jpg` on blob) — best resemblance
of the five, despite the higher-res set 2 photos giving crisper detail
on paper. One note: wanted A's natural slight closed-mouth smile
preserved rather than the standard "serious game-face" expression —
swap `EXPRESSION_NICK_SMILE` in for Nick specifically, not the roster
default.

Then ran the ENTIRE 24-person roster (all of batch 1/2/KennyG/Jen/Cleo
plus the previously-untouched McGhee/John/Frank/Zelle/Sheldon/Rodney)
through the same PuLID+Kontext noir pipeline in one batch —
`tools/player-cards/run_full_roster_pulid.py` (not committed, scratch
script; the permanent asset is `modal_app_kontext_pulid.py` itself).
**Zero generation failures across 24 people.** Key simplification this
run proved out: with PuLID doing real identity injection from the
photo, per-person FRAMING text describing hair/facial-hair/build by
hand (the old approach, error-prone -- see the Rufus goatee mistake
above) is no longer necessary -- one generic FRAMING_MALE/FRAMING_FEMALE
template plus "preserve his exact real hairstyle/facial hair/skin tone
from the reference photo" was enough, and every person came out visibly
distinct with no whitewashing/generic-face collapse. subject_photo_url
and identity_photo_url were the SAME photo for all 24 (no separate face
crop needed -- PuLID's own InsightFace step does its own face detection
on whatever image it's given).

Published as "Full lineup — noir + PuLID identity injection" on
likeness-review-2. Three flagged for a quick fix, not yet done: KennyG
and Shipp both picked up burned-in on-screen caption text from their
source video ("KENNY" / "SHIPP") rendering into the image -- need
different source frames without visible captions, or a tighter crop
that excludes the caption area. Jen kept the full room background
instead of going plain and the outfit/pose drifted off the jersey
instruction -- same background-compliance issue seen with her in the
earlier B&W style test, seems to recur specifically for her source
photo. Everyone else (21 of 24) reads clean on first pass.

**Roster fix round 2 + Kevin added, 2026-08-24 (same day).** Brandon
flagged 4 issues from the full-lineup batch plus asked for a headcount:
- **KennyG "work on resemblance"**: fixed by swapping the identity
  photo from the wide/distant `kennyg_subject_v3.jpg` to the tight face
  crop `kennyg_head_ref.png` (already existed from the earlier masked-
  correction work) while keeping the same subject photo for pose/
  framing. Big improvement -- confirms identity-photo tightness/clarity
  matters even though PuLID's InsightFace does its own face detection;
  a small/distant face in the source gives it less to work with.
- **KennyG caption-text bug was actually Kiwi's**: I mislabeled this in
  my report to Brandon. `kenny_kiwi_subject.jpg` has "KENNY aka: KIWI"
  burned into the frame (his real photo folder has burned-in captions
  in nearly every frame -- "KENNY", "aka: KIWI", "Mr. Flirt" -- but the
  FIRST frame in the folder, before captions kick in, is clean).
  Swapped to that clean frame, fixed.
- **Nick's stray head artifact**: gone on a reroll (different seed,
  same photo A / `nick_a_subject.jpg`) -- was a one-off sampling glitch,
  not a structural problem with the photo or prompt.
- **Jen's background**: fixed with the same stronger "CRITICAL:
  completely plain, solid, empty background" language that fixed her
  B&W-style-test background issue earlier -- confirms this is just a
  standing quirk of her specific source photo that needs the emphatic
  phrasing every time, not a one-off.
- **Chef's closed eyes: NOT fixed.** Tried an explicit "eyes fully
  open, alert" instruction on the same source photo -- stayed closed.
  Checked his whole 28-frame reference folder: literally every frame
  has his eyes closed/squinting mid-laugh, same moment. PuLID's
  identity conditioning is pulling that closed-eye state through even
  against a direct contradicting text instruction. Same resistance
  class as KennyG's expression fight earlier in the project. Next step
  if Brandon wants it pursued: masked eyes-only ReferenceLatent
  correction (the technique that worked for KennyG's hair/skin), but
  there's no real "eyes open" reference photo of Chef to condition on
  -- would need text-only masked correction, which is a weaker version
  of the technique. Not yet attempted.
- **Kevin added as roster member #25** (previously flagged, unrostered,
  found mixed into the Reggie folder). Used a clean caption-free frame
  (`f_0369.jpg`, cropped to exclude the "Kevin" caption and a chunk of
  background). First pass whitewashed him -- same bug as the batch-2
  regression, generic "preserve skin tone/ethnicity" phrasing wasn't
  enough. Fixed on retry with the same explicit "he is Black with dark
  brown skin" clause. **Lesson reinforced again: always use the
  strongest explicit ethnicity phrasing by default, every person, every
  time -- the generic version keeps failing.**

**Full roster headcount, as of 2026-08-24: 25 people total, 24 have a
clean/approved-pending noir render, 1 (Chef) has an open issue.** No
more untouched photo folders exist under `~/Nick/work/people/` --
Brandon confirmed this is the complete set (told him so directly and
he agreed). Any future new roster member would need fresh video
sourcing, not something sitting unused in existing material.

**Kevin's remaining hair bug found and fixed, 2026-08-24 (round 3).**
Brandon asked to see Kevin's original photo + attempts on a fresh
review page (`likeness-review-3`, plain image files not base64 --
`likeness-review-2` had grown to 66MB from base64 accumulation).
Inspecting attempt 2's embedded ComfyUI prompt metadata (PNG tEXt
chunk, readable via PIL's `im.info['prompt']`) found the actual bug:
the prompt text explicitly said Kevin has "short, closely-cropped
salt-and-pepper gray hair (not bald)" -- wrong, he's bald with a shaved
head in every source frame. That's why attempt 2 still rendered hair
despite the skin-tone fix landing -- not a model resistance issue like
Chef's eyes, an actual wrong fact fed to the model. Ran 4 corrected
attempts (`run_kevin3.py`, scratchpad, not committed) via
`modal.Cls.from_name("scoot34-kontext-pulid-test", "PulidKontextGenerator")`
against the already-deployed app (no rebuild needed), changing one
lever at a time from a common corrected-hair base: (A) fix alone same
seed/identity photo, (B) + tight face-only identity crop, (C) + PuLID
weight 1.0->1.2, (D) + fresh seed. **A/B/C all fixed the bald head
correctly and read near-identical** -- identity-crop tightness and the
weight bump made negligible visible difference at this seed. **D (new
seed) regressed to a lighter, more outline-only render style with much
less black shadow on the face** -- reads less convincingly dark-skinned
purely from a style/shading shift, not a reintroduced ethnicity bug;
flags that seed also drives noir shading *intensity*, not just
framing/scale (see the earlier framing-drift finding same day). Not
yet Brandon-approved which (if any) V3 attempt to lock as Kevin's
final. Source images (subject photo, face crop, all figure PNGs) live
in Azure blob `stevearchive10723/media/card-art/kontext-test/` under
`kevin_*` / `34-ROSTER-PULID-KEVIN*` -- SAS URLs generated ad hoc per
session (account key via `az storage account keys list`), not
persisted anywhere.

**First full front-card batch through the new PuLID pipeline, 2026-08-24.**
Brandon: "let's try the first 6 cards (front)" -- first time the
PuLID+Kontext noir art (not the old BADASS/comic-graphic art) has been
run through the complete card-assembly chain: `modal_app_jersey.py`'s
`composite_jersey()` (crest + mesh texture, already-deployed app, no
redeploy needed) -> `finalize_card.py` (rembg `isnet-anime` cutout,
already installed locally) -> a new crop-to-art-slot step (not
committed, scratch `crop_to_slot.py`: crop to the figure's alpha bbox
with 12%/6%/10% margin, letterbox-pad to the 168x240pt/0.7 aspect
instead of stretching, resize to 700x1000) -> `build_cards.py` with a
placeholder roster CSV (tier="OG" for all six just so the accent
stripe shows; real tier/stats still not assigned). Used the 6 people in
folder order (01_CLEO..06_KENNY_KIWI/Kiwi), each already had a
`34-ROSTER-PULID-{NAME}_figure.png` from the 2026-08-24 full-roster
PuLID batch.

Published `fairchildlabs.org/card-review-1/` (full 6-up sheet +
individual card crops, plain image files). **Real bug confirmed, not
new:** Shipp's card still has "SHIPP" caption text baked into the
generated art plus a garbled artifact behind his shoulder -- this is
the exact caption-bleed issue flagged (but not fixed) on the
full-roster PuLID batch earlier the same day. Needs a cleaner source
frame or stronger "remove all text/background" prompt before Shipp's
card is usable. Also chased down and ruled OUT a suspected bug: a
white rectangular patch on Cleo's upper arm turned out to be the
correct sleeveless-jersey armhole gap (confirmed identical in the
un-composited raw noir figure), not a jersey-compositing defect.
Other 5 cards (Cleo, Rufus, E-Dub, Anthony, Kiwi) read clean.
Local pipeline scripts for this pass live in
`/tmp/.../scratchpad/cards6/` (session-specific tmp, not persisted) --
`crop_to_slot.py` is the one piece worth promoting into
`tools/player-cards/` if this full-pipeline pass is repeated for more
of the roster, since `finalize_card.py`'s rembg-cutout output has no
existing committed step that crops/pads it to the art slot aspect.

**Card-frame + jersey pipeline overhaul, 2026-08-25 (4 rounds on Cleo
only, per Brandon's "let's get it right" directive).** Round 1
(card-review-1, above) surfaced three real complaints: distracting
speed-lines background, oversized/off-looking crest, blotchy dark
"shadow" on the jersey.
- **Round 2:** removed `draw_manga_bg()` from `build_cards.py` entirely
  (blank field instead) -- committed `d20e3da`.
- **Round 3:** traced the shadow to `modal_app_jersey.py`'s mesh-weave
  multiplier (a real fabric-photo swatch tiled as a 0.65x-1.45x
  brightness multiplier) -- too strong tiled over a curved,
  already-segmented silhouette. Disabled it (flat recolor), shrunk the
  crest 0.54x->0.32x of shoulder width. Committed `f6d1103`. Brandon's
  follow-up: shadow still present, crest still not centered either
  size.
- **Round 4, the real fix:** Brandon's own suggestion -- build the
  jersey (base color + mesh + logo) as ONE standalone flat texture
  first, authored/previewable on its own, THEN stamp it onto the
  player, instead of per-pixel recoloring + runtime crest-geometry math
  per subject. Built `make_jersey_texture.py` (new, committed): flat
  1200x800 canvas (matches a typical garment-bbox aspect so the crest
  doesn't stretch into an oval), base jersey color, mesh baked in at a
  much lower fixed intensity (0.06 vs the runtime version's 0.45 native
  swing) via the SAME mesh swatch, crest centered by construction
  (`assets/jersey_texture_dark.png`, regenerate via that script if
  tuning changes). `composite_jersey()` now just resizes this texture
  to the garment mask's own bounding box and stamps it in through the
  mask -- no more notch-detection crest math, no more per-subject
  recolor. Also caught and fixed a side-effect bug the flat/stamped
  output made newly visible: the neck-clip margin bumped earlier that
  day (0.05->0.09, tuned for Kevin) cut a visible rectangular notch out
  of Cleo's own collar fabric (deeper V than Kevin's) -- reverted to
  0.05. Committed `2c0ad02`, also commits the two source assets
  (`fonde_crest_white.png`, `mesh_texture_mult.png`) that were
  previously blob-only, so the texture is fully reproducible from the
  repo. "light" side (back-of-card, still not built) keeps the old
  per-pixel recolor as a fallback -- no light-side texture asset exists
  yet.

**Result confirmed matches production:** ran the real deployed
`composite_jersey()` (not just the local iteration scripts) through
the full finalize/crop/build_cards chain for Cleo and it reproduced
the same clean result. Published as "Round 4" on card-review-1.

**Round 5, same day -- the actual real fix, per Brandon's own
diagnosis.** His read on round 4: still shadowed on the neck/arms,
crest still not centered, and the crest's "SENIOR BASKETBALL" text got
clipped at the bottom. His call: the rectangle itself was the problem
-- "make the shirt+mesh+logo one unit and just add it on top of their
torso." Rebuilt around that:
- `make_jersey_sticker.py` (new, committed, supersedes/removes
  `make_jersey_texture.py`) bakes color+mesh+crest into ONE asset with
  a real garment-shaped ALPHA channel (collar notch, shoulder straps,
  sleeve width) instead of a rectangle -- built from
  `assets/jersey_shape_template.png`, a known-clean subject's (Cleo's)
  own mask shape cropped to its bbox, reused as a generic template
  since the roster shares locked pose/framing. Crest kept well clear
  of the template's bottom edge -- that edge is always the AI render's
  own photo-frame cutoff (no true garment hem), consistent across
  subjects given the locked framing, so a fixed margin works roster-wide.
- `composite_jersey()` no longer needs ANY classifier for positioning:
  the jersey always renders pure solid black in the AI art, so a plain
  darkness threshold + largest-connected-component (lower 58% of frame,
  to exclude hair/eyebrows) robustly finds the torso bbox. The sticker
  is resized to that bbox and stamped in using ITS OWN alpha for the
  edge shape.
- **This dropped segformer/torch/transformers from the app entirely.**
  Whole classes of bug (classifier bleeding into skin/neck/arms, crest
  position math fighting mask geometry) can't recur since there's no
  per-pixel classification left at all. Also much faster Modal cold
  starts (no ML model to load).
- "light" side (back-of-card, still not built) has no sticker asset --
  `composite_jersey` now raises `NotImplementedError` for it rather
  than carrying dead per-pixel-recolor code for a path nothing calls.

Verified against the real deployed function end-to-end (not just local
iteration), reproduced the same clean result. Committed `3d76b14`.
Published as "Round 5" on card-review-1.

**Round 6, same day -- Brandon caught round 5's real flaw and it led
to the actual fix.** His reads: "you keep overwriting the torso or
arms with dark jersey... the jersey sticker isn't the shape of a
jersey... the original (pre fonde/mesh) jerseys fitted well, it start
to get messed up after you add the other stuff." Correct diagnosis:
round 5's sticker borrowed ONE subject's (Cleo's) garment shape and
stretched it to fit each new subject's detected bbox -- exactly what
was distorting the fit, since a stretched foreign shape can't match a
different photo's actual pose/proportions.

**The fix stops touching the shape at all.** The AI always renders the
jersey as literal pure black -- confirmed repeatedly across this whole
project -- so a plain darkness threshold + largest connected component
in the lower ~58% of the frame finds THIS subject's own jersey outline
directly, every time, matching exactly what the model actually drew.
No borrowed shape, no stretch, no distortion possible. Mesh + crest now
apply directly onto that real per-subject shape instead of a separate
overlay. Caught and fixed a real bug from the sticker version in the
same pass: multiplying the AI's literal (0,0,0) black jersey pixels by
a mesh brightness factor is a no-op (0 * anything = 0) -- that's why
round 5's mesh was invisible. Fixed by filling the true base hex color
first (a flat replace, not a luminance blend -- the source has zero
internal shading to preserve, confirmed early in this project), then
multiplying mesh onto that non-zero color.

`modal_app_jersey.py` rewritten again (segformer removal from round 5
stands; the sticker-shape asset/generator from round 5 is now also
removed) -- verified against the real deployed function, reproduced
the same clean result. Committed `4d7dabf`.

**Brandon also asked for a new review page each round from here on**
(`card-review-2`, `card-review-3`, ...) instead of appending
indefinitely to `card-review-1` -- published this round as
`fairchildlabs.org/card-review-2/`.

**Round 7, same day -- Brandon confirmed card-review-2 good, asked for
one more crest tweak.** "Make the Fonde Logo a little bigger and line
up the bottom of it with the bottom of frame." Crest width 0.30 ->
0.40 of jersey width; position switched from a fixed top margin to
bottom-anchored on the jersey mask's own bottom edge (reliable across
the roster since that edge is always the photo's own frame cutoff, not
a garment hem -- established in round 6). A zero margin clipped
"SENIOR BASKETBALL" by a couple px on Cleo -- settled on a small
buffer (`CREST_BOTTOM_MARGIN_FRAC = 0.04`, 4% of jersey height).
Verified against the real deployed pipeline. Committed `c5528a8`.
Published on **`card-review-3`**.

**Round 8, 2026-08-26 -- crest horizontal centering.** Brandon: "the
center of it (the N in FoNde) needs to be aligned with the players
chin, so in Cleo's case you need to shift it to the left slightly."
Root cause: crest was centered on the jersey mask's own bbox, which
drifts off-true whenever shoulders/arms aren't symmetric in the pose --
confirmed on Cleo, jersey-bbox center sat ~46px right of his actual
chin. Fixed with a new `_find_head_center_x()`: horizontal center of
the largest dark blob in the top 42% of the frame (the hair/head
region) -- reliably sits above the chin for a front-facing subject,
independent of shoulder pose. Verified against the real deployed
pipeline. Committed `07fda5c`. Published on `card-review-4`.

**Naming convention going forward, per Brandon 2026-08-25: a fresh
`card-review-N` page each round** (not appended indefinitely to
`card-review-1` the way the likeness-review pages grew to 40-60MB+).
Rounds so far: card-review-1 (rounds 1-5, background/mesh/sticker
iteration, superseded), card-review-2 (round 6, the true-mask fix),
card-review-3 (round 7, crest size/position), card-review-4 (round 8,
crest horizontal centering under the chin).

**Round 9, 2026-08-26 -- ran the other 5 (Rufus, E-Dub, Anthony, Kiwi,
+ Cleo re-confirmed), first time off Cleo-only.** Exactly the
generalization risk flagged above materialized, on Kiwi specifically:
- **Crest badly oversized, overlapping his face.** Root cause: crest
  size was `bw * CREST_W_FRAC` (jersey mask's own detected width).
  Kiwi's dense chin-shadow stippling touches the jersey with literally
  no gap in the source art -- confirmed true even with the
  morphological closing step disabled entirely, so it's a property of
  the artwork, not a bridging artifact. That inflated his detected
  mask width, which (crest being bottom-anchored) pushed the resulting
  oversized crest's top edge up into his face. **Fix:** size the crest
  off the whole IMAGE's width instead (`CREST_W_FRAC` now 0.204 of
  image width, equivalent to Cleo's old 0.40-of-bbox result) -- the
  roster shares a locked framing/identical pixel dimensions every
  render, so image width is a reliable scale reference the per-subject
  mask isn't.
- **Kiwi's collar is also genuinely much deeper** (more exposed chest)
  than Cleo's -- even the corrected fixed-size crest didn't fit above
  his true collar. Added `_find_true_collar_y()`: scans the mask's
  row-width profile upward from the bottom (least likely contaminated)
  for the transition from "narrow neck" to "wide torso" width, and
  shrinks the crest proportionally when the fixed size would overflow
  above that line. Verified no regression on Cleo (shrink never
  triggers for him) while fixing Kiwi (crest now visibly smaller on
  his card, correctly).
- Also swapped Kiwi's source from the full-roster batch render (still
  had "KENNY" caption text baked in) to the already-fixed
  `34-ROSTERFIX-KIWI` blob (clean, from the earlier likeness-review-2
  round) -- the roster-batch composite_jersey call had been using the
  wrong/stale source.

Verified against the real deployed pipeline for all 5. Committed
`09a7cd6`. Published on `card-review-5` (full sheet + individual
crops).

**Remaining open item, not fixed this round:** E-Dub has a faint mesh
seam at the collar (a thin strip of untextured flat black where his
beard/collar meet) -- traced to the *other* direction of the same
class of bug: his true collar sits slightly ABOVE the fixed "exclude
top 42%" line used for the jersey/mesh mask (not the crest, a separate
mask), so that sliver never gets mesh applied. Cosmetic only, visible
at zoom, not blocking. Would need the same kind of per-subject-relative
fix (row-width-profile-based head/torso boundary) applied to the mesh
mask's own top cutoff, not just the crest's positioning -- flagged for
a future round if Brandon wants it addressed.

**Shipp still excluded/blocked** -- his likeness art itself (not the
jersey pipeline) has the pre-existing "SHIPP" caption-text + garbled-
artifact bug, unlike Kiwi has no already-fixed source render sitting in
Blob to swap in. Needs a fresh PuLID generation pass with a cleaner
source frame -- separate task from jersey compositing.

**Round 10, 2026-08-26 -- Brandon's direct follow-up on the round-9
batch, three real fixes.** "Make Cleo's jersey the reference, make the
fonde logo the same size across pictures... If cut off by frame, it's
not necessary to show the whole logo... Edub off center, too low...
Anthony need to extend torso and move logo down."
1. **Uniform logo size, no shrink-to-fit.** Reverted round 9's
   shrink-to-fit-a-deep-collar behavior entirely -- crest size is now
   always fixed (image-width-relative), same physical size every
   subject. Kiwi's deep collar means his crest now clips at the bottom
   of the frame instead of reading smaller than everyone else's, which
   is what Brandon explicitly asked for.
2. **E-Dub "off center" root cause:** `crop_to_slot.py` (previously
   scratch-only, promoted to a committed tool this round) centered the
   final card crop on the FULL alpha-content bbox (arms included),
   which drifts off the true head/chin line whenever the pose isn't
   symmetric -- even though the crest itself was already correctly
   centered on his chin by `composite_jersey`. Fixed by centering the
   crop on the head region's own center instead (same signal
   `_find_head_center_x` already uses), so crop and crest agree.
3. **Anthony "logo too high / torso not extended" root cause:** the
   old crop, needing extra height to reach the card's 0.7 portrait
   aspect (torso+arms content is inherently much wider than that
   aspect allows, true for every subject, confirmed by direct
   calculation), added that extra padding SYMMETRICALLY above and
   below the figure -- diluting how much of the frame a wider-posed
   subject's figure fills, and pushing the crest higher up within the
   visible frame. Fixed by anchoring the crop's bottom at the figure's
   own bottom edge and extending upward only, keeping apparent scale
   and logo vertical position consistent across subjects regardless of
   how much total padding a given pose needs.
   - Hit a real secondary bug while implementing this: the bottom
     margin needs to clear `build_cards.py`'s nameplate bar, which
     covers the bottom 14.2% of the art slot as an OVERLAY (not a
     separate crop region) -- an initial version estimated the margin
     from a pre-adjustment height that the headroom-extension step
     then invalidated, under-padding the bottom and hiding the crest
     under the bar. Fixed by solving directly for the margin that
     gives the nameplate zone its required share of the FINAL crop
     height.
   - Also simplified: PIL's `Image.crop()` auto-fills out-of-bounds
     regions with transparent/zero, so the manual letterbox-padding
     step from earlier rounds was unnecessary complexity (and had its
     own bug -- silently re-centering padding symmetrically after
     clamping, discarding the intended bottom-anchor).

Verified against the real deployed pipeline (both `composite_jersey`
and `crop_to_slot.py`) for all 5 subjects. Committed `01c3d4d`.
Published on `card-review-6`, which also answers Brandon's standing
question ("why not build jersey+logo as one unit") directly: the logo
already IS a separate fixed-size overlay now, independent of each
subject's jersey shape -- splitting "real per-subject jersey shape" from
"fixed-size logo stamped on top" gets uniform logo sizing without
needing to re-warp a combined asset per subject (which is what
distorted the logo into an oval back in round 5).

**Round 11, 2026-08-26 -- two more precision fixes + first clean
6-person batch with zero manual intervention.** Brandon: "edub it
still not centered but better. Antohny logo need to go down. Go ahead
and fix up those and then give me the next 6."
- **E-Dub root cause, finally isolated:** `composite_jersey`
  (raw-image darkness threshold) and `crop_to_slot.py` (post-rembg
  alpha analysis) were each computing "head center" independently and
  disagreed by ~10px (712.5 vs ~708-ish) -- small in absolute terms,
  but enough for the crest to visibly drift off the crop's own center
  once resized. Fixed by having `composite_jersey` return `head_cx` in
  its result dict; the calling pipeline now writes it as a
  `{serial}_head_cx.txt` sidecar next to the finalized figure/mask, and
  `crop_to_slot.py` reads that exact value when present instead of
  recomputing its own -- guarantees crest and crop agree exactly,
  can't just get closer.
- **Anthony:** his crest position was governed by the "stay clear of
  the neck" collar clamp (`top_margin`), not the bottom anchor (which
  only kicks in for a shallow collar) -- the clamp's small margin
  (0.03 of jersey height) kept his crest floating high on his chest.
  Bumped to 0.10 -- pushes it down to sit naturally, clipping more
  under the nameplate like the rest of the roster already does, per
  Brandon's standing "if cut off by frame, that's fine" call.

Both verified against the real deployed pipeline for all 5 subjects.
Committed `bccc74a`.

**Next 6 run immediately after, first batch needing zero manual
per-subject fixes:** Mike MP3 (34-DRAFT-07), Black (08), Brandon (09,
the user's own likeness), Donnie (10), Bo (11), Kobe (12) -- sourced
from the existing `34-ROSTER-PULID-{NAME}_figure.png` full-roster-batch
blobs (all present, no missing/broken sources this time). One cosmetic
note, not fixed: **Kobe's source pose has his hand raised near his
chest**, so his fingers visually overlap part of the crest -- a
pose/compositing clash specific to that one photo (the crest has a lot
of transparent gaps between its outline/text strokes, so whatever's
underneath shows through), not a detection or positioning bug. Everyone
else landed clean on the first pass. Published on `card-review-7`
(also shows the E-Dub/Anthony fix results).

**Round 12, 2026-08-26 -- head-to-glyph alignment (structural fix),
Bo's baldness fixed, FONDE wordmark demoed.** Brandon: "have all the
heads vertically aligned with the bottom of the scoot logo... Bo is
completely bald... If I change from Fonde Basketball logo to just
'FONDE' lettering... will you be able to align it right on the
torsos?"

**Head-to-glyph alignment (the real structural fix):** the old crop
math derived headroom as a SIDE EFFECT of forcing the card's 0.7
aspect ratio from a wide arm-span bbox -- headroom landed wherever
that happened to compute to, which is why narrower-bbox subjects
(Donnie, Mike, Bo, Kobe) already looked right while others didn't, per
Brandon's own read. Replaced with direct math: the scoot glyph disc
build_cards.py draws in the card's corner sits at a fixed
`GLYPH_BOTTOM_FRAC = 0.15` down the art slot (derived from that
script's own geometry constants -- recompute if those change). Crop
height/position now solve directly for putting each subject's own
head-top (the rembg alpha bbox's y0 -- robust for BOTH bald and hairy
subjects, unlike a darkness-threshold hair-blob detector which would
have nothing to find on a bald head) at that exact line, with the
bottom margin solved simultaneously to still clear the nameplate zone.
Drops the old arm-margin ("natural_w") sizing entirely -- width is now
purely derived from required height, so a wide arm span may get
cropped tighter rather than dictating extra headroom. Verified across
all 11 subjects processed so far -- heads land at a visually identical
line regardless of pose/arm-span variation. Committed `4d34507`.

**Bo's baldness fixed:** confirmed bald in his own source photo
(`bo_subject.jpg`) -- the earlier render invented hair, same
model-bias class as Kevin's earlier bald-hair bug this project.
Fixed identically: swapped the prompt's generic "preserve his real
hairstyle (or lack of hair)" for an explicit "he is BALD with a smooth
shaved head -- NO hair at all," regenerated via
`scoot34-kontext-pulid-test`'s already-deployed `generate()` off the
same source/identity photo and seed (552011). Note for reruns: the
embedded `identity`/`subject` PNG filenames in a prior render's own
metadata are ComfyUI's internal input-dir names, NOT persisted Blob
paths (a direct fetch 404s) -- always reuse the ORIGINAL source photo
blob (e.g. `bo_subject.jpg`) instead.

**FONDE wordmark-only option demoed, not yet committed to the
roster.** Extracted just the "FONDE" text (cropping out the ball
outline + "REC CENTER"/"SENIOR BASKETBALL" lines) from the existing
crest photo via connected-component analysis (excluding components
touching the arc/seam corners) -- new asset
`assets/fonde_wordmark_white.png`, committed but NOT wired into
`modal_app_jersey.py`'s `CREST_ASSET_BLOB` (still the circular badge
in production). Demoed via a scratch stamp script on Cleo and on Kiwi
(deepest collar in the roster, the subject that gave the circular logo
the most trouble) -- both landed clean on the first try, centered
vertically in the available chest space (collar to bottom) rather
than bottom-anchored like the taller multi-line badge needed. **A
single wide text line is genuinely easier to align uniformly than the
circular badge was** -- confirms Brandon's suspicion. Waiting on his
go-ahead before switching the whole roster/production pipeline over.

**BigMo "switch mode" (impersonation) researched, found NOT
implemented.** Brandon described a feature (SMS-based, tell BigMo to
temporarily act as another user, 1hr timeout, every message tagged
like "[rocketman(as)bo]") he recalled discussing. Thorough repo search
(SMS command dispatcher `ri/src/server/sms/commands.ts`, bot routing,
all `arch/*.md` docs, full git log) found zero trace -- no code, no
stub, no test, no design doc. It exists only as a prior verbal
discussion, never written down or built. Flagged to Brandon as a
from-scratch feature if he wants it, unrelated to the card-art work
this session.

**Round 13, same day -- wordmark confirmed and wired into production
for the whole roster.** Brandon: "Switch the whole roster to the FONDE
wordmark. Cleo is perfect (FOnde midpoint aligned with the bottom of
the shoulder deltoid muscle). Kiwi needs to drop down (so maybe Kiwi
needs a bit more torso drawn)." Wired `fonde_wordmark_white.png` into
`CREST_ASSET_BLOB`, switched crest vertical placement from
bottom-anchored (needed for the old tall multi-line badge) to
vertically CENTERED in the available chest space (`true_collar_y` to
`y1`) -- this is what made Cleo read as "perfect."

Running the full 11-subject batch through it surfaced one more real
sizing bug: `CREST_W_FRAC` tuned at 0.30 against Cleo/Kiwi only ran a
letter into the arm on narrower-torso subjects -- confirmed on Donnie,
Kobe, and E-Dub (visually looked like clipping past the card edge at
first glance, but precise pixel measurement showed the text WAS
correctly centered on head_cx and within the canvas -- the real issue
was the jersey's own visible width being narrower than the wordmark
for these subjects, so a letter ran into/behind the arm). Narrowed to
0.25 -- clean across all 11. Verified against the real deployed
pipeline. Committed `41f4ed0`.

**Kiwi's "needs to drop down" diagnosed as confirmed source-framing
limitation, not a placement bug** -- same class of issue as Bo's
baldness (needs a regen, not a compositing fix). His collar is the
deepest in the roster, so his visible chest space (collar to frame-
bottom) is smaller than everyone else's; the wordmark centers
correctly within that space, it just doesn't have much room. Not yet
fixed -- would need a source-art regen showing more torso in frame,
not attempted this round.

Published on `card-review-9`.

**Round 14, same day -- the real scaling rule.** Brandon: "you need
some kind of scaling rule for Fonde. Edcub, mp3, donnie, too wide. Bo,
Kobe, mp3, too low... keep the same scaling of fonde size to the
jersey width." Two root causes, both fixed:
1. **Size:** switched `CREST_W_FRAC` from a fraction of the whole
   IMAGE's width (fixed absolute size for everyone) to a fraction of
   the JERSEY MASK's own bbox width per subject (0.42) -- auto-shrinks
   for narrow-torso subjects instead of needing per-subject overrides.
   Measured `bw` (jersey width) across all 11: Cleo 709, Rufus 721,
   E-Dub 514, Anthony 756, Kiwi 825, Mike MP3 492, Black 731, Brandon
   668, Donnie 566, Bo 492, Kobe 537 -- confirms the "too wide" trio
   (E-Dub/MP3/Donnie) were genuinely among the narrowest.
2. **Vertical position:** switched from "centered in the available
   chest space (collar to bottom)" to a FIXED 145px gap below the true
   collar line, calibrated directly from Cleo's confirmed-perfect
   render (collar=366, wordmark top=511). Centering had been pushing
   subjects with a lot of visible chest -- shallow collar, e.g. Bo/
   Kobe/Mike MP3 all have collar_y≈315-331, among the shallowest --
   too far down, since centering in a bigger available range puts the
   midpoint further from the collar regardless of what actually reads
   right. Kept a safety floor (`cy = min(cy, y1-ch-0.03*bh)`) so Kiwi's
   deep collar doesn't push the wordmark fully off-canvas.

Verified against the real deployed pipeline for all 11 subjects,
including Cleo (confirmed still looks right after switching to
jersey-width-relative sizing). Committed `0f66200`. Published on
`card-review-10`. Kiwi's issue is unchanged (safety-floor-clamped, not
actually fixed) -- still needs the source-art regen.

**Round 15, same day -- rendered "FONDE" from real type instead of a
photo extraction, plus handle names.** Brandon caught a real defect:
"There is a white horizontal artifact just under the 'f' that shows
up. Just writing 'Fonde' in white on top the jersey would be better."
The old wordmark (cropped out of the real jersey crest photo,
2026-08-26 earlier round) had a stray white speck under the F, a relic
of the ball-outline/seam crop that never fully isolated the letters.

**Fix: guess the font, render it clean, no photo extraction at all.**
Compared candidates against the extracted original's distinctive
flared-serif slab style -- Bevan (Google Fonts, OFL license) matched
closely (same "feet," same bold weight/proportions), clearly better
than Alfa Slab One (tried, too heavy/blocky) or the system's own
installed fonts (DejaVu/Liberation/FreeFont -- none have this athletic
block-serif look at all). New `make_fonde_wordmark.py` renders "FONDE"
directly with Bevan at large size then crops tight to content -- no
distress texture (Brandon's "just writing... in white" reads as
preferring clean over trying to replicate the worn-ink look further).
Committed the font file + its OFL license text alongside the script
(`assets/Bevan-Regular.ttf`, `assets/Bevan-OFL.txt`).

Regenerated `assets/fonde_wordmark_white.png` from this and
re-uploaded to Blob at the same `CREST_ASSET_BLOB` path -- no code
change needed in `modal_app_jersey.py` itself, just the asset swap.
Re-ran all 11 subjects through the full pipeline to pick up the new
asset. Committed `beb6d2d`.

**Handle names set:** Brandon -> "Rocket Man", Donnie -> "The
Nightmare" (both roster CSV `handle` column, shown as the big
nameplate text). Minor cosmetic flag, not fixed: "The Nightmare" is
long enough to crowd the tier label in the nameplate's corner --
`build_cards.py`'s nameplate text isn't dynamically sized, worth
revisiting if more long handles come up.

Published on `card-review-11`.

**Round 16, same day -- horizontal position genuinely fixed, Anthony's
baldness fixed, MP3 handle shortened.** Brandon: "the postiion isn't
that great on The Nightmare, Edub, or MP3" + (mid-turn) "Anthoney
doesn't have hair, he's shaved head" + "remove 'mike' just mp3."

**Position root cause, precisely isolated this time (not just
eyeballed):** pixel-measured that pure head_cx (chin) centering WAS
mathematically correct in every case checked -- confirmed via redline
overlays and exact text-bbox measurement, not visual impression alone
(which had misled once already this session, on E-Dub). The real issue
is pose-dependent: on a more 3/4-turned pose (Donnie especially -- his
near shoulder reads visibly wider/foreshortened-closer than the far
one), a face-centered wordmark looks off-center relative to the SHIRT's
own asymmetric silhouette even though it's correctly centered on the
face. Tested pure jersey-bbox-center as the alternative -- fixed
Donnie/E-Dub/Mike MP3 cleanly, but visibly overshot on Cleo, whose own
head_cx-vs-jersey-center gap (44px) is actually the LARGEST in the
roster, yet his face-centered card is the one Brandon already called
"perfect." Neither single geometric signal works for the whole roster.
**Settled on a 50/50 blend of head_cx and jersey-bbox-center** -- reads
acceptably close to correct on both extremes tested. This blended value
is still what gets returned/shared via the head_cx sidecar mechanism
(round 11), so crop centering and crest centering remain in agreement.
Verified against the real deployed pipeline for all 11. Committed
`db9a275`.

**Anthony's baldness fixed** -- confirmed bald with a full white/gray
beard in his own source photo (`anthony_subject.jpg`), same bug class
as Bo and Kevin earlier (generic "preserve his real hairstyle"
language not reliable, needs an explicit "he is BALD" override).
Regenerated via the same `scoot34-kontext-pulid-test` pattern, same
seed/guidance. One residual, not fixed: his real beard is fuller than
what rendered (same "stubborn attribute resistance" pattern as
Kevin/Rufus's hair-color fights earlier in the project) -- bald head
itself is solid, beard fullness is a minor follow-up if wanted.

**Mike MP3's handle shortened to "MP3"** in the roster CSV (name field
stays "Mike MP3" for reference).

Published on `card-review-12`.

**Round 17, same day -- Anthony's real bug (rembg, not jersey
compositing) + Donnie's slight nudge.** Brandon: "Anthorny is messed
up. The Nightmare FONDE needs to move slight to right."

**Anthony:** a visible gray gradient smudge on his arm, present in
the FINAL card but confirmed absent from the raw jersey-composited
image (pre-rembg) -- isolated to `finalize_card.py`'s rembg cutout
step. The default `isnet-anime` model hallucinated a translucent
"ghost" shape on that arm; reproducible identically on rerun (not
transient noise). Tested `u2net` (clean, acceptable edge quality) and
`isnet-general-use` (also clean on the arm, but ate a hole in the
wordmark text instead -- worse). Added `MODEL_OVERRIDE` dict in
`finalize_card.py` keyed by serial -- Anthony (`34-DRAFT-05`) now uses
`u2net`, everyone else keeps `isnet-anime` (still the better default
generally, chosen because the source is comic art not a real photo).

**Donnie:** added `CREST_CX_NUDGE` dict in `modal_app_jersey.py`
(+20px for `34-DRAFT-10`) on top of round 16's 50/50 blend rule -- a
"slight" one-card adjustment Brandon asked for, not a signal the
general rule is wrong (no other subject flagged this round). Both
mechanisms are the same pattern: small per-serial override dicts,
default/absent = no change, for exactly this class of "the general
rule is right for everyone else, this one subject needs a small
manual tweak" feedback.

Verified against the real deployed pipeline for all 11. Committed
`b37089f`. Published on `card-review-13`.

**Card-review page count: 1 through 13 now** (see the naming-convention
note above). Roster status for the front-card pipeline: **11 of 25
roster members done, all on the current wordmark pipeline** (Cleo,
Rufus, E-Dub, Anthony, Kiwi, Mike MP3, Black, Brandon, Donnie, Bo,
Kobe), Shipp still blocked (needs fresh PuLID source art), 13 roster
members not yet attempted at all (KennyG, Reggie, McGhee, John, Rick,
Frank, Chef, Zelle, Sheldon, Rodney, Nick, Jen, and Kevin who's roster
member #25 outside the original 01-23 numbered folders). Two open
cosmetic/framing items, neither blocking: E-Dub's minor mesh-seam-at-
collar (flagged round 9), Kiwi's wordmark reading high on his chest
due to his own source photo's shallow torso framing (flagged round 13,
needs a source-art regen to actually fix).

**MMS spec handed to the other (BigMo/email) session, 2026-08-24.**
Brandon asked whether BigMo could eventually text him his lineup pic on
request. Two separate sessions running in parallel this day (see
[[infra_claude_runs_on_dreamlab]] convention) -- this one owns the art
pipeline, a peer session ("scoot-96") owns BigMo/SMS/email. Sent that
session a spec via SendMessage: check whether the Twilio number
(+13614232253) has MMS capability enabled (A2P 10DLC campaigns
sometimes gate MMS separately from SMS even on a capable long code),
check whether the existing send path supports Twilio's `mediaUrl`
param, then send one test MMS end-to-end using an already-rendered card
PNG. Explicitly scoped OUT the "BigMo, send me my lineup pic"
intent-routing/trigger -- that's later work once MMS itself is proven.

**MMS proven end-to-end, same day.** scoot-96 confirmed Twilio delivery
(status: delivered, num_media: 1, no error_code) using a test image I
handed off -- caught and fixed a real bug in the process: the blob's
Content-Type was `application/octet-stream` instead of `image/png`
(Azure default when upload doesn't set one explicitly), which could
have made Twilio reject it; fixed via `az storage blob update
--content-type image/png` before handing off the URL. Send-path
plumbing now committed on main: `SMSProvider.send()`/`throttledSend()`
accept an optional `mediaUrl: string[]`
(`ri/src/server/sms/{provider,twilio,send}.ts`). Nothing triggers it
yet -- the "BigMo, send me my lineup pic" intent-routing is still
future work, but the transport layer is proven and ready.

**Roster tally after batch 2:** done in the likeness-first flow —
batch 1 (Rocket Man, Donnie, Kiwi, Black, Rick, Nick, Chef), KennyG,
Jen, batch 2 (Shipp, Rufus, EDub, Anthony, Mike MP3, Bo, Kobe, Reggie)
= 17 of 23 (+ Kevin as an unrostered 24th, pending). Remaining
untouched: Cleo (01), Kenny/Kiwi already done — remaining are 01_CLEO
(likely fine as-is per Brandon's earlier "not Cleo" comment on the old
full-roster pass, but not yet run through this new likeness-first
flow), 14_MCGHEE, 15_JOHN, 17_FRANK, 19_ZELLE, 20_SHELDON, 21_RODNEY.

**Round 18, 2026-08-26 — the rest of the roster, 13 members batch-run
through the front-card pipeline, zero code changes needed.** Brandon:
"GIVE ME THE REST OF THE PLAYERS." Serials 34-DRAFT-13 through
34-DRAFT-25 assigned to KennyG, Reggie, McGhee, John, Rick, Frank,
Chef, Zelle, Sheldon, Rodney, Nick, Jen, Kevin — all had an existing
`34-ROSTER-PULID-{NAME}_figure.png` source blob already in Azure
(Kevin used the V3C correction pass from the earlier bald-hair fix
round; not yet Brandon-confirmed as his final pick among A/B/C, which
read near-identical). Ran the full deployed pipeline unchanged
(`composite_jersey` → `finalize_card.py` → `crop_to_slot.py` →
`build_cards.py`) — 11 of 13 landed clean with no manual intervention,
same "generalizes cleanly" result as the previous zero-intervention
batch (round 11's "next 6").

**Real bug found and fixed: Jen's source blob was stale.** Her
figure came out with the full busy room background (lockers, doors,
table/chairs) baked in — the background-compliance fix documented
earlier in this project (round 2, 2026-08-24, "CRITICAL: completely
plain, solid, empty background" language) was never re-saved under the
blob name the roster-batch script actually points at
(`34-ROSTER-PULID-JEN_figure.png`). Caught via a real signal, not just
visual impression: her composited jersey-mask width came back 360px,
anomalously narrow vs. the rest of the roster's 490-900px range —
background clutter was confusing the darkness-threshold jersey
detector. Found the actual corrected render already sitting in blob
storage under the same recovery-naming pattern used for Kiwi's earlier
fix (`34-ROSTERFIX-JEN_figure.png`) — swapped it in, reran her through
the full pipeline, mask width came back 502px (in line with everyone
else), background clean. **Lesson: when a documented fix's blob name
isn't explicitly recorded, check for a `*-ROSTERFIX-{NAME}` blob before
assuming the fix needs to be redone from scratch** — this is the second
time this exact pattern (Kiwi, now Jen) has saved a full regeneration.

**Sheldon flagged, not fixed — same pose-clash class as Kobe's.** His
raised hand/fist sits directly in front of the FONDE wordmark,
partially obscuring it. Same root cause as Kobe's hand-near-crest issue
from round 11 (a specific source photo's pose overlapping the crest
region, not a detection/placement bug) — same call: leave as-is.

**Chef's long-standing closed-eyes issue not present on this render.**
The old BADASS/comic-graphic-era renders had it (documented extensively
above, PuLID identity conditioning pulling his eyes-closed mid-laugh
expression through even against direct text instruction, never
resolved). This round's PuLID+noir source photo is evidently a
different frame from his reference folder — eyes read open/alert. Not
something this round's pipeline fixed on purpose; worth confirming with
Brandon it holds up, not chasing further unless he flags it again.

**Status: 24 of 25 roster members now have a finished front card** on
the current wordmark pipeline (only Shipp remains blocked, needs a
fresh PuLID source generation with a clean caption-free frame — no
`*-ROSTERFIX-SHIPP` blob exists the way Kiwi/Jen's did). Published
`fairchildlabs.org/card-review-14/`. No commits this round — the fix
was a source-asset swap (existing blob → existing blob), not a code
change; `roster24.csv`/`art_all24` outputs live in this session's
scratchpad only, not the repo (matches this project's existing
convention of keeping roster CSVs as scratch/test data, not committed).

**Round 19, 2026-08-27 — FONDE crest dropped entirely (plain black
jerseys), plus a real fill-contamination bug fixed.** Brandon, visibly
frustrated after ~8 rounds of crest-position tuning: "I'm frustrated
with the FONDE position, I'm leaning toward just removing it and have
black jerseys... before the faces got messed up the only problem was
the Fonde logo." Added `APPLY_CREST = False` in `modal_app_jersey.py`
— short-circuits before the crest-compositing block and returns the
base-color+mesh jersey with no wordmark. The crest-placement code
itself (bbox/collar/head_cx math) is kept, not deleted, in case it's
wanted again later — just dormant behind the flag.

**Second complaint, same message: "shadow effect on Sheldon, Rodney,
Chef, John around chin/beards."** Investigated each individually rather
than assuming one cause:
- **Chef and John: real, confirmed bug.** A dark beard/goatee touching
  the jersey with no gap in the source art gets swept into the jersey's
  own largest-connected-dark-region (the same mask `_find_jersey_mask`
  uses for the fill), so the base-color+mesh fill painted directly onto
  the beard — reading as a gray shadow eating into the chin/mouth. Same
  contamination class as Kiwi's chin-shadow bug from round 9, but this
  time it corrupts the actual pixel fill, not just a crest-size
  calculation. **Fix: this exact problem was already solved once before
  in this project**, on the old segformer-based mask version (commit
  `bc63da7`, "clip the garment mask to below the collar's V-notch...
  before recolor/texture ever runs") — reapplied the identical pattern
  to the current darkness-threshold mask: call the already-existing
  `_find_true_collar_y()` (previously only used for crest vertical
  placement) right after `_find_jersey_mask()` returns, and zero out
  `mask_bool` above that line before the blur/matte/fill pipeline ever
  touches it. Verified clean on Chef and John (before/after crops
  published).
- **Rodney: turned out already clean** on inspection — no beard-bleed
  present even before the fix (his beard has enough separation from the
  jersey). The collar-clip fix left a small cosmetic dark notch artifact
  at the base of his V-neck, not chased further this round.
- **Sheldon: confirmed NOT a compositing bug at all.** Checked his
  original AI-generated portrait (`34-ROSTER-PULID-SHELDON_figure.png`)
  before any jersey compositing runs — the dark gradient under his
  chin/neck is already there, baked in as the model's own dramatic
  chiaroscuro shading (same style choice used roster-wide, just
  extending further down his neck than most other subjects). The
  collar-clip fix can't touch this since it's not jersey-mask
  contamination, it's neck/skin shading in the source image itself.
  Flagged as needing a source-art regen if Brandon wants it addressed,
  not attempted this round.

Reran the ENTIRE 24-person roster (not just the 4 flagged) through the
updated pipeline in one batch to confirm both fixes hold roster-wide
with no regressions — zero manual per-subject intervention needed,
confirmed clean across all 24 cards. Committed `1acc6a5`. Published
`fairchildlabs.org/card-review-15/`.

**Status unchanged on roster completeness:** 24 of 25 have a finished
front card (Shipp still blocked). The crest-position friction that
drove ~8 tuning rounds is now moot — plain black jerseys have no
per-subject placement problem to solve. Remaining open items: Sheldon's
baked-in neck shading (needs regen, not a priority unless Brandon asks),
Rodney's minor V-neck notch, Kevin's V3 pick still not locked, Shipp's
source-art block.

**Round 20, 2026-08-27 — nameplate font-fit + first real tier/handle
data.** Brandon: "Nick's nickname is Trey-Up (but track by first name,
we will put first name on back of cards). The only OGs are Frank and
Cleo and McGhee (in this batch). Reduce the Font size whent he name
extends into the [tier label]" (message cut off; his next reply, "55+",
answered a separate in-flight question about what tier the other 21
should carry — see the standing-preference note below on how that
exchange went).

**Real bug fixed in `build_cards.py`:** the nameplate handle was drawn
at a fixed font size (19pt front / 13pt back) regardless of string
length — "The Nightmare" was already flagged (round 15/16) as crowding
the tier label sharing the same bar, never fixed until now. Added
`fit_font_size()`: measures the tier label's own width at its actual
font (varies per tier string, not a constant), reserves that plus a
10pt gap on the nameplate's right side, and scales the handle font down
by the exact ratio needed to fit the remaining space (one
`stringWidth` measurement suffices since it scales linearly with size —
no iterative search). Applied to both the front nameplate and the back
header (same crowding risk, same fix). Verified "The Nightmare" now
sits clear of "55+" with real spacing.

**First real tier data entered**, replacing the "OG" placeholder used
for the whole roster since round 1: Cleo, Frank, McGhee = OG (amber
accent); everyone else in the 24-person batch = 55+ (new tier added to
`TIERS` — same bone color the untracked default already rendered, now
explicit since it's real data rather than a fallback). Nick's card
`handle` changed to his actual nickname "Trey-Up"; the `name` field
stays "Nick" (his first name) per Brandon's instruction to track him by
first name — that field is what the not-yet-built back-of-card design
will surface.

Rebuilt and verified all 24 cards. Committed `a14a02d`. Published
`fairchildlabs.org/card-review-16/`.

**Immediate follow-up, same round.** First publish of card-review-16
had a real bug: the 14-19 sheet (which has Frank and McGhee on it) was
uploaded to the server but never actually referenced in the page's own
HTML, so it was invisible — Brandon's "what happen to Frank and
McGhee?" was a fair catch of a real publishing mistake, not a rendering
bug (both cards were correct all along). Fixed by linking the sheet.
Then Brandon added a 4th OG: **Reggie is also OG** (was 55+) — updated
`roster24.csv`, rebuilt, verified the amber accent shows on his card,
republished. Tier tally after this round: **OG = Cleo, Frank, McGhee,
Reggie; 55+ = the other 20.** `roster24.csv` remains scratchpad-only,
not committed (matches this project's existing convention for roster
CSVs) — if this session ends, the tier assignments above are the
source of truth to reconstruct it from, not a committed file.

**Standing workflow note: this session, `AskUserQuestion` was rejected
mid-flow (2026-08-27) and Brandon just typed a one-word answer ("55+")
directly in chat instead.** In this fast-iteration art-director
workflow — rapid rounds of "show me / here's what's wrong / fix it" —
prefer asking clarifying questions as plain chat text over the
structured multi-choice tool; it seems to break his flow. Doesn't
necessarily generalize to other projects/sessions, but worth defaulting
to plain-text questions for the rest of this player-cards track.

**Round 22 (informal numbering — scratch scripts call it "r22"),
2026-08-26/27 — session got OOM-killed mid-batch, resumed and completed
2026-08-27.** Continuing past round 20/21 (nameplate font-fit + tier
data, both already committed), the same session started replacing round
19's collar-clip beard/mesh-bleed fix with a different technique in
`modal_app_jersey.py`: `_largest_dark_region()` gained an `open_kernel`
param that erodes first to sever thin/moderate bridges (beard touching
jersey with no real gap), picks the largest surviving connected
component, then dilates back within the ORIGINAL dark pixels to restore
true jersey edges without shape loss — applied at mask-detection time
(`open_kernel=17`) rather than as a post-hoc clip. Validated clean on 5
test cases, then launched the full 24-person regeneration. **This exact
batch is what triggered the OOM crash described in
[[infra_dreamlab_oom_reboot_2026_08_24]]** — the finalize step
launched all 24 `finalize_card.py` calls concurrently, which killed the
Claude Code session itself partway through (only 6/24 finalized:
01/Cleo, 11/Bo, 13/KennyG, 15/McGhee, 17/Rick, 20/Zelle).

**Resumed cleanly the next day, 2026-08-27, from surviving scratch state**
(raw jersey composites for all 24 had already made it to Azure blob +
local scratch before the kill — only the finalize/crop/build steps were
incomplete). Finished the remaining 18 `finalize_card.py` calls
**sequentially this time** (~8s/card, zero memory pressure), ran
`crop_to_slot.py` and `build_cards.py` for the full 24 against
`roster24.csv` (already had the final tier/handle data from round 20/21:
OG = Cleo/Frank/McGhee/Reggie, 55+ = the other 20, Nick's handle
Trey-Up). Spot-checked Chef/John/Rodney (the round-19 beard-bleed test
cases) — clean on all three, no seam or shadow contamination, erosion
approach appears to hold as well as or better than the collar-clip
version it replaces (no sign of Rodney's old "small cosmetic dark notch"
artifact at this resolution, not yet pixel-verified). Front sheets sent
to Brandon for review via SendUserFile (not yet published to
fairchildlabs.org, not yet committed — `modal_app_jersey.py`'s
`open_kernel` change is still uncommitted in the working tree pending
his verdict).

**Shipped 2026-08-27:** Brandon confirmed (noted review-16 "still has the
shadows") and asked for a new review page. Committed the `open_kernel`
erosion fix (`8e36b23`) and published `fairchildlabs.org/card-review-17/`
(sheets renamed to the established `sheet_{first}-{last}.png` convention:
01-07, 08-13, 14-19, 20-25; www-data ownership). Round 22/review-17
superseded card-review-16 (which still had the beard/shadow bug on
Chef/John).

**Round 23, same day — second real bug found on review-17: rectangular
shadow band around the torso/collar, "most visible and regular on
Bo/Kobe/KennyG."** Root cause: `_find_jersey_mask()` zeroed out the top
42% of the frame OUTRIGHT (`dark[: int(H*0.42), :] = 0`) before searching
for the jersey region, to keep hair/head out of the darkness search —
this predates both round 19 and round 22, and is a DIFFERENT code path
than the row-clip round 19's own docstring already warned about
("unlike a blanket row-clip which cuts real jersey area too... left a
visible rectangular seam on every subject" — that warning was about a
different, already-reverted attempt, but the exact same failure mode
was still live here). Any subject whose real jersey/shoulder extended
above that fixed line had it silently discarded, leaving the AI's own
unprocessed (differently shaded) art showing above a hard, dead-straight
boundary — worst on subjects whose true collar sits right at that line.

**Fixed:** `_largest_dark_region()` gained `min_centroid_y` — filters
which CONNECTED COMPONENT is eligible to be picked as "the jersey" (still
keeps hair/head from winning) instead of deleting pixels first, so a
real jersey's full extent survives once its component is selected.
Verified via a targeted 6-person test (Bo/Kobe/KennyG for the seam,
Chef/John for beard-bleed regression, Cleo as a general check) before
committing to the full batch — Kobe's collar in particular went from a
visibly banded seam to reading seamlessly into the mesh. Full 24-person
re-run confirmed clean, no regression on the beard-bleed fix. Committed
`96a74c4`, published **`fairchildlabs.org/card-review-18/`** — current
shipped state, supersedes review-17.

**Round 24, 2026-08-27 — QR/hash lookup mark added to the front, front
considered feature-complete.** Brandon: tiny QR in the top-right
whitespace, mirrored from the glyph disc's top-left placement, plus a
short typeable hash as a fallback (paper printout may need to be typed
into a screen, not scanned). Design: 6-char uppercase hex, deterministic
`sha256(serial + secret)[:6]` — not the serial itself, since the
sequential `34-DRAFT-NN` pattern would let one card leak how to guess
the rest of the roster. No stored mapping table needed: with a fixed
~25-person roster, resolving a code back to a player just means
checking it against every known serial's own derived code at
lookup time. QR encodes `https://thedreamlaboratory.org/c/<code>` —
**placeholder, that route doesn't exist yet**, nothing wired to the
Scoot app; purely print-ready art for now.

Iterated on size/weight with a single-card spot check first
(`card-review-19`) before running the full batch — first pass (34pt QR,
thin gray code) got "the right part looks cut off, make the QR
slightly smaller, hash bold." The "cut off" read turned out to be a bad
crop in the screenshot sent for review, not a real clipping bug (full
sheet render confirmed card edges intact) — worth remembering: crop
narrowly for a close-up and it can misread as a defect. Shrunk to 28pt,
switched the code to `MonoBold` (registered `DejaVuSansMono-Bold.ttf`,
new font key) in full ink black instead of muted gray. Verified via
`cv2.QRCodeDetector` that it decodes to the exact expected URL at both
sizes before ever showing Brandon anything. Approved second pass
("placement and style" good). Committed `950786b`, full 24-person
rebuild published `fairchildlabs.org/card-review-20/`.

**Front card status: considered feature-complete** pending Shipp's
still-blocked source art (needs a fresh PuLID generation with a
caption-free frame) and any further polish Brandon flags. **Next up:
the back of the card** — comparatively unstarted. `roster24.csv`'s
stats/vitals columns (`g`, `winpct`, `plusminus`, `profile_1/2/3`, etc.)
are still all placeholder `—`; the light-jersey headshot art for
`draw_back()`'s side-pose panel (`composite_jersey(side="light")`
exists in the pipeline but has never actually been run); and Brandon
hasn't reviewed a single back card yet, unlike the front's many review
rounds. `feedback_prefer_server_hosting` was also reinforced this round
(2026-08-27) — see [[feedback_prefer_server_hosting]] — always publish
a link, even for a one-image spot check, never send a raw file.

**Round 25, same day — printed serial replaced with edition label.**
Brandon caught a real gap in round 24's own design intent: the card's
small-print text still showed the real `34-DRAFT-NN` serial, which
defeats the entire point of hashing the serial for the QR (anyone
holding one card could read the next card's serial straight off the
face, no scanning needed). New `edition_label(row)` prints
`34-<edition>` (from the CSV's already-existing `edition` column) in
that spot instead — identical on every card in a print run, only
changes on reprint. Applied to both front and back's serial-display
spot; the internal `serial` variable (art filenames, `short_code()`
input) is untouched. Committed `27214a3`, published
`fairchildlabs.org/card-review-21/`.

**Round 26, same day — Shipp unblocked, 25/25 roster complete.** Brandon:
"Shipp fix." Root cause (documented since round 14): every usable frame
in Shipp's source folder (`~/Nick/work/people/02_SHIPP/`) that had been
tried before had a burned-in red "SHIPP" caption baked into the video,
rendering straight through into every generation attempt. Re-inspected
all 17 raw frames in that folder directly rather than reusing an old
subject photo — `f_0017.jpg` is clean (no caption), camera-facing,
waist-up. Ran him through the exact locked pipeline the rest of the
roster uses: `modal_app_kontext_pulid.py`'s `PulidKontextGenerator`
(seed 552011, `STYLE_NOIR` + `FRAMING_MALE` + `EXPRESSION_SERIOUS`
prompts recovered from the round-18-era session transcript since they'd
never been promoted out of scratch scripts), then
`modal_app_jersey.py`'s `composite_jersey` → `finalize_card.py` →
`crop_to_slot.py` → `build_cards.py`. **Zero code changes needed** —
first-attempt clean generation, no caption, good likeness; the current
pipeline (erosion-based beard fix, collar-seam fix, QR/hash mark,
edition label) just worked on a new subject unchanged.

Assigned serial `34-DRAFT-02` — the gap that's been sitting in the
`34-DRAFT-NN` sequence since round 1 (Cleo=01, next real card=03) was
always Shipp's reserved slot, matching his `02_SHIPP` source-folder
number. Added to `roster24.csv` (55+ tier, Guard — no stronger signal
available on those fields for him yet). No `fairchildlabs.org/card-
review-*` round or memory before this one ever actually closed his
case despite being flagged repeatedly (rounds 14, 18) — always check
the subject's raw source folder directly for a caption-free frame
before assuming a fresh photo shoot is needed.

Published `fairchildlabs.org/card-review-22/` — **first review page
covering all 25 roster members** (previous rounds were always 24,
Shipp missing). Front card work is now genuinely complete across the
whole roster. Next: the back of the card (see round 24's note above —
stats/vitals still placeholder, side-pose light-jersey art never
generated, no back card reviewed yet).

**Round 27, 2026-08-27 — new source video (`NickFondeBrothers_v3.mp4`), 7
new roster members found and shipped, 25→32 total.** Brandon copied a new
v3 video ("superset of v2"), asked to archive it and run the breakdown
on it, skipping existing roster members, generating cards for anyone
new. Explicitly said not to block on per-player Q&A while he was away.

**v3 is NOT v2 + appended footage — it's substantially re-edited.**
Verified directly: spot-checked timestamps matching v2's original
`roster.md` windows (e.g. Rick @402s, Frank @424s) and found completely
different people there in v3. The old timing map was useless; redid the
breakdown from scratch — 1fps frame extraction (615 frames) across the
whole 10:15 runtime, contact-sheet visual scan (far faster and more
reliable than tesseract OCR, which was slow — ~40min projected for the
full pass — and noisy on busy gym-crowd backgrounds; OCR results cross-
checked afterward as a safety net, confirmed no missed names). Everyone
from ~365s onward matched existing roster captions exactly (Brandon,
Donnie, Bo, KennyG, Reggie, Kevin, McGhee, John, Rick, Chef, Zelle,
Sheldon, Rodney) — new material was concentrated entirely in the first
~170s, before the footage settles into already-known names (Anthony,
Cleo, Shipp, Rufus, EDub).

**7 new people found: Jennifer, AJ, Ray, Jerry, Debra, Tim, Marko.**
Confirmed each is genuinely new, not a rename/duplicate — specifically
checked "Jennifer" against the existing roster's "Jen" (34-DRAFT-24):
completely different woman, different hair, different video source
entirely (Jen's source photo carries a "TEXAS HISTORIAL RECORD" watermark
from an unrelated shoot). Assigned continuing serials 34-DRAFT-26
through 32, tier 55+ (no stronger data available), position alternated
Guard/Forward arbitrarily.

**New extraction technique: pillarbox cropping instead of frame-hunting.**
Unlike the rest of the video (brief drop-in captions with clean gaps
between them, e.g. Shipp's fix), these 7 people's clips are individually-
shot vertical phone video, pillarboxed into the 16:9 frame, with a
PERSISTENT name caption for the entire clip — every single 1fps sample
across each person's whole window had the caption, no gap existed to
exploit. But the caption sat entirely within the black pillarbox bars
(auto-detected via column-brightness scan, identical `[656:1263]` px
window on all 7 clips, zero overlap with actual footage) — cropped to
just the real content instead of hunting for a clean frame. Generalizes:
if a future subject has a fully-persistent caption, check whether it's
sitting in unused letterbox/pillarbox space before assuming no fix
exists.

**Pipeline ran unchanged, zero code changes needed** — same PuLID+noir
generation (seed 552011, FRAMING_MALE/FRAMING_FEMALE, EXPRESSION_SERIOUS
recovered from the round-18-era transcript), same jersey/collar-seam
fix, same QR/edition-label front card. One wrinkle: the cropped identity
photos are narrower/taller (608×1080 portrait) than the rest of the
roster's source photos, so Kontext's output aspect followed suit
(752×1392 vs the usual ~1400×2000-ish) — `crop_to_slot.py`'s math
produced large negative-coordinate crops to reach the target aspect,
which looked alarming in the log output but rendered correctly (source
PNGs have transparent margins, so the "out of bounds" crop is just extra
whitespace, not corruption). Confirmed visually on all 7, no fix needed.

**Real open issue, flagged not fixed: Tim (34-DRAFT-31) has a speckle/
noise artifact** on his shoulder from the `rembg` cutout step. Tried the
same fix that worked for Anthony (`MODEL_OVERRIDE` → `u2net`) — made it
dramatically worse (lost his entire torso, kept only a floating head),
reverted immediately. Left as a known cosmetic defect, not a broken
card — his face/likeness reads fine. Worth a fresh look in a later round
with more time, not urgent.

Published **`fairchildlabs.org/card-review-23/`** — current shipped
state, 32-card roster. `v3` video itself archived to Azure blob storage
at `stevearchive10723/media/source-video/NickFondeBrothers_v3.mp4`
(Google Drive copy explicitly deferred by Brandon — "not hooked up
yet"). All new-people scratch files (clean-cropped identity photos, SAS
URL lists, generation scripts) live in this session's own scratchpad
(`cd96f0f9-30dc-43a1-9570-e939a94424ad`) under `v3_breakdown/` and
`new_people*` — not the repo, matching this project's existing
convention that roster CSVs/scratch generation scripts stay out of
version control.

**Round 28, same day — Debra whitewashing bug (real, unresolved), Nick
2nd option, Jen/Jennifer kept as two cards.** Brandon: Debra needs to be
"more flattering" (her original card's `EXPRESSION_SERIOUS` read as
sunken/tired, not a game-face), keep both Jen and Jennifer for the real
Jen to pick between, and build a second Nick card option from his other
video set.

**Debra: 4 regeneration attempts, all failed the same way.** (1) Warm
smile expression — whitewashed her (light skin, blonde hair, unrecognizable).
(2) Same + explicit "she is Black with medium-dark brown skin, do not
lighten it, do not change her ethnicity" lock plus real hair color
("dark brown with auburn tones") — still whitewashed, no better. (3)
Toned the expression language down further + lowered guidance 2.5→2.0
to lean harder on the reference photo — still whitewashed. (4) Much
more conservative "calm, pleasant, eyes soft, mouth relaxed" wording,
close to the original's structure, guidance back to 2.5 — **still
whitewashed.** All four kept identical seed/style/framing/PuLID
settings, changing only the expression text (and once, guidance). This
is a stronger, more reproducible version of the "ANIME whitewashing"
pattern already documented earlier in this project — here it recurred
on the noir+PuLID pipeline that had otherwise been reliable on skin
tone across the whole roster, specifically triggered by pushing toward
a smiling/warm expression. Reverted her blob back to the original
(correct skin tone) generation rather than ship something that doesn't
read as her. **Real fix likely needs the masked ReferenceLatent
technique already proven in this project (KennyG's skin/hair correction,
Rufus's hair fix)** — mask her face, condition on a real crop of her
own photo — not another round of text-prompt tuning. Flagged to
Brandon, not silently resolved.

**Nick's second card option, sourced from his OTHER video set.** Memory
already noted Nick has two source video sets: "getwell shoot" (used for
the current card, `f_0515.jpg`) and "hallway shoot" (`nick.MP4`, 4K,
never used for a generation). Neither video was still local — restored
`nick.MP4` (3.3GB) from the `azarchive` cold-storage rclone remote
(`azarchive:media/nick-getwell/source/`, alongside `NickFondeBrothers_v2.mp4`
itself — worth remembering both original source videos live there, not
just extracted frames). Picked a clean, direct-facing frame at 2:30,
ran through the identical pipeline (serial `34-DRAFT-23-V2`, doesn't
overwrite the real `34-DRAFT-23`), zero code changes, zero whitewashing
issue (v1/v2 both read correctly). Deleted the local video copy after
use (already safe in cold archive, no need to keep 3.3GB locally) — see
[[feedback_archive_share_after_use]] for the same pattern.

**Jen (34-DRAFT-24) and Jennifer (34-DRAFT-26) both stay** — no merge,
no dedup. Brandon's call: let the real Jen choose which card she wants
once this reaches her.

Published **`fairchildlabs.org/card-review-24/`** — Nick v1/v2 + Jen/
Jennifer + Debra (reverted) side by side. Roster CSV/serials unchanged
from round 27 (32 people) — this round was pure art iteration on 3
existing slots, no new roster members, no code changes to the
pipeline itself.

**Round 29, same day — final decisions applied, 31-person roster.**
Brandon: Nick v1 (original card, keep as-is), drop Debra entirely
(whitewashing bug from round 28 never got fixed, not worth shipping a
card that doesn't read as her), keep both Jen and Jennifer unchanged.
Removed Debra's row from `roster24.csv`, rebuilt the full set —
**31 people, down from 32.** Published `fairchildlabs.org/card-review-25/`
— current shipped state. Debra can be revisited later via the masked
ReferenceLatent correction technique (see round 28) if Brandon wants
her added back; not attempted again here per his explicit call to drop
her rather than keep iterating.

**Round 30, 2026-08-27 — back-of-card template already existed, just
never rendered against real art.** Brandon asked to start the back:
white jersey, smaller frame area, blank stat line, player profile text
area — "but I think we may have already had a template." Correct:
`draw_back()` in `build_cards.py` was fully built (season/career stat
table, profile text block, ghosted token watermark, 52×62pt side-pose
panel) but had never actually been run against real roster art since
the pipeline moved to the darkness-threshold jersey detection. The
"light" (white) jersey recolor is entirely local — `jersey_variant()`
recolors the existing `{serial}_figure.png` + `{serial}_jersey_mask.png`
pair via a luminance-based PIL blend to the `JERSEY["light"]` colors
(`#F4F1E8`/`#BFBBAD`), no new Modal generation needed at all. Ran it
against the full 31-person roster, **zero code changes required** —
worked cleanly across genders/hair styles/tiers on the first attempt.
Published `fairchildlabs.org/card-review-26/`.

**What's actually left for the back is content, not code:** real
season/career stats per person, real 3-line profile bio text (spec:
~28 chars/line, hard limit), and Brandon's call on whether the
side-pose panel should get a real second photo/angle eventually or
stay as the same front pose just recolored. None of that is fabricatable
— needs his input or real data, not more pipeline work.

**Round 31, same day — back panel polish: headshot crop, no black bg,
simplified vitals.** Brandon: drop the black background on the side
panel, make it more of a headshot with the white jersey just visible at
the shoulders (not the same waist-up front pose shrunk down), and
simplify the vitals line to just "Fonde Rec Center" (was
handle·position·home — position isn't real data yet, handle's already
in the header). New `head_crop()` in `build_cards.py`: derives a tight
head-and-shoulders crop from the light-jersey art's own alpha-content
bbox (not fixed pixel coordinates), so it generalizes across the
roster's real per-subject scale variation — verified clean on the full
31-person set on the first attempt, including long hair (Jennifer),
beanies (Kiwi), beards (Tim). New `HOME_LABELS` dict maps the roster
CSV's short `home` key ("Fonde") to the full display string ("Fonde Rec
Center") for the vitals line. Committed `f5fb235`, republished
`fairchildlabs.org/card-review-26/` in place (same URL, updated
content).

**Note for future rounds:** the old SAS-token blob URLs
(`raw_urls_r19.txt` and similar) expire ~24h after generation — regenerate
fresh ones from the storage account key rather than assuming a prior
session's URLs still work. Special-cased blob names to remember (not the
default `34-ROSTER-PULID-{NAME}_figure.png` pattern): Kiwi and Jen use
`34-ROSTERFIX-{NAME}_figure.png`, Kevin uses
`34-ROSTER-PULID-KEVIN-V3C_figure.png`, Anthony uses
`34-ROSTER-PULID-ANTHONY-BALDFIX_figure.png`. PDF/sheets/scratch files
for round 23 live in this session's own scratchpad
(`cd96f0f9-30dc-43a1-9570-e939a94424ad`), not the OOM-killed session's —
different session, different scratchpad path. Round 22's files live in
`/tmp/claude-1000/-home-brandon-scoot/5e56fcf2-315e-4fe3-9a33-8b836065384a/scratchpad/cards6/`
(`cards_r22.pdf`, `sheet_r22-*.png`, `art_r22/`, `art_r22_crop/`,
`raw_r22/`) — that's a different session's scratchpad than whatever
session continues this work next, so if picking this up in a fresh
session, don't assume the default scratchpad has these files; the path
above is the one that matters until this round ships and gets cleaned
up.
