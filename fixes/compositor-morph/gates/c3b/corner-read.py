#!/usr/bin/env python3
# c3b-d (b) reader (arch-compositor-morph): where the card's top edge, left edge and top-left / top-right corner arcs
# are drawn in each Simulator shot of `k-gates.sh corner` (pre-look --engine sim, held touch, frozen animations), against
# where the formula puts them (closed pill 16,16,398x52 -> open 12,12,406x(H); radius min(32 - 12 m, h/2, w/2)).
# Edge = the sub-pixel position of the strongest luminance step along a short scan line across the expected edge
# (parabolic peak of |gradient|), device px (DPR 3; the page starts at device y 177 under the status bar).
# A wobble shows as residuals (measured - formula) that jump back and forth between neighbouring m steps; C (no CM,
# the nav's own CSS geometry) is the reference, A~A2 (two loads of one build) the noise.
#   python3 fixes/compositor-morph/gates/c3b/corner-read.py out/cm/corner-sim [H css, default 791]
import sys, os, json, math
from PIL import Image
D = sys.argv[1]; _p = [a for a in sys.argv[2:] if not a.startswith("--")]; H = float(_p[0]) if _p else 791.0
Y0, S = 177, 3.0
def lum(im, x, y):
    r, g, b = im.getpixel((x, y))[:3]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def edge(im, pts):
    # pts: device pixel coords along a scan line; returns the sub-pixel index of the max |step|
    v = [lum(im, x, y) for x, y in pts]; d = [abs(v[i + 1] - v[i]) for i in range(len(v) - 1)]
    i = max(range(len(d)), key=lambda k: d[k])
    if 0 < i < len(d) - 1:
        a, b, c = d[i - 1], d[i], d[i + 1]; den = a - 2 * b + c; off = 0.5 * (a - c) / den if den else 0
    else: off = 0
    return i + 0.5 + off, d[i]
def geo(m):
    n = 1 - m; w = 406 - 8 * n; h = 52 + (H - 52) * m; r = min(32 - 12 * m, h / 2, w / 2)
    return dict(l=16 - 4 * m, t=16 - 4 * m, w=w, h=h, r=r)
def measure(f, m):
    im = Image.open(f).convert('RGB'); g = geo(m); out = {}
    # top edge at the card's centre column, scan y over +-8 device px
    x = int(S * (g['l'] + g['w'] / 2)); ye = Y0 + S * g['t']; y0 = int(ye) - 8
    i, s = edge(im, [(x, y) for y in range(y0, y0 + 17)]); out['top'] = (y0 + i - ye, s)
    # left edge at mid-height of the straight part (only when there is one: h > 2r + 6)
    if g['h'] > 2 * g['r'] + 6:
        y = int(Y0 + S * (g['t'] + g['h'] / 2)); xe = S * g['l']; x0 = max(0, int(xe) - 8)
        i, s = edge(im, [(x, y) for x in range(x0, x0 + 17)]); out['left'] = (x0 + i - xe, s)
    # corner arcs, along the 45-degree diagonal through the arc's centre: TL and TR
    for k, sx in (('tl', 1), ('tr', -1)):
        cx = g['l'] + g['r'] if sx == 1 else g['l'] + g['w'] - g['r']; cy = g['t'] + g['r']
        ex = cx - sx * g['r'] / math.sqrt(2); ey = cy - g['r'] / math.sqrt(2)   # the arc point, css
        pts = [(int(round(S * ex - sx * j / math.sqrt(2))), int(round(Y0 + S * ey - j / math.sqrt(2)))) for j in range(-12, 13)]
        # step k along the diagonal = 1 device px of diagonal distance (rounded to pixels)
        i, s = edge(im, pts); out[k] = (i - 12, s)
    return out
keys = ('top', 'left', 'tl', 'tr')
if '--shots' not in sys.argv and '--shots-lib' not in sys.argv:
  ms = sorted({f.split('-', 1)[1][:-4] for f in os.listdir(D) if f.endswith('.png') and f[0] in 'AV' and not f.split('-', 1)[1].startswith('load')}, key=float)
  rows = {}
  for arm in ('A', 'A2', 'V', 'V2'):
      rows[arm] = {}
      for m in ms:
          f = os.path.join(D, f'{arm}-{m}.png')
          if os.path.exists(f): rows[arm][m] = measure(f, float(m))
  keys = ('top', 'left', 'tl', 'tr')
  print(f'{D}: residual (measured - formula), device px, per m; A/A2 = v14 two loads, V/V2 = C two loads')
  for k in keys:
      print(f'== {k}')
      for arm in ('A', 'A2', 'V', 'V2'):
          print(f'  {arm:3}', ' '.join(f"{m}:{rows[arm][m][k][0]:+.2f}" if k in rows[arm].get(m, {}) else f'{m}:  -  ' for m in ms))
      # wobble score: mean |second difference| of the residual over m (a steady drift scores 0, back-and-forth scores high)
      for arm in ('A', 'A2', 'V', 'V2'):
          r = [rows[arm][m][k][0] for m in ms if k in rows[arm].get(m, {})]
          sd = [abs(r[i + 1] - 2 * r[i] + r[i - 1]) for i in range(1, len(r) - 1)]
          print(f'  wobble {arm:3} mean |2nd diff| {sum(sd) / len(sd) if sd else float("nan"):.2f}  max {max(sd) if sd else float("nan"):.2f}  (n {len(r)})')
  json.dump(rows, open(os.path.join(D, 'corner-read.json'), 'w'))

# --shots: the in-motion frames of corner-shots.mjs (out/cm/corner-shots/run.json). Each frame gets m from the scroll the
# page drew inside its capture window; frames whose window spans more than 0.02 in m are skipped (the edges read here move at most 4 css px per unit m, so 0.02 is 0.24 device px; a frame drawn mid-change could be
# either) are skipped. Per arm and stroke: the residual (measured - formula) per edge, its spread (sd) and largest
# |residual|; a wobble shows as a larger spread than C's and than the A/A of the same build (r1 against r2).
if '--shots' in sys.argv:
    run = json.load(open(os.path.join(D, 'run.json')))
    print(f'\n{D} --shots: in-motion frames, residual (measured - formula), device px')
    for lab, row in run['arms'].items():
        for r in row.get('runs', []):
            got = {k: [] for k in keys}
            for sh in r['shots']:
                if sh.get('mLo') is None or sh['mHi'] - sh['mLo'] > 0.02 or sh['mLo'] < -0.02 or sh['mHi'] > 0.32: continue
                if not os.path.exists(sh['f']): continue
                m = (sh['mLo'] + sh['mHi']) / 2; out = measure(sh['f'], m)
                for k in keys:
                    if k in out: got[k].append((m, out[k][0]))
            line = []
            for k in keys:
                v = [x[1] for x in got[k]]
                if not v: line.append(f'{k} -'); continue
                mu = sum(v) / len(v); sd = (sum((x - mu) ** 2 for x in v) / len(v)) ** 0.5
                line.append(f'{k} n {len(v)} mean {mu:+.2f} sd {sd:.2f} max|r| {max(abs(x) for x in v):.2f}')
            print(f'  {lab} r{r["k"]}: ' + ' | '.join(line))
