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
# EOP_BASE=h: stack on g0.0h (g0.0f + PR-039 keep-phase = P-168 arm f-B2, fixes/g0-0h) instead of g0.0f (lead 2026-10-08)
if os.environ.get('EOP_BASE') == 'h':
    F = 'out/g0box/p168/f-B2'
    assert h(os.path.join(F, JS)) == '9162843e750f' and h(os.path.join(F, CSS)) == '26d28a0a263b', 'g0.0h pins'
else:
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

# a3 (lead 2026-10-09 after the first Simulator counts: the cost at y ~1700 is the inert flip, not the src writes; a2's
# early inert is an a11y defect): the panel's inert lifts at the first scroll-quiet moment (no scroll event for 300 ms,
# the idle mount's own rule) after b latches, via a new latch __bIn, instead of in the IO frame mid-drag. inert =
# !(__bIn || E): an open before the quiet moment lifts it at the open, as before (E). The hidden panel is focusable only
# from __bIn on, i.e. no earlier than in g0.0f (b at y ~1750), so focus order and aria-hidden are unchanged in kind.
# src and the mount keep b (a1 showed the src writes are not the cost).
def a3(a):
    j = os.path.join(a, JS)
    edit(j, '  var I = uN();\n  let L, te;',
         '  // [eop a3] the panel\'s inert lifts at the first scroll-quiet moment (no scroll for 300 ms) after b latches, not in\n'
         '  // the IntersectionObserver frame mid-drag (one 25-68 ms style recalc of the panel subtree on the phone); an open\n'
         '  // (E) before that lifts it at once, as before.\n'
         '  let __bIn = N(!1);\n'
         '  ne(() => {\n'
         '    if (!s(b) || s(__bIn)) return;\n'
         '    let t = 0,\n'
         '      o = performance.now(),\n'
         '      i = () => {\n'
         '        o = performance.now();\n'
         '      },\n'
         '      n = () => {\n'
         '        performance.now() - o < 300 ? (t = window.setTimeout(n, 300)) : (window.removeEventListener(`scroll`, i), z(__bIn, !0));\n'
         '      };\n'
         '    return (\n'
         '      window.addEventListener(`scroll`, i, { passive: !0 }),\n'
         '      (t = window.setTimeout(n, 300)),\n'
         '      () => {\n'
         '        (window.removeEventListener(`scroll`, i), window.clearTimeout(t));\n'
         '      }\n'
         '    );\n'
         '  });\n'
         '  var I = uN();\n  let L, te;')
    edit(j, '((a.inert = !(s(b) || s(E))),', '((a.inert = !(s(__bIn) || s(E))) /* [eop a3] */,')

# a4 (Simulator counts 2026-10-08: under drags with 300 ms pauses plus momentum, a3's 300 ms scroll-quiet never comes
# before the end, so a3 would move the flip into the first open): as a3, plus the first finger lift (touchend /
# touchcancel, passive) after b lifts inert too. The flip's style recalc then lands after the finger is up, when iOS
# scrolls on its own (momentum), not in a finger-down frame of the drag.
def a4(a):
    a3(a)
    j = os.path.join(a, JS)
    edit(j, '''    return (
      window.addEventListener(`scroll`, i, { passive: !0 }),
      (t = window.setTimeout(n, 300)),
      () => {
        (window.removeEventListener(`scroll`, i), window.clearTimeout(t));
      }
    );''', '''    let u = () => z(__bIn, !0); /* [eop a4] or the first finger lift after b */
    return (
      window.addEventListener(`scroll`, i, { passive: !0 }),
      window.addEventListener(`touchend`, u, { passive: !0, capture: !0 }),
      window.addEventListener(`touchcancel`, u, { passive: !0, capture: !0 }),
      (t = window.setTimeout(n, 300)),
      () => {
        (window.removeEventListener(`scroll`, i),
          window.removeEventListener(`touchend`, u, !0),
          window.removeEventListener(`touchcancel`, u, !0),
          window.clearTimeout(t));
      }
    );''')

