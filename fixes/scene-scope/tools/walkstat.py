# P-056b scoring: q40ui's exact procedure (pageframes3, 1440, y 6000-7500 step 100, every step captured).
# Per y: the modal S0 frame (hash of the decoded RGB); per arm the loads off that frame (px, max delta, bbox);
# recurrences of q40ui's odd V hash at y7500; q40ui's own frames placed against the same modal frames.
# usage: python3 walkstat.py <dir>...   (env ODD=559c68ab9d2b)
import sys, os, json, hashlib, math
from collections import Counter, defaultdict
from PIL import Image, ImageChops
ODD = os.environ.get('ODD', '559c68ab9d2b')
frames = defaultdict(list)  # y -> [(label, arm, path, hash)]
for d in sys.argv[1:]:
    idx = json.load(open(d + '/index.json'))
    for lab, v in idx.items():
        arm = 'V' if lab.startswith('RBi40pti') else 'S0'
        for f in v['frames']:
            im = Image.open(f['file']).convert('RGB')
            frames[f['y']].append((lab, arm, f['file'], hashlib.sha256(im.tobytes()).hexdigest()[:12]))
hist = {}
for lab in ('S0', 'S0b', 'RBi40pti'):
    for f in json.load(open('out/scene-scope/q40ui/w1440/index.json'))[lab]['frames']:
        im = Image.open(f['file']).convert('RGB')
        hist[(lab, f['y'])] = (f['file'], hashlib.sha256(im.tobytes()).hexdigest()[:12])


def diff(a, b):
    A = Image.open(a).convert('RGB'); B = Image.open(b).convert('RGB')
    D = ImageChops.difference(A, B)
    return sum(1 for p in D.convert('L').getdata() if p), max(e[1] for e in D.getextrema()), D.getbbox()


def fisher(a, b, c, d):
    n, r1, c1 = a + b + c + d, a + b, a + c
    p = lambda x: math.comb(r1, x) * math.comb(n - r1, c1 - x) / math.comb(n, c1)
    p0 = p(a)
    return sum(p(x) for x in range(max(0, c1 - (n - r1)), min(r1, c1) + 1) if p(x) <= p0 * (1 + 1e-9))


nload = {arm: len({l for fs in frames.values() for l, a, _, _ in fs if a == arm}) for arm in ('V', 'S0')}
print('loads per arm', nload)
for y in sorted(frames):
    fs = frames[y]
    mh = Counter(h for _, a, _, h in fs if a == 'S0').most_common(1)[0][0]
    ref = next(p for _, a, p, h in fs if h == mh)
    off = {'V': [], 'S0': []}
    for lab, arm, p, h in fs:
        if h != mh:
            off[arm].append((lab, h) + diff(p, ref))
    hs = ' '.join(f'{lab}={hist[(lab, y)][1] == mh and "modal" or "OFF"}' for lab in ('S0', 'S0b', 'RBi40pti') if (lab, y) in hist)
    print(f'y{y}: modal {mh}; off-modal V {len(off["V"])}/{nload["V"]}, S0 {len(off["S0"])}/{nload["S0"]} | q40ui {hs}')
    for arm in ('V', 'S0'):
        for lab, h, px, md, bb in off[arm]:
            print(f'    {arm:3s} {lab:14s} {h} {px} px, max delta {md}, bbox {bb}')
    if y == 7500:
        odd = {arm: sum(1 for _, a, _, h in fs if a == arm and h == ODD) for arm in ('V', 'S0')}
        a, c = len(off['V']), len(off['S0'])
        print(f'  y7500: hash {ODD} in V {odd["V"]}/{nload["V"]}, S0 {odd["S0"]}/{nload["S0"]}; off-modal V {a} vs S0 {c}, '
              f'Fisher exact two-sided p = {fisher(a, nload["V"] - a, c, nload["S0"] - c):.4g}')
