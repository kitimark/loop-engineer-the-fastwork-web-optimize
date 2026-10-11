#!/usr/bin/env python3
# Best frame offset k between two exported sequences (A frame i ~ B frame i+k) by content difference.
# usage: xalign.py <workdir> <A> <B> <i0> <i1> [kmax]
import sys, os, numpy as np
from PIL import Image
wd, A, B, i0, i1 = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
km = int(sys.argv[6]) if len(sys.argv) > 6 else 30
def ld(a, n):
    p = f'{wd}/{a}/f_{n:04d}.png'
    if not os.path.exists(p): return None
    return np.asarray(Image.open(p).convert('L').crop((0, 60, 430, 820)).resize((107, 190)), dtype=np.float32)
cache = {}
def get(a, n):
    if (a, n) not in cache: cache[(a, n)] = ld(a, n)
    return cache[(a, n)]
res = []
for k in range(-km, km + 1):
    ds = [np.abs(get(A, i) - get(B, i + k)).mean() for i in range(i0, i1) if get(A, i) is not None and get(B, i + k) is not None]
    if ds: res.append((round(float(np.mean(ds)), 2), k, len(ds)))
res.sort(); print(res[:6])
