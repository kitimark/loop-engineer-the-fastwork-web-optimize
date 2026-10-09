#!/usr/bin/env python3
# people-blink frame analysis (fix-scrollcb-g0, 2026-10-09) for fixes/people-blink/pb-frames.mjs output. Pixels only.
# Per load: the Simulator screen video, decoded beforehand by a visible ffmpeg command to gray at 430 px wide (1 px =
# 1 css px; 932 rows; <mov>.gray), frame times from ffprobe (<mov>.pts); see frames(). For each frame k the vertical content shift s_k against frame k-1 is found on row profiles (8 column bands),
# refined on full rows. Then, inside the web view (rows WV0..WV1), in 8-row bands:
#   - texture t_k(band) = the band's pixel std;
#   - LATE (half-drawn / empty): a band that is flat in frame k (t < FLAT) while the same document rows one frame later
#     (shifted by s_{k+1}) are textured (t > TEX) and differ from it by > DIFF: content that was missing and then appears;
#   - FLASH (blink): frame k differs from both neighbours in a band (after shift) while k-1 and k+1 agree there.
# Bands are mapped to document y with the logger's scrollY at the frame's wall time (video start wall + pts; page
# Date.now shares the Mac clock) plus the web view's top row; the doc y is approximate (the UI process scrolls ahead of
# the page's rAF when the page is late). Each event lists the flips logged within +-100 ms.
# usage: python3 fixes/people-blink/pb-analyze.py out/people-blink/<tag>/pb.json [--strips N] [--load i]
import json, sys, os
import numpy as np

W, H = 430, 932
BAND = 8
FLAT, TEX, DIFF = 6.0, 14.0, 18.0


def frames(mov):
    # No decoding here (lead 2026-10-09, user T-228 #138): the frames come from a visible ffmpeg command run beforehand,
    #   ffmpeg -v error -i <mov> -vf scale=430:932:flags=area -fps_mode passthrough -f rawvideo -pix_fmt gray <mov>.gray
    #   ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 <mov> > <mov>.pts
    # and are read here as a memory map (uint8, n x 932 x 430).
    pts = [x.strip(',') for x in open(mov + '.pts').read().split()]
    pts = [float(x) for x in pts if x and x != 'N/A']
    raw = mov + '.gray'
    n = os.path.getsize(raw) // (W * H)
    F = np.memmap(raw, dtype=np.uint8, mode='r', shape=(n, H, W))
    return F, np.array(pts[:n])


def shift(a, b, r0, r1, smax=400):
    # content moves up when scrolling down: a's row r shows what b showed at row r + s. Find s in [-60, smax].
    cols = [slice(20 + i * 49, 20 + i * 49 + 40) for i in range(8)]
    pa = np.stack([a[:, c].mean(1) for c in cols], 1)
    pb = np.stack([b[:, c].mean(1) for c in cols], 1)
    best, bs = None, 0
    for s in range(-60, smax + 1):
        lo, hi = max(r0, r0 - s), min(r1, r1 - s)
        if hi - lo < 120:
            continue
        d = np.abs(pa[lo:hi] - pb[lo + s: hi + s]).mean()
        if best is None or d < best:
            best, bs = d, s
    return bs, best


