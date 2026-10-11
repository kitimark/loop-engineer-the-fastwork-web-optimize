#!/usr/bin/env python3
# Contact sheet of chosen GIF frames (composited), 4 per row. usage: sheet.py <gif> <out.png> i,j,k,...
import sys
from PIL import Image, ImageSequence
g, out, pick = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
im = Image.open(g); frames = {}
for i, f in enumerate(ImageSequence.Iterator(im)):
    if i in pick: frames[i] = f.convert('RGB').copy()
tw = 400; th = int(im.size[1] * tw / im.size[0])
s = Image.new('RGB', (tw * 4, th * ((len(pick) + 3) // 4)), 'white')
for k, i in enumerate(pick): s.paste(frames[i].resize((tw, th)), ((k % 4) * tw, (k // 4) * th))
s.save(out)
