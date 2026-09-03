---
name: project_card_photo_intake
description: "Card comicization via SMS — Phase 1 (intake) built 2026-09-03: hash-addressed card_art table, photo-by-text stored + cold-synced; render orchestration + approval loop NOT built yet. Trial with Brandon first."
metadata:
  type: project
---

**Decided 2026-09-03:** members will text BigMo a photo and get a comic-style card render back. Brandon's rules: track everything **by content hash** (many photos per player is fine, many renders per photo is fine, nothing overwritten), keep **all versions in cold storage** (for a later web gallery), and **trial with Brandon alone first** — he sends a photo, we iterate on the flow before opening it up.

**Built (Phase 1, intake):**
- `card_art` table (migration `0021`), one row per file: `hash` (sha256), `kind` source|render, `parent_hash` (render→source), `card_serial` (active card at submit), `media_url` `/media/card-art/<hash>.<ext>`, `cold_path`, `status` received|rendering|rendered|approved|rejected, `meta` jsonb.
- `sms/card-photo-commands.ts`: bare photo, or photo + text mentioning card/photo/pic → stored + deduped by hash; "my photos" lists. Wired in `bigmo.ts` *before* the bare-photo guard. `media-download.ts` gained `fetchTwilioMediaBytes()`.
- Host systemd timer `card-art-cold-sync` (10 min): `rclone copy --immutable` to `azarchive:media/card-art/versions`, then fills `cold_path` via psql. rclone is host-only (not in the app container) — that's why it's a timer, not app code.
- Verified end to end with a real file (store → serve 200 → sync → cold_path filled), test artefacts removed.

**Not built yet (Phase 2):** the render job. Plan agreed: async job (Modal takes minutes; Twilio webhook can't wait) → run existing pipeline (see [[project_player_cards_facial_likeness]]: Kontext+PuLID gen, hair inpaint w/ reference, jersey composite, finalize/crop, `build_cards.draw_front`) as ONE call → store render as `card_art` kind=render with parent_hash → MMS to Brandon for approve/reject code → on approve swap `player_cards.front_image_url` and MMS the member. Rate-limit 1 render/member/day. Licensing (FLUX-dev, Kontext-dev, InsightFace non-commercial) still undecided before opening to all members.

**First real step when resuming:** Brandon texts a selfie → check `select * from card_art` → run the pipeline by hand on that file (no orchestration code yet) to see how phone-selfie input quality holds up. Related: [[project_card_link_sms_webchat]].
