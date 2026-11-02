"""Pixel diff between the unfocused (a) and focused (b) screenshots.

Reports the number of pixels that change at all, and how many of those are
near the design's focus blue (#1f6feb) or MapLibre's default focus blue
(rgb(0,150,255)). A control with a visible ring must show a few hundred.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

D = Path("/home/chris/.hermes/cache/scratch/qa-vision")

for name in sys.argv[1:]:
    a_p, b_p = D / f"fp-{name}-a.png", D / f"fp-{name}-b.png"
    if not (a_p.exists() and b_p.exists()):
        print(f"{name:10s} missing pair")
        continue
    a = np.asarray(Image.open(a_p).convert("RGB")).astype(int)
    b = np.asarray(Image.open(b_p).convert("RGB")).astype(int)
    if a.shape != b.shape:
        print(f"{name:10s} size mismatch {a.shape} {b.shape}")
        continue
    d = np.abs(a - b).sum(axis=2)
    changed = int((d > 12).sum())
    # focus-blue-ish pixels in the focused shot
    blue = ((b[:, :, 2] > 150) & (b[:, :, 2] - b[:, :, 0] > 60) & (b[:, :, 1] < 170)).sum()
    blue_a = ((a[:, :, 2] > 150) & (a[:, :, 2] - a[:, :, 0] > 60) & (a[:, :, 1] < 170)).sum()
    print(f"{name:10s} changed_px={changed:7d}  blue_focused={int(blue):6d}  blue_unfocused={int(blue_a):6d}  size={a.shape[1]}x{a.shape[0]}")
