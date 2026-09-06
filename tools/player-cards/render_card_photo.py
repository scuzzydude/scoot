#!/usr/bin/env python3
"""Render a member's card from a card_art SOURCE photo, stage by stage, storing
every intermediate as a hash-addressed card_art RENDER row (so every version
lands in cold storage via the cold-sync timer and can be re-run from any
stage). Runs on the HOST (needs rclone, docker, modal, rembg, reportlab).

Usage:
  python3 tools/player-cards/render_card_photo.py <source-hash> [--describe "He is ..."]
        [--seed 552011] [--from-raw <blob path>] [--skip-modal]

Stages (each appends a card_art row: kind=render, parent_hash=<source>, meta.stage=...):
  raw      Kontext+PuLID noir generation on Modal      -> raw figure PNG
  jersey   composite_jersey on Modal (brand jersey + crest + mask)
  figure   finalize_card.py (rembg re-matte) + crop_to_slot.py
  card     build_cards.draw_front -> 300dpi card front PNG  (status=rendered)

--describe is the explicit appearance sentence appended to the prompt (skin
tone / hair / facial hair). Say it plainly -- generic "preserve ethnicity"
wording has repeatedly failed (see .claude/memory/project_player_cards_facial_likeness.md).
"""
import argparse, hashlib, io, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MEDIA_HOST_DIR = Path(os.environ.get("CARD_ART_LOCAL_DIR", "/var/lib/scoot/media/card-art"))
PUBLIC_BASE = os.environ.get("MEDIA_PUBLIC_BASE", "https://thedreamlaboratory.org/media/card-art")
PG_CONTAINER = os.environ.get("PG_CONTAINER", "scoot-postgres-1")
PG_URL = os.environ.get("PG_URL", "postgresql://scoot:password@localhost:5432/scoot")
BLOB_REMOTE = "azarchive:"  # rclone remote for stevearchive10723

STYLE_NOIR = (
    "Change this into a stark high-contrast black-and-white noir comic "
    "illustration -- pure black and white, NO COLOR, NO gray halftone. "
    "Bold, minimal ink linework in the style of Frank Miller's Sin City "
    "-- large solid black shadow shapes cutting hard-edged across the "
    "face and body, stark white highlights, dramatic graphic "
    "silhouette-driven shading, very few thin lines, mostly bold clean "
    "shapes of pure black against pure white, minimal fine detail."
)
FRAMING_MALE = (
    "Waist-up portrait composition, cropped just above the waist -- do "
    "not show hips, legs, or lower body. Change the clothes to a solid "
    "dark charcoal-black basketball jersey (sleeveless, round neckline, "
    "athletic jersey style, no cape, no collar), no logos, no text, no "
    "numbers. This is a SENIOR athlete in his 50s, 60s, or older -- "
    "preserve visible signs of his real age with a LIGHT touch: a few "
    "subtle, soft lines is enough, do not heavily wrinkle the face. "
    "Think 'superhero grandpa' -- heroic, strong, and capable, but "
    "clearly an older man. A strong, solid build appropriate for a fit "
    "older man -- not a bodybuilder. Simple plain background, nothing "
    "else in the scene. Preserve his exact real hairstyle (or lack of "
    "hair), his exact real facial hair (beard/mustache/goatee/clean-"
    "shaven -- whatever the reference photo shows), his exact real "
    "skin tone and ethnicity, and his exact real face shape and "
    "features from the reference photo -- do NOT change his ethnicity, do "
    "NOT invent facial hair he doesn't have or remove facial hair he does have."
)
EXPRESSION_SERIOUS = (
    "Give the character a confident, serious game-face expression: "
    "eyes focused and slightly narrowed (not wide open), a subtle "
    "confident smirk or closed determined mouth, eyebrows level or "
    "slightly lowered. NOT smiling, NOT surprised, NOT wide-eyed, "
    "NOT goofy."
)


def sh(cmd, **kw):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"command failed: {cmd}\n{r.stderr.strip()}")
    return r.stdout


def psql(sql):
    return sh(["docker", "exec", "-i", PG_CONTAINER, "psql", PG_URL, "-qAt", "-c", sql]).strip()


def q(v):  # SQL literal
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def source_row(h):
    out = psql(f"SELECT hash, scoot_id, user_id, card_serial, media_url FROM card_art WHERE hash LIKE {q(h + '%')} AND kind='source'")
    if not out:
        sys.exit(f"no source card_art row matching {h}")
    hash_, scoot_id, user_id, card_serial, media_url = out.split("|")
    return dict(hash=hash_, scoot_id=int(scoot_id), user_id=int(user_id), card_serial=card_serial or None, media_url=media_url)


def store_render(src, data: bytes, ext: str, stage: str, extra_meta=None, status="rendered"):
    """Content-address `data` under media/card-art, insert a render row, return (hash, public_url)."""
    h = hashlib.sha256(data).hexdigest()
    dest = MEDIA_HOST_DIR / f"{h}{ext}"
    if not dest.exists():
        tmp = Path(tempfile.mkstemp(suffix=ext)[1]); tmp.write_bytes(data)
        sh(["sudo", "cp", str(tmp), str(dest)]); sh(["sudo", "chmod", "644", str(dest)]); tmp.unlink()
    meta = {"stage": stage, **(extra_meta or {})}
    mime = "image/png" if ext == ".png" else "image/jpeg"
    psql(
        "INSERT INTO card_art (hash, kind, scoot_id, user_id, card_serial, parent_hash, media_url, mime, bytes, origin, status, meta) "
        f"VALUES ({q(h)}, 'render', {src['scoot_id']}, {src['user_id']}, {q(src['card_serial'])}, {q(src['hash'])}, "
        f"{q('/media/card-art/' + h + ext)}, {q(mime)}, {len(data)}, 'pipeline', {q(status)}, {q(json.dumps(meta))}::jsonb) "
        "ON CONFLICT (hash) DO UPDATE SET meta = card_art.meta || EXCLUDED.meta, status = EXCLUDED.status"
    )
    print(f"  [{stage}] {h[:8]}  {PUBLIC_BASE}/{h}{ext}")
    return h, f"{PUBLIC_BASE}/{h}{ext}"


