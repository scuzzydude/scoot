#!/usr/bin/env python3
"""One-time (re-runnable) import of the player-cards roster into the live
Scoot app: renders each person's single front-card PNG into the app's
/media/ directory and prints SQL to load player_cards + auto-link
card_links for known name matches.

Does NOT touch the database directly -- prints SQL for review, matching
this project's convention of hand-reviewed migrations (see
infra_prod_db_migrations memory: never db:push against prod).

Usage:
    python3 export_cards_to_app.py <roster.csv> <art_dir> <media_dir>

Writes:
    <media_dir>/card-{serial}.png        -- one per roster row
    ./card_import.sql                     -- review, then:
                                              docker exec -i scoot-postgres-1 \\
                                                psql -U scoot -d scoot < card_import.sql
"""
import csv
import io
import os
import sys
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_cards import (
    register_fonts, draw_front, short_code, TRIM_W, TRIM_H,
)
from reportlab.pdfgen import canvas

SCOOT_ID = 34

# Auto-match: card CSV `handle` (lowercased) -> users.username on the live
# DB, confirmed by hand against a real query 2026-08-30 (see
# project_player_cards_facial_likeness memory, round "card link" scoping).
HANDLE_TO_USERNAME = {
    "shipp": "shipp", "rufus": "rufus", "kiwi": "kiwi", "chef": "chef",
    "rick": "rick", "rodney": "rodney", "anthony": "anthony",
    "jerry": "jerry", "john": "john", "marko": "marco", "ray": "ray",
    "sheldon": "sheldon", "jennifer": "jennifer", "kevin": "kevin",
    "aj": "aj", "kennyg": "snake", "tim": "tim",
    "the nightmare": "nightmare", "mp3": "mp3", "rocket man": "rocketman",
}


def render_one(serial, row, art_dir, media_dir, scratch_dir):
    register_fonts()
    pdf_path = os.path.join(scratch_dir, f"{serial}.pdf")
    c = canvas.Canvas(pdf_path, pagesize=(TRIM_W, TRIM_H))
    draw_front(c, 0, 0, row, art_dir)
    c.save()

    png_prefix = os.path.join(scratch_dir, f"{serial}_render")
    subprocess.run(
        ["pdftoppm", "-png", "-r", "300", pdf_path, png_prefix],
        check=True, capture_output=True,
    )
    # pdftoppm names single-page output "<prefix>.png" or "<prefix>-1.png"
    # depending on version -- handle both.
    for cand in (f"{png_prefix}.png", f"{png_prefix}-1.png", f"{png_prefix}-01.png"):
        if os.path.exists(cand):
            png_path = cand
            break
    else:
        raise RuntimeError(f"pdftoppm did not produce output for {serial}")

    dest_name = f"card-{serial}.png"
    dest_path = os.path.join(media_dir, dest_name)
    subprocess.run(["sudo", "cp", png_path, dest_path], check=True)
    subprocess.run(["sudo", "chmod", "644", dest_path], check=True)
    return f"/media/{dest_name}"


def sql_escape(v):
    if v is None:
        return "NULL"
    v = str(v).strip()
    if v == "" or v == "—":  # em dash placeholder
        return "NULL"
    return "'" + v.replace("'", "''") + "'"


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    roster_path, art_dir, media_dir = sys.argv[1:4]
    scratch_dir = "/tmp/card_export_scratch"
    os.makedirs(scratch_dir, exist_ok=True)

    with open(roster_path, newline="") as f:
        rows = list(csv.DictReader(f))

    insert_lines = []
    link_lines = []
    unmatched = []

    for row in rows:
        serial = row["serial"].strip()
        handle = row["handle"].strip()
        code = short_code(serial)
        print(f"rendering {serial} ({handle})...")
        url = render_one(serial, row, art_dir, media_dir, scratch_dir)

        cols = ["serial", "scoot_id", "handle", "name", "aka", "tier",
                "position", "home", "joined", "edition", "g", "win_pct",
                "plus_minus", "g_career", "win_pct_career", "pm_career",
                "profile_1", "profile_2", "profile_3", "front_image_url", "code"]
        vals = [
            sql_escape(serial), str(SCOOT_ID), sql_escape(handle),
            sql_escape(row.get("name")), sql_escape(row.get("aka")),
            sql_escape(row.get("tier")), sql_escape(row.get("position")),
            sql_escape(row.get("home")), sql_escape(row.get("joined")),
            sql_escape(row.get("edition")), sql_escape(row.get("g")),
            sql_escape(row.get("winpct")), sql_escape(row.get("plusminus")),
            sql_escape(row.get("g_career")), sql_escape(row.get("winpct_career")),
            sql_escape(row.get("pm_career")), sql_escape(row.get("profile_1")),
            sql_escape(row.get("profile_2")), sql_escape(row.get("profile_3")),
            sql_escape(url), sql_escape(code),
        ]
        insert_lines.append(
            f"INSERT INTO player_cards ({', '.join(cols)}) VALUES ({', '.join(vals)});"
        )

        username = HANDLE_TO_USERNAME.get(handle.lower())
        if username:
            # New card becomes this member's active/default one ("my card");
            # any card(s) they already hold (a prior season's edition, etc.)
            # go inactive but stay linked -- see card_links in schema.ts.
            link_lines.append(
                f"WITH m AS (SELECT id AS user_id FROM users WHERE username = {sql_escape(username)}) "
                f"UPDATE card_links SET is_active = false "
                f"WHERE scoot_id = {SCOOT_ID} AND user_id = (SELECT user_id FROM m);\n"
                f"INSERT INTO card_links (scoot_id, user_id, card_serial, is_active) "
                f"SELECT {SCOOT_ID}, id, {sql_escape(serial)}, true FROM users "
                f"WHERE username = {sql_escape(username)} "
                f"ON CONFLICT (scoot_id, user_id, card_serial) DO UPDATE SET is_active = true;"
            )
        else:
            unmatched.append(f"{serial} ({handle})")

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "card_import.sql")
    with open(out_path, "w") as f:
        f.write("-- player_cards import, generated by export_cards_to_app.py\n\n")
        f.write("\n".join(insert_lines))
        f.write("\n\n-- auto-linked card_links (name match)\n\n")
        f.write("\n".join(link_lines))
        f.write("\n")

    print(f"\nwrote {out_path}  ({len(insert_lines)} cards, {len(link_lines)} auto-linked)")
    print("\nUNMATCHED (no username match, needs manual link or self-claim):")
    for u in unmatched:
        print(f"  {u}")


if __name__ == "__main__":
    main()
