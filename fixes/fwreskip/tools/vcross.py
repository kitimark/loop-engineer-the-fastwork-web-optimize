#!/usr/bin/env python3
# Cross-compare post-jump frames from different runs/holds (cfix MODE V), aligned by paint stamp like vscore.py.
# A frame is named <dir>:<arm>:<tag>:<k> (k = 1-based post-jump frame, 'final' for the settled shot).
# usage: vcross.py <frameA> <frameB> [<frameA> <frameB> ...]
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from vscore import cmp, post  # noqa: E402
def path(spec):
    d, arm, tag, k = spec.split(':')
    if k == 'final': return os.path.join(d, f'V-{arm}-{tag}-final.png')
    run = json.load(open(os.path.join(d, 'V.json')))['arms'][arm][tag]
    files, _ = post(d, arm, tag, run)
    return files[int(k) - 1] if int(k) <= len(files) else None
a = sys.argv[1:]
for i in range(0, len(a), 2):
    fa, fb = path(a[i]), path(a[i + 1])
    print(f'{a[i]}  vs  {a[i + 1]}: {cmp(fa, fb) if fa and fb else "missing"}')