def blob_bytes(blob_path: str) -> bytes:
    """blob_path like 'media/card-art/kontext-test/X_figure.png' (container/prefix/name)."""
    return subprocess.run(["rclone", "cat", BLOB_REMOTE + blob_path], check=True, capture_output=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_hash")
    ap.add_argument("--describe", default="", help="explicit appearance sentence, e.g. 'He is Black with dark brown skin.'")
    ap.add_argument("--seed", type=int, default=552011)
    ap.add_argument("--from-raw", default=None, help="skip generation; blob path of an existing raw figure")
    ap.add_argument("--work", default=None, help="scratch dir (default: temp)")
    args = ap.parse_args()

    src = source_row(args.source_hash)
    if not src["card_serial"]:
        sys.exit("source photo has no card_serial -- link a card first ('my card' / claim code)")
    card_serial = src["card_serial"]
    pipe_serial = f"{card_serial}-{src['hash'][:8]}"
    work = Path(args.work or tempfile.mkdtemp(prefix="render-card-"))
    work.mkdir(parents=True, exist_ok=True)
    print(f"source {src['hash'][:8]} -> card {card_serial}  (pipeline serial {pipe_serial}, work {work})")
    psql(f"UPDATE card_art SET status='rendering' WHERE hash={q(src['hash'])}")

    import modal

    # ---- stage raw: Kontext + PuLID generation
    if args.from_raw:
        raw_blob = args.from_raw
        gen_meta = {"reused": True}
    else:
        prompt = " ".join(p for p in (STYLE_NOIR, FRAMING_MALE, args.describe.strip(), EXPRESSION_SERIOUS) if p)
        src_url = PUBLIC_BASE + "/" + Path(src["media_url"]).name
        payload = {"serial": pipe_serial, "subject_photo_url": src_url, "identity_photo_url": src_url,
                   "prompt": prompt, "seed": args.seed, "guidance": 2.5,
                   "pulid_weight": 1.0, "pulid_start_at": 0.0, "pulid_end_at": 1.0}
        print("  generating on Modal (scoot34-kontext-pulid-test) ...", flush=True)
        gen = modal.Cls.from_name("scoot34-kontext-pulid-test", "PulidKontextGenerator")
        result = gen().generate.remote(payload)
        raw_blob = result["figure_path"]
        gen_meta = {"seed": args.seed, "guidance": 2.5, "describe": args.describe, "prompt_style": "noir"}
    raw_png = blob_bytes(raw_blob)
    raw_hash, raw_url = store_render(src, raw_png, ".png", "raw", {"blob": raw_blob, **gen_meta})

    # ---- stage jersey: brand jersey + crest + mask
    print("  compositing jersey on Modal (scoot34-jersey-test) ...", flush=True)
    comp = modal.Function.from_name("scoot34-jersey-test", "composite_jersey")
    res = comp.remote({"serial": pipe_serial, "image_url": raw_url, "side": "dark"})
    jfig = blob_bytes(res["figure_path"]); jmask = blob_bytes(res["mask_path"])
    _, jfig_url = store_render(src, jfig, ".png", "jersey", {"blob": res["figure_path"], "head_cx": res.get("head_cx")})
    _, _ = store_render(src, jmask, ".png", "jersey_mask", {"blob": res["mask_path"]})
    (work / "jersey_figure.png").write_bytes(jfig); (work / "jersey_mask.png").write_bytes(jmask)

    # ---- stage figure: rembg re-matte + slot crop (local CPU)
    art_raw = work / "art_raw"; art_crop = work / "art_crop"
    sh([sys.executable, str(HERE / "finalize_card.py"), card_serial, str(work / "jersey_figure.png"), str(work / "jersey_mask.png"), str(art_raw)])
    sh([sys.executable, str(HERE / "crop_to_slot.py"), str(art_raw), str(art_crop), card_serial])
    fig_png = (art_crop / f"{card_serial}_figure.png").read_bytes()
    _, _ = store_render(src, fig_png, ".png", "figure")
    _, _ = store_render(src, (art_crop / f"{card_serial}_jersey_mask.png").read_bytes(), ".png", "figure_mask")

    # ---- stage card: front card at 300 dpi
    sys.path.insert(0, str(HERE))
    from reportlab.pdfgen import canvas
    from build_cards import register_fonts, draw_front, TRIM_W, TRIM_H
    row_out = psql(f"SELECT handle, aka, tier, home, joined FROM player_cards WHERE serial={q(card_serial)}")
    handle, aka, tier, home, joined = row_out.split("|")
    row = {"serial": card_serial, "handle": handle, "aka": aka, "tier": tier, "home": home, "joined": joined}
    register_fonts()
    pdf_path = work / f"{card_serial}.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=(TRIM_W, TRIM_H))
    draw_front(c, 0, 0, row, str(art_crop))
    c.save()
    sh(["pdftoppm", "-png", "-r", "300", "-singlefile", str(pdf_path), str(work / "card")])
    card_png = (work / "card.png").read_bytes()
    card_hash, card_url = store_render(src, card_png, ".png", "card", status="rendered")
    psql(f"UPDATE card_art SET status='rendered' WHERE hash={q(src['hash'])}")
    print(json.dumps({"source": src["hash"], "card": card_hash, "card_url": card_url, "work": str(work)}))


if __name__ == "__main__":
    main()
