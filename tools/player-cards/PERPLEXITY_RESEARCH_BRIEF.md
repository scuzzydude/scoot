# Research brief: facial likeness in stylized (cel-shaded anime) card art

Paste everything below the line into Perplexity. Written so a fresh
session can act on the answers without re-deriving this context.

---

## Context

We generate cel-shaded anime-style trading-card illustrations from a real
photo, using a self-hosted pipeline: ComfyUI running on Modal (serverless
GPU), SDXL checkpoint `cagliostrolab/animagine-xl-4.0`, ControlNet
(lineart + openpose, driven by the subject's photo) for pose, and an
IPAdapter pass for style transfer against one locked style-reference
image. The cel-shaded style itself (bold black lineart, flat color, hard
shadows, no gradients) is solved and locked — the open problem is
**facial likeness**: the generated face needs to be recognizable as the
specific person in the source photo, not just "a face."

## What we've already tried (don't re-recommend these blind)

1. **IP-Adapter FaceID Plus V2** (`h94/IP-Adapter-FaceID`, InsightFace
   `buffalo_l` embedding, via `cubiq/ComfyUI_IPAdapter_plus`) — weight 1.0:
   no visible identity effect (embedding computed, confirmed via logs, but
   negligible visual influence). Weight 1.8: degraded overall image
   coherence instead of adding identity.
2. **PuLID** (`cubiq/PuLID_ComfyUI`, InsightFace `antelopev2`, EVA-CLIP,
   `huchenlei/ipadapter_pulid` weights) — swept method × weight:
   - `fidelity`, weight 1.0: **best result so far** — real eyebrow/eye/
     mouth structure appeared for the first time, but not confidently
     recognizable as the specific person.
   - `fidelity`, weight 1.2 and 1.6: blank face / chaotic noise
     respectively — worse, not better.
   - `style`, weight 1.0: blank face.
   - `neutral`, weight 0.7 (per PuLID's own docs' recommendation for this
     method): blank face plus an odd color-lighting artifact.
3. **Dedicated tight face crop** as the identity-conditioning image
   (instead of the same full-body cutout ControlNet uses) — theory being
   the face is a small fraction of a full-body/bust composition, so
   identity signal is diluted. Result: comparable to the best result
   above, not a clear improvement.
4. **Face-detailer / crop-refine-paste-back** (hand-built, no new custom
   node): detect the face in the *generated* illustration via InsightFace
   (had to lower `det_thresh` from 0.5 to 0.05 — the default is calibrated
   for real photos and doesn't fire on flat-color anime art), crop it out
   so it fills the whole working frame, run a short img2img pass (denoise
   0.6) with PuLID identity conditioning at that scale, feather-blend the
   refined crop back into the original. Result: **worse than doing
   nothing** — erased facial structure the base generation already had
   and introduced a garbled artifact near the mouth.

Ten real combinations total, all converged on the same ceiling. This
stopped looking like a settings problem — methods, weights, image
sources, and a structurally different compositing architecture all
landed in the same place.

## Constraints for any recommendation

- Must be feasible to integrate into an existing ComfyUI graph running on
  Modal (self-hosted serverless GPU) — not a full rebuild of the
  pipeline, though swapping the base checkpoint or the identity method is
  fine.
- Output style must stay cel-shaded / flat-color / bold-lineart anime —
  **not** photorealistic. Any identity method that pulls hard toward
  photoreal is a problem, not a solution.
- Self-hosted is preferred over a third-party hosted API where
  reasonably possible — this project generates cards from real members'
  photos, and sending those to another vendor is a real consideration,
  not a footnote. If a hosted API is genuinely the best answer, say so
  clearly and flag the data-handling/privacy terms rather than defaulting
  to it.
- Open to swapping the base SDXL checkpoint entirely if that's what
  actually unlocks reliable identity preservation with a good identity
  method — style can be re-locked against a new checkpoint if needed.

## Questions to research

1. What are the current (check as of today, not older cached knowledge)
   best-in-class methods specifically for identity-preserving
   **stylized/anime** generation — as opposed to photoreal — beyond
   IP-Adapter FaceID, PuLID, and InstantID? Anything newer (2026) worth
   knowing about?
2. Are there SDXL-family anime checkpoints known to pair more reliably
   with identity-preservation adapters (PuLID, InstantID, FaceID) than
   Animagine XL 4.0 — e.g., Illustrious-XL, NoobAI-XL, or others? Is there
   a documented reason some anime checkpoints hold identity better than
   others under the same adapter?
3. Is there known guidance on why a "face detailer" crop→refine→paste
   pipeline (denoise ~0.6, identity conditioning active) might make a
   face *worse* than the un-refined original — wrong denoise range,
   wrong node/conditioning order, a known pitfall with PuLID specifically
   in an img2img (not txt2img) context?
4. Are there hosted APIs (fal.ai, Replicate, Leonardo.ai, others)
   offering identity-preserving stylized/anime avatar generation
   specifically (not just photoreal)? For each: pricing, self-hostable
   alternative if one exists, and stated data-handling/retention policy
   for uploaded reference photos.
5. Are there face-swap-style approaches (post-process compositing a real
   likeness onto a stylized face, rather than conditioning generation on
   an embedding) that are known to work well for anime/cel-shaded output
   specifically?

Report back with concrete tool/repo names, version or release recency,
and enough detail to act on directly — this will be read by someone
picking the project back up cold.
