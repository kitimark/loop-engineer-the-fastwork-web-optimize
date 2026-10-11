#!/usr/bin/env python3
# art-rec: Day 6 (end of the page, pictures on/off) and Day 9 logo (end of the menu close) from simshots.mjs's
# iOS Simulator stills (iPhone 15 Pro Max, 430x775 css at 3x; viewport top = 59 css = 177 device px).
# Crops keep only the page: below the status bar (row 177) and above Safari's bottom bar (row 2490).
from PIL import Image, ImageDraw, ImageFont
S = '.claude/worktrees/agent-a34f4f98a6e023093/out/art-rec/sim/'
OUT = 'out/article-gifs/'
F = lambda s: ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', s)
FB = lambda s: ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', s)
INK, SOFT = (23, 34, 30), (80, 90, 86)

def day6():
    pw = 286; top, bot = 177, 2490
    ph = int((bot - top) * pw / 1290)
    groups = [('One screen above the end', 'end-1screen'), ('The end of the page (menu open)', 'end')]
    cols = [('pictures on (v9-final)', 'C'), ('pictures off (test build)', 'V')]
    m, gap, ggap = 16, 10, 40
    Wd = 2 * m + 4 * pw + 2 * gap + ggap
    Hd = 44 + 28 + ph + 46
    img = Image.new('RGB', (Wd, Hd), 'white'); d = ImageDraw.Draw(img)
    for g, (gt, shot) in enumerate(groups):
        gx = m + g * (2 * pw + gap + ggap)
        d.text((gx, 12), gt, font=FB(21), fill=INK)
        for c, (ct, arm) in enumerate(cols):
            x = gx + c * (pw + gap)
            d.text((x, 46), ct, font=F(15), fill=SOFT)
            im = Image.open(S + f'{arm}-{shot}.png').convert('RGB').crop((0, top, 1290, bot)).resize((pw, ph), Image.LANCZOS)
            img.paste(im, (x, 72))
    d.text((m, Hd - 32), 'iOS Simulator (iPhone 15 Pro Max, Safari) - the same build with and without the end screen\'s background pictures', font=F(15), fill=SOFT)
    img.save(OUT + 'day6-end-bg.png'); print('day6', img.size)

def day9_logo():
    x0, x1, y0, y1 = 0, 645, 210, 395
    sc = 0.6; cw, ch = int((x1 - x0) * sc), int((y1 - y0) * sc)
    rows = [('at rest (menu closed)', 'closed-rest'), ('560 ms into the 680 ms close', 'close-560'),
            ('600 ms', 'close-600'), ('620 ms', 'close-620')]
    cols = [('before (g0.0d)', 'd'), ('after (g0.0e)', 'e')]
    # guide: the resting logo's left edge, measured on the at-rest still (first near-white column in the logo band)
    rest = Image.open(S + 'd-closed-rest.png').convert('RGB')
    gx = next(x for x in range(60, 400) if any(min(rest.getpixel((x, y))) >= 250 for y in range(270, 340)))
    m, gap, lw = 16, 20, 230
    Wd = m + lw + 2 * cw + gap + m
    Hd = 48 + len(rows) * (ch + 12) + 40
    img = Image.new('RGB', (Wd, Hd), 'white'); d = ImageDraw.Draw(img)
    for c, (ct, arm) in enumerate(cols):
        d.text((m + lw + c * (cw + gap), 14), ct, font=FB(21), fill=INK)
    for r, (rt, shot) in enumerate(rows):
        y = 48 + r * (ch + 12)
        d.text((m, y + ch // 2 - 9), rt, font=F(15), fill=SOFT)
        for c, (ct, arm) in enumerate(cols):
            x = m + lw + c * (cw + gap)
            im = Image.open(S + f'{arm}-{shot}.png').convert('RGB').crop((x0, y0, x1, y1)).resize((cw, ch), Image.LANCZOS)
            img.paste(im, (x, y))
            g = x + int((gx - x0) * sc)
            for yy in range(y, y + ch, 8):
                d.line([(g, yy), (g, min(yy + 4, y + ch - 1))], fill=(220, 40, 40), width=2)
    d.text((m, Hd - 30), 'iOS Simulator, clock held at each moment of the close - red dashes: where the logo rests', font=F(15), fill=SOFT)
    img.save(OUT + 'day9-logo.png'); print('logo', img.size, 'guide x', gx)

day6(); day9_logo()
