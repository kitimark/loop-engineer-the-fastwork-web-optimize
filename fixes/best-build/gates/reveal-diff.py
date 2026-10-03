# best-build copy of fixes/morph-inherit/gates/reveal-diff.py: arm names may have several capitals (NH, VH, MH, NH2), and
# --masks <dir> writes one diff image per pair (CSS px; white = any change, red = over 8) to locate the changed pixels.
# Original header:
# morph-inherit gates (a), (b) frozen-frame diffs (fix-nav-morph; copied from fixes/nav-morph/): every arm vs a reference arm (--ref, default C) per morph value, from
# reveal-frames.mjs (Chrome) or reveal-sim-frames.mjs (Simulator) PNGs named <arm>-<k>-m<m>.png (arm: a capital letter
# plus an optional digit, e.g. C, C2, B, B2, M). --page y0,y1 keeps only that band (CSS px, at DPR 3; the Simulator's
# status bar and Safari toolbar are outside the page). Prints changed pixels, pixels over 8, max channel delta, the
# changed box in CSS px.   python3 fixes/best-build/gates/reveal-diff.py <dir> [--page 60,834] [--ref NH] [--masks <dir>]
import sys, glob, os, re
import numpy as np
from PIL import Image
d = sys.argv[1]
band = None
if '--page' in sys.argv:
    band = [int(v) * 3 for v in sys.argv[sys.argv.index('--page') + 1].split(',')]
ref = sys.argv[sys.argv.index('--ref') + 1] if '--ref' in sys.argv else 'C'
masks = sys.argv[sys.argv.index('--masks') + 1] if '--masks' in sys.argv else None
if masks: os.makedirs(masks, exist_ok=True)
files = {}
for f in glob.glob(os.path.join(d, '*.png')):
    m = re.match(r'([A-Z]+\d?)-(\d+)-m([\d.]+)\.png$', os.path.basename(f))
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
        o8 = np.nonzero(dd > 8)
        box8 = (round(o8[1].min() / 3, 1), round(o8[0].min() / 3, 1), round((o8[1].max() + 1) / 3, 1), round((o8[0].max() + 1) / 3, 1)) if len(o8[0]) else None
        if masks:
            im = np.zeros(dd.shape + (3,), np.uint8); im[dd > 0] = (255, 255, 255); im[dd > 8] = (255, 0, 0)
            h, w = dd.shape
            small = im[: h - h % 3, : w - w % 3].reshape(h // 3, 3, w // 3, 3, 3).max(axis=(1, 3))
            Image.fromarray(small.astype(np.uint8)).save(os.path.join(masks, f'{ref}-vs-{arm}-{k}.png'))
        print(f'k {k} m {files[(ref, k)][1]} {ref} vs {arm}: px {len(ys)} over8 {int((dd > 8).sum())} max {dd.max()} box {box} box8 {box8}')
