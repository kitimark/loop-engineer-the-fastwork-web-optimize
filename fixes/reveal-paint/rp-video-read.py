#!/usr/bin/env python3
# reveal-paint decisive check (2): from rp-frames.mjs (pb.json) and pb-analyze.py's pba.json, per load and LAND phase:
# the #people is-visible flip (wall ms), the scrollY there, and the video events (LATE = a band flat in frame k and
# textured in k+1 at the same document rows: content missing then appearing; FLASH = differs from both neighbours) whose
# document rows overlap the card (geom.card) from 100 ms before the flip to 1500 ms after it. Pixels only.
#   python3 fixes/reveal-paint/rp-video-read.py out/people-blink/rp-v1
import json, sys, os
d = sys.argv[1]
rec = json.load(open(os.path.join(d, 'pb.json')))
pba = {f"{r['arm']}{r['rep']}": r for r in json.load(open(os.path.join(d, 'pba.json')))}
tot = {}
for L in rec['loads']:
    key = f"{L['arm']}{L['rep']}"
    r = pba.get(key)
    if not r:
        continue
    perf0 = L['geom']['perf0']
    card = L['geom']['card']  # [docTop, height, ...]
    marks = [(m[1], m[3]) for m in L.get('mk', [])]
    flips = [perf0 + m[0] for m in L.get('m', []) if 'start-selling-future' in m[1] and m[2] == 'class' and '+is-visible' in str(m[3])]
    for ph in ('land1', 'land2'):
        t0 = next((t for t, n in marks if n == ph), None)
        t1 = next((t for t, n in marks if n == ph + ':end'), None)
        if t0 is None:
            continue
        fl = next((f for f in flips if f >= t0 - 50 and f <= t0 + 6000), None)
        if fl is None:
            print(f"{key} {ph}: no flip")
            continue
        vstart = L['vidStartWall']
        evs = []
        for e in r['events']:
            w = vstart + e['pts'] * 1000.0
            if not (fl - 100 <= w <= fl + 1500) or not e.get('docY'):
                continue
            a, b = e['docY']
            if b < card[0] or a > card[0] + card[1]:
                continue
            evs.append((round(w - fl), e['kinds'], e['bands'], e['docY']))
        late = [x for x in evs if 'late' in x[1]]
        tot.setdefault(L['arm'], [0, 0, 0])
        tot[L['arm']][0] += 1
        tot[L['arm']][1] += 1 if late else 0
        tot[L['arm']][2] += sum(x[2] for x in late)
        print(f"{key} {ph}: flip at +{round(fl - t0)} ms after the stroke mark; card-area events (ms after flip, kinds, 8-row bands, doc y): "
              + (' '.join(f"{x[0]}:{'/'.join(x[1])}:{x[2]}:{x[3][0]}-{x[3][1]}" for x in evs) or 'none'))
for arm, (n, nl, bands) in tot.items():
    print(f"arm {arm}: {n} reveals, {nl} with a LATE (blank-then-drawn) event over the card within 1.5 s, {bands} late bands in all")