# w (2026-10-09, WebKit source via bm-g0box-webkit): adding the first window `wheel` listener changes the root style's
# eventListenerRegionTypes (style/StyleAdjuster.cpp:227-244, inherited), so Document::invalidateEventListenerRegions()
# (dom/Document.cpp:6648-6663) calls scheduleFullStyleRebuild(), and every element's changed region types invalidate the
# event region of its composited layer (rendering/RenderElement.cpp:1013-1028). N() did that mid-drag at y ~1700 (and
# P() again on the way back up). On iOS the touch half returns early unless touch event regions are on
# (Document.cpp:12723-12730, UNRESOLVED for shipping Safari). w: the wheel jack listener is added once when the effect
# mounts (page load, with #platform present, as te.observe) and removed at teardown; A runs its body only while the jack
# is armed (d), so the wheel behaviour is the same at every y. The touchstart/touchmove pair stays in N()/P() as before.
# Decisive local check for the touch half: if w's IO frame loses the style spike, the touch pair is cheap here.
def w(a):
    j = os.path.join(a, JS)
    edit(j, '''d = !0),
          window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),
          window.addEventListener(`touchstart`, j, { passive: !0, capture: !0 }),''', '''d = !0),
          window.addEventListener(`touchstart`, j, { passive: !0, capture: !0 }),''')
    edit(j, '''d = !1),
          window.removeEventListener(`wheel`, A, !0),
          window.removeEventListener(`touchstart`, j, !0),''', '''d = !1),
          window.removeEventListener(`touchstart`, j, !0),''')
    edit(j, '''      A = (e) => {
        k(e.deltaY) &&''', '''      A = (e) => {
        // [eop w] attached from the mount (one root-style change at load, not mid-drag); acts only while the jack is armed
        d &&
          k(e.deltaY) &&''')
    edit(j, '    (R && te && te.observe(R), ', '    (R && te && te.observe(R), R && window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }) /* [eop w] */, ')
    edit(j, '          P(),\n          ne(),', '          P(),\n          window.removeEventListener(`wheel`, A, !0) /* [eop w] */,\n          ne(),')

# ws (lead 2026-10-09): w only where it can't cost wheel/trackpad users: a non-passive window wheel listener from the
# mount makes every wheel scroll wait for the main thread at every y in Chrome and desktop Safari (today only near the
# end). Scoped like PR-030: touch screens (hover: none, pointer: coarse) up to 640 px wide, motion not reduced, read once
# at mount (__wM). Everywhere else N()/P() add and remove the wheel listener at g0.0h's timing, unchanged.
def ws(a):
    j = os.path.join(a, JS)
    edit(j, '''d = !0),
          window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''', '''d = !0),
          __wM || window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''')
    edit(j, '''d = !1),
          window.removeEventListener(`wheel`, A, !0),''', '''d = !1),
          __wM || window.removeEventListener(`wheel`, A, !0),''')
    edit(j, '''      A = (e) => {
        k(e.deltaY) &&''', '''      A = (e) => {
        // [eop ws] on small touch screens attached from the mount (one root-style change at load, not mid-drag), so it
        // acts only while the jack is armed (d); elsewhere it is attached only while armed, as before
        d &&
          k(e.deltaY) &&''')
    edit(j, '      R = y(),\n', '      // [eop ws] small touch screens, motion not reduced (PR-030 scope): the wheel jack listener lives from mount to teardown\n'
         '      __wM = matchMedia(`(hover: none) and (pointer: coarse) and (max-width: 640px) and (prefers-reduced-motion: no-preference)`).matches,\n'
         '      R = y(),\n')
    edit(j, '    (R && te && te.observe(R), ', '    (R && te && te.observe(R), R && __wM && window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }) /* [eop ws] */, ')
    edit(j, '          P(),\n          ne(),', '          P(),\n          __wM && window.removeEventListener(`wheel`, A, !0) /* [eop ws] */,\n          ne(),')

# ws2 (2026-10-09, after the mount-cost check: ws's add at mount costs a full style rebuild inside the hydration frame,
# Simulator median +10 ms dur / +9 ms L+S, n = 3): register the wheel listener before the body has any style, from an
# inline <head> script, so the root's eventListenerRegionTypes are final before the first style resolution and nothing
# is rebuilt later. Same scope (PR-030 media query, read once in the head). The head listener calls window.__fwWheel,
# which the component sets to A at mount and clears at teardown; A acts only while the jack is armed (d). The CSP meta
# gets the inline script's sha256 (its only change). Elsewhere N()/P() keep g0.0h's add/remove timing.
HTML = 'index.html'
WS2_JS = ('(function(){if(!matchMedia("(hover: none) and (pointer: coarse) and (max-width: 640px) and (prefers-reduced-motion: no-preference)").matches)return;'
          'window.__fwWheelOn=1;addEventListener("wheel",function(e){var f=window.__fwWheel;f&&f(e)},{passive:false,capture:true})})()')
