---
name: project-player-cards-facial-likeness
description: "Player-card art pipeline works end-to-end (Modal/ComfyUI); facial likeness is the open blocker, Tier 1 done (negative), Tier 2 LoRA pilot paused on source-photo collection"
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-08-19T13:35:39.772Z
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

Blocked on source photos: the plan assumed 72 video frames at
`~/Nick/work/people/09_BRANDON/` would give enough training data.
Inspection found otherwise — frames past `f_0293` are a different
person ("Donnie"), and nearly the whole Brandon range has a burned-in
"BRANDON" name-card graphic overlapping the face. After filtering, only
6 clean frames survive, collapsing to 2 real distinct moments (same
angle/lighting/shirt throughout — one continuous phone clip). Asked
Brandon; he chose to send more photos before running the pilot rather
than run now on data too thin to fairly test the LoRA mechanism. Staging
folder + instructions for what to add:
`tools/player-cards/art/lora_training/brandon/README.txt` (gitignored,
not committed — personal photos). **Resume at PLAN_facial_likeness.md
Tier 2 step 3** (captions + the actual Modal training function) once
more photos land there.

**Where to pick this up:**
- `tools/player-cards/FACIAL_LIKENESS_RESEARCH.md` — full research,
  sourced, with an explicit evidence-gaps section.
- `tools/player-cards/PLAN_facial_likeness.md` — prioritized plan, now
  has Tier 1's result and Tier 2's paused status inline.
  Tier 3 (bigger, only if Tier 2 is unacceptable): USO on FLUX.
- See [[scoot_currency_ledger]] and [[project_plan]] for where this sits
  relative to the main Phase 5 ledger work — player-cards is a parallel
  track, not blocking Phase 5b.
