# art-hero-worst: still strip from the work frames (216x384, work index = clip frame + 9), original above, g0.0l below.
import json
from PIL import Image, ImageDraw, ImageFont
D = 'out/article-video/'
longs = {"A": [(1.3958, 1.5488, 153), (1.5489, 1.6688, 120), (1.7448, 1.8188, 74)], "B": [(1.2754, 1.3354, 60)]}
cols = [78, 83, 88, 93, 98, 103]
TW, TH, G = 128, 228, 6
f = lambda s: ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', s)
W = len(cols) * TW + (len(cols) - 1) * G + 2 * 4
rowH = 30 + 18 + TH + 22
H = 2 * rowH + 40
im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
for r, (s, title) in enumerate([('A', 'before (original site)'), ('B', 'after (final build g0.0l)')]):
    y0 = r * rowH
    d.text((4, y0 + 6), title, font=f(18), fill='black')
    for k, n in enumerate(cols):
        x = 4 + k * (TW + G); t = n / 60
        d.text((x + TW / 2, y0 + 38), f'{round(t * 1000)} ms', font=f(13), fill='#444444', anchor='mm')
        th = Image.open(f'{D}work-hw/{s}/f_{n + 9:04d}.png').convert('RGB').resize((TW, TH), Image.LANCZOS)
        yy = y0 + 48
        im.paste(th, (x, yy))
        hit = [ms for a, b, ms in longs[s] if a <= t <= b]
        if hit:
            d.rectangle([x - 1, yy - 1, x + TW, yy + TH], outline='#E0201B', width=4)
            d.text((x + TW / 2, yy + TH + 11), f'in a {hit[0]} ms page frame', font=f(12), fill='#C0181B', anchor='mm')
        else:
            d.rectangle([x, yy, x + TW - 1, yy + TH - 1], outline='#dddddd', width=1)
d.text((W / 2, H - 26), 'Every 5th 60 Hz screen frame (83 ms apart), ms into the clip; same robot drag, aligned on the drag start.', font=f(12), fill='#444444', anchor='mm')
d.text((W / 2, H - 10), 'iPhone 15 Pro Max - Safari - drag 2 of 3 - red frame: the page was inside a frame over 50 ms (phone log)', font=f(12), fill='#444444', anchor='mm')
im.save(D + 'hero-worst-strip.png', optimize=True)
print(im.size)
