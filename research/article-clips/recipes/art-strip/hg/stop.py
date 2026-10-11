# art-strip: 3x close-up of the first title stop in the herocatch v2 pair (the o opens into faces while the page settles),
# native device pixels (crop 1010x384 at 140,856), each side + its frame-time strip and playhead, the pt close-up layout.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import strips as S
from PIL import ImageFont
H = os.path.dirname(os.path.abspath(__file__))
R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/'
F = 'fontfile=/System/Library/Fonts/Helvetica.ttc'; FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc'
CW, CH, CX, CY = 1010, 384, 140, 856
W, SH, N, LEAD = CW + 28, 100, 96, 1.5   # 96 grid frames = 1.6 s, from 1.5 s after the first flick starts
src = [(R + '20261010T110844Z-ar-herocatch-orig.mov', round(41.114 + LEAD, 3), 'before (original site)'),
       (R + '20261010T111222Z-ar-herocatch-g0m.mov', round(23.848 + LEAD, 3), 'after (final build g0.0m)')]
win, parts = [], []
for i, (mov, ss, lab) in enumerate(src):
    M0, D = S.window(mov, ss, 'grid', 0, N)
    pw = S.pw_for(CW); y = 43 + CH
    win.append({'id': f'hero-gesture-stop-3x-{"AB"[i]}', 'mov': mov, 'ss': ss, 'mode': 'grid', 'a': 0, 'n': N, 'W': CW, 'SH': SH, 'pw': pw})
    parts.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame={N},setpts=PTS-STARTPTS,crop={CW}:{CH}:{CX}:{CY},setsar=1,"
        f"pad={W}:{43 + CH + 3 + SH}:14:43:color=white,drawtext={F}:text='{lab}':x=14:y=10:fontsize=23:fontcolor=black,"
        f"drawtext={F}:text='%{{eif\\:round((t+{LEAD})*1000)\\:d}} ms':x=w-tw-14:y=11:fontsize=20:fontcolor=0x444444[r{i}x];\n"
        f"[{2 + i}:v]setsar=1[s{i}];[r{i}x][s{i}]overlay=x=14:y={y}:format=auto[r{i}y];[r{i}y]split[r{i}a][r{i}b];"
        f"[r{i}b]crop={pw}:{SH}:0:{y},drawbox=c=white:t=fill[p{i}];[r{i}a][p{i}]overlay=x='14+clip(t/{D:.6f}\\,0\\,1)*{CW - pw}':y={y}:eval=frame:format=auto[r{i}]")
t1 = 'Close-up - first stop on the People title\\: the o opens into faces while the page settles'
t2 = 'iPhone 15 Pro Max - Safari - robot replay of my own swipe - actual device pixels - 3x slower (50 ms per phone frame) - ms after the first flick'
for t, sz, b in [(t1, 21, True), (t2, 16, False)]:
    f = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc' if b else '/System/Library/Fonts/Helvetica.ttc', sz)
    print(('OVER ' if f.getlength(t) > W - 16 else 'ok   ') + f'{round(f.getlength(t))} / {W}  {t[:50]}')
parts.append(f"[r0][r1]vstack=inputs=2,pad={W}:ih+72:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-63:fontsize=21:fontcolor=black,"
    f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-30:fontsize=16:fontcolor=0x444444,"
    "setpts=round(N/20/TB),fps=60,tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]")
open(f'{H}/stop.txt', 'w').write(';\n'.join(parts) + '\n')
json.dump(win, open(f'{H}/windows-stop.json', 'w'), indent=1)
print([(w['id'], w['ss']) for w in win])
