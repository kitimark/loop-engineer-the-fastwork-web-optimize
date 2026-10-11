# art-strip: day7-end-openclose-2x: the day7-end close-up (gencu full('end'): full screen at 796x1416 per side, 60 grid
# frames from 0.1 s before the menu moves) for the open push E21 and, as part 2, the next push E22 that closes the menu,
# each part aligned on its own push; 2x slower (each 60 Hz phone frame held 2 output frames), strips + playheads.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import strips as S
from PIL import ImageFont
H = os.path.dirname(os.path.abspath(__file__))
R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/'
F = 'fontfile=/System/Library/Fonts/Helvetica.ttc'; FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc'
A, B = R + '20261010T125906Z-ar-endoc-orig.mov', R + '20261010T130126Z-ar-endoc-g0m.mov'
SEGS = [((A, 86.65), (B, 64.55), 'One push opens the menu, the next one closes it')]
N, SH, CW = 270, 112, 796
LINE = 'iPhone 15 Pro Max - Safari - same robot pushes on both - 2x slower (33 ms per phone frame) - ms after the open push'
for t, sz, b in [(SEGS[0][2], 30, True), (LINE, 24, False)]:
    f = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc' if b else '/System/Library/Fonts/Helvetica.ttc', sz)
    print(('OVER ' if f.getlength(t) > 1592 else 'ok   ') + f'{round(f.getlength(t))} / 1600')
parts, win = [], []
for k, (sa, sb, title) in enumerate(SEGS):
    for j, ((mov, ss), lab, pw) in enumerate([(sa, 'before (original site)', 804), (sb, 'after (final build g0.0m)', 796)]):
        i = 2 * k + j; si = 2 + i; tag = f'h{k}{j}'
        M0, D = S.window(mov, ss, 'grid', 0, N); ppw = S.pw_for(CW); y = 1472
        win.append({'id': f'end-openclose-take-2x-{"AB"[j]}', 'mov': mov, 'ss': ss, 'mode': 'grid', 'a': 0, 'n': N, 'W': CW, 'SH': SH, 'pw': ppw})
        parts.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame={N},setpts=PTS-STARTPTS,crop=1290:2295:0:162,scale=796:1416:flags=lanczos,setsar=1,"
            f"pad={pw}:{1472 + SH}:0:56:color=white,drawtext={F}:text='{lab}':x=16:y=14:fontsize=30:fontcolor=black,"
            f"drawtext={F}:text='%{{eif\\:round((t-0.3)*1000)\\:d}} ms':x=796-tw-16:y=16:fontsize=26:fontcolor=0x444444[{tag}x];\n"
            f"[{si}:v]setsar=1[{tag}s];[{tag}x][{tag}s]overlay=x=0:y={y}:format=auto[{tag}y];[{tag}y]split[{tag}a][{tag}b];"
            f"[{tag}b]crop={ppw}:{SH}:0:{y},drawbox=c=white:t=fill[{tag}p];"
            f"[{tag}a][{tag}p]overlay=x='clip(t/{D:.6f}\\,0\\,1)*{CW - ppw}':y={y}:eval=frame:format=auto,setpts=round(N/30/TB),fps=60[{tag}]")
    parts.append(f"[h{k}0][h{k}1]hstack=inputs=2,pad=1600:{1568 + SH}:0:0:color=white,drawtext={FB}:text='{title}':x=(w-tw)/2:y=h-92:fontsize=30:fontcolor=black,"
        f"drawtext={F}:text='{LINE}':x=(w-tw)/2:y=h-44:fontsize=24:fontcolor=0x444444,setsar=1[c{k}]")
parts.append("[c0]tpad=stop_mode=clone:stop_duration=1.0,format=yuv420p[out]")
open(f'{H}/eo2x.txt', 'w').write(';\n'.join(parts) + '\n')
json.dump(win, open(f'{H}/windows-eo2x.json', 'w'), indent=1)
