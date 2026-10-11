import json, sys
sys.path.insert(0, '..')
import strips
from align import load, W
k, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
mov, m0, d = W[k]
obs = [x for x in load(k) if a <= x[0] <= b]
fr = [f for f in strips.chain(mov)['frames'] if a - 0.3 <= f[0] <= b]
rows = [(t, 'S', f'{v:6.2f}') for t, v in obs] + [(t, 'P', f'dt {dt:4.0f} y {y:7.1f}') for t, dt, y in fr]
for t, kind, s in sorted(rows):
    print(f'{t:9.4f} {kind} {s}')
