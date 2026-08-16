# Scoot(34) Player Card — Template Spec

Version 1.1 · 2026 edition

Source of truth for the physical trading-card pipeline BigMo will eventually
drive. Captured here as reference while the source art and the ComfyUI
generation pipeline are still being built out. `build_cards.py` (the sheet
assembly script) already exists and works — not covered here.

> **v1.1 supersedes v1.0's art direction (2026-08-16).** v1.0 called for flat
> solid-black silhouettes (`#1A1A18`, no interior linework). That's wrong —
> the real target is cel-shaded color comic/manga illustration. Section 1
> below is the corrected spec. Sections 2–7 (geometry, tier ladder, roster
> CSV, glyph, printing) are unchanged from v1.0 and still apply.

## 1. What BigMo needs to hand back (v1.1)

**Not silhouettes.** Final art is a cel-shaded color comic/manga illustration
of each player — two or three flat tones per material, hard-edged shadows,
bold contour lines. No gradients, no airbrush, no soft shading.

**One illustration per player, not two.** The same pose, shading, and
likeness serve both card faces. The jersey is rendered on its own mask so it
can be recolored per face (dark fill for the front, light fill for the
back) — a reversible-jersey trick. Two independently-generated front/back
images would drift and show as a different person when the card is flipped.

**Deliverables per player, named by Scoot serial:**

| File | Purpose | Pixels | Notes |
|---|---|---|---|
| `{serial}_figure.png` | The illustration | 1400 × 2000 RGBA | Transparent background. Figure fills the frame and crops at the bottom edge. Keep faces and hands out of the bottom 15% (nameplate covers it). **Do not crop or scale to card geometry** — `build_cards.py` owns placement, geometry isn't locked yet. |
| `{serial}_jersey_mask.png` | Recolor mask | same dimensions as figure | White = jersey pixels, black = everything else |

**Transparent background, no generated scenery.** Prompt explicitly for
plain/no background/no court. The card template draws the manga background
(speed lines, screentone, impact burst) procedurally, in black on white —
that is not part of what gets generated per player.

**Alpha channel — watch this closely.** Save true RGBA. A prior batch of
logo files arrived as RGB with alpha silently flattened (one came out
white-on-white). Verify mode is RGBA and spot-check a transparent pixel
before considering any output done.

## 1b. Generation pipeline (ComfyUI)

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
of this pipeline — `build_cards.py` handles placement downstream, and the
geometry itself isn't locked yet.

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

### 4b. The scoot glyph

`assets/scoot_glyph.png` and `assets/scoot_glyph.svg` are the real mark — the
hooded rider, traced from a photograph of the physical chip
(`scoot_token_small.jpg`, right-hand token). Solid black `#1A1A18`,
transparent background, aspect 0.6068.

The trace is only as good as the photograph. If an original vector or clean
export of the logo exists, replace both files with it — same names, same
transparent-black convention — and everything downstream picks it up.

## 5. Building the sheets

```bash
python3 build_cards.py --roster roster.csv --art art/ --out scoot34_2026.pdf
```

Expected folder layout:

```
build_cards.py
roster.csv
assets/scoot_glyph.png
art/34-00007_front.png
art/34-00007_back.png
...
```

Produces alternating pages: fronts, then backs, six cards per sheet, with
crop marks.

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
- **`build_cards.py` input naming** — the existing working script expects `art/{serial}_front.png` + `art/{serial}_back.png` (section 5). The v1.1 pipeline produces `{serial}_figure.png` + `{serial}_jersey_mask.png` instead (one illustration + a recolor mask, not two separate images). Not reconciled yet — either `build_cards.py` needs updating to composite front/back from figure+mask itself, or a separate compositing step produces `_front.png`/`_back.png` from them before `build_cards.py` runs.

## Relationship to the Nick video frame-harvesting work

The generated illustrations are downstream of the candidate frames being
pulled from Brotherhood testimonial video (see the Nick get-well video
frame-harvesting work — `~/Nick/work/roster.md` and the review site at
`/nick-review/`). Candidate photo → curated best-expression shot → rembg
cutout → ControlNet-conditioned generation → this template. The `serial`
numbering scheme (`34-00007`) does not yet map to anything in
`scoot_members` — that link is
still an open integration question, not yet needed while art direction and
tooling are being proven out manually.