def webview(F):
    # rows that ever change: the web view; Safari's own bars are static except the toolbar collapse
    v = np.asarray(F[:: max(1, len(F) // 60)], dtype=np.float32).std(0).mean(1)
    rows = np.where(v > 1.0)[0]
    return (int(rows[0]), int(rows[-1]) + 1) if len(rows) else (60, 850)


def analyze(load, nstrips=0, outdir=None):
    F, pts = frames(load['mov'])
    n = len(F)
    r0, r1 = webview(F)
    S = np.zeros(n, int)
    for k in range(1, n):
        S[k] = shift(np.asarray(F[k], np.float32), np.asarray(F[k - 1], np.float32), r0, r1)[0]
    # page log: Date.now -> scrollY
    f = np.array(load['f'], float) if load.get('f') else np.zeros((0, 3))
    wall = load['vidStartWall'] + pts * 1000.0
    def y_at(t):
        if not len(f):
            return float('nan')
        i = np.searchsorted(f[:, 1], t)
        return f[min(max(i - 1, 0), len(f) - 1), 2]
    perf0 = load['geom']['perf0']
    flips = [(perf0 + m[0], m[1], m[2], m[3]) for m in load.get('m', [])] + [(perf0 + e[0], e[2], e[1], e[3]) for e in load.get('ev', [])]
    flips.sort()
    ft = np.array([x[0] for x in flips]) if flips else np.zeros(0)
    marks = [(m[1], m[3]) for m in load.get('mk', [])]
    def phase(t):
        p = '-'
        for tw, name in marks:
            if tw <= t:
                p = name
        return p
    ev = []
    nb = (r1 - r0) // BAND
    for k in range(1, n - 1):
        s1 = S[k + 1]
        for b in range(nb):
            a0 = r0 + b * BAND
            a1 = a0 + BAND
            if a0 - s1 < r0 or a1 - s1 > r1:
                continue
            cur = F[k, a0:a1, 10:420].astype(np.int16)
            nxt = F[k + 1, a0 - s1:a1 - s1, 10:420].astype(np.int16)
            tc, tn = cur.std(), nxt.std()
            d = np.abs(cur - nxt).mean()
            late = tc < FLAT and tn > TEX and d > DIFF
            s0 = S[k]
            flash = False
            if not late and a0 + s0 >= r0 and a1 + s0 <= r1 and a0 - s1 >= r0:
                prv = F[k - 1, a0 + s0:a1 + s0, 10:420].astype(np.int16)
                dp, dn, dpn = np.abs(cur - prv).mean(), d, np.abs(prv - nxt).mean()
                flash = dp > DIFF and dn > DIFF and dpn < DIFF / 3
            if late or flash:
                ev.append((k, b, 'late' if late else 'flash', round(float(d), 1), round(float(tc), 1), round(float(tn), 1)))
    # group per frame
    out = []
    byk = {}
    for k, b, kind, d, tc, tn in ev:
        byk.setdefault(k, []).append((b, kind, d, tc, tn))
    for k, L in sorted(byk.items()):
        if len(L) < 2:
            continue  # a single 8-row band: text edges, countdown digits
        rows = [r0 + b * BAND for b, *_ in L]
        y = y_at(wall[k])
        near = [list(flips[i][1:]) + [round(flips[i][0] - wall[k])] for i in range(len(flips)) if abs(ft[i] - wall[k]) <= 100]
        out.append({'k': k, 'pts': round(float(pts[k]), 3), 'phase': phase(wall[k]), 'kinds': sorted({x[1] for x in L}), 'bands': len(L),
                    'rows': [min(rows), max(rows) + BAND], 'docY': [round(y + min(rows) - r0), round(y + max(rows) + BAND - r0)] if y == y else None,
                    'scrollY': y, 'shift': int(S[k]), 'shiftNext': int(S[k + 1]), 'flips': near[:12]})
    res = {'arm': load['arm'], 'rep': load['rep'], 'frames': n, 'webview': [r0, r1], 'events': out,
           'shiftMax': int(S.max()) if n else 0, 'geom': {k: load['geom'][k] for k in ('people', 'card', 'avatars', 'showcase', 'deck', 'title', 'vh')}}
    if nstrips and outdir:
        from PIL import Image
        for e in sorted(out, key=lambda e: -e['bands'])[:nstrips]:
            k = e['k']
            im = np.concatenate([F[k - 1], np.full((H, 4), 255, np.uint8), F[k], np.full((H, 4), 255, np.uint8), F[k + 1]], 1)
            fn = os.path.join(outdir, f"strip-{load['arm']}{load['rep']}-k{k}.png")
            Image.fromarray(im).save(fn)
            e['strip'] = fn
    return res


if __name__ == '__main__':
    src = sys.argv[1]
    ns = int(sys.argv[sys.argv.index('--strips') + 1]) if '--strips' in sys.argv else 0
    only = int(sys.argv[sys.argv.index('--load') + 1]) if '--load' in sys.argv else None
    rec = json.load(open(src))
    outdir = os.path.dirname(src)
    R = []
    for i, L in enumerate(rec['loads']):
        if L.get('void') or (only is not None and i != only):
            continue
        r = analyze(L, ns, outdir)
        R.append(r)
        byph = {}
        for e in r['events']:
            byph.setdefault(e['phase'], [0, 0])
            byph[e['phase']][0] += 1
            byph[e['phase']][1] += e['bands']
        print(f"PBA {r['arm']}{r['rep']} frames {r['frames']} webview {r['webview']} shiftMax {r['shiftMax']} events {len(r['events'])} by phase {json.dumps(byph)}")
    json.dump(R, open(os.path.join(outdir, 'pba.json' if only is None else f'pba-{only}.json'), 'w'), indent=1)
