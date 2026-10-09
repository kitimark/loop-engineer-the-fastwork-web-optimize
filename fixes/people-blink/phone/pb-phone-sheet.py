#!/usr/bin/env python3
# people-blink phone contact sheets (lead 2026-10-09, user T-228 #158): reads out/people-blink/phone-frames/plan.json
# (pb-strip-plan.mjs) and the PNGs ffmpeg cut from the -pb- ioscap recordings (<arm>_%03d.png, the user allowed
# pictures of the deck recordings, T-228 #155; Sleep focus on during recording, T-228 #151). Per arm one sheet
# (sheet-<arm>.png, 9 frames per row, half size) labelled "+ms after the scroll start, page y", plus per frame the same
# sharpness / white numbers as pb-shots.py over the web view. Sheets stay in out/ (gitignored), never committed.
# usage: python3 fixes/people-blink/phone/pb-phone-sheet.py
import json, os
import numpy as np
from PIL import Image, ImageDraw

D = 'out/people-blink/phone-frames'
W = 430
PER_ROW = 9
MASK = 64  # px at 430 wide: the address bar, expanded or compact


def metrics(a, r0, r1):
    v = a[r0:r1]
    lap = np.abs(4 * v[1:-1, 1:-1] - v[:-2, 1:-1] - v[2:, 1:-1] - v[1:-1, :-2] - v[1:-1, 2:])
    return round(float(lap.mean()), 2), round(float((v >= 245).mean()), 3)


plan = json.load(open(os.path.join(D, 'plan.json')))['plan']
for p in plan:
    arm = p['arm']
    ims, labels = [], []
    for fr in p['frames']:
        f = os.path.join(D, f"{arm}_{fr['n']:03d}.png")
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('L')
        if im.width != W:
            im = im.resize((W, round(im.height * W / im.width)), Image.BILINEAR)
        # Safari's address bar (bottom of the screen) shows the Mac's LAN address: mask it (Hard rule 12)
        ImageDraw.Draw(im).rectangle([0, im.height - MASK, im.width, im.height], fill=235)
        a = np.asarray(im, dtype=np.float32)
        sh, wh = metrics(a, 60, im.height - 80)
        ims.append(im)
        labels.append(f"+{fr['ms']}ms y{fr['y']}")
        print(f"{arm} {fr['n']:3d} +{fr['ms']:5d} ms y {fr['y']:5d} sharp {sh:6.2f} white {wh:.3f}")
    if not ims:
        print(f'{arm}: no frames')
        continue
    tw, th = W // 2, ims[0].height // 2
    rows = (len(ims) + PER_ROW - 1) // PER_ROW
    sheet = Image.new('L', (tw * PER_ROW, (th + 16) * rows), 255)
    d = ImageDraw.Draw(sheet)
    for i, (im, lb) in enumerate(zip(ims, labels)):
        x, y = (i % PER_ROW) * tw, (i // PER_ROW) * (th + 16)
        sheet.paste(im.resize((tw, th), Image.BILINEAR), (x, y + 16))
        d.text((x + 2, y + 2), lb, fill=0)
    out = os.path.join(D, f'sheet-{arm}.png')
    sheet.save(out)
    print('wrote', out)
