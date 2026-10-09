#!/usr/bin/env python3
# reveal-paint decisive check (2), pictures: for one load and LAND phase of rp-frames.mjs, the Simulator video frames from
# 2 frames before the #people is-visible flip to N frames after it, side by side (gray, 430 px wide each, the web view's
# rows), from the gray decode pb-analyze.py reads (<mov>.gray / <mov>.pts). Output: <dir>/rev-<arm><rep>-<phase>.png. Each
# frame's caption row: ms from the flip.
#   python3 fixes/reveal-paint/rp-video-strip.py out/people-blink/rp-v1 M1 land2 [N=8] [step=1]
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw
W, H = 430, 932
d, key, ph = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 8
STEP = int(sys.argv[5]) if len(sys.argv) > 5 else 1
rec = json.load(open(os.path.join(d, 'pb.json')))
L = next(l for l in rec['loads'] if f"{l['arm']}{l['rep']}" == key)
mov = os.path.join(d, f"{key}.mov")
pts = [float(x.strip(',')) for x in open(mov + '.pts').read().split() if x.strip(',') not in ('', 'N/A')]
n = os.path.getsize(mov + '.gray') // (W * H)
F = np.memmap(mov + '.gray', np.uint8, 'r', shape=(n, H, W))
perf0 = L['geom']['perf0']
marks = [(m[1], m[3]) for m in L.get('mk', [])]
t0 = next(t for t, nm in marks if nm == ph)
fl = next(perf0 + m[0] for m in L['m'] if 'start-selling-future' in m[1] and m[2] == 'class' and '+is-visible' in str(m[3]) and perf0 + m[0] >= t0 - 50)
wall = [L['vidStartWall'] + p * 1000.0 for p in pts[:n]]
k0 = next(i for i, w in enumerate(wall) if w >= fl)
ks = list(range(max(0, k0 - 2), min(n, k0 + N * STEP), STEP))
cap = 18
im = np.full((H + cap, len(ks) * (W + 4)), 255, np.uint8)
for j, k in enumerate(ks):
    im[cap:, j * (W + 4): j * (W + 4) + W] = F[k]
img = Image.fromarray(im)
dr = ImageDraw.Draw(img)
for j, k in enumerate(ks):
    dr.text((j * (W + 4) + 4, 2), f"{key} {ph} k{k} {round(wall[k] - fl):+d} ms", fill=0)
out = os.path.join(d, f"rev-{key}-{ph}.png")
img.save(out)
print(out, 'frames', ks, 'flip frame', k0)
