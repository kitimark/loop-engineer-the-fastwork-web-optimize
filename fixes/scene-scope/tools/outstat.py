# P-056c (a) follow-up: per-animation timing OUTSIDE #platform (anicensus 'outx', added after the first census).
# Per key (name|tag.class) at its first appearance per load: startTime relative to the first walk step's read
# (document timeline), and the step index where it first appears; plus the step where it is first 'finished'.
# A loads = S0*, V loads = RBi40pti*. Flags a key whose V start is outside the A envelope +-17 ms.
# usage: python3 outstat.py <census-*.json>
import sys, json
from collections import defaultdict

TOL = 17
for fn in sys.argv[1:]:
    d = json.load(open(fn))
    loads = [l for l in d if not l.startswith('W')]
    print(f'== {fn}: {loads}')
    for l in loads:
        print(f'  {l}: t0 {d[l]["steps"][0]["t"]} (ms since navigation), slow load' if d[l]['steps'][0]['t'] > 6000 else f'  {l}: t0 {d[l]["steps"][0]["t"]}')
    first = defaultdict(dict)  # key -> load -> (step, st_rel, dur?)
    fin = defaultdict(dict)
    for l in loads:
        st = d[l]['steps']; t0 = st[0]['t']
        for i, s in enumerate(st):
            seen = defaultdict(int)
            for a in s.get('outx', []):
                k = a['k']; seen[k] += 1; kk = f'{k}#{seen[k]}'
                if kk not in first or l not in first[kk]:
                    first[kk][l] = (i, None if a['st'] is None else round(a['st'] - t0))
                if a['ps'] == 'finished' and l not in fin[kk]:
                    fin[kk][l] = i
    nflag = 0
    for kk in sorted(first):
        A = {l: v for l, v in first[kk].items() if l.startswith('S0')}
        V = {l: v for l, v in first[kk].items() if l.startswith('RBi40pti')}
        sa = [v[1] for v in A.values() if v[1] is not None]; sv = [v[1] for v in V.values() if v[1] is not None]
        if not sa or not sv: continue
        flag = any(not (min(sa) - TOL <= x <= max(sa) + TOL) for x in sv)
        # only print keys that first appear during the walk (start > 0) or that are flagged
        if flag or (min(sa + sv) > 0):
            nflag += flag
            print(f'  {"FLAG " if flag else "     "}{kk}: start A {sorted(sa)} V {sorted(sv)}; first step A {sorted({v[0] for v in A.values()})} V {sorted({v[0] for v in V.values()})}'
                  + (f'; finished seen at step A {dict((l[-2:], i) for l, i in fin[kk].items() if l.startswith("S0"))} V {dict((l[-2:], i) for l, i in fin[kk].items() if l.startswith("RB"))}' if fin[kk] else ''))
    print(f'  flagged keys: {nflag}')
