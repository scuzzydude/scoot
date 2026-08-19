---
name: project-player-cards-facial-likeness
description: "Player-card art pipeline works end-to-end (Modal/ComfyUI); facial likeness open blocker, Tier 1 + Tier 2 LoRA both tried and negative -- see confound note on pose before concluding LoRA itself failed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-19T14:46:57.017Z
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

**Confound flagged, not yet isolated:** v6's own baseline (no identity
mechanism at all) is *also* facially weak on this exact pose —
downward-tilted head, self-occluding the eyes. Every likeness test in
this project has reused the same pose/seed, so it's not yet known
whether a more front-facing pose would do better regardless of identity
mechanism. Worth testing before concluding LoRA itself is a dead end —
see PLAN_facial_likeness.md Tier 2 step 4's note for the exact framing.

**Where to pick this up:**
- `tools/player-cards/FACIAL_LIKENESS_RESEARCH.md` — full research,
  sourced, with an explicit evidence-gaps section.
- `tools/player-cards/PLAN_facial_likeness.md` — prioritized plan, now
  has Tier 1's result and Tier 2's paused status inline.
  Tier 3 (bigger, only if Tier 2 is unacceptable): USO on FLUX.
- See [[scoot_currency_ledger]] and [[project_plan]] for where this sits
  relative to the main Phase 5 ledger work — player-cards is a parallel
  track, not blocking Phase 5b.
