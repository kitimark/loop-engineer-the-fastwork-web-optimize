#!/usr/bin/env python3
# audit-article-data: read-only recount of the article's phone numbers from the frame logs (no pictures).
# Uses art-strip/strips.py's clock chain (page t -> movie s) and a port of art-d5/bands.mjs.
import json, os, sys, statistics
sys.path.insert(0, '$SCRATCH/art-strip')
import strips

RUNS = strips.WC + 'out/wc/runs/'
SCR = strips.WC + 'out/iphone-screen/'
BINS = [(0, 20, '0-20'), (20, 34, '20-34'), (34, 50, '34-50'), (50, 100, '50-100'), (100, 200, '100-200'), (200, 1e9, '>200')]
OUT = {}

def load(run):
    j = json.load(open(RUNS + run + '.json'))
    segs = (j.get('run') or {}).get('segments')
    if segs:
        seg = next((s for s in segs if s.get('marks')), segs[0])
    else:
        seg = {'frames': j['frames'], 'marks': [], 'touches': j.get('touches', [])}
    return j, seg

def mark(seg, n):
    return next((m[0] for m in seg.get('marks') or [] if m[1] == n), None)

def bands(seg):
    """port of art-d5/bands.mjs: class per frame index"""
    Y_IN, Y_OUT, Y_FLIP, Y_HERO = 242, 970, 600, 855
    inView, enterT, expandedAt, closeAt = False, None, None, None
    prevY = seg['frames'][0][2]; lastMove = -1e9
    out = []
    for fr in seg['frames']:
        t, dt, y = fr[0], fr[1], fr[2]
        iv = Y_IN <= y <= Y_OUT
        if iv and not inView:
            enterT = t; expandedAt = None
        if (not iv) and inView:
            if expandedAt is not None or (enterT is not None and t - enterT >= 1300):
                closeAt = t
            enterT = None; expandedAt = None
        inView = iv
        if inView and enterT is not None and expandedAt is None and t - enterT >= 1420:
            expandedAt = enterT + 1420
        if y != prevY:
            lastMove = t
        if expandedAt is not None and expandedAt < t <= expandedAt + 920: c = 'o'
        elif closeAt is not None and closeAt < t <= closeAt + 920: c = 'o'
        elif 0 < y < Y_FLIP and t - lastMove < 1000: c = 'heroOnly'
        elif Y_FLIP <= y < Y_HERO: c = 'overlap'
        else: c = 'rest'
        prevY = y
        out.append(c)
    return out

def cnt(dts):
    return {'n': len(dts), 'gt34': sum(d > 34 for d in dts), 'gt50': sum(d > 50 for d in dts), 'max': max(dts) if dts else None,
            'ms': round(sum(dts)), 'bins': [sum(lo < d <= hi for d in dts) for lo, hi, _ in BINS]}

def fmt(c):
    return f"n {c['n']:5d} >34 {c['gt34']:4d} >50 {c['gt50']:4d} max {c['max']}  bins {'/'.join(map(str, c['bins']))}"

def page_window(seg, a, b):
    return [i for i, f in enumerate(seg['frames']) if a < f[0] <= b]

def movie_window(run, M0, D):
    """indices of seg frames whose movie end time is in (M0, M0+D] (as strips.side_stats)"""
    ch = strips.chain(SCR + run + '.mov')
    j, seg = load(run)
    # one segment in these runs: chain frames sorted == seg frames order; check
    assert len(ch['frames']) == len(seg['frames']), (run, len(ch['frames']), len(seg['frames']))
    order = sorted(range(len(seg['frames'])), key=lambda i: seg['frames'][i][0])
    return [i for k, i in enumerate(order) if M0 < ch['frames'][k][0] <= M0 + D]

def split(seg, idx, cls):
    r = {}
    for c in ['heroOnly', 'overlap', 'o', 'rest']:
        r[c] = cnt([seg['frames'][i][1] for i in idx if cls[i] == c])
    r['all'] = cnt([seg['frames'][i][1] for i in idx])
    return r

def p(*a):
    print(*a)

# ---- 1. herocatch / herouser / herofinger: whole wc-read window, band split
p('== A. user-swipe runs, wc-read windows (finger -> end; herouser first touch -> last + 3 s), band split')
HC = {'orig': ['20261010T110844Z-ar-herocatch-orig', '20261010T111421Z-ar-herocatch-orig'],
      'g0m': ['20261010T111040Z-ar-herocatch-g0m', '20261010T111222Z-ar-herocatch-g0m']}
