#!/usr/bin/env python3
# Score Chrome jump frames (cfix MODE V). The screencast can deliver a frame painted before the jump after the jump
# started, and out of order, so frames are aligned by their paint stamp (V.json frameStamps, page clock): per run, the
# saved frames f1-f4 painted after the jump's scroll event, sorted by stamp, are post-jump frames 1..n. Then B vs P and
# B vs A, frame k against frame k of the same tag (start + rep): differing pixels, max channel delta, bbox (device px).
# usage: vscore.py <dir> [<dir2> ...]
import sys, os, json
from collections import defaultdict
from PIL import Image, ImageChops
def cmp(fa, fb):
    a, b = Image.open(fa).convert('RGBA'), Image.open(fb).convert('RGBA')
    if a.size != b.size: return ('size',)
    bands = ImageChops.difference(a, b).split()
    m = ImageChops.lighter(ImageChops.lighter(bands[0], bands[1]), ImageChops.lighter(bands[2], bands[3]))
    hist = m.histogram(); n = sum(hist[1:])
    mx = max((i for i, c in enumerate(hist) if c), default=0)
    return (n, mx, m.getbbox())
def post(d, arm, tag, run):
    t0 = run['sc'][0][0] if run.get('sc') else run['tj']
    fr = [(s, os.path.join(d, f'V-{arm}-{tag}-f{i + 1}.png')) for i, s in enumerate(run['frameStamps']) if s > t0]
    fr.sort()
    return [f for _, f in fr], [s for s, _ in fr]
def main():
    summ = defaultdict(lambda: defaultdict(list))
    for d in sys.argv[1:]:
        V = json.load(open(os.path.join(d, 'V.json')))['arms']
        for tag, rb in V.get('B', {}).items():
            fb, sb = post(d, 'B', tag, rb)
            line = [f'{os.path.basename(d)} {tag:14s} B post {len(fb)}']
            for arm in ('P', 'A'):
                if tag not in V.get(arm, {}): continue
                fo, so = post(d, arm, tag, V[arm][tag])
                line.append(f'{arm} post {len(fo)}')
                for k in range(min(len(fb), len(fo), 3)):
                    r = cmp(fb[k], fo[k]); summ[arm][k + 1].append(r[0])
                    line.append(f'  {arm}{k + 1} {r}')
                r = cmp(os.path.join(d, f'V-B-{tag}-final.png'), os.path.join(d, f'V-{arm}-{tag}-final.png')); summ[arm]['final'].append(r[0])
                line.append(f'  {arm}final {r}')
            print(' |'.join(line))
    for arm in ('P', 'A'):
        for k in summ[arm]:
            v = summ[arm][k]
            print(f'summary B vs {arm} frame {k}: n={len(v)} identical {sum(1 for x in v if x == 0)} | differing px {sorted(x for x in v if x)}')
if __name__ == '__main__':
    main()
