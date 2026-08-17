# Scoot(34) player card art pipeline

See `arch/player-cards.md` (v1.2) for the full spec this implements. The
generation side (this README, `workflow_player_card.json`,
`prep_cutout.py`, `finalize_card.py`) was built on **dreamlab** (no GPU) —
structurally validated here, actual generation runs on Modal (see the v1.2
spec's update note in §1b). `build_cards.py` + `assets/` (sheet assembly +
the real scoot glyph mark) arrived 2026-08-17 from the other side of this
project and are canonical, not placeholders.

This folder holds what we authored plus what was handed off — the workflow
graph, two pre/post-processing scripts, the card-assembly script, and the
glyph assets. It does NOT include a ComfyUI checkout or any model weights —
those are reproducible from public sources (see below) and don't belong in
git. To actually run this:
- `workflow_player_card.json` is portable — drop it into any ComfyUI
  install's root (or its `user/default/workflows/` folder) and load it from
  the UI, or POST it to that install's `/prompt` API endpoint.
- `prep_cutout.py` and `finalize_card.py` only need `pip install
  "rembg[cpu]" pillow numpy` — no ComfyUI/torch dependency for either one,
  they're plain pre/post-processing.
- `build_cards.py` needs `reportlab` + `pillow` + `numpy`, a `roster.csv`
  (per-edition, not checked in), and `art/` populated with
  `{serial}_figure.png` + `{serial}_jersey_mask.png` per player.
  `assets/` must stay a sibling directory — the glyph path resolves
  relative to the script's own location, not the CWD.

## What's built, what isn't

**Built and working, right here, no GPU needed:**
- `prep_cutout.py` — rembg cutout of a player from a source photo (this IS
  the same technique already validated against the Nick get-well video
  frames — see `~/Nick/work/roster.md`)
- `finalize_card.py` — post-processing: re-mattes alpha with rembg's
  anime-tuned model, hard-thresholds it, verifies true RGBA (refuses to
  write a file with a flat/degenerate alpha channel), cleans up the jersey
  mask. Smoke-tested end to end.
- `workflow_player_card.json` — the ComfyUI graph itself, 21 nodes,
  every `class_type` verified against the actual installed node source
  (not guessed). Structurally sound.

**Not done — needs the GPU box:**
- No model weights are downloaded here (deliberately — they're multi-GB
  each and dreamlab's disk habit is "don't fill the SSD," see the Nick
  video storage work). See below for exactly what to fetch.
- No actual generation has been test-run. The graph loads correctly but
  every placeholder (`*_PLACEHOLDER*`) in `workflow_player_card.json`
  needs a real value before it'll run.
- Prompt skeleton below is a first draft — needs your eye on real output
  before it's trustworthy.

## Models to download onto the GPU box

Place under `ComfyUI/models/<subfolder>/`, matching ComfyUI's normal layout.

| Node | Subfolder | What | Suggestion |
|---|---|---|---|
| 2 (checkpoint) | `checkpoints/` | Anime/comic-style SDXL checkpoint | Start with an Illustrious-XL or Animagine-XL family finetune — both have strong bold-linework, cel-shaded output that matches "hard-edged shadows, bold contour lines, no gradients." Whatever you pick, it needs to actually produce flat cel-shading, not painterly anime — check example galleries before committing. |
| 7 (controlnet) | `controlnet/` | SDXL Union ControlNet | `xinsir/controlnet-union-sdxl-1.0` — one file drives both the lineart pass (node 8) and openpose pass (node 9), instead of downloading two separate SDXL ControlNets. If it underperforms on either, fall back to two dedicated models and two separate `ControlNetLoader` nodes. |
| 12 (ipadapter) | `ipadapter/` + `clip_vision/` | SDXL IP-Adapter Plus + its CLIP vision encoder | `ip-adapter-plus_sdxl_vit-h.safetensors` + the matching ViT-H CLIP vision model. `IPAdapterUnifiedLoader`'s "PLUS (high strength)" preset expects these specifically — check `ComfyUI_IPAdapter_plus`'s README for the exact expected filenames, it's picky about this. |

## The style reference image (node 13)

This is the single biggest lever for "34 cards read as one set." It needs
to be ONE image, fixed for the whole edition, that embodies the target
look — flat 2-3 tone cel shading, bold contour lines, the comic/manga style
you want every card to share. Doesn't need to be a Scoot player; needs to
be a strong, unambiguous example of the target rendering style. Whatever
you pick, treat it like the seed — decide once, don't swap it mid-edition.

## Prompt skeleton (node 3) — DRAFT, needs your eye on real output

```
cel-shaded comic illustration, flat color, bold black contour lines,
hard-edged cast shadows, two to three tone shading per material, no
gradients, no airbrush, no soft shading, dynamic basketball pose,
plain transparent background, no scenery, no court, no crowd, single
figure, full body
```

## Negative prompt (node 4) — DRAFT

```
photorealistic, photo, 3d render, soft shading, airbrush, gradient,
blurry, extra limbs, extra fingers, watermark, text, background,
scenery, court, crowd, multiple people
```

## Running one player through it (once models are in place)

1. `python prep_cutout.py <source_frame.jpg> cutouts/<serial>.png`
2. Load `workflow_player_card.json` into ComfyUI (or POST it to `/prompt`
   via the API — better for batching all 34). Before running:
   - node 1 `image` → `cutouts/<serial>.png`
   - nodes 19, 21 `filename_prefix` → include `<serial>`
   - everything else stays fixed once set for the edition (checkpoint,
     controlnet, ipadapter, style reference in node 13, seed in node 16,
     prompts in nodes 3/4)
3. `python finalize_card.py <serial> <raw_figure_output.png> <raw_jersey_mask_output.png> art/`

Repeat step 1–3 per player, same fixed settings throughout. Once a handful
look right and consistent as a set, batch the rest.

## Jersey mask caveat

`segformer_b2_clothes` (node 20) was trained on real clothing photos, not
comic illustrations. It's the right *kind* of tool (dedicated clothing
segmentation, not asking the diffusion model to somehow output a mask), but
accuracy on generated art needs spot-checking, especially on poses where
the jersey is partly obscured (arms crossed, back turned, etc).