def ws2(a):
    import base64
    hp = os.path.join(a, HTML); shutil.copyfile(os.path.join(os.environ.get('EOP_SITE', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty'), HTML), hp)
    sha = base64.b64encode(hashlib.sha256(WS2_JS.encode()).digest()).decode()
    edit(hp, "script-src 'self' 'sha256-xZb9LTox5WUlNevpC3teLDEDD7rbLVR6SN+chrqqURw='", f"script-src 'self' 'sha256-xZb9LTox5WUlNevpC3teLDEDD7rbLVR6SN+chrqqURw=' 'sha256-{sha}'")
    edit(hp, '\t\t<script src="/analytics.js"></script>\n', f'\t\t<script>{WS2_JS}</script>\n\t\t<script src="/analytics.js"></script>\n')
    j = os.path.join(a, JS)
    edit(j, '''d = !0),
          window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''', '''d = !0),
          __wM || window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''')
    edit(j, '''d = !1),
          window.removeEventListener(`wheel`, A, !0),''', '''d = !1),
          __wM || window.removeEventListener(`wheel`, A, !0),''')
    edit(j, '''      A = (e) => {
        k(e.deltaY) &&''', '''      A = (e) => {
        // [eop ws2] on small touch screens the head script's wheel listener calls this from the first paint on, so it
        // acts only while the jack is armed (d); elsewhere it is attached only while armed, as before
        d &&
          k(e.deltaY) &&''')
    edit(j, '      R = y(),\n', '      // [eop ws2] small touch screens, motion not reduced: the wheel listener was registered by the inline head script\n'
         '      __wM = !!window.__fwWheelOn,\n'
         '      R = y(),\n')
    edit(j, '    (R && te && te.observe(R), ', '    (R && te && te.observe(R), R && __wM && (window.__fwWheel = A) /* [eop ws2] */, ')
    edit(j, '          P(),\n          ne(),', '          P(),\n          __wM && window.__fwWheel === A && (window.__fwWheel = null) /* [eop ws2] */,\n          ne(),')

# ws3 (2026-10-09, after the Chrome scope check): ws2's inline script never runs. The mirror serves a CSP *header*
# whose script-src lists other hashes (Chrome: "Executing inline script violates ... script-src 'self' 'sha256-JUE+...'"),
# so the meta change alone cannot allow it. ws3 puts the same code at the top of /analytics.js, the page's own
# same-origin, parser-blocking <head> script (index.html line 13, before the body): no new request, no HTML or CSP
# change. The JS side is ws2's (window.__fwWheelOn / window.__fwWheel).
ANALYTICS = 'analytics.js'
def ws3(a):
    ap = os.path.join(a, ANALYTICS); shutil.copyfile(os.path.join(os.environ.get('EOP_SITE', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty'), ANALYTICS), ap)
    s = open(ap).read()
    open(ap, 'w').write('/* [eop ws3] small touch screens, motion not reduced: the end-of-page wheel jack listener is registered here,\n'
                        '   before the body has any style, so adding it never rebuilds the document\'s style later (fixes/g0-box) */\n'
                        + WS2_JS + ';\n' + s)
    j = os.path.join(a, JS)
    edit(j, '''d = !0),
          window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''', '''d = !0),
          __wM || window.addEventListener(`wheel`, A, { passive: !1, capture: !0 }),''')
    edit(j, '''d = !1),
          window.removeEventListener(`wheel`, A, !0),''', '''d = !1),
          __wM || window.removeEventListener(`wheel`, A, !0),''')
    edit(j, '''      A = (e) => {
        k(e.deltaY) &&''', '''      A = (e) => {
        // [eop ws3] on small touch screens the head script's wheel listener (analytics.js) calls this from the first
        // paint on, so it acts only while the jack is armed (d); elsewhere it is attached only while armed, as before
        d &&
          k(e.deltaY) &&''')
    edit(j, '      R = y(),\n', '      // [eop ws3] small touch screens, motion not reduced: the wheel listener was registered by analytics.js in <head>\n'
         '      __wM = !!window.__fwWheelOn,\n'
         '      R = y(),\n')
    edit(j, '    (R && te && te.observe(R), ', '    (R && te && te.observe(R), R && __wM && (window.__fwWheel = A) /* [eop ws3] */, ')
    edit(j, '          P(),\n          ne(),', '          P(),\n          __wM && window.__fwWheel === A && (window.__fwWheel = null) /* [eop ws3] */,\n          ne(),')

ALL = {'a1': [a1], 'a2': [a2], 'b': [b], 'a1b': [a1, b], 'a3': [a3], 'a3b': [a3, b], 'a4': [a4], 'a4b': [a4, b], 'a14b': [a1, a4, b], 'w': [w], 'ws': [ws], 'ws2': [ws2], 'ws3': [ws3]}
# usage: python3 eop-build.py [OUT [arm ...]]   (default: out/g0box/eop with a1 a2 b a1b, as first built)
if len(sys.argv) > 1: OUT = sys.argv[1]
ARMS = {k: ALL[k] for k in (sys.argv[2:] or ['a1', 'a2', 'b', 'a1b'])}
if os.path.exists(os.path.join(OUT, 'HASHES.txt')): sys.exit(f'{OUT}/HASHES.txt exists (read-only snapshot): refuse to rebuild')
for arm, parts in ARMS.items():
    a = copy(arm)
    for p in parts: p(a)
lines = []
for arm in ARMS:
    for f in (JS, CSS, 'index.html', 'analytics.js'):
        if f in ('index.html', 'analytics.js') and not os.path.exists(os.path.join(OUT, arm, f)): continue
        lines.append(f'{hashlib.sha256(open(os.path.join(OUT, arm, f), "rb").read()).hexdigest()}  {arm}/{f}')
open(os.path.join(OUT, 'HASHES.txt'), 'w').write('\n'.join(lines) + '\n')
for arm in ARMS: print(arm, h(os.path.join(OUT, arm, JS)), h(os.path.join(OUT, arm, CSS)))
print('HASHES.txt', h(os.path.join(OUT, 'HASHES.txt')))
