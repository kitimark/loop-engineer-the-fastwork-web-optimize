#!/usr/bin/env python3
# reveal-paint decisive check (2), counts: per load and LAND phase of rp-frames.mjs, the Simulator video frames from 100 ms
# before the #people is-visible flip to 600 ms after it whose web-view content area (rows 110-880 of the 430x932 gray
# decode, i.e. below the fixed nav and above the toolbar pill) is blank: pixel std < 4 (a white screen, nothing drawn).
# Also the first frame after the flip where the card's deck photo is drawn (content std > 25 in rows 300-700).
# Pixels only; the frames come from the gray decode pb-analyze.py reads.
#   python3 fixes/reveal-paint/rp-video-blank.py out/people-blink/rp-v1
import json, sys, os
import numpy as np
W, H = 430, 932
d = sys.argv[1]
rec = json.load(open(os.path.join(d, 'pb.json')))
tot = {}
for L in rec['loads']:
    key = f"{L['arm']}{L['rep']}"
    mov = os.path.join(d, f"{key}.mov")
    if not os.path.exists(mov + '.gray'):
        continue
    pts = [float(x.strip(',')) for x in open(mov + '.pts').read().split() if x.strip(',') not in ('', 'N/A')]
    n = min(len(pts), os.path.getsize(mov + '.gray') // (W * H))
    F = np.memmap(mov + '.gray', np.uint8, 'r', shape=(n, H, W))
    wall = [L['vidStartWall'] + p * 1000.0 for p in pts[:n]]
    perf0 = L['geom']['perf0']
    marks = [(m[1], m[3]) for m in L.get('mk', [])]
    for ph in ('land1', 'land2'):
        t0 = next((t for t, nm in marks if nm == ph), None)
        if t0 is None:
            continue
        fl = next((perf0 + m[0] for m in L['m'] if 'start-selling-future' in m[1] and m[2] == 'class' and '+is-visible' in str(m[3]) and perf0 + m[0] >= t0 - 50), None)
        if fl is None:
            print(f"{key} {ph}: no flip")
            continue
        ks = [k for k in range(n) if fl - 100 <= wall[k] <= fl + 600]
        blank, first_photo = [], None
        for k in ks:
            a = F[k, 110:880, 10:420]
            if a.std() < 4:
                blank.append(k)
            if first_photo is None and wall[k] >= fl and F[k, 300:700, 10:420].std() > 25:
                first_photo = round(wall[k] - fl)
        # blank duration: from the first blank frame to the next non-blank frame
        dur = 0
        if blank:
            k1 = blank[-1]
            nxt = next((k for k in ks if k > k1 and k not in blank), None)
            dur = round((wall[nxt] if nxt is not None else wall[k1]) - wall[blank[0]])
        tot.setdefault(L['arm'], []).append((len(blank), dur))
        print(f"{key} {ph}: blank web-view frames {len(blank)}" + (f" from {round(wall[blank[0]] - fl):+d} ms, {dur} ms on screen" if blank else '') +
              f"; first frame with the deck drawn {first_photo} ms after the flip")
for arm, v in tot.items():
    print(f"arm {arm}: {len(v)} reveals, {sum(1 for b, _ in v if b)} with a blank web view, blank ms {[x for _, x in v]}")
