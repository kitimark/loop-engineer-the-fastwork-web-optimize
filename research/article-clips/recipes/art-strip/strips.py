#!/usr/bin/env python3
# art-strip: frame-time strips for the article's iPhone clips (user T-170 #191), the Chrome before/after design
# (research/team-article/capture/before-after.mjs stripPPM) with the phone thresholds: one bar per page frame from the
# phone's own rAF log [t, dt, scrollY, innerHeight], bar width = the frame's duration, height = dt on 0-100 ms
# (over 100 ms: full height, its ms printed above), grey <= 34 ms, amber > 34, red > 50, faint dotted guides at 16.7 /
# 34 / 50 ms. Numbers and generated images only; reads no recording picture (frames.json PTS + driver records).
#
# Clock chain (as fixes/worst-cases-capture/wc-offsets.mjs and fixes/people-blink/phone/pb-strip-plan.mjs):
#   page performance.now() -> Mac wall ms (the driver's sync pairs [wallBefore, perf, wallAfter]; pairs within 10 ms of
#   the best round trip, median offset) -> host uptime (wc/ar: stamps.jsonl wallNs/upRawNs of the run; pb: the
#   2026-10-09 06:45Z time.monotonic/time.time reading, 1790444203298) -> the recorder's PTS (frames.json; PTS on the
#   uptime clock is OBSERVED) -> movie seconds = PTS - first PTS (ffmpeg: start_time 0, time base 1/600).
# Window of one side: the movie time of its output frame 0 (M0) and its real-time length D.
#   grid mode (setpts=PTS-STARTPTS,fps=60,trim=start_frame=s): M0 = first frame >= -ss, + s/60; D = n/60
#   raw  mode (trim=start_frame=a:end_frame=b on decoded frames): M0 = frame a after -ss; D = frame b - frame a
import json, os, statistics, sys
from PIL import Image, ImageDraw, ImageFont

WT = '.claude/worktrees/'
WC = WT + 'agent-a4147eb3c10989361/'
PB = WT + 'agent-ac97cdb0aa8f3a8b2/'
MONO_OFF = 1790444203298
HERE = os.path.dirname(os.path.abspath(__file__))
_stamps = None

def frames_json(mov):
    return json.load(open(mov[:-4] + '.frames.json'))['frames']

def movie_times(mov):
    fr = frames_json(mov)
    p0 = fr[0][0]
    return [round((f[0] - p0) * 600) / 600 for f in fr]  # the .mov's own 1/600 s time base

def window(mov, ss, mode, a, n):
    ts = movie_times(mov)
    after = [t for t in ts if t >= ss - 1e-9]
    if mode == 'grid':
        return after[0] + a / 60, n / 60
    return after[a], after[n] - after[a]  # raw: n = end_frame (exclusive)

def _sync_off(sync):
    rtt = [c - a for a, p, c in sync]
    best = min(rtt)
    use = [(a + c) / 2 - p for (a, p, c), r in zip(sync, rtt) if r <= best + 10]
    return statistics.median(use), [r / 2 for r in rtt if r <= best + 10]

def chain(mov):
    """rAF frames of the run as (movS_end, dt_ms, scrollY) + chain facts."""
    base = os.path.basename(mov)[:-4]
    fr = frames_json(mov)
    pts0 = fr[0][0]
    if '-pb-' in base:
        parts = base.split('-')
        i = parts.index('pb')
        arm, ts = parts[i + 1], parts[i + 2]
        rec = json.load(open(PB + f'out/pbp/g-{arm}-{ts}.json'))
        segs = rec['run']['segments']
        up_minus_wall = -MONO_OFF
        how = 'pb: perf->wall (driver sync) -> uptime (06:45Z monotonic reading) -> PTS'
    else:
        global _stamps
        if _stamps is None:
            _stamps = [json.loads(l) for l in open(WC + 'out/wc/runs/stamps.jsonl') if l.strip()]
        rec = json.load(open(WC + f'out/wc/runs/{base}.json'))
        st = next((s for s in _stamps if s['label'] == f'{base}-rec'), None) or next(s for s in _stamps if s['label'] == f'{base}-pre')
        up_minus_wall = (st['upRawNs'] - st['wallNs']) / 1e6
        segs = rec['run']['segments']
        how = 'wc/ar: perf->wall (driver sync) -> uptime (stamps.jsonl) -> PTS'
    marked = next(s for s in segs if s.get('marks'))
    out, half = [], []
    for s in segs:
        off, h = _sync_off(s.get('sync') or marked['sync'])
        half += h
        for t, dt, y, *_ in s['frames']:
            out.append(((t + off + up_minus_wall) / 1000 - pts0, dt, y))
        s['_off'] = off
    out.sort()
    marks = []
    for s in segs:
        for t, name in s.get('marks') or []:
            marks.append(((t + s['_off'] + up_minus_wall) / 1000 - pts0, name))
    return {'frames': out, 'halfRttMs': [min(half), max(half)], 'how': how, 'marks': marks}

