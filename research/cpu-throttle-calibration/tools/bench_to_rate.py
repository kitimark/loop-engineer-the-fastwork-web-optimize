#!/usr/bin/env python3
"""bench_to_rate.py — map a device's cpu_bench.js result (and optionally lh_benchmark_index.js result)
onto the equivalent Chrome CPU-throttling rate on the calibration Mac, by log-log interpolation of
data/chrome/bench-curve.json (and data/chrome/devtools-calibration.json for BenchmarkIndex).

Usage:
  python3 tools/bench_to_rate.py DEVICE_BENCH.json [--lhbi SCORE] [--curve data/chrome/bench-curve.json]
DEVICE_BENCH.json may be the raw cpu_bench.js output, a list of them (medians are averaged), or any JSON
object containing a "results" dict shaped like cpu_bench.js output.
Rates below 1 mean the device is faster than the unthrottled Mac on that sub-benchmark (extrapolated).
"""
import json, math, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument('device')
ap.add_argument('--curve', default='data/chrome/bench-curve.json')
ap.add_argument('--calib', default='data/chrome/devtools-calibration.json')
ap.add_argument('--key', help='top-level key holding the cpu_bench result(s), e.g. quiet')
ap.add_argument('--lhbi', type=float, help='device Lighthouse BenchmarkIndex median (higher = faster)')
a = ap.parse_args()


def interp_rate(points, y):
    """points: [(rate, value)] with value increasing in rate; log-log piecewise linear, extrapolate at ends."""
    pts = sorted(points)
    lx = [(math.log(r), math.log(v)) for r, v in pts]
    ly = math.log(y)
    for (x0, y0), (x1, y1) in zip(lx, lx[1:]):
        if ly <= y1 or (x1, y1) == lx[-1]:
            if ly < lx[0][1]: (x0, y0), (x1, y1) = lx[0], lx[1]
            return math.exp(x0 + (ly - y0) * (x1 - x0) / (y1 - y0))
    return float('nan')


def load_device(p):
    d = json.load(open(p))
    if isinstance(d, dict) and a.key: d = d[a.key]          # e.g. --key quiet for data/iphone/bench.json
    items = d if isinstance(d, list) else [d]
    items = [i.get('bench', i) if isinstance(i, dict) else i for i in items]
    items = [i for i in items if isinstance(i, dict) and 'results' in i]
    keys = items[0]['results'].keys()
    return {k: sum(i['results'][k]['median_ms'] for i in items) / len(items) for k in keys} | \
           {'total_ms': sum(i['total_ms'] for i in items) / len(items), 'geomean_ms': sum(i['geomean_ms'] for i in items) / len(items)}


curve = json.load(open(a.curve))['curve']
dev = load_device(a.device)
print('| metric | device ms | Mac 1x ms | device / Mac1x | equivalent Chrome rate |')
print('|---|---|---|---|---|')
for k, v in dev.items():
    pts = [(c['rate'], c[k]['mean']) for c in curve if k in c]
    if not pts: continue
    base = dict(pts)[1]
    print(f'| {k} | {v:.1f} | {base:.1f} | {v / base:.2f} | {interp_rate(pts, v):.2f}x |')

if a.lhbi:
    cal = json.load(open(a.calib))
    by = {}
    for run in cal['runs']:
        for c in run['curve']: by.setdefault(c['rate'], []).append(c['median'])
    # score is inversely proportional to time -> use 1/score as the "time" axis
    pts = [(r, 1 / (sum(v) / len(v))) for r, v in by.items()]
    print(f"\nLighthouse BenchmarkIndex {a.lhbi:.0f} -> equivalent Chrome rate {interp_rate(pts, 1 / a.lhbi):.2f}x "
          f"(DevTools calibration on this Mac: low-tier {[r['low'] for r in cal['runs']]}, mid-tier {[r['mid'] for r in cal['runs']]})")
