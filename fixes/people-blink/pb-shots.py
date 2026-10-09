#!/usr/bin/env python3
# people-blink screenshot-burst reader (fix-scrollcb-g0, 2026-10-09) for pb-frames.mjs PB_MODE=shots. Simulator
# screenshots only (`simctl io screenshot`, the same kind our pixel gates use); no video is read.
# Per load: every burst shot and rest reference, downscaled to 430 px wide (1 px = 1 css px), gray:
#   - sharp: mean |Laplacian| over the web view (rows 59-834), a blur / fade drop lowers it;
#   - white: share of near-white pixels (>= 245) in the web view (the hidden card shows what is under it);
#   - the page's own main-thread state at the shot's start: scrollY and whether #people had .is-visible (page log).
# Contact sheets (out/people-blink/<tag>/sheet-<arm>-<phase>.png, 8 shots per row, half size, label strip) are for
# looking at; they stay in out/ (gitignored).
# usage: python3 fixes/people-blink/pb-shots.py out/people-blink/<tag>/pb.json
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw

W, H = 430, 932
R0, R1 = 59, 834


def load(f):
    im = Image.open(f).convert('L').resize((W, H), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32), im


def metrics(a):
    v = a[R0:R1]
    lap = np.abs(4 * v[1:-1, 1:-1] - v[:-2, 1:-1] - v[2:, 1:-1] - v[1:-1, :-2] - v[1:-1, 2:])
    return round(float(lap.mean()), 2), round(float((v >= 245).mean()), 3)


def page_state(L, t_wall):
    perf0 = L['geom']['perf0']
    f = [x for x in L.get('f', []) if x[1] <= t_wall]
    y = f[-1][2] if f else None
    vis = None
    for m in L.get('m', []):
        if perf0 + m[0] > t_wall:
            break
        if m[1].startswith('section#people') and m[2] == 'class':
            if '+is-visible' in m[3]:
                vis = True
            elif '-is-visible' in m[3]:
                vis = False
    return y, vis


def main(src):
    rec = json.load(open(src))
    out = os.path.dirname(src)
    res = []
    for L in rec['loads']:
        if L.get('void') or not L.get('shots'):
            print('skip', L.get('arm'), L.get('void'))
            continue
        arm = L['arm'] + str(L['rep'])
        refs = []
        for y, f, t0, t1, ok, sy in L['refs']:
            if ok and os.path.exists(f):
                a, _ = load(f)
                refs.append((y, sy) + metrics(a))
        rows = []
        by = {}
        for name, f, t0, t1, ok in L['shots']:
            if not ok or not os.path.exists(f):
                continue
            a, im = load(f)
            sh, wh = metrics(a)
            y, vis = page_state(L, t0)
            ph0 = next((m[1] for m in L['mk'] if m[3] == name), t0)
            rows.append({'phase': name, 'f': os.path.basename(f), 'dt': t0 - ph0, 'dur': t1 - t0, 'sharp': sh, 'white': wh, 'pageY': y, 'visible': vis})
            by.setdefault(name, []).append((im, f"{name} +{t0 - ph0}ms y{round(y) if y is not None else '-'} {'V' if vis else 'h'}"))
        for name, ims in by.items():
            cols = 8
            tw, th = W // 2, H // 2
            sheet = Image.new('L', (cols * (tw + 4), ((len(ims) + cols - 1) // cols) * (th + 18)), 255)
            d = ImageDraw.Draw(sheet)
            for i, (im, lab) in enumerate(ims):
                x, yy = (i % cols) * (tw + 4), (i // cols) * (th + 18)
                sheet.paste(im.resize((tw, th)), (x, yy + 16))
                d.text((x + 2, yy + 2), lab, fill=0)
            fn = os.path.join(out, f'sheet-{arm}-{name}.png')
            sheet.save(fn)
        res.append({'arm': arm, 'ko': bool(L.get('ko')), 'refs': refs, 'shots': rows})
        print(f"== {arm}{(' (reveal knocked out)' if arm[1:2] == 'K' else ' (deck events knocked out)' if arm[1:2] == 'D' else '') if L.get('ko') else ''} refs [y, pageY, sharp, white]: {refs}")
        for r in rows:
            print(f"  {r['phase']} +{r['dt']:5d}ms ({r['dur']} ms) pageY {r['pageY'] if r['pageY'] is None else round(r['pageY'])} visible {r['visible']} sharp {r['sharp']} white {r['white']}")
    json.dump(res, open(os.path.join(out, 'pbs.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
