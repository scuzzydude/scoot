#!/usr/bin/env python3
"""Operator CLI for calling the deployed scoot34-player-cards Modal app.

This is a manual/ops tool for dreamlab (style-reference bootstrap, the
three-card likeness test, one-off debugging) — it blocks and waits, which
is fine for a human watching a terminal. It is NOT the pattern BigMo's
production webhook must use; that path needs the non-blocking spawn/poll
pattern in MODAL_BUILD_SPEC.md §3 (see modal_app.py's spawn_example()),
since a member's inbound text cannot wait 60-90s for a synchronous reply.

Usage:
    python call_modal.py style-ref --seed 42 --prompt "..." --negative "..."
    python call_modal.py generate --serial 34-00001 --photo-url <url> --style-ref-url <url> --seed 42 [--pose "..."]
"""
import argparse
import sys

import modal


def style_ref(args):
    cls = modal.Cls.from_name("scoot34-player-cards", "CardGenerator")
    result = cls().generate_style_reference.remote(args.seed, args.prompt, args.negative)
    print(result)


def generate(args):
    cls = modal.Cls.from_name("scoot34-player-cards", "CardGenerator")
    payload = {
        "serial": args.serial,
        "photo_url": args.photo_url,
        "pose": args.pose or "",
        "seed": args.seed,
        "style_ref": args.style_ref_url,
    }
    if args.face_photo_url:
        payload["face_photo_url"] = args.face_photo_url
    if args.face_touchup:
        payload["face_touchup"] = True
    if args.lora_test:
        payload["lora_test"] = True
        payload["lora_strength"] = args.lora_strength
    result = cls().generate.remote(payload)
    print(result)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("style-ref")
    p1.add_argument("--seed", type=int, required=True)
    p1.add_argument("--prompt", required=True)
    p1.add_argument("--negative", required=True)
    p1.set_defaults(func=style_ref)

    p2 = sub.add_parser("generate")
    p2.add_argument("--serial", required=True)
    p2.add_argument("--photo-url", required=True)
    p2.add_argument("--style-ref-url", required=True)
    p2.add_argument("--seed", type=int, required=True)
    p2.add_argument("--pose", default="")
    p2.add_argument("--face-photo-url", default=None,
                     help="Tight face-only crop for PuLID identity conditioning. "
                          "Falls back to --photo-url (the full-body cutout) if omitted.")
    p2.add_argument("--face-touchup", action="store_true",
                     help="Opt-in face-detailer pass (crop generated face, refine, paste back). "
                          "OFF by default -- tested worse than the baseline on 2026-08-18, "
                          "kept available for further tuning. See modal_app.py's comment.")
    p2.add_argument("--lora-test", action="store_true",
                     help="Tier 2 pilot (PLAN_facial_likeness.md): swap PuLID for the subject's "
                          "own per-subject LoRA (node 29). OFF by default -- see modal_app.py's "
                          "generate() comment. Only Brandon's LoRA exists so far.")
    p2.add_argument("--lora-strength", type=float, default=1.0,
                     help="strength_model for --lora-test's LoraLoaderModelOnly. Default 1.0 "
                          "matches train_lora.py's training scale.")
    p2.set_defaults(func=generate)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
