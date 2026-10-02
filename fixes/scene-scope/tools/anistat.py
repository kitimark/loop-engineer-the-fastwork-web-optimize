# P-056c (a) scoring of anicensus.mjs output. A loads = S0r*, S0br* (today's build, two servers); V loads = RBi40ptir*.
# Steps are aligned by index (the walk is the same in every load; y is checked). Per #platform animation key and step:
#  set:    a key present in a V load but in no A load, or present in every A load but missing from a V load -> FAIL;
#          a key present in only some A loads -> "A/A varies" (not a fail).
#  state:  the A loads agree on one playState and a V load has another -> FAIL; A loads disagree -> "A/A varies".
#  timing: running in every load: startTime from the last scene=active write; paused in every load: currentTime.
#          V inside [min A - 17, max A + 17] ms -> pass, else FAIL; A spread > period / 4 -> "uninformative".
#  outside #platform: per name:state count, V inside [min A, max A] -> pass, else FAIL.
# usage: python3 anistat.py <census-*.json>...
import sys, json, itertools
from collections import defaultdict

TOL = 17
for fn in sys.argv[1:]:
    d = json.load(open(fn))
    A = [l for l in d if l.startswith('S0')]
    V = [l for l in d if l.startswith('RBi40pti')]
    n = min(len(d[l]['steps']) for l in A + V)
    ys = {l: [(s['dir'], s['target'] if 'target' in s else s['y']) for s in d[l]['steps'][:n]] for l in A + V}
    walk_same = all(ys[l] == ys[A[0]] for l in A + V)
    geo = {l: (d[l]['geo']['top'], d[l]['geo']['bottom']) for l in A + V}
    print(f'== {fn}: A {A}, V {V}; {n} steps; same walk in every load: {walk_same}; #platform top/bottom {set(geo.values())}')
    fails = defaultdict(list); varies = defaultdict(int); keys_seen = set(); uninf = {}; checked = defaultdict(int)
    timing = {}  # key -> (A values, V values, dur, kind) at the first step where it qualifies
    for i in range(n):
        dirn, y = ys[A[0]][i]
        per = {l: {p['k']: p for p in d[l]['steps'][i]['plat']} for l in A + V}
        allk = set().union(*[set(m) for m in per.values()])
        keys_seen |= allk
        for k in allk:
            inA = [k in per[l] for l in A]; inV = [k in per[l] for l in V]
            if any(inV) and not any(inA):
                fails['set'].append((k, y, dirn, 'V only')); continue
            if all(inA) and not all(inV):
                fails['set'].append((k, y, dirn, 'missing in V')); continue
            if not all(inA):
                varies['set'] += 1; continue
            if not all(inV): continue
            sA = {per[l][k]['ps'] for l in A}; sV = {per[l][k]['ps'] for l in V}
            checked['state'] += 1
            if len(sA) > 1:
                varies['state'] += 1; continue
            if sV != sA:
                fails['state'].append((k, y, dirn, f'A {sorted(sA)} V {sorted(sV)}')); continue
            ps = next(iter(sA))
            fld = 'st' if ps == 'running' else 'ct' if ps == 'paused' else None
            if not fld: continue
            va = [per[l][k][fld] for l in A]; vv = [per[l][k][fld] for l in V]
            if None in va or None in vv: continue
            dur = per[A[0]][k]['dur']
            checked['timing'] += 1
            spread = max(va) - min(va)
            if dur and dur != float('inf') and spread > dur / 4:
                uninf[k] = (spread, dur); continue
            if not all(min(va) - TOL <= v <= max(va) + TOL for v in vv):
                fails['timing'].append((k, y, dirn, f'{fld} A {[round(x) for x in va]} V {[round(x) for x in vv]}'))
            if (k, fld) not in timing: timing[(k, fld)] = (fld, va, vv, dur)
        # outside #platform
        oa = [d[l]['steps'][i]['outside'] for l in A]; ov = [d[l]['steps'][i]['outside'] for l in V]
        for nk in set().union(*[set(o) for o in oa + ov]):
            ca = [o.get(nk, 0) for o in oa]; cv = [o.get(nk, 0) for o in ov]
            checked['outside'] += 1
            if not all(min(ca) <= c <= max(ca) for c in cv):
                fails['outside'].append((nk, y, dirn, f'A {ca} V {cv}'))
    print(f'  keys seen {len(keys_seen)}; checked: {dict(checked)}; A/A varies: {dict(varies)}; uninformative keys {len(uninf)}')
    for kind in ('set', 'state', 'timing', 'outside'):
        fl = fails[kind]
        print(f'  {kind}: {len(fl)} fail(s)')
        seen = set()
        for k, y, dirn, det in fl:
            if (k, det) in seen: continue
            seen.add((k, det)); print(f'    {k} @ {dirn} y{y}: {det}')
    for k, (sp, dur) in sorted(uninf.items()):
        print(f'  uninformative: {k}: A spread {round(sp)} ms > period/4 ({dur})')
    print('  row titles (first qualifying step):')
    for (k, _f), (fld, va, vv, dur) in sorted(timing.items()):
        if 'row-title' in k:
            print(f'    {k.split("|")[1].split(">")[-1][:60]}: {fld} A {[round(x) for x in va]} V {[round(x) for x in vv]}')
    ev = {l: [e for e in d[l]['ev'] if e[1] == 'scene'] for l in A + V}
    print('  scene writes per load:', {l: len(e) for l, e in ev.items()})
