# Scoot(34) Player Card — Template Spec

Version 1.2 · 2026 edition

Source of truth for the physical trading-card pipeline BigMo will eventually
drive. `build_cards.py` (sheet assembly) and `assets/` (the scoot glyph mark)
now live in this repo at `tools/player-cards/` — canonical, delivered
2026-08-17, not placeholders.

> **v1.2 supersedes v1.1 (2026-08-17).** Sections 1 and 4b below are now the
> canonical spec as delivered alongside working `build_cards.py` +
> `assets/`, not this repo's own reconstruction of it. Two things changed
> from v1.1's understanding: (1) the jersey crest/rider text is explicitly
> **not** generated — it's a vector overlay, composited by `build_cards.py`,
> because diffusion models mangle text; (2) the §7 front/back naming
> mismatch flagged in v1.1 is **closed** — `build_cards.py` composites both
> jersey sides itself from `{serial}_figure.png` + `{serial}_jersey_mask.png`
> via `jersey_variant()`. Legacy `_front.png`/`_back.png` still work as a
> fallback if present. Section 1b (the ComfyUI generation pipeline) is
> unchanged in substance — see its own update note for the one thing that
> did change (where it runs).

## 1. What the art pipeline hands back

Two files per member, named by Scoot serial. **One illustration, not two** —
the card composites both jersey sides itself.

| File | Format | Notes |
|---|---|---|
| `{serial}_figure.png` | RGBA, 1400 × 2000 | Cel-shaded colour illustration, transparent background |
| `{serial}_jersey_mask.png` | L or RGB, same dims | White = jersey pixels, black = everything else |

### Rules for the art

1. **Cel-shaded colour, not silhouette.** Two or three flat tones per
   material, hard-edged shadows, bold contour lines. No gradients, no
   airbrush. Toner reproduces flat tone cleanly and gradients badly.
2. **Transparent background, no scenery.** The card draws the manga
   background (speed lines, screentone) procedurally in black on white.
   Prompt explicitly against generated backgrounds.
3. **Blank jersey.** Do not generate the Fonde crest or the chest rider —
   diffusion models mangle text. Both are composited as vector overlays.
4. **Fill the frame and let it crop.** The figure runs off the bottom edge.
5. **Keep faces and hands out of the bottom 15%.** The nameplate covers it.
6. **True RGBA.** Flattened alpha silently destroys the mask — a prior asset
   batch shipped as RGB and one file came out white-on-white.
7. **Do not crop or scale to card geometry.** `build_cards.py` owns
   placement.

### Jersey recolour

The real jersey is reversible: black on one side, white on the other, same
crest inverting between them. The card front shows the dark side, the back
panel shows the light side, both derived from the single figure by
recolouring the masked region. Luminance inside the mask is normalised and
blended between a base and shadow tone, so the original cel shading
survives (`jersey_variant()` in `build_cards.py`).

Tones live in `build_cards.py` as design tokens, not in the art:

```python
JERSEY = {"dark": ("#2E2E2A", "#121210"), "light": ("#F4F1E8", "#BFBBAD")}
```

Legacy `{serial}_front.png` / `{serial}_back.png` are still accepted as a
fallback if a pre-rendered pair exists (`player_art()`).

## 1b. Generation pipeline (ComfyUI)

> **Update 2026-08-17:** the 21-node graph below is unchanged and still IS
> the pipeline — what changed is where it runs. Azure Container Apps
> serverless GPU is off the table; the deploy target is now **Modal**
> (bring-your-own-container, not a hosted model API — chosen specifically
> so every dependency, model weight, and custom-node commit can be pinned
> for long-term reproducibility). See `tools/player-cards/workflow_player_card.json`
> and its `README.md`. The Modal build spec itself lives outside this repo
> (handed off between Claude sessions via `~/BIGMO_SYNC_REPLY.md` /
> `~/MODAL_BUILD_SPEC.md` on the `dreamlab` host) — not duplicated here.

