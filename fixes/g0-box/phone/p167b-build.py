#!/usr/bin/env python3
# P-167 follow-up pre-stage (lead 12:55Z): more knock-out arms of g0.0e for a Simulator layer census after the block,
# aimed at the layers and memory ko2 leaves (+33 layers, +16 MB at the top). DIAGNOSTIC ONLY, never a candidate build;
# ko4 changes rasterization (pixels) on purpose. A separate script from p167-build.py so that the P-167 block's served
# arms (out/g0box/p167/e-ko2, ...) are never rewritten while it runs. Writes out/g0box/p167/<arm>/ and HASHES-b.txt.
#   e-ko4    g0.0e with the countdown strips and cells unlayered (will-change auto; CSS 1474 .strip, 12316 .cell)
#   e-ko5    g0.0e without the idle mount of the morph panel (JS 14691: s(__mnt) dropped from the mount condition)
#   e-ko245  ko2 + ko4 + ko5 (with ko2 of p167-build.py: no idle un-skip, cE re-defers)
import hashlib, os, shutil
JS = '_app/immutable/nodes/2.DyWL8TcE.js'; CSS = '_app/immutable/assets/2.gBuqKVzi.css'
E = 'out/g0box/g00e'; OUT = 'out/g0box/p167'
def h(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12]
def copy(arm):
    for f in (JS, CSS):
        d = os.path.join(OUT, arm, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(os.path.join(E, f), d)
    return os.path.join(OUT, arm)
def edit(path, old, new):
    s = open(path).read(); assert s.count(old) == 1, (path, old[:60], s.count(old)); open(path, 'w').write(s.replace(old, new))
assert h(os.path.join(E, JS)) == '5c39f7a96e41' and h(os.path.join(E, CSS)) == 'd4e684032482', 'g0.0e pins'
def ko2(a):
    edit(os.path.join(a, JS), 'function fwKick() {\n  fwArmed',
         'function fwKick() {\n  return; /* [P-167 KO2] diagnostic only: no idle un-skip */\n  fwArmed')
    edit(os.path.join(a, JS), '      t && sE(e, !0),\n      e.onActiveChange?.(t),',
         '      sE(e, t) /* [P-167 KO2] diagnostic only: re-defer as the baseline */,\n      e.onActiveChange?.(t),')
def ko4(a):
    edit(os.path.join(a, CSS), '.strip.svelte-1quva9c {\n  will-change: transform;',
         '.strip.svelte-1quva9c {\n  will-change: auto; /* [P-167 KO4] diagnostic only: strips unlayered */')
    edit(os.path.join(a, CSS), '.cell.svelte-1quva9c {\n  will-change: transform;\n}',
         '.cell.svelte-1quva9c {\n  will-change: auto; /* [P-167 KO4] diagnostic only: cells unlayered */\n}')
def ko5(a):
    edit(os.path.join(a, JS), '(s(b) || s(E) || s(__mnt)) && e(ue);',
         '(s(b) || s(E)) /* [P-167 KO5] diagnostic only: no idle mount */ && e(ue);')
ARMS = {'e-ko4': [ko4], 'e-ko5': [ko5], 'e-ko245': [ko2, ko4, ko5]}
lines = ['g0.0e JS 5c39f7a96e41 CSS d4e684032482 (base of every e-ko arm)']
for arm, fns in ARMS.items():
    a = copy(arm)
    for fn in fns: fn(a)
    lines.append(f'{arm} JS {h(os.path.join(a, JS))} CSS {h(os.path.join(a, CSS))}')
open(os.path.join(OUT, 'HASHES-b.txt'), 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
