#!/usr/bin/env python3
# P-168 pre-stage (lead 14:0xZ, option 1): candidate g0.0g = g0.0f + a constant stacking context on every element fwWC
# tags, so the data-fw-wc flip (will-change: transform <-> auto) can no longer flip the used z-index auto <-> 0, which
# WebKit answers with Layout (WebKit main f9dcd0ee: style/StyleAdjuster.cpp 391-410 shouldTreatAutoZIndexAsZero ...
# willChange().canCreateStackingContext(); style/StyleDifference.cpp 428-429 hasAutoUsedZIndex flip -> Layout).
# `isolation: isolate` rather than `z-index: 0`: z-index is ignored on non-positioned, non-flex/grid items (several
# fwWC targets are static), isolation always makes a stacking context (StyleAdjuster.cpp 404). While an element is in
# its window (data-fw-wc="1", which covers every on-screen moment) will-change: transform already makes it a stacking
# context with used z-index 0, so the added isolation changes nothing there: pixels are expected identical.
# Also writes the diagnostic arm f-ko3 (g0.0f with fwWC a no-op: no will-change windows at all), never a candidate.
# Writes out/g0box/p168/<arm>/ and out/g0box/p168/HASHES.txt.
import hashlib, os, shutil
JS = '_app/immutable/nodes/2.DyWL8TcE.js'; CSS = '_app/immutable/assets/2.gBuqKVzi.css'
F = 'out/g0box/snap4/V'; OUT = 'out/g0box/p168'
def h(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12]
def copy(arm):
    for f in (JS, CSS):
        d = os.path.join(OUT, arm, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(os.path.join(F, f), d)
    return os.path.join(OUT, arm)
def edit(path, old, new):
    s = open(path).read(); assert s.count(old) == 1, (path, old[:60], s.count(old)); open(path, 'w').write(s.replace(old, new))
assert h(os.path.join(F, JS)) == '30fd80ccbb3f' and h(os.path.join(F, CSS)) == '1d1e5d62a2c4', 'g0.0f pins'
def g(a):
    edit(os.path.join(a, CSS), '.start-selling [data-fw-wc="0"] {\n  will-change: auto !important;\n}\n',
         '.start-selling [data-fw-wc="0"] {\n  will-change: auto !important;\n}\n'
         '/* [P-168 g0.0g] a constant stacking context on every element fwWC tags: the data-fw-wc flip above then no longer\n'
         '   flips the used z-index (auto <-> 0), which WebKit answers with a Layout (StyleDifference hasAutoUsedZIndex);\n'
         '   in the window (every on-screen moment) will-change: transform already isolates, so nothing on screen changes. */\n'
         '.start-selling [data-fw-wc] {\n  isolation: isolate;\n}\n')
def ko3(a):
    edit(os.path.join(a, JS), 'function fwWC() {\n  if (!(`IntersectionObserver` in window)) return;',
         'function fwWC() {\n  return; /* [P-168 f-KO3] diagnostic only: no will-change windows */\n  if (!(`IntersectionObserver` in window)) return;')
# Lead 14:2xZ (c): f-ko25 = g0.0f + ko2 (no idle un-skip, cE re-defers as the baseline) + ko5 (no idle mount of the morph
# panel): the smaller layout tree, to test whether the phone's ~30 % costlier Layouts at y 250-555 scale with it.
# Diagnostic arm (ko5 brings back the 40-75 ms mount task where #platform enters the 200 % zone, JS 14516-14520).
def ko2(a):
    edit(os.path.join(a, JS), 'function fwKick() {\n  fwArmed',
         'function fwKick() {\n  return; /* [P-168 KO2] diagnostic only: no idle un-skip */\n  fwArmed')
    edit(os.path.join(a, JS), '      t && sE(e, !0),\n      e.onActiveChange?.(t),',
         '      sE(e, t) /* [P-168 KO2] diagnostic only: re-defer as the baseline */,\n      e.onActiveChange?.(t),')
def ko5(a):
    edit(os.path.join(a, JS), '(s(b) || s(E) || s(__mnt)) && e(ue);',
         '(s(b) || s(E)) /* [P-168 KO5] diagnostic only: no idle mount */ && e(ue);')
# Lead 14:3xZ: f-cv25 = g0.0f + ko2 + the idle mount kept, but the mounted panel's subtree skipped
# (content-visibility: hidden) until the original's own mount trigger, s(b) || s(E) (dN: b latches when #platform
# reaches its zone or the morph opens; E = morph > 0.001). The flag sits on <html> so a panel mounted after the trigger
# (b before the idle mount) is never left hidden; it latches (never re-hidden). The panel is position absolute, inset 0,
# width/height 100 %, so the size containment of `hidden` does not change its box. A candidate form of ko5: the idle
# mount still keeps the 40-75 ms mount task out of the scroll; the panel's layout/paint/layers move to the trigger.
def cv(a):
    edit(os.path.join(a, CSS), '.start-selling-morph.is-expanded .start-selling-morph-panel,\n.start-selling-top-nav.is-expanded .start-selling-morph-panel {\n  pointer-events: auto;\n}\n',
         '.start-selling-morph.is-expanded .start-selling-morph-panel,\n.start-selling-top-nav.is-expanded .start-selling-morph-panel {\n  pointer-events: auto;\n}\n'
         '/* [P-168 f-cv25] the idle-mounted panel is skipped (no layout, paint or layers for its subtree) until the\n'
         '   original mount trigger (#platform zone or morph > 0) sets html[data-fw-cv-live]; it is invisible before that\n'
         '   (opacity from --morph = 0) and its box is fixed by inset 0 / 100 %, so nothing on screen changes. */\n'
         'html:not([data-fw-cv-live]) .start-selling-morph-panel {\n  content-visibility: hidden;\n}\n')
    edit(os.path.join(a, JS), '          window.clearTimeout(t));\n      }\n    );\n  });\n  var I = uN();',
         '          window.clearTimeout(t));\n      }\n    );\n  });\n'
         '  // [P-168 f-cv25] lift the panel skip on the original mount trigger (latched; see the CSS rule)\n'
         '  ne(() => {\n    (s(b) || s(E)) && document.documentElement.setAttribute(`data-fw-cv-live`, ``);\n  });\n'
         '  var I = uN();')
# Lead 14:5xZ: de-offscreen's knock-outs (b28ac944, fixes/de-offscreen/README.md KO B and KO C) on g0.0f, for a
# Simulator Timeline Composite count (counts only). Appended as the last rule of the CSS, the de-offscreen form.
#   f-B: the paused-scene morph col-track animations off (the hidden panel's 12 layers / 16 MB stop compositing;
#        not pixel-identical at the menu open: the columns restart from 0, so a proposal if kept)
#   f-C: the paused-scene platform row-title ::after sweeps off (17 off-screen 0 MB layers)
KOB = '.start-selling [data-start-selling-scene="paused"] .start-selling-morph-col-track {\n  animation: none !important;\n}\n'
KOC = '.start-selling [data-start-selling-scene="paused"] .start-selling-platform-row [class*="start-selling-platform-row-title-"]::after {\n  animation: none !important;\n}\n'
def append_css(rule, tag):
    def f(a):
        p = os.path.join(a, CSS); s = open(p).read(); assert rule not in s
        open(p, 'w').write(s + f'/* [P-168 {tag}] de-offscreen knock-out (b28ac944), diagnostic only */\n' + rule)
    return f
ARMS = {'g': [g], 'f-ko3': [ko3], 'f-ko25': [ko2, ko5], 'f-cv25': [ko2, cv], 'f-B': [append_css(KOB, 'f-B')], 'f-C': [append_css(KOC, 'f-C')]}
lines = [f'g0.0f JS {h(os.path.join(F, JS))} CSS {h(os.path.join(F, CSS))} (base)']
for arm, eds in ARMS.items():
    a = copy(arm)
    for e in eds: e(a)
    lines.append(f'{arm} JS {h(os.path.join(a, JS))} CSS {h(os.path.join(a, CSS))}')
open(os.path.join(OUT, 'HASHES.txt'), 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
