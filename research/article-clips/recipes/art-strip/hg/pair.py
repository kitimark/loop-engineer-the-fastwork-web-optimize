import sys, json, bisect
sys.path.insert(0, '..')
import strips
R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/'
runs = ['20261010T110844Z-ar-herocatch-orig', '20261010T111421Z-ar-herocatch-orig', '20261010T111040Z-ar-herocatch-g0m', '20261010T111222Z-ar-herocatch-g0m']
info = {}
for r in runs:
    ch = strips.chain(R + r + '.mov')
    fin = [t for t, n in ch['marks'] if n == 'finger'][0]
    fr = [f for f in ch['frames'] if f[0] >= fin - 0.5]
    start = next(fr[i][0] for i in range(1, len(fr)) if abs(fr[i][2] - fr[i - 1][2]) >= 0.5)
    ts = strips.movie_times(R + r + '.mov')
    win = [t for t in ts if start - 0.5 <= t <= start + 11]
    gaps = [round((b - a) * 1000) for a, b in zip(win, win[1:]) if b - a > 0.026]
    info[r] = (ch, fin, start, gaps)
    print(r, 'finger', round(fin, 3), 'first move', round(start, 3), '+', round(start - fin, 3), 'rec gaps>26ms', gaps)
    # y path: stops
    ys = [(round(f[0] - start, 2), round(f[2])) for f in ch['frames'] if start <= f[0] <= start + 11]
    # print y every 0.5 s
    print('  y@0.5s', [ys[min(bisect.bisect_left([a for a, _ in ys], k / 2), len(ys) - 1)][1] for k in range(0, 22)])
def ypath(r):
    ch, fin, start, _ = info[r]
    fr = [f for f in ch['frames'] if start - 0.1 <= f[0] <= start + 10.5]
    T = [f[0] - start for f in fr]; Y = [f[2] for f in fr]
    return lambda t: Y[max(0, bisect.bisect_right(T, t) - 1)]
for a in runs[:2]:
    for b in runs[2:]:
        pa, pb = ypath(a), ypath(b)
        d = [abs(pa(k / 60) - pb(k / 60)) for k in range(0, 600)]
        print(a[:16], b[:16], 'median |dy|', sorted(d)[300], 'p90', sorted(d)[540], 'max', round(max(d)))
print('onsets (s after first move), with y at onset')
for r in runs:
    ch, fin, start, _ = info[r]
    f = [x for x in ch['frames'] if start - 0.05 <= x[0] <= start + 14]
    ons, still = [], 1
    for i in range(1, len(f)):
        dy = abs(f[i][2] - f[i - 1][2])
        if dy >= 0.5:
            if still >= 0.15: ons.append((round(f[i][0] - start, 2), round(f[i - 1][2])))
            still = 0
        else: still += f[i][0] - f[i - 1][0]
    print(r[:16], r[-4:], ons)
    seg = json.load(open('.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs/' + r + '.json'))['run']
    print('   strokes', [(s.get('id'), s.get('kin', {}).get('dir'), s.get('kin', {}).get('px'), s.get('kin', {}).get('ms')) for s in seg['strokes']][:14])
