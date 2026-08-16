# Scoot(34) Player Card — Template Spec

Version 1.0 · 2026 edition

Source of truth for the physical trading-card pipeline BigMo will eventually
drive. Captured here as reference while the source art (silhouettes pulled
from Brotherhood testimonial video, see the Nick get-well video harvesting
work) and the `build_cards.py` tooling are still being built out.

## 1. What BigMo needs to hand back

Two transparent PNGs per member, named by Scoot serial.

| File | Purpose | Pixels (300 dpi) | Pixels (600 dpi, preferred) | Aspect |
|---|---|---|---|---|
| `{serial}_front.png` | Main silhouette | 700 × 1000 | 1400 × 2000 | 0.700 |
| `{serial}_back.png` | Side-pose silhouette | 217 × 258 | 434 × 516 | 0.840 |

Example: `34-00007_front.png`, `34-00007_back.png`

### Rules for the art

- **Transparent background.** Alpha channel, not white. The template supplies the tier colour underneath.
- **Solid black silhouette, no interior linework.** Fill `#1A1A18`. No gradients, no outlines, no shading, no halftone. This is the scoot token's visual language — a filled shape, nothing else.
- **Fill the frame and let it crop.** The figure should run off the bottom edge and may run off the sides. A silhouette that floats inside the frame looks like a sticker; one the frame can't contain looks like a card.
- **Leave the bottom 34 pt clear of anything essential.** The nameplate bar covers the bottom ~14% of the front art slot. Torso can run under it — faces and hands cannot.
- **Front = the signature move. Back = the resting pose.** Turnaround, set shot, pull-up on the front; hands on knees, arms folded, walking the ball up on the back. The contrast between the two is where personality lives.
- **No anti-aliased grey fringe if avoidable.** Hard alpha edges reproduce better in toner. If the pipeline outputs soft edges, threshold the alpha.

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

## Relationship to the Nick video frame-harvesting work

The silhouette art (`{serial}_front.png` / `_back.png`) is downstream of the
candidate frames being pulled from Brotherhood testimonial video (see
`ip/` session notes / memory `scoot_currency_ledger`-adjacent work — the Nick
get-well video project). Candidate photo → curated best-expression shot →
silhouette extraction → this template. The `serial` numbering scheme
(`34-00007`) does not yet map to anything in `scoot_members` — that link is
still an open integration question, not yet needed while art direction and
tooling are being proven out manually.
