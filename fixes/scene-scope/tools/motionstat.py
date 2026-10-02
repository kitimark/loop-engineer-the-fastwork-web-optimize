# P-056c (b) scoring: per (y, T) motion frame, differing px (any channel) and max delta, V vs S0 and S0b vs S0;
# plus the running infinite set per arm at each y (from index.json 'run', names only, phases dropped).
# usage: python3 motionstat.py <dir> [<dir>...]
import sys, json
from PIL import Image, ImageChops


def diff(a, b):
    A = Image.open(a).convert('RGB'); B = Image.open(b).convert('RGB')
    D = ImageChops.difference(A, B); r, g, bb = D.split()
    M = ImageChops.lighter(ImageChops.lighter(r, g), bb)
    return sum(1 for v in M.getdata() if v), max(e[1] for e in D.getextrema()), M.getbbox()


tot = {'V': [0, 0], 'S0b': [0, 0]}
for d in sys.argv[1:]:
    idx = json.load(open(d + '/index.json'))
    ref = idx['S0']
    print(f'== {d}: arms {list(idx)}')
    for i, f in enumerate(ref['frames']):
        y = f['y']
        names = {lab: sorted(r.split('@')[0] for r in idx[lab]['frames'][i]['run']) for lab in idx}
        same = all(n == names['S0'] for n in names.values())
        print(f'y{y}: running infinite in S0: {len(names["S0"])}; same set in every arm: {same}')
        if not same:
            for lab, n in names.items():
                print(f'   {lab}: {n}')
        for j, s in enumerate(f['shots']):
            row = []
            for lab, key in (('RBi40pti', 'V'), ('S0b', 'S0b')):
                if lab not in idx: continue
                px, md, bb = diff(s['file'], idx[lab]['frames'][i]['shots'][j]['file'])
                tot[key][0] += 1; tot[key][1] += px == 0
                row.append(f'{key} {"identical" if px == 0 else f"{px} px d{md} {bb}"}')
            print(f'   T{s["T"]:>5}: ' + ' | '.join(row))
print('identical frames:', {k: f'{v[1]}/{v[0]}' for k, v in tot.items()})