def font(sz, bold=False):
    return ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc' if bold else '/System/Library/Fonts/Helvetica.ttc', sz, index=1 if bold else 0)

BG = (0x1a, 0x21, 0x1e)
C_OK, C_34, C_50 = (0x6b, 0x7d, 0x75), (0xe2, 0xb8, 0x4a), (0xff, 0x6b, 0x4a)

def draw_strip(path, frames, M0, D, W, SH, pw):
    """frames: (movS_end, dt). x of movie time m = pw/2 + (m-M0)/D*(W-pw), the playhead's centre at that time."""
    SS = 8  # horizontal supersampling for sub-pixel bar edges
    LB = round(SH * 0.22)
    HB = SH - LB - 3
    base_y = SH - 3
    yof = lambda ms: base_y - round(min(ms, 100) / 100 * HB)
    big = Image.new('RGB', (W * SS, SH), BG)
    d = ImageDraw.Draw(big)
    xs = lambda m: (pw / 2 + (m - M0) / D * (W - pw)) * SS
    longs = []
    for te, dt, *_ in frames:
        tsr = te - dt / 1000
        if te <= M0 or tsr >= M0 + D:
            continue
        x0, x1 = max(0, xs(tsr)), min(W * SS, xs(te))
        if x1 - x0 >= 3 * SS:
            x1 -= SS  # 1 px gap between bars wide enough to show it
        c = C_50 if dt > 50 else C_34 if dt > 34 else C_OK
        d.rectangle([round(x0), yof(dt), max(round(x0), round(x1) - 1), base_y - 1], fill=c)
        if dt > 100:
            longs.append(((x0 + x1) / 2 / SS, dt))
    im = big.resize((W, SH), Image.BOX)
    # faint dotted guides over the bars
    ov = Image.new('RGBA', (W, SH), (0, 0, 0, 0))
    o = ImageDraw.Draw(ov)
    for ms in (16.7, 34, 50):
        y = yof(ms)
        for x in range(0, W, 4):
            o.line([(x, y), (x + 1, y)], fill=(255, 255, 255, 70))
    im = Image.alpha_composite(im.convert('RGBA'), ov)
    d = ImageDraw.Draw(im)
    f = font(max(10, round(SH * 0.16)))
    last = -1e9
    for xc, dt in longs:
        txt = str(round(dt))
        tw = d.textlength(txt, font=f)
        x = min(max(xc - tw / 2, 1), W - tw - 1)
        if x < last + 3:
            x = last + 3
        d.text((x, LB - 2), txt, font=f, fill=(0xff, 0xd0, 0xc4), anchor='ls')
        last = x + tw
    im.convert('RGB').save(path, optimize=True)

def side_stats(frames, M0, D):
    d = [dt for te, dt, *_ in frames if M0 < te <= M0 + D]
    return {'n': len(d), 'gt34': sum(x > 34 for x in d), 'gt50': sum(x > 50 for x in d), 'gt100': sum(x > 100 for x in d), 'max': max(d) if d else None}

def make(spec):
    """spec: {id, mov, ss, mode, a, n, W, SH, pw} -> writes strips/<id>.png, returns stats incl. M0/D and chain facts."""
    M0, D = window(spec['mov'], spec['ss'], spec['mode'], spec['a'], spec['n'])
    ch = chain(spec['mov'])
    path = os.path.join(HERE, 'strips', spec['id'] + '.png')
    draw_strip(path, ch['frames'], M0, D, spec['W'], spec['SH'], spec['pw'])
    st = side_stats(ch['frames'], M0, D)
    return {**spec, 'png': path, 'M0': round(M0, 5), 'D': round(D, 5), **st, 'halfRttMs': ch['halfRttMs'], 'chain': ch['how']}

def pw_for(W):
    return 3 if W >= 640 else 2

if __name__ == '__main__':
    specs = json.load(open(sys.argv[1]))
    res = [make(s) for s in specs]
    json.dump(res, open(sys.argv[2], 'w'), indent=1)
    for r in res:
        print(f"{r['id']:34s} M0 {r['M0']:9.4f} D {r['D']:.3f} n {r['n']:4d} >34 {r['gt34']:3d} >50 {r['gt50']:3d} >100 {r['gt100']:2d} max {r['max']}  halfRTT {r['halfRttMs'][0]:.1f}-{r['halfRttMs'][1]:.1f}")