HU = {'orig': ['20261010T104514Z-ar-herouser-orig'], 'g0m': ['20261010T104634Z-ar-herouser-g0m']}
HF = {'orig': ['20261010T105127Z-ar-herofinger-orig', '20261010T105719Z-ar-herofinger-orig'],
      'g0m': ['20261010T105336Z-ar-herofinger-g0m', '20261010T105519Z-ar-herofinger-g0m']}
pooled = {}
for name, group in (('herocatch', HC), ('herouser', HU), ('herofinger', HF)):
    for arm, runs in group.items():
        acc = {}
        for run in runs:
            j, seg = load(run)
            cls = bands(seg)
            if name == 'herouser':
                ts = [t[0] for t in seg['touches']]
                a, b = min(ts) - 0.001, max(ts) + 3000
            else:
                a, b = mark(seg, 'finger'), mark(seg, 'end') or seg['frames'][-1][0]
            idx = page_window(seg, a, b)
            sp = split(seg, idx, cls)
            prof = (j.get('meta') or {}).get('profile') or {}
            th = f"{(prof.get('start') or {}).get('state')} {(prof.get('start') or {}).get('battC')} -> {(prof.get('end') or {}).get('state')} {(prof.get('end') or {}).get('battC')}"
            p(f'{run}  window {(b - a) / 1000:.1f} s  thermal {th}')
            for c, v in sp.items():
                p(f'   {c:9s} {fmt(v)}  ({v["ms"] / 1000:.1f} s)')
                acc.setdefault(c, []).extend([seg['frames'][i][1] for i in idx if c == 'all' or cls[i] == c])
            OUT.setdefault(name, {})[run] = sp
        if len(runs) > 1:
            p(f'  POOLED {name} {arm}:')
            for c, d in acc.items():
                v = cnt(d); p(f'   {c:9s} {fmt(v)}  ({v["ms"] / 1000:.1f} s)')
                OUT.setdefault('pooled', {}).setdefault(name, {}).setdefault(arm, {})[c] = v

# ---- 2. clip windows (movie time) with band split
p('\n== B. clip windows (movie s, strips.py stats), band split')
CLIPS = [
    ('clip1 hero-gesture-long', '20261010T110844Z-ar-herocatch-orig', 40.81833, 11.5),
    ('clip1 hero-gesture-long', '20261010T111222Z-ar-herocatch-g0m', 23.56333, 11.5),
    ('hero-cards-return (v63 Day 5)', '20261010T110844Z-ar-herocatch-orig', 45.55167, 4.4),
    ('hero-cards-return (v63 Day 5)', '20261010T111222Z-ar-herocatch-g0m', 28.115, 4.4),
    ('clip2 stop-1x', '20261010T110844Z-ar-herocatch-orig', 42.11833, 2.2),
    ('clip2 stop-1x', '20261010T111222Z-ar-herocatch-g0m', 24.86333, 2.2),
    ('Day8 stop-2x', '20261010T110844Z-ar-herocatch-orig', 42.61833, 1.6),
    ('Day8 stop-2x', '20261010T111222Z-ar-herocatch-g0m', 25.36333, 1.6),
    ('Day8 stop-full', '20261010T110844Z-ar-herocatch-orig', 41.01833, 4.0),
    ('Day8 stop-full', '20261010T111222Z-ar-herocatch-g0m', 23.76333, 4.0),
    ('old day5-hero (v62)', '20261009T132512Z-wc-hero-orig', 50.41167, 7.2),
    ('old day5-hero (v62)', '20261009T132633Z-wc-hero-g0l', 95.57167, 7.2),
    ('middle clip', '20261009T135711Z-wc-middle-orig', 84.26833, 2.2),
    ('middle clip', '20261009T135904Z-wc-middle-g0l', 16.37, 2.2),
]
for lab, run, M0, D in CLIPS:
    j, seg = load(run)
    cls = bands(seg)
    idx = movie_window(run, M0, D)
    sp = split(seg, idx, cls)
    long_ = sorted([seg['frames'][i][1] for i in idx if seg['frames'][i][1] > 80], reverse=True)
    p(f'{lab:32s} {run[:16]} {run.split("-")[-1]:4s} {fmt(sp["all"])}  >80ms {long_}')
    p('      ' + '  '.join(f'{c} {sp[c]["gt34"]}/{sp[c]["gt50"]} (n {sp[c]["n"]})' for c in ['heroOnly', 'overlap', 'o', 'rest']))
    OUT.setdefault('clips', {})[f'{lab}|{run}'] = sp