1. **Preprocess with `rembg`** — cut the player out of the source gym photo
   (see the Nick get-well video frame-harvesting work for source material).
   This cutout is preprocessing input only, never the deliverable.
2. **Condition with ControlNet** (lineart + openpose) on the cutout, so pose
   and silhouette carry through to the illustration.
3. **Generate with SDXL or Flux** on an anime/comic-style checkpoint.
4. **Hold consistency with IP-Adapter** — one fixed style reference image,
   fixed seed, fixed ControlNet weights, one prompt skeleton. Only the
   per-player conditioning (the rembg cutout + pose) changes between players.
   34 cards need to read as one set, not 34 separate art projects.
5. **Jersey mask** — a separate segmentation pass (clothing/human-parsing
   model) over the generated figure to isolate jersey pixels into
   `{serial}_jersey_mask.png`.

Geometry (crop/scale to the card's actual art slot) is explicitly NOT part
of this pipeline — `build_cards.py` handles placement downstream.

## 2. Card geometry

| | |
|---|---|
| Trim size | 2.500 × 3.500 in (180 × 252 pt) — standard trading card |
| Bleed | 0.125 in all four sides |
| Chip band | 6 pt (~1/12 in) around the full perimeter |
| Art slot | 168 × 240 pt inside the band |
| Corner radius after cutting | 3 mm (1/8 in) |
| Imposition | 6-up on US Letter, cards butted, shared cut lines |
| Cut lines | 4 vertical, 3 horizontal per sheet |

The chip band doubles as a trim buffer. A cutting error of a millimetre
changes the band thickness slightly instead of putting a white sliver on the
image. This is why full-bleed art is safe here even cutting by hand.

## 3. Tier ladder

Field colour encodes tier. All fields are light or mid-tone so a solid black
silhouette always reads.

| Tier | Hex | Note |
|---|---|---|
| Rookie | `#E3DFD2` | bone |
| Brother / Sister | `#79C2AE` | teal |
| OG | `#EF9F27` | amber |
| Double OG | `#E9764F` | coral |
| Triple OG | `#A79BE0` | periwinkle |
| Legend | `#C9B037` | antique gold |
| Starter | `#FFFFFF` | bare token white |

Deliberate constraint: the chrome is only ever black and white. Band,
stripes, nameplate, glyph disc, serial, rules. Colour exists only as the
field the silhouette stands on. That's what keeps the set looking like Scoot
rather than like a generic sports card.

## 4. Roster CSV

One row per member. Column order doesn't matter; names do.

| Column | Example | Notes |
|---|---|---|
| serial | 34-00007 | Scoot serial, matches the physical token. Never changes across editions. |
| handle | Kiwi | The front of the card. There are no jersey numbers — everybody is 34. |
| name | Donnie R. | Back only |
| tier | Double OG | Must match the ladder above |
| position | Guard | |
| home | Fonde | Fonde or Judson |
| joined | 2026 | |
| signature | Turnaround | His move. Also the art direction for the front silhouette. |
| edition | 2026 | Print edition — the thing that changes on reprint |
| g, winpct, plusminus | — | Current season. Leave as — for the first set. |
| g_career, winpct_career, pm_career | — | Career row |
| profile_1/2/3 | Will not switch. Ever. | ~28 characters per line, 3 lines max. Hard limit — longer lines will run off the card. |

## 4b. The scoot mark

Delivered 2026-08-17 (`tools/player-cards/assets/`), built from the official
art (`scoot_black_on_white.png`, `thumbnail_34.png`). Aspect 0.5337 (w/h) —
supersedes v1.1's placeholder note about tracing from a token photograph;
these are the real assets now, not a trace.

| File | Use |
|---|---|
| `scoot_glyph_black_transparent.png` | Front disc mark |
| `scoot_glyph_white_transparent.png` | Same, for dark fields |
| `scoot_glyph_ghost.png` | Pale watermark behind the card back |
| `scoot_glyph.svg` | Vector, for signage / shirts / print |

**Only the pure mark is used.** The `thumbnail_34` variant with the number
knocked out of the rider's chest is not part of the card set — the 34
belongs on the jersey, where the illustration puts it. Do not reintroduce it.

**On the source files:** the original uploads were saved as RGB with no
alpha channel, so two of the source variants came out white-on-white and
black-on-white respectively — the transparency was flattened on export
(the same failure mode called out in Rule 6 above, this time hitting the
logo itself rather than a player card). The four assets above were rebuilt
with real alpha channels from the two usable sources and verified
(`RGBA`, real alpha range 0–255, not flat) before landing in this repo.

## 5. Building the sheets

```bash
python3 build_cards.py --roster roster.csv --art art/ --out scoot34_2026.pdf
```

Expected folder layout (all now present in `tools/player-cards/` except
`roster.csv` and `art/`, which are per-edition, not checked in):

```
build_cards.py
roster.csv
assets/scoot_glyph_black_transparent.png
assets/scoot_glyph_white_transparent.png
assets/scoot_glyph_ghost.png
assets/scoot_glyph.svg
art/34-00007_figure.png
art/34-00007_jersey_mask.png
...
```

Produces alternating pages: fronts, then backs, six cards per sheet, with
crop marks. A working proof (placeholder art, real layout) exists —
`scoot34_proof.pdf` — confirming the chip band, crop marks, tier fields,
glyph disc, and nameplate all render correctly end to end.

Back sheets are mirrored left-to-right by default so they register when you
flip the stack on the long edge. If your printer's duplex flips the other
way, or you're hand-feeding, use `--no-mirror`.

If an art file is missing the card still renders with a placeholder
silhouette, so you can proof the layout and the copy before BigMo finishes.

## 6. Printing

- Print at 100%. No scaling, no "fit to page." If the trim comes out at 2.4 in, scaling is on.
- 110 lb Cover stock (300 gsm), smooth, laser-rated. Not Index — that's 199 gsm and too thin.
- Feed through the bypass/manual tray, straight-through exit if the machine has one.
- Run one calibration sheet first. The amber and coral will not match your screen; adjust and reprint before committing to 34.
- Cut on the crop marks with a rotary trimmer. Round corners at 3 mm.
- Penny sleeve, then 35 pt toploader.

## 7. Open decisions

- **Starter tier** — currently bare white. Confirm whether Starter sits above Legend or is a separate designation.
- **Rating block** — dropped for the first edition. Add once there's something to rate.
- **Rookie card inset** — has no meaning in year one. Founding members may want a charter mark in that corner instead.
- **Season table growth** — fits four season rows plus career before it's full. Decide now between showing every season forever (eventually forces a sideways back) or a rolling three-season window.
- ~~`build_cards.py` input naming~~ **CLOSED 2026-08-17** — `build_cards.py` composites `_front`/`_back` itself from `{serial}_figure.png` + `{serial}_jersey_mask.png`. No separate reconciliation step needed.
- **Card-approval gate is not `scoots.trustee_id`.** That field is mint authority for the currency ledger (Phase 5a); print approval is a different decision entirely and deserves its own Charter-level answer, not a schema shortcut. Explicitly parked, not forgotten.

## Relationship to the Nick video frame-harvesting work

The generated illustrations are downstream of the candidate frames being
pulled from Brotherhood testimonial video (see the Nick get-well video
frame-harvesting work — `~/Nick/work/roster.md` and the review site at
`/nick-review/`). Candidate photo → curated best-expression shot → rembg
cutout → ControlNet-conditioned generation → this template. The `serial`
numbering scheme (`34-00007`) does not yet map to anything in
`scoot_members` — that link is still an open integration question, not yet
needed while art direction and tooling are being proven out manually.
