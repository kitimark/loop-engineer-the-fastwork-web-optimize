# nav-earn: stack the probe's nav-strip stills (A left, B right) with labels.
#   python3 fixes/nav-earn/probe/montage.py <probe dir> <vp> [arms]
import json, sys, os
from PIL import Image, ImageDraw
d, vp = sys.argv[1], sys.argv[2]
arms = (sys.argv[3] if len(sys.argv) > 3 else 'A,B').split(',')
runs = {r['arm']: r for r in json.load(open(os.path.join(d, 'probe.json')))['runs'] if r['vp'] == vp}
arms = [a for a in arms if a in runs]
rows = runs[arms[0]]['stills']
ims = {a: [Image.open(s['strip']) for s in runs[a]['stills']] for a in arms}
w, h = ims[arms[0]][0].size
scale = min(1.0, 700 / w)
W, H = int(w * scale), int(h * scale)
lab = 110
out = Image.new('RGB', (lab + W * len(arms) + 10 * (len(arms) - 1), (H + 6) * len(rows) + 30), 'white')
dr = ImageDraw.Draw(out)
for j, a in enumerate(arms):
    dr.text((lab + j * (W + 10) + 4, 8), {'A': 'A = v8 (now)', 'B': 'B = v8 + fix'}.get(a, a), fill='black')
for i, s in enumerate(rows):
    y = 30 + i * (H + 6)
    m = s.get('morph') or '0'
    dr.text((4, y + 4), ('before' if s['ms'] < 0 else f"{s['ms']} ms") + (f"\nmorph {float(m):.2f}" if s['ms'] >= 0 else ''), fill='black')
    for j, a in enumerate(arms):
        out.paste(ims[a][i].resize((W, H)), (lab + j * (W + 10), y))
o = os.path.join(d, f'montage-{vp}' + ('' if len(arms) > 1 else '-' + arms[0]) + '.png')
out.save(o)
print(o)
