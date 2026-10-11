# Numbers-only alignment check: the screen recording's frame-to-frame change (YAVG of |frame - previous|, page area,
# grey 322x572) against the phone log's scroll changes mapped with the clock chain; best lag L = screen minus chain.
import json, re, sys, statistics
sys.path.insert(0, '..')
import strips
W = {k: (mov, m0, d) for k, mov, m0, d in json.load(open('windows.json'))}
def load(k):
    t, out = None, []
    for line in open(f'{k}.txt'):
        m = re.search(r'pts_time:([\d.]+)', line)
        if m: t = float(m.group(1)); continue
        m = re.search(r'YAVG=([\d.]+)', line)
        if m and t is not None: out.append((t, float(m.group(1))))
    return out
res = {}
for k in (sys.argv[1:] if __name__ == "__main__" else []):
    mov, m0, d = W[k]
    obs = load(k)
    ch = strips.chain(mov)['frames']
    fr = [f for f in ch if m0 - 0.6 < f[0] < m0 + d + 0.6]
    ev = [fr[i][0] for i in range(1, len(fr)) if abs(fr[i][2] - fr[i - 1][2]) >= 0.5]
    ys = sorted(v for _, v in obs)
    thr = max(0.3, ys[len(ys) // 5] * 3)  # "changed" = well above the quietest fifth
    o = [v > thr for _, v in obs]
    best = None
    scores = []
    for L in range(-120, 151, 2):
        p = []
        for j in range(len(obs)):
            a = obs[j - 1][0] if j else obs[j][0] - 1 / 60
            b = obs[j][0]
            p.append(any(a - L / 1000 < e <= b - L / 1000 for e in ev))
        tp = sum(x and y for x, y in zip(o, p)); tn = sum((not x) and (not y) for x, y in zip(o, p))
        fp = sum((not x) and y for x, y in zip(o, p)); fn = sum(x and (not y) for x, y in zip(o, p))
        den = ((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn)) ** 0.5 or 1
        mcc = (tp * tn - fp * fn) / den
        scores.append((mcc, L))
    scores.sort(reverse=True)
    top = scores[0]
    near = [L for s, L in scores if s >= top[0] - 0.02]
    res[k] = {'L': top[1], 'mcc': round(top[0], 3), 'Lrange': [min(near), max(near)], 'events': len(ev), 'frames': len(obs), 'thr': round(thr, 2)}
    print(k, res[k])
json.dump(res, open('align.json', 'w'), indent=1)
