---
name: project-player-cards-facial-likeness
description: "Player-card facial likeness: SOLVED via FLUX.1 Kontext (Tier 4). v1 breakthrough (likeness+full body+style, one shot), v2/v3 tuned crop/muscle/cartoon-face per Brandon's feedback, no regressions. Cost ~$0.02-0.03/card, ~$0.81/roster -- no per-subject training"
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-19T17:41:38.598Z
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

**Where to pick this up:**
- `tools/player-cards/FACIAL_LIKENESS_RESEARCH.md` — full research,
  sourced, with an explicit evidence-gaps section.
- `tools/player-cards/PLAN_facial_likeness.md` — prioritized plan, now
  has Tier 1's result and Tier 2's paused status inline.
  Tier 3 (bigger, only if Tier 2 is unacceptable): USO on FLUX.
- See [[scoot_currency_ledger]] and [[project_plan]] for where this sits
  relative to the main Phase 5 ledger work — player-cards is a parallel
  track, not blocking Phase 5b.
