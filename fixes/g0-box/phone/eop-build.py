#!/usr/bin/env python3
# End-of-page candidate 1 (lead 2026-10-09, de-offscreen's ranked list #1, user T-228 #101: the approach drags first):
# "arm the end of the page off the drag". On g0.0f, at y ~1750 on the phone the end-of-page IntersectionObserver (JS
# 14436-14441, rootMargin 200 % on .start-selling-platform) sets b, which (1) gives every panel column image its src
# (14630), (2) lifts the panel's inert (14692): one 25-68 ms style recalc + Layout + Composite mid-drag (P-164 G runs);
# and (3) I() -> N() (14414-14420) attaches the non-passive capture touchmove/wheel jack, so from y ~2010 the first
# touchmoves of every approach drag are cancelable. The panel is idle-mounted already (__mnt, 14522-14550).
# Arms (each g0.0f + parts; base out/g0box/snap4/V, pins 30fd80ccbb3f / 1d1e5d62a2c4):
#   a1  the images' src at the idle mount (new latch __bSrc set with __mnt): the src part leaves the drag; inert,
#       the jack and every other b use stay as they are. Behaviour identical (the panel is invisible until b/E anyway).
#   a2  a1 + inert lifted at the idle mount too (inert = !(b || E || __bSrc)). Pixel-identical, but the hidden panel's
#       buttons become Tab-focusable from the idle mount instead of from y ~1750 (aria-hidden stays): an a11y change,
#       attribution only unless the lead accepts it.
#   b   the jack attaches only near the real end: u (the jack's arm flag in I()) comes from a second observer on the
#       same element with rootMargin 0 0 150 % 0 and 21 thresholds, u = intersecting and the platform's bottom inside
#       that root (platform bottom within 2.5 viewports of the viewport top; on the phone scrollY >= ~4060 of 5213).
#       A single contact cannot travel the remaining >= 1.4 viewports, so every touch that can reach O() starts with
#       the jack attached. b keeps its 200 % observer (src/inert/mount trigger unchanged).
#   a1b a1 + b.
# Writes out/g0box/eop/<arm>/ (JS + CSS) and out/g0box/eop/HASHES.txt (read-only after writing).
import hashlib, os, shutil, sys
JS = '_app/immutable/nodes/2.DyWL8TcE.js'; CSS = '_app/immutable/assets/2.gBuqKVzi.css'
F = 'out/g0box/snap4/V'; OUT = 'out/g0box/eop'
def h(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12]
def copy(arm):
    for f in (JS, CSS):
        d = os.path.join(OUT, arm, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(os.path.join(F, f), d)
    return os.path.join(OUT, arm)
def edit(path, old, new):
    s = open(path).read(); assert s.count(old) == 1, (path, old[:70], s.count(old)); open(path, 'w').write(s.replace(old, new))
assert h(os.path.join(F, JS)) == '30fd80ccbb3f' and h(os.path.join(F, CSS)) == '1d1e5d62a2c4', 'g0.0f pins'

def a1(a):
    j = os.path.join(a, JS)
    edit(j, '  let __mnt = N(!1);\n',
         '  let __mnt = N(!1);\n'
         '  // [eop a1] the panel images get their src at the idle mount (latch __bSrc), not mid-drag where #platform enters\n'
         '  // the 200 % zone (b): the panel is invisible until b / E, so nothing on screen changes; b keeps every other use.\n'
         '  let __bSrc = N(!1);\n')
    edit(j, '          : (window.removeEventListener(`scroll`, i), z(__mnt, !0));',
         '          : (window.removeEventListener(`scroll`, i), z(__mnt, !0), z(__bSrc, !0));')
    edit(j, '(k(n, `src`, s(b) || s(E) ? s(t)[0] : void 0),',
         '(k(n, `src`, s(b) || s(E) || s(__bSrc) ? s(t)[0] : void 0),')
def a2(a):
    a1(a)
    edit(os.path.join(a, JS), '((a.inert = !(s(b) || s(E))),',
         '((a.inert = !(s(b) || s(E) || s(__bSrc))) /* [eop a2] inert lifts at the idle mount too */,')
def b(a):
    j = os.path.join(a, JS)
    edit(j, '''      te = R
        ? new IntersectionObserver(
            ([e]) => {
              ((u = !!e?.isIntersecting), u && z(b, !0), I());
            },
            { rootMargin: `200% 0px` },
          )
        : void 0;''',
         '''      te = R
        ? new IntersectionObserver(
            ([e]) => {
              e?.isIntersecting && z(b, !0);
            },
            { rootMargin: `200% 0px` },
          )
        : void 0,
      // [eop b] the touchmove/wheel jack (I -> N, non-passive capture listeners) attaches only near the real end: while
      // #platform's bottom is inside the viewport extended by 150 % downwards (2.5 viewports from the top). O() needs
      // that bottom inside the viewport, and one contact cannot travel the remaining >= 1.4 viewports, so every touch
      // that can open the morph starts with the jack attached; the approach drags above get passive, non-cancelable moves.
      __teJ = R
        ? new IntersectionObserver(
            ([e]) => {
              ((u = !!e?.isIntersecting && (!e.rootBounds || e.boundingClientRect.bottom <= e.rootBounds.bottom + 1)), I());
            },
            { rootMargin: `0px 0px 150% 0px`, threshold: Array.from({ length: 21 }, (e, t) => t / 20) },
          )
        : void 0;''')
    edit(j, '    (R && te && te.observe(R), _(), m());', '    (R && te && te.observe(R), R && __teJ && __teJ.observe(R), _(), m());')
    edit(j, '          te?.disconnect(),\n          P(),', '          te?.disconnect(),\n          __teJ?.disconnect(),\n          P(),')

ARMS = {'a1': [a1], 'a2': [a2], 'b': [b], 'a1b': [a1, b]}
if os.path.exists(os.path.join(OUT, 'HASHES.txt')): sys.exit(f'{OUT}/HASHES.txt exists (read-only snapshot): refuse to rebuild')
for arm, parts in ARMS.items():
    a = copy(arm)
    for p in parts: p(a)
lines = []
for arm in ARMS:
    for f in (JS, CSS): lines.append(f'{hashlib.sha256(open(os.path.join(OUT, arm, f), "rb").read()).hexdigest()}  {arm}/{f}')
open(os.path.join(OUT, 'HASHES.txt'), 'w').write('\n'.join(lines) + '\n')
for arm in ARMS: print(arm, h(os.path.join(OUT, arm, JS)), h(os.path.join(OUT, arm, CSS)))
print('HASHES.txt', h(os.path.join(OUT, 'HASHES.txt')))
