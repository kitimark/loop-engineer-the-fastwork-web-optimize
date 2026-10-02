#!/usr/bin/env python3
# Exact pixel compare of screenshot pairs (RGBA): identical / N differing pixels + bbox (device px) + max channel delta.
# usage: pxcmp.py <dir> [--cal <calibration.png>] <a>:<b> ...   (names relative to dir, .png added when missing)
# --cal: a screenshot of a fixed full-viewport magenta overlay; only the magenta box (the web content area) is
# compared, so the Simulator's status bar and Safari's toolbar (URL with the arm's port) are left out.
import sys, os
from PIL import Image, ImageChops
args = sys.argv[1:]
d = args.pop(0)
box = None
if args and args[0] == '--cal':
    args.pop(0); cal = Image.open(os.path.join(d, args.pop(0))).convert('RGB')
    w, h = cal.size; px = cal.load()
    mag = lambda p: p[0] > 240 and p[1] < 20 and p[2] > 240
    xs = [x for x in range(w) if mag(px[x, h // 2])]; ys = [y for y in range(h) if mag(px[w // 2, y])]
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    print(f'content box {box}')
for pair in args:
    a, b = pair.split(':')
    fa, fb = [os.path.join(d, x if x.endswith('.png') else x + '.png') for x in (a, b)]
    A, B = Image.open(fa).convert('RGBA'), Image.open(fb).convert('RGBA')
    if box: A, B = A.crop(box), B.crop(box)
    if A.size != B.size:
        print(f'{a} vs {b}: SIZE {A.size} vs {B.size}'); continue
    diff = ImageChops.difference(A, B)
    bbox = diff.getbbox()
    if not bbox:
        print(f'{a} vs {b}: IDENTICAL ({A.size[0]}x{A.size[1]})'); continue
    px = diff.load(); w, h = A.size; n = 0; mx = 0
    for y in range(bbox[1], bbox[3]):
        for x in range(bbox[0], bbox[2]):
            p = px[x, y]
            if p != (0, 0, 0, 0):
                n += 1; mx = max(mx, max(p))
    print(f'{a} vs {b}: DIFF {n} px ({100 * n / (w * h):.3f} %), bbox {bbox}, max channel delta {mx}')
