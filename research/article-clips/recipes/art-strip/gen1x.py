# art-strip: real-speed (1x) versions of the opening close-ups (user comments on opening clips 2 and 3, via the lead):
# same pair, crop, labels and strip design as day8-ptitle-3x-strip / day3-carousel-3x-strip (gencu.py pt/car), every
# 60 Hz grid frame once at 60 fps, a 1 s end hold, windows widened by 0.5 s before and 1.0 s after on both sides.
import json, os
from PIL import ImageFont
import strips as S
D = os.path.dirname(os.path.abspath(__file__)); G = D + '/g1x'; os.makedirs(G, exist_ok=True)
R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/'
F = 'fontfile=/System/Library/Fonts/Helvetica.ttc'; FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc'
SPEED = 'real speed, every 60 Hz screen frame once'
PRE, POST = 0.5, 1.0
WIN = []
def tw(t, sz, b=False):
    return ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc' if b else '/System/Library/Fonts/Helvetica.ttc', sz).getlength(t.replace('\\,', ','))
def strip(name, i, mov, ss, n, CW, SH, x, y, tin, tout):
    pw = S.pw_for(CW); M0, Dw = S.window(mov, ss, 'grid', 0, n)
    WIN.append({'id': f'{name}-{"AB"[i]}', 'mov': mov, 'ss': ss, 'mode': 'grid', 'a': 0, 'n': n, 'W': CW, 'SH': SH, 'pw': pw})
    return (f"[{tin}];\n[{2 + i}:v]setsar=1[s{i}];[{tin}][s{i}]overlay=x={x}:y={y}:format=auto[{tin}y];[{tin}y]split[{tin}y1][{tin}y2];"
            f"[{tin}y2]crop={pw}:{SH}:0:{y},drawbox=c=white:t=fill[p{i}];"
            f"[{tin}y1][p{i}]overlay=x='{x}+clip(t/{Dw:.6f}\\,0\\,1)*{CW - pw}':y={y}:eval=frame:format=auto[{tout}]")
def make(name, src, n, crop, CW, CH, W, SH, padx, pady, gap, lab_fs, tim_fs, timer, lab_y, tim_y, t1, t2, f1, f2, foot_h, y1, y2):
    parts = []
    for i, (mov, ss, lab) in enumerate(src):
        parts.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame={n},setpts=PTS-STARTPTS,crop={crop},setsar=1,"
            f"pad={W}:{pady + CH + gap + SH}:{padx}:{pady}:color=white,drawtext={F}:text='{lab}':x={padx}:y={lab_y}:fontsize={lab_fs}:fontcolor=black,"
            f"drawtext={F}:text='%{{eif\\:round({timer})\\:d}} ms':x=w-tw-{padx}:y={tim_y}:fontsize={tim_fs}:fontcolor=0x444444"
            + strip(name, i, mov, ss, n, CW, SH, padx, pady + CH, f'r{i}x', f'r{i}'))
    for t, sz, b in [(t1, f1, True), (t2, f2, False)]:
        print(('OVER ' if tw(t, sz, b) > W - 8 else 'ok   ') + f'{name}: {round(tw(t, sz, b))} / {W}  {t[:60]}')
    parts.append(f"[r0][r1]vstack=inputs=2,pad={W}:ih+{foot_h}:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-{y1}:fontsize={f1}:fontcolor=black,"
        f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-{y2}:fontsize={f2}:fontcolor=0x444444,"
        "tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]")
    open(f'{G}/{name}.txt', 'w').write(';\n'.join(parts) + '\n')
# title: gencu pt() (crop 890x320 at 200,480; timer zero = the o starts to open, 0.5 s into the old window)
make('opening-ptitle-1x', [(R + '20261010T071845Z-ar-ptitle-orig.mov', round(50.830 - PRE, 3), 'before (original site)'),
                           (R + '20261010T071753Z-ar-ptitle-g0m.mov', round(27.320 - PRE, 3), 'after (final build g0.0m)')],
     120 + round((PRE + POST) * 60), '890:320:200:480', 890, 320, 918, 100, 14, 43, 3, 23, 20, f'(t-{0.5 + PRE})*1000', 10, 11,
     'Close-up - the o in People opens into a row of faces',
     f'iPhone 15 Pro Max - Safari - actual device pixels - {SPEED} - ms after the o starts to open', 21, 16, 72, 63, 30)
# carousel: gencu car() (crop 600x180 at 150,1165; ms into the clip)
make('opening-carousel-1x', [(R + '20261010T042754Z-ar-carousel-orig.mov', round(36.900 - PRE, 3), 'before (original site)'),
                             (R + '20261010T042903Z-ar-carousel-g0m.mov', round(20.440 - PRE, 3), 'after (final build g0.0m)')],
     192 + round((PRE + POST) * 60), '600:180:150:1165', 600, 180, 620, 80, 10, 30, 2, 16, 14, 't*1000', 7, 8,
     'Close-up - the profile-photo pill, page at rest',
     f'iPhone 15 Pro Max - Safari - actual device pixels - {SPEED} - ms into the clip', 15, 12, 50, 44, 21)
json.dump(WIN, open(f'{G}/windows-1x.json', 'w'), indent=1)
print([(w['id'], w['ss'], w['n']) for w in WIN])
