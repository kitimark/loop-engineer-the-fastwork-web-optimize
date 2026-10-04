# F3 frozen-frame diffs (fix-nav-morph): every arm vs a reference arm (--ref, default C) per morph value, from
# reveal-frames.mjs (Chrome) or reveal-sim-frames.mjs (Simulator) PNGs named <arm>-<k>-m<m>.png (arm: a capital letter
# plus an optional digit, e.g. C, C2, P, B, B2, M). --page y0,y1 keeps only that band (CSS px, at DPR 3; the Simulator's
# status bar and Safari toolbar are outside the page). Prints changed pixels, pixels over 8, max channel delta, the
# changed box in CSS px.   python3 fixes/nav-morph/reveal-diff.py <dir> [--page 60,834] [--ref C]
import sys, glob, os, re
import numpy as np
from PIL import Image
d = sys.argv[1]
band = None
if '--page' in sys.argv:
    band = [int(v) * 3 for v in sys.argv[sys.argv.index('--page') + 1].split(',')]
ref = sys.argv[sys.argv.index('--ref') + 1] if '--ref' in sys.argv else 'C'
files = {}
for f in glob.glob(os.path.join(d, '*.png')):
    m = re.match(r'([A-Z]\d?)-(\d+)-m([\d.]+)\.png$', os.path.basename(f))
    if m: files[(m.group(1), int(m.group(2)))] = (f, m.group(3))
load = lambda f: np.asarray(Image.open(f).convert('RGB')).astype(int)
for k in sorted({k for (_, k) in files}):
    if (ref, k) not in files: continue
    c = load(files[(ref, k)][0])
    for arm in sorted({a for (a, kk) in files if kk == k and a != ref}):
        x = load(files[(arm, k)][0])
        dd = np.abs(c - x).max(axis=2)
        if band: dd[:band[0], :] = 0; dd[band[1]:, :] = 0
        ys, xs = np.nonzero(dd)
        box = (round(xs.min() / 3, 1), round(ys.min() / 3, 1), round((xs.max() + 1) / 3, 1), round((ys.max() + 1) / 3, 1)) if len(ys) else None
        print(f'k {k} m {files[(ref, k)][1]} {ref} vs {arm}: px {len(ys)} over8 {int((dd > 8).sum())} max {dd.max()} box {box}')
