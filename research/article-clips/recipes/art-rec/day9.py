#!/usr/bin/env python3
# art-rec: Day 9 before/after crops from the fix owners' Simulator stills (iOS 26.5 Simulator, iPhone 15 Pro Max, 3x).
#  corners: fix-platform-corners out/pc/simfix-b (g00b = g0.0b, g00bfix = g0.0b + the corner rule = g0.0c)
#  join:    fix-join-fade out/jf/pr r2-* (g00c = g0.0c, fix = rev 2 = g0.0d), held seek stops
from PIL import Image, ImageDraw, ImageFont
W = '.claude/worktrees/'
PC = W + 'agent-a8c224ad281bb9356/out/pc/simfix-b/'
JF = W + 'agent-afa964e040156488b/out/jf/pr/'
OUT = 'out/article-gifs/'
F = lambda s: ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', s)
INK, SOFT = (23, 34, 30), (80, 90, 86)

def corners():
    cols = [('before (g0.0b)', PC + 'g00b-sim-stage1-full.png'), ('after (g0.0c)', PC + 'g00bfix-sim-stage1-full.png')]
    # card 2 rect (sim.json): css l 20, t 231.2 in the viewport, w 390, h 311.1; viewport top = 59 css (177 device px)
    L, T, R, B = 60, 177 + 694, 60 + 1170, 177 + 694 + 933
    cw = 560; scale = cw / (R - L + 96)
    zs = 150  # device px around each corner, zoomed
    zw = 270
    pad = 24
    ch = int((B - T + 96) * scale)
    Wd = pad + 2 * (cw + pad)
    Hd = 52 + ch + 16 + zw + 60
    img = Image.new('RGB', (Wd, Hd), 'white'); d = ImageDraw.Draw(img)
    for k, (lab, f) in enumerate(cols):
        im = Image.open(f).convert('RGB')
        x0 = pad + k * (cw + pad)
        d.text((x0, 14), lab, font=F(24), fill=INK)
        card = im.crop((L - 48, T - 48, R + 48, B + 48)).resize((cw, ch), Image.LANCZOS)
        img.paste(card, (x0, 52))
        # zooms: bottom-left and top-right corners
        for j, (cx, cy) in enumerate([(L, B - zs), (R - zs, T)]):
            z = im.crop((cx - 20 if j == 0 else cx + 20 - 0, cy + (20 if j == 0 else -20), cx - 20 + zs if j == 0 else cx + 20 + zs, cy + (20 if j == 0 else -20) + zs)).resize((zw, zw), Image.LANCZOS)
            img.paste(z, (x0 + j * (zw + 20), 52 + ch + 16))
    d.text((pad, Hd - 34), 'iOS Simulator (iPhone 15 Pro Max, Safari) - the 2nd platform card; below: two of its corners, zoomed', font=F(17), fill=SOFT)
    img.save(OUT + 'day9-corners.png')

def join():
    rows = [('the button fade held at 40 ms (end of the page, menu opening)', 'join-24-40'), ('held at 200 ms (button at 68 % opacity)', 'join-80-200')]
    cols = [('before (g0.0c)', 'r2-g00c-'), ('after (g0.0d)', 'r2-fix-')]
    pad, cw, chh = 16, 600, 192
    Wd = pad + 2 * (cw + pad); Hd = 44 + 2 * (chh + 34) + 44
    img = Image.new('RGB', (Wd, Hd), 'white'); d = ImageDraw.Draw(img)
    for k, (lab, pre) in enumerate(cols): d.text((pad + k * (cw + pad), 12), lab, font=F(24), fill=INK)
    for r, (rl, stop) in enumerate(rows):
        y = 44 + r * (chh + 34)
        d.text((pad, y + 4), rl, font=F(18), fill=SOFT)
        for k, (lab, pre) in enumerate(cols):
            img.paste(Image.open(JF + pre + stop + '.png').convert('RGB'), (pad + k * (cw + pad), y + 30))
    d.text((pad, Hd - 32), 'iOS Simulator (iPhone 15 Pro Max, Safari) - the top bar\'s right end at the end of the page; frames held by a seek harness', font=F(17), fill=SOFT)
    img.save(OUT + 'day9-join.png')

corners(); join()
print('ok')
