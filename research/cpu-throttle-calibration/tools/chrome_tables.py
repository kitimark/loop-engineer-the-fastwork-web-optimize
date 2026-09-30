#!/usr/bin/env python3
"""chrome_tables.py — print markdown tables from data/chrome/*.summary.json and bench-curve.json.
Usage: python3 tools/chrome_tables.py [data/chrome]"""
import json, sys, glob, os, collections

D = sys.argv[1] if len(sys.argv) > 1 else 'data/chrome'


def ms(a, k, nd=1):
    v = a[k]
    return f"{v['mean']:.{nd}f} ± {v['sd']:.{nd}f}"


rows = []
for f in sorted(glob.glob(os.path.join(D, 'scroll-*.summary.json'))):
    s = json.load(open(f))
    m = s['meta']; rows.append((m['viewport'], m['rate'], s))
rows.sort(key=lambda r: (r[0], r[1]))

for phase in ['scroll', 'idle', 'bottom']:
    print(f"\n### Phase: {phase} (mean ± sd over runs)\n")
    print('| viewport | rate | runs | fps | median ms | p95 ms | p99 ms | max ms | >20 | >34 | >50 | >100 | smooth % | jank ms | LoAF n | LoAF ms | LoAF blocking ms |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for vp, rate, s in rows:
        a = s['aggregate'][phase]
        print(f"| {vp} | {rate}x | {len(s['runs'])} | {ms(a,'fps')} | {ms(a,'median_ms')} | {ms(a,'p95_ms')} | {ms(a,'p99_ms')} | {ms(a,'max_ms',0)} | "
              f"{ms(a,'gt20',0)} | {ms(a,'gt34',0)} | {ms(a,'gt50',0)} | {ms(a,'gt100',0)} | {ms(a,'smooth_pct')} | {ms(a,'jank_ms',0)} | "
              f"{ms(a,'loaf_count',0)} | {ms(a,'loaf_total_ms',0)} | {ms(a,'loaf_blocking_ms',0)} |")

print('\n### Scroll phase meta (per run)\n')
print('| viewport | rate | load ms (per run) | scroll duration ms | steps | capped | finalY/maxY |')
print('|---|---|---|---|---|---|---|')
for vp, rate, s in rows:
    rs = s['runs']
    print(f"| {vp} | {rate}x | {', '.join(str(r['meta']['loadMs']) for r in rs)} | {', '.join(str(r['phases']['scroll']['duration_ms']) for r in rs)} | "
          f"{', '.join(str(r['scroll']['steps']) for r in rs)} | {', '.join('Y' if r['scroll']['capped'] else 'n' for r in rs)} | "
          f"{', '.join(str(r['scroll']['finalY']) + '/' + str(r['scroll']['maxY']) for r in rs)} |")

print('\n### Per-section jank during scroll (sum over runs)\n')
for vp, rate, s in rows:
    agg = collections.OrderedDict()
    for r in s['runs']:
        for sec in r['sections']:
            a = agg.setdefault(sec['section'], collections.Counter())
            for k in ('frames', 'gt34', 'gt50', 'gt100', 'jank_ms', 'loaf', 'loaf_ms'): a[k] += sec[k]
            a['max_ms'] = max(a['max_ms'], sec['max_ms'])
    print(f"\n{vp} {rate}x: " + '; '.join(f"{k[:32]}: >50={v['gt50']} >100={v['gt100']} max={v['max_ms']:.0f} jank={v['jank_ms']}ms loaf={v['loaf']}/{v['loaf_ms']}ms" for k, v in agg.items()))

print('\n### Top LoAF script attributions (all phases, summed over runs)\n')
for vp, rate, s in rows:
    agg = {}
    for r in s['runs']:
        for t in r['topScriptsAll']:
            k = (t['src'], t['fn'], t['pos'], t['type'])
            a = agg.setdefault(k, {'count': 0, 'dur': 0, 'forced': 0, 'max': 0, 'inv': t['inv']})
            a['count'] += t['count']; a['dur'] += t['dur_ms']; a['forced'] += t['forced_ms']; a['max'] = max(a['max'], t['max_ms'])
    top = sorted(agg.items(), key=lambda kv: -kv[1]['dur'])[:6]
    print(f"\n{vp} {rate}x:")
    for (src, fn, pos, typ), a in top:
        print(f"  - `{src or '(inline)'}` fn=`{fn}` pos={pos} {typ} inv=`{a['inv'][:40]}`: n={a['count']} total={a['dur']}ms max={a['max']}ms forced={a['forced']}ms")

bc = os.path.join(D, 'bench-curve.json')
if os.path.exists(bc):
    b = json.load(open(bc))
    keys = [k for k in b['curve'][0] if k not in ('rate',)]
    print('\n### cpu_bench.js curve (median-of-5 per run; mean ± sd over runs)\n')
    print('| rate | ' + ' | '.join(keys) + ' | total / total@1x |')
    print('|---|' + '---|' * (len(keys) + 1))
    base = b['curve'][0]['total_ms']['mean']
    for c in b['curve']:
        print(f"| {c['rate']}x | " + ' | '.join(f"{c[k]['mean']:.1f} ± {c[k]['sd']:.1f}" for k in keys) + f" | {c['total_ms']['mean']/base:.2f} |")
