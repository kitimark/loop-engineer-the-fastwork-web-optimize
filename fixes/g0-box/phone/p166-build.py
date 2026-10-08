#!/usr/bin/env python3
# P-166 knock-out arms as snapshot copies (overlay trees, 2 files each) under out/g0box/p166/<arm>/; prints hashes
import hashlib, os, shutil
JS = '_app/immutable/nodes/2.DyWL8TcE.js'; CSS = '_app/immutable/assets/2.gBuqKVzi.css'
E = 'out/g0box/g00e'; F = 'out/g0box/snap4/V'; OUT = 'out/g0box/p166'
def h(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12]
def copy(src, arm):
    for f in (JS, CSS):
        d = os.path.join(OUT, arm, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(os.path.join(src, f), d)
    return os.path.join(OUT, arm)
def edit(path, old, new):
    s = open(path).read(); assert s.count(old) == 1, (path, old[:60], s.count(old)); open(path, 'w').write(s.replace(old, new))
assert h(os.path.join(E, JS)) == '5c39f7a96e41' and h(os.path.join(E, CSS)) == 'd4e684032482', 'g0.0e pins'
assert h(os.path.join(F, JS)) == '30fd80ccbb3f' and h(os.path.join(F, CSS)) == '1d1e5d62a2c4', 'g0.0f pins'
# e-nohe: g0.0e with the hero CSS mode off (heCss false: the baseline JS writer, as on Chrome)
a = copy(E, 'e-nohe')
edit(os.path.join(a, JS), "      heCss =\n        `GestureEvent` in window &&",
     "      heCss =\n        /* [P-166 knock-out e-nohe] diagnostic only: the CSS mode off */ false &&\n        `GestureEvent` in window &&")
# f-nowc: g0.0f with the per-element will-change windows off (fixes/n10-c-wc-windows-off's change, re-applied here)
a = copy(F, 'f-nowc')
edit(os.path.join(a, CSS), '.start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img,\n.start-selling [data-fw-wc="0"] {',
     '.start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img {\n  /* [P-166 knock-out f-nowc] diagnostic only: [data-fw-wc="0"] windows off (n10-c-wc-windows-off) */')
# f-noglint: g0.0f with the secure-card glint animation off
a = copy(F, 'f-noglint')
s = open(os.path.join(a, CSS)).read()
open(os.path.join(a, CSS), 'w').write(s + '\n/* [P-166 knock-out f-noglint] diagnostic only: the secure-network glint does not animate */\n'
  '.start-selling-platform-secure-network-dash-glint.is-active svg {\n  animation: none !important;\n}\n')
lines = []
for arm in ('e-nohe', 'f-nowc', 'f-noglint'):
    lines.append(f'{arm} JS {h(os.path.join(OUT, arm, JS))} CSS {h(os.path.join(OUT, arm, CSS))}')
lines.insert(0, 'g0.0e JS 5c39f7a96e41 CSS d4e684032482 (base of e-nohe); g0.0f JS 30fd80ccbb3f CSS 1d1e5d62a2c4 (base of f-*)')
open(os.path.join(OUT, 'HASHES.txt'), 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
