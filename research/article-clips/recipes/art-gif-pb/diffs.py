#!/usr/bin/env python3
# Per-frame mean abs diff (content rows 60-820 of the 430-wide exports) for motion-start detection.
# usage: diffs.py <workdir> <arm> [first] [last]
import sys, os, numpy as np
from PIL import Image
wd, arm = sys.argv[1], sys.argv[2]
n = len([f for f in os.listdir(f'{wd}/{arm}') if f.startswith('f_')])
a0 = int(sys.argv[3]) if len(sys.argv) > 3 else 1
a1 = int(sys.argv[4]) if len(sys.argv) > 4 else n
prev, out = None, []
for i in range(a0, a1 + 1):
    a = np.asarray(Image.open(f'{wd}/{arm}/f_{i:04d}.png').convert('L'), dtype=np.float32)[60:820]
    if prev is not None: out.append(f'{i}:{float(np.abs(a - prev).mean()):.1f}')
    prev = a
print(arm, n, ' '.join(out))
