# 1440 y7500 ring-frame statistics over q40v/w1440a + q40v2/w1440b: reference = the modal S0 frame (hash of the
# decoded pixels); per load: differing px and max channel delta vs the reference; Fisher exact (two-sided) on
# differing-vs-identical counts, V vs S0.  usage: python3 ringstat.py <dir>...
import sys, json, hashlib, math
from collections import Counter
from PIL import Image, ImageChops
loads = []
for d in sys.argv[1:]:
    idx = json.load(open(d + '/index.json'))
    for lab, v in idx.items():
        for f in v['frames']:
            if f['y'] != 7500:
                continue
            arm = 'V' if lab.startswith('RBi40pti') else 'S0'
            im = Image.open(f['file']).convert('RGB')
            loads.append((lab, arm, im, hashlib.sha256(im.tobytes()).hexdigest()[:12]))
hs = Counter(h for _, a, _, h in loads if a == 'S0')
ref_h = hs.most_common(1)[0][0]
ref = next(im for _, a, im, h in loads if h == ref_h)
print('reference = modal S0 hash', ref_h, '| S0 hashes', dict(hs), '| V hashes', dict(Counter(h for _, a, _, h in loads if a == 'V')))
cnt = {'V': [0, 0], 'S0': [0, 0]}
mx = {'V': (0, 0), 'S0': (0, 0)}
for lab, arm, im, h in loads:
    if h == ref_h:
        cnt[arm][1] += 1
        print(f'  {lab:14s} {arm:3s} identical')
        continue
    D = ImageChops.difference(im, ref)
    bb = D.getbbox()
    px = sum(1 for p in D.convert('L').getdata() if p)
    md = max(e[1] for e in D.getextrema())
    cnt[arm][0] += 1
    mx[arm] = max(mx[arm], (md, px))
    print(f'  {lab:14s} {arm:3s} {px} px differ, max delta {md}, bbox {bb}, hash {h}')


def fisher(a, b, c, d):
    n = a + b + c + d
    r1 = a + b
    c1 = a + c
    p = lambda x: math.comb(r1, x) * math.comb(n - r1, c1 - x) / math.comb(n, c1)
    p0 = p(a)
    lo, hi = max(0, c1 - (n - r1)), min(r1, c1)
    return sum(p(x) for x in range(lo, hi + 1) if p(x) <= p0 * (1 + 1e-9))


(a, b), (c, d) = cnt['V'], cnt['S0']
print(f'V differing {a}/{a + b} (max delta, px {mx["V"]}); S0 differing {c}/{c + d} (max delta, px {mx["S0"]}); '
      f'Fisher exact two-sided p = {fisher(a, b, c, d):.4g}')
