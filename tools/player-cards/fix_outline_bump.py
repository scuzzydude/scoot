#!/usr/bin/env python3
"""Remove a small bump/artifact from a figure's outer outline (bald crown,
shoulder, etc.) by fitting a circle to the clean outline on either side and
redrawing that span. Works on the finished {serial}_figure.png (RGBA, ink
outline on transparent). First used 2026-09-09 on Trey-Up's crown.

    python3 fix_outline_bump.py in.png out.png --span 392 428 --left 374 397 --right 424 441 [--stroke 5] [--depth 14]

--span   columns to repair; --left/--right  clean columns used for the fit;
--depth  how far below the old outline to repaint as skin (covers the bump's interior).
"""
import argparse
import numpy as np
from PIL import Image

INK = (26, 26, 24)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--span", nargs=2, type=int, required=True)
    ap.add_argument("--left", nargs=2, type=int, required=True)
    ap.add_argument("--right", nargs=2, type=int, required=True)
    ap.add_argument("--stroke", type=int, default=5)
    ap.add_argument("--depth", type=int, default=14)
    a_ = ap.parse_args()
    im = Image.open(a_.src).convert("RGBA"); a = np.array(im).copy(); alpha = a[..., 3]

    def top_y(x): return int(np.where(alpha[:, x] > 128)[0].min())
    xs = np.array(list(range(*a_.left)) + list(range(*a_.right))); ys = np.array([top_y(x) for x in xs])
    A = np.c_[2 * xs, 2 * ys, np.ones_like(xs)]; b = xs ** 2 + ys ** 2
    cx, cy, c0 = np.linalg.lstsq(A, b, rcond=None)[0]; r = np.sqrt(c0 + cx ** 2 + cy ** 2)
    fit = lambda x: cy - np.sqrt(max(r * r - (x - cx) ** 2, 0))
    print(f"circle centre ({cx:.1f},{cy:.1f}) r={r:.1f}  max residual {np.abs(ys - [fit(x) for x in xs]).max():.2f}px")
    for x in range(a_.span[0], a_.span[1]):
        t_new = int(round(fit(x))); t_old = top_y(x)
        a[:t_new, x] = (0, 0, 0, 0)
        if t_new > 0: a[t_new - 1, x] = (*INK, 110)
        a[t_new:t_new + a_.stroke, x] = (*INK, 255)
        a[t_new + a_.stroke:max(t_old + a_.depth, t_new + a_.stroke), x] = (255, 255, 255, 255)
    Image.fromarray(a, "RGBA").save(a_.dst); print("wrote", a_.dst)

if __name__ == "__main__":
    main()
