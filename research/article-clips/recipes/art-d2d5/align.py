#!/usr/bin/env python3
# align.py (art-d2d5, 2026-10-11): where the replay starts in each recording, by numbers only (no frame is read).
# For each run: the .mov time (seconds into the recording, strips.py's clock chain) of mark finger, of the first page
# frame whose scrollY differs from the resting scrollY (the first scroll move: its frame start t - dt and end t), and of
# mark end. Clip 1 (art-strip/g5, hero-gesture-long) starts 0.3 s before that frame's END (ss = end - 0.3); check: on
# 10 Oct's pair this prints ss 40.814 (110844Z) and 23.548 (111222Z), g5's values exactly.
# usage: python3 align.py <mov> [<mov> ...]   (env WC_ROOT = the checkout holding out/wc/runs of those runs)
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import strips

def align(mov):
    ch = strips.chain(mov)
    fr = ch['frames']
    marks = dict((n, t) for t, n in ch['marks'])
    tf = marks.get('finger'); te = marks.get('end')
    after = [f for f in fr if tf is None or f[0] > tf]
    y0 = after[0][2]
    mv = next(f for f in after if f[2] != y0)
    first_move_start = mv[0] - mv[1] / 1000
    return {'mov': os.path.basename(mov), 'finger': round(tf, 4) if tf is not None else None, 'end': round(te, 4) if te is not None else None,
            'firstMoveStart': round(first_move_start, 4), 'firstMoveEnd': round(mv[0], 4), 'ss': round(mv[0] - 0.3, 3),
            'halfRttMs': [round(x, 1) for x in ch['halfRttMs']]}

if __name__ == '__main__':
    for m in sys.argv[1:]:
        print(json.dumps(align(m)))
