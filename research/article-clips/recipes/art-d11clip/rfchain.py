# art-d11clip: clock chain for the Day 11 -ar-revealflick runs (records in out/rf/runs/, no stamps.jsonl rows of their own).
# Same chain as art-strip/strips.py (perf -> wall via the driver's sync pairs -> host uptime -> recorder PTS), except the
# uptime-minus-wall offset: the rf runs (04:27-04:30Z) wrote no stamps, so it is a linear fit of out/wc/runs/stamps.jsonl
# rows from 04:31-04:43Z (slope ~0.46 ms/min), extrapolated 1-4 min back to each run's sync time.
import json, os, sys, datetime
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art-strip'))
import strips
WC = strips.WC
def _fit():
    rows = []
    a = datetime.datetime(2026, 10, 11, 4, 31, tzinfo=datetime.timezone.utc).timestamp() * 1000
    b = datetime.datetime(2026, 10, 11, 4, 43, tzinfo=datetime.timezone.utc).timestamp() * 1000
    for l in open(WC + 'out/wc/runs/stamps.jsonl'):
        if not l.strip(): continue
        s = json.loads(l); w = s['wallNs'] / 1e6
        if a <= w <= b: rows.append((w, (s['upRawNs'] - s['wallNs']) / 1e6))
    n = len(rows); mx = sum(r[0] for r in rows) / n; my = sum(r[1] for r in rows) / n
    k = sum((x - mx) * (y - my) for x, y in rows) / sum((x - mx) ** 2 for x, _ in rows)
    res = max(abs(y - (my + k * (x - mx))) for x, y in rows)
    return (lambda w: my + k * (w - mx)), k * 60000, res, n
FIT, SLOPE, RES, NFIT = _fit()
def rec(mov):
    base = os.path.basename(mov)[:-4]
    return json.load(open(WC + f'out/rf/runs/{base}.json'))
def chain(mov):
    if '-revealflick-' not in mov: return _orig_chain(mov)
    r = rec(mov); fr = strips.frames_json(mov); pts0 = fr[0][0]
    s = r['run']['segments'][0]
    off, half = strips._sync_off(s['sync'])
    wall_at = s['sync'][0][0]
    umw = FIT(wall_at)
    m = lambda t: (t + off + umw) / 1000 - pts0
    frames = sorted((m(t), dt, y) for t, dt, y, *_ in s['frames'])
    marks = [(m(t), nm) for t, nm in s['marks']]
    ts = r['summary']['segments'][0]['perStroke'][0]['touchStart']
    v = r['run']['inject'][0]['value']; v = json.loads(v) if isinstance(v, str) else v
    flip = next(t for t, nm, at, d in v['m'] if t >= dict((n, t) for t, n in s['marks'])['flick'] - 50 and 'section#people' in nm and at == 'class' and '+is-visible' in d)
    k = next(i for i, f in enumerate(s['frames']) if f[0] > flip)
    rv = s['frames'][k]
    return {'frames': frames, 'halfRttMs': [min(half), max(half)], 'how': f'rf: perf->wall (driver sync) -> uptime (linear fit of {NFIT} stamps 04:31-04:43Z, slope {SLOPE:.2f} ms/min, max residual {RES:.2f} ms, extrapolated) -> PTS',
            'marks': marks, 'touchMov': m(ts), 'flipMov': m(flip), 'reveal': {'movEnd': m(rv[0]), 'dt': rv[1], 'y': rv[2]}, 'perf2mov': (off + umw) / 1000 - pts0, 'sframes': s['frames']}
_orig_chain = strips.chain
strips.chain = chain
