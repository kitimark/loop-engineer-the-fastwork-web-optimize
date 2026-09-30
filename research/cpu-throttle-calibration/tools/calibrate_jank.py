#!/usr/bin/env python3
"""Compare the iPhone scripted-scroll jank with Chrome at each CPU throttle rate, normalised per refresh rate.

Run from research/cpu-throttle-calibration:  python3 tools/calibrate_jank.py [--json out.json]

Frame arrays are [t_ms, interval_ms, scrollY]; marks.scroll is the [start, end] of the scroll phase.
P is the display frame period (iPhone Safari rAF 60 Hz => 16.67 ms; Mac Chrome 120 Hz => 8.33 ms).
  dropped %  = missed vsyncs / (missed + frames), missed = sum(max(0, round(dt/P) - 1))
  >34/>50/>100 = absolute long frames; these are comparable across devices (perceptible hitches)
"""
import glob, json, statistics as st, sys


def scroll_window(d):
    m = d['marks']['scroll']
    return m if isinstance(m, list) else [m['start'], m['end']]


def metrics(frames, a, b, period):
    iv = [f[1] for f in frames if a <= f[0] < b]
    missed = sum(max(0, round(x / period) - 1) for x in iv)
    return {
        'dropped_pct': 100 * missed / (missed + len(iv)),
        'gt34': sum(x > 34 for x in iv), 'gt50': sum(x > 50 for x in iv), 'gt100': sum(x > 100 for x in iv),
        'max_ms': max(iv), 'scroll_s': (b - a) / 1000,
    }


def collect(pattern, period):
    runs = [metrics(d['frames'], *scroll_window(d), period) for d in (json.load(open(f)) for f in sorted(glob.glob(pattern)))]
    return {k: round(st.mean(r[k] for r in runs), 1) for k in runs[0]} | {'runs': len(runs)}


rows = {'iPhone 15 Pro Max Safari': collect('data/iphone/scroll_run[123].json', 1000 / 60)}
for vp in ('mobile', 'desktop'):
    for rate in (1, 4, 6, 20):
        rows[f'Chrome {vp} {rate}x'] = collect(f'data/chrome/scroll-{vp}-{rate}x.run[123].json', 1000 / 120)

ref = rows['iPhone 15 Pro Max Safari']
print(f"{'config':26} {'dropped%':>8} {'>34':>6} {'>50':>6} {'>100':>6} {'max':>6}  distance")
for k, r in rows.items():
    # distance on the absolute long-frame counts (log-ish scale via +1)
    dist = sum(abs((r[m] + 1) / (ref[m] + 1) - 1) for m in ('gt34', 'gt50', 'gt100', 'max_ms')) / 4
    r['distance_to_iphone'] = round(dist, 2)
    print(f"{k:26} {r['dropped_pct']:8.1f} {r['gt34']:6.1f} {r['gt50']:6.1f} {r['gt100']:6.1f} {r['max_ms']:6.0f}  {dist:.2f}")

if '--json' in sys.argv:
    json.dump(rows, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
