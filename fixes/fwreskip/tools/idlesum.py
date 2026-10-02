#!/usr/bin/env python3
# Median and range per arm per spot of Sim idle windows (vfix MODE I log lines "I <arm><n> <spot> w<k> ... | mut {..} | tl {..}").
# usage: idlesum.py <vres-*.log>...
import sys, re, json, statistics
from collections import defaultdict
KEYS = [('tl', 'RequestAnimationFrame'), ('tl', 'FireAnimationFrame'), ('tl', 'FunctionCall'), ('tl', 'RecalculateStyles'), ('tl', 'Layout'), ('tl', 'Paint'), ('tl', 'Composite'), ('tl', 'ObserverCallback:IntersectionObserver'), ('tl', 'ObserverCallback:MutationObserver'), ('tl', 'TimerFire'), ('mut', 'attr:style'), ('mut', 'characterData'), ('mut', 'childList'), ('mut', 'attr:class')]
d = defaultdict(lambda: defaultdict(list))
for f in sys.argv[1:]:
    for line in open(f):
        m = re.match(r'I ([A-Z])\d+ (\w+) w\d+ .*\| mut (\{.*?\}) \| tl (\{.*\})\s*$', line)
        if not m: continue
        arm, spot, mut, tl = m.group(1), m.group(2), json.loads(m.group(3)), json.loads(m.group(4))
        for src, k in KEYS:
            d[(spot, k)][arm].append((tl if src == 'tl' else mut).get(k, 0))
spots = ['y0', 'band', 'reversal', 'pin']
for spot in spots:
    print(f'\n{spot}: per second, median [min-max] (n windows)')
    for src, k in KEYS:
        row = d[(spot, k)]
        if not any(any(v) for v in row.values()): continue
        cells = []
        for arm in ('B', 'P', 'A'):
            v = row.get(arm, [])
            cells.append(f'{arm} {statistics.median(v):.1f} [{min(v):.1f}-{max(v):.1f}] n{len(v)}' if v else f'{arm} -')
        print(f'  {k:38s} ' + ' | '.join(cells))
