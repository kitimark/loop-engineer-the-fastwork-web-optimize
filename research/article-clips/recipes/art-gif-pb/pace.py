#!/usr/bin/env python3
# Frame pacing in a movie window from ioscap's frames.json (PTS s; movie t = pts - first pts).
# usage: pace.py <frames.json> <t0> <t1>
import sys, json
fr = json.load(open(sys.argv[1]))['frames']
t0, t1 = float(sys.argv[2]), float(sys.argv[3])
p0 = fr[0][0]
ts = [f[0] - p0 for f in fr if t0 <= f[0] - p0 <= t1]
g = [round((b - a) * 1000, 1) for a, b in zip(ts, ts[1:])]
print(sys.argv[1].split('/')[-1], 'frames', len(ts), 'gaps != 16.7:', [(i, x) for i, x in enumerate(g) if abs(x - 16.67) > 2])
