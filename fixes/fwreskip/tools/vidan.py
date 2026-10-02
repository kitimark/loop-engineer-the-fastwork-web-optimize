#!/usr/bin/env python3
# Simulator jump video: every recorded frame (VFR, passthrough), content box only; per frame the mean abs diff (0-255)
# to the previous frame and to the last frame. The jump is the first frame whose diff to the previous one is large;
# the frames right after it show whether the target section painted at once (diff to last ~ codec noise) or late.
# usage: vidan.py <video.mov> [box x0,y0,x1,y1]   (writes <video>-frames/ and prints the table)
import sys, os, subprocess, glob
from PIL import Image, ImageChops, ImageStat
v = sys.argv[1]
box = tuple(int(x) for x in sys.argv[2].split(',')) if len(sys.argv) > 2 else (0, 177, 1290, 2502)
d = v[:-4] + '-frames'
os.makedirs(d, exist_ok=True)
for f in glob.glob(os.path.join(d, '*.png')): os.remove(f)
subprocess.run(['ffmpeg', '-v', 'error', '-i', v, '-fps_mode', 'passthrough', '-frame_pts', '1', os.path.join(d, 'f%06d.png')], check=True)
pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', v], capture_output=True, text=True).stdout.split()
files = sorted(glob.glob(os.path.join(d, 'f*.png')))
ims = [Image.open(f).convert('L').crop(box) for f in files]
last = ims[-1]
md = lambda a, b: ImageStat.Stat(ImageChops.difference(a, b)).mean[0]
jump = None
print(f'{os.path.basename(v)}: {len(ims)} frames')
for i, im in enumerate(ims):
    dp = md(im, ims[i - 1]) if i else 0.0
    dl = md(im, last)
    if jump is None and i and dp > 8: jump = i
    t = pts[i] if i < len(pts) else '?'
    print(f'  {i:3d} t={t:>9} dprev={dp:6.2f} dlast={dl:6.2f}{"  <- jump" if jump == i else ""}')
if jump is not None:
    for k in range(jump, min(jump + 3, len(files))):
        Image.open(files[k]).resize((215, 466)).save(os.path.join(d, f'thumb-{k}.png'))