# ---- 3. slow approach (Fig 13/14) recount
p('\n== C. Fig 13/14 slow approach (approach -> approach-end)')
SA = {'orig': ['20261009T135711Z-wc-middle-orig', '20261009T140304Z-wc-middle-orig'],
      'g0l': ['20261009T135904Z-wc-middle-g0l', '20261009T135954Z-wc-middle-g0l']}
for arm, runs in SA.items():
    d_all = []; dur = 0
    for run in runs:
        j, seg = load(run)
        a, b = mark(seg, 'approach'), mark(seg, 'approach-end')
        fr = [f for f in seg['frames'] if a < f[0] <= b]
        d = [f[1] for f in fr]; d_all += d; dur += (b - a)
        ys = [f[2] for f in fr]
        p(f'{run}  {(b - a) / 1000:.2f} s  fps {len(d) / ((b - a) / 1000):.1f}  y {min(ys)}-{max(ys)}  {fmt(cnt(d))}')
    v = cnt(d_all)
    p(f'  POOLED {arm}: {fmt(v)}  fps {v["n"] / (dur / 1000):.1f}  shares ' + ' '.join(f'{b / v["n"] * 100:.2f}%' for b in v['bins']))

# ---- 4. 'o' windows: mean frame time per stop (Day 8 claim 0.9 s at 26-37 ms mean)
p('\n== D. per-stop "o" windows (bands.mjs o class, contiguous runs), mean dt')
for run in HU['orig'] + HU['g0m'] + HC['orig'] + HC['g0m']:
    j, seg = load(run)
    cls = bands(seg)
    if 'herouser' in run:
        ts = [t[0] for t in seg['touches']]; a, b = min(ts) - 0.001, max(ts) + 3000
    else:
        a, b = mark(seg, 'finger'), mark(seg, 'end')
    groups, cur = [], []
    for i, f in enumerate(seg['frames']):
        if cls[i] == 'o' and a < f[0] <= b:
            cur.append(i)
        elif cur:
            groups.append(cur); cur = []
    if cur: groups.append(cur)
    desc = []
    for g in groups:
        fr = [seg['frames'][i] for i in g]
        span = fr[-1][0] - fr[0][0] + fr[0][1]
        mean = statistics.mean(f[1] for f in fr)
        kind = 'open' if fr[0][2] >= 242 and fr[0][2] <= 970 else 'close'
        desc.append(f'{kind}@y{round(fr[0][2])} {len(fr)}fr {span / 1000:.2f}s mean {mean:.1f}')
    p(f'{run}: ' + ' | '.join(desc))

# ---- 5. Fig 3 'worst' array
worst = [24,40,7,5,17,8,17,16,17,17,16,17,17,16,17,17,16,17,16,17,17,16,17,17,17,17,17,16,17,16,17,43,9,43,6,42,6,2,44,22,6,36,20,2,2,45,41,5,44,3,32,41,9,153,120,43,33,74,17,58,32,24,56,65,69,128,99,84,64,79,25,9,15,16,17,16,17,17,16,17,17,16,17,17,16,17,17,16,17,17,16,17,17,16,17,71,12,17,22,49,7,7,15,17,21,36,8,7,11,17,16,23,86,92,59,130,30,44,9,11,17,16,29,44,9,10,10,15]
p(f'\n== E. Fig 3 worst array: {len(worst)} frames, {sum(worst)} ms, >34 {sum(x > 34 for x in worst)}, >50 {sum(x > 50 for x in worst)}')
j, seg = load('20261009T134136Z-wc-hero-orig')
dts = [round(f[1]) for f in seg['frames']]
for k in range(len(dts) - len(worst) + 1):
    if dts[k:k + len(worst)] == worst:
        fr = seg['frames'][k:k + len(worst)]
        p(f'   found in 134136Z frames at t {fr[0][0]:.0f}-{fr[-1][0]:.0f}, y {fr[0][2]}-{fr[-1][2]}')
        break
else:
    p('   NOT found verbatim in 134136Z')

json.dump(OUT, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audit.json'), 'w'), indent=1)
