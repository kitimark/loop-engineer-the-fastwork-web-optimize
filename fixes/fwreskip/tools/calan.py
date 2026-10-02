#!/usr/bin/env python3
# Capture calibration for Simulator screen recordings: in each CAL-*.mov (vfix MODE C: one-rAF full-viewport magenta
# flash), count the recorded frames whose centre region is magenta. 0 frames = the recording can miss a one-frame
# state, so it is not evidence for single frames.
# usage: calan.py <dir>
import sys, os, glob, subprocess
from PIL import Image
for v in sorted(glob.glob(os.path.join(sys.argv[1], 'CAL-*.mov'))):
    d = v[:-4] + '-frames'
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, '*.png')): os.remove(f)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', v, '-fps_mode', 'passthrough', os.path.join(d, 'f%06d.png')], check=True)
    pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', v], capture_output=True, text=True).stdout.replace(',', ' ').split()
    files = sorted(glob.glob(os.path.join(d, 'f*.png')))
    hits = []
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB'); w, h = im.size
        c = im.crop((w // 4, h * 2 // 5, w * 3 // 4, h * 3 // 5)).resize((20, 20))
        px = list(c.getdata()); mag = sum(1 for p in px if p[0] > 200 and p[1] < 60 and p[2] > 200)
        if mag > len(px) * 0.9: hits.append((i, pts[i] if i < len(pts) else '?'))
    gaps = [round(float(pts[i + 1]) - float(pts[i]), 4) for i in range(len(pts) - 1)] if len(pts) > 1 else []
    print(f'{os.path.basename(v)}: {len(files)} frames, magenta frames {len(hits)} {hits}, median frame gap {sorted(gaps)[len(gaps) // 2] if gaps else "?"} s')
