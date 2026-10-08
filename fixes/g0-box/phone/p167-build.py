#!/usr/bin/env python3
# P-167 pre-stage (lead 12:3xZ, after P-166 stage 2): knock-out arms of g0.0e as snapshot copies (overlay trees, 2 files
# each) under out/g0box/p167/<arm>/; DIAGNOSTIC ONLY, never a candidate build. Candidates from the lead's read-only map
# (map-spotA 12:1xZ): KO1 accent-ca idle opacity animations, KO2 early un-skipped deferred sections, KO3 data-fw-wc
# will-change windows. Prints the hashes and writes out/g0box/p167/HASHES.txt.
#   e-ko1    g0.0e with the accent idle frames back on the baseline step-end keyframes (CSS 1301/1304/1308)
#   e-ko2    g0.0e with no idle un-skip (fwKick a no-op, JS 2719) and cE re-deferring as the baseline (JS 2799 sE(e, t))
#   e-ko3    g0.0e with no will-change windows (fwWC a no-op, JS 2738: no data-fw-wc attribute is written)
#   e-ko123  all three
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
def ko1(a):
    for n in '012':
        edit(os.path.join(a, CSS), f'  animation: 0.6s linear infinite fw-acc-idle-{n};',
             f'  animation: 0.6s step-end infinite svelte-1fn2go6-idle-{n}; /* [P-167 KO1] diagnostic only: baseline idle frames */')
def ko2(a):
    edit(os.path.join(a, JS), 'function fwKick() {\n  fwArmed',
         'function fwKick() {\n  return; /* [P-167 KO2] diagnostic only: no idle un-skip */\n  fwArmed')
    edit(os.path.join(a, JS), '      t && sE(e, !0),\n      e.onActiveChange?.(t),',
         '      sE(e, t) /* [P-167 KO2] diagnostic only: re-defer as the baseline */,\n      e.onActiveChange?.(t),')
def ko3(a):
    edit(os.path.join(a, JS), 'function fwWC() {\n  if (!(`IntersectionObserver` in window)) return;',
         'function fwWC() {\n  return; /* [P-167 KO3] diagnostic only: no will-change windows */\n  if (!(`IntersectionObserver` in window)) return;')
ARMS = {'e-ko1': [ko1], 'e-ko2': [ko2], 'e-ko3': [ko3], 'e-ko123': [ko1, ko2, ko3]}
lines = ['g0.0e JS 5c39f7a96e41 CSS d4e684032482 (base of every e-ko arm)']
for arm, fns in ARMS.items():
    a = copy(arm)
    for fn in fns: fn(a)
    lines.append(f'{arm} JS {h(os.path.join(a, JS))} CSS {h(os.path.join(a, CSS))}')
open(os.path.join(OUT, 'HASHES.txt'), 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
