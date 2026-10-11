#!/usr/bin/env python3
# art-closeups-hq: high-quality 60 fps x264 filter graphs for the article's 3x close-ups, straight from the source
# recordings. Same pairs, start times, crops, alignment and labels as the GIF recipes (art-ar-gifs pt3x/car3x/menu3x,
# art-rec day5-3x, art-gif-pb gE3x/g3x, art-join-closeup join3/logo3); only the scale (native or fit 1600 px), font sizes
# (scaled with the picture), output rate (60 fps, each phone frame held 3 frames) and the "at 20 fps" wording change.
# art-strip (T-170 #191): + a frame-time strip under each panel (strips.py, inputs 2/3: the phone's rAF log on the
# panel's window via the clock chain) and a white playhead over it, overlaid on each side's own clock before the 3x
# slow-down (setpts=round(N/20/TB)). Simulator panels (join, logo) are not made: no phone frame log.
import os, json
from PIL import ImageFont
import strips as S
D = os.path.dirname(os.path.abspath(__file__))
G = D + '/gcu'
os.makedirs(G, exist_ok=True)
R = '.claude/worktrees/agent-a4147eb3c10989361/out/iphone-screen/'
RP = '.claude/worktrees/agent-ac97cdb0aa8f3a8b2/out/iphone-screen/'
WINDOWS = []
def strip(name, i, mov, ss, mode, a, n, W, SH, x, y, tin, tout, tail=''):
    # strip image (input 2+i) at (x, y) under the panel + the playhead at t/D (t = this side's own clock)
    pw = S.pw_for(W)
    M0, Dw = S.window(mov, ss, mode, a, n)
    WINDOWS.append({'id': f'{name}-3x-{"AB"[i]}', 'mov': mov, 'ss': ss, 'mode': mode, 'a': a, 'n': n, 'W': W, 'SH': SH, 'pw': pw})
    return (f"[{tin}];\n[{2 + i}:v]setsar=1[s{i}];[{tin}][s{i}]overlay=x={x}:y={y}:format=auto[{tin}y];"
            f"[{tin}y]split[{tin}y1][{tin}y2];[{tin}y2]crop={pw}:{SH}:0:{y},drawbox=c=white:t=fill[p{i}];"
            f"[{tin}y1][p{i}]overlay=x='{x}+clip(t/{Dw:.6f}\\,0\\,1)*{W - pw}':y={y}:eval=frame:format=auto{tail}[{tout}]")
F = 'fontfile=/System/Library/Fonts/Helvetica.ttc'
FB = 'fontfile=/System/Library/Fonts/HelveticaNeue.ttc'
RATE = '50 ms per phone frame'
widths = []

def tw(text, size, bold=False):
    f = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc' if bold else '/System/Library/Fonts/Helvetica.ttc', size)
    return f.getlength(text.replace('\\,', ','))

def chk(name, text, size, W, bold=False):
    widths.append((name, round(tw(text, size, bold)), W, text[:60]))

def write(name, g):
    open(f'{G}/{name}.txt', 'w').write(g)

# --- People title (pt3x): native 890x320 crop, k = 890/623
def pt():
    W, SH = 918, 100
    src = [(R + '20261010T071845Z-ar-ptitle-orig.mov', 50.830), (R + '20261010T071753Z-ar-ptitle-g0m.mov', 27.320)]
    half = lambda i, lab: (f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=120,setpts=PTS-STARTPTS,crop=890:320:200:480,setsar=1,"
        f"pad={W}:{366 + SH}:14:43:color=white,drawtext={F}:text='{lab}':x=14:y=10:fontsize=23:fontcolor=black,"
        f"drawtext={F}:text='%{{eif\\:round((t-0.5)*1000)\\:d}} ms':x=w-tw-14:y=11:fontsize=20:fontcolor=0x444444" + strip('day8-ptitle', i, *src[i], 'grid', 0, 120, 890, SH, 14, 363, f'r{i}x', f'r{i}'))
    t1 = 'Close-up - the o in People opens into a row of faces'
    t2 = f'iPhone 15 Pro Max - Safari - actual device pixels - 3x slower ({RATE}) - ms after the o starts to open'
    chk('pt', t1, 21, W, True); chk('pt', t2, 17, W)
    write('pt', ';\n'.join([half(0, 'before (original site)'), half(1, 'after (final build g0.0m)'),
        f"[r0][r1]vstack=inputs=2,pad={W}:ih+72:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-63:fontsize=21:fontcolor=black,"
        f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-30:fontsize=17:fontcolor=0x444444,"
        "setpts=round(N/20/TB),fps=60,tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]"]) + '\n')

# --- carousel pill (car3x): already native 600x180, unchanged layout
def car():
    W, SH = 620, 80
    src = [(R + '20261010T042754Z-ar-carousel-orig.mov', 36.900), (R + '20261010T042903Z-ar-carousel-g0m.mov', 20.440)]
    half = lambda i, lab: (f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=192,setpts=PTS-STARTPTS,crop=600:180:150:1165,setsar=1,"
        f"pad={W}:{212 + SH}:10:30:color=white,drawtext={F}:text='{lab}':x=10:y=7:fontsize=16:fontcolor=black,"
        f"drawtext={F}:text='%{{eif\\:round(t*1000)\\:d}} ms':x=w-tw-10:y=8:fontsize=14:fontcolor=0x444444" + strip('day3-carousel', i, *src[i], 'grid', 0, 192, 600, SH, 10, 210, f'r{i}x', f'r{i}'))
    t1 = 'Close-up - the profile-photo pill, page at rest'
    t2 = f'iPhone 15 Pro Max - Safari - actual device pixels - 3x slower ({RATE}) - ms into the clip'
    chk('car', t1, 15, W, True); chk('car', t2, 12, W)
    write('car', ';\n'.join([half(0, 'before (original site)'), half(1, 'after (final build g0.0m)'),
        f"[r0][r1]vstack=inputs=2,pad={W}:ih+50:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-44:fontsize=15:fontcolor=black,"
        f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-21:fontsize=12:fontcolor=0x444444,"
        "setpts=round(N/20/TB),fps=60,tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]"]) + '\n')

# --- menu push (menu3x): 2 x 1290x1380 would be 2580 wide -> lanczos to 796x852 per panel (k = 796/460 = 1.73)
def menu():
    SH = 112
    src = [(R + '20261010T041207Z-ar-menu-orig.mov', 80.400), (R + '20261010T041016Z-ar-menu-v14.mov', 76.680)]
    def half(i, lab, pw):
        return (f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame=156,setpts=PTS-STARTPTS,crop=1290:1380:0:162,scale=796:852:flags=lanczos,setsar=1,"
            f"pad={pw}:{900 + SH}:0:48:color=white,drawtext={F}:text='{lab}':x=14:y=12:fontsize=26:fontcolor=black,"
            f"drawtext={F}:text='%{{eif\\:round((t+-0.2)*1000)\\:d}} ms':x=796-tw-14:y=14:fontsize=22:fontcolor=0x444444" + strip('day8-menu', i, *src[i], 'grid', 0, 156, 796, SH, 0, 900, f'h{i}x', f'h{i}'))
    t1 = 'Close-up - one slow push up at the end of the page opens the menu'
    t2 = f'iPhone 15 Pro Max - Safari - upper part of the screen - 3x slower ({RATE}) - ms after the push starts'
    chk('menu', t1, 28, 1600, True); chk('menu', t2, 21, 1600)
    write('menu', ';\n'.join([half(0, 'before (original site)', 804), half(1, 'after (v14)', 796),
        f"[h0][h1]hstack=inputs=2,pad=1600:{984 + SH}:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-80:fontsize=28:fontcolor=black,"
        f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-38:fontsize=21:fontcolor=0x444444,"
        "setpts=round(N/20/TB),fps=60,tpad=stop_mode=clone:stop_duration=1.0,setsar=1,format=yuv420p[out]"]) + '\n')

# --- full-screen pairs (day5-3x, gE3x, g3x): 1290x2295 halves -> 796x1416 (k = 2 vs the 398x708 GIF halves)
def full(name, pre0, pre1, tlabel, lab0, lab1, footer_lines, tail_hold, post_half, out, src, wins):
    SH = 112
    def half(i, pre, lab, pw):
        return (f"[{i}:v]{pre},crop=1290:2295:0:162,scale=796:1416:flags=lanczos,setsar=1,"
            f"pad={pw}:{1472 + SH}:0:56:color=white,drawtext={F}:text='{lab}':x=16:y=14:fontsize=30:fontcolor=black,"
            f"drawtext={F}:text='%{{eif\\:round({tlabel})\\:d}} ms':x=796-tw-16:y=16:fontsize=26:fontcolor=0x444444" + strip(out, i, *src[i], *wins[i], 796, SH, 0, 1472, f'h{i}x', f'h{i}', post_half))
    if len(footer_lines) == 2:
        t1, t2 = footer_lines
        chk(name, t1, 30, 1600, True); chk(name, t2, 24, 1600)
        foot = (f"pad=1600:{1568 + SH}:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-92:fontsize=30:fontcolor=black,"
                f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-44:fontsize=24:fontcolor=0x444444,setpts=round(N/20/TB),fps=60,")
    else:
        (t2,) = footer_lines
        chk(name, t2, 24, 1600)
        foot = f"pad=1600:{1516 + SH}:0:0:color=white,drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-34:fontsize=24:fontcolor=0x444444,"
    write(name, ';\n'.join([half(0, pre0, lab0, 804), half(1, pre1, lab1, 796),
        f"[h0][h1]hstack=inputs=2,{foot}tpad=stop_mode=clone:stop_duration={tail_hold},setsar=1,format=yuv420p[out]"]) + '\n')

def simpanel(name, sides, crop, tl, foot, red):
    # 3 panels 612x180 device px; native would be 1938 wide -> lanczos to 504x148 (k = 1.05 vs the 480 GIF panels)
    parts = []
    for i, (lab, start, dur) in enumerate(sides):
        pw = 528 if i < 2 else 504
        box = 'drawbox=x=76:y=0:w=2:h=ih:color=red@0.6:t=fill,' if red else ''
        parts.append(f"[{i}:v]trim=start={start}:duration={dur},setpts=(PTS-STARTPTS)/2,crop={crop},scale=504:148:flags=lanczos,setsar=1,fps=60,{box}"
            f"pad={pw}:196:0:48:color=white,drawtext={F}:text='{lab}':x=0:y=13:fontsize=25:fontcolor=0x17221e,"
            f"drawtext={F}:text='%{{eif\\:(t-0.4)*1000/3+{tl}\\:d}} ms':x=504-tw:y=17:fontsize=19:fontcolor=0x50605a[h{i}]")
    chk(name, foot, 17, 1594 - 17)
    parts.append(f"[h0][h1][h2]hstack=inputs=3,pad=iw+34:ih+58:17:17:color=white,drawtext={F}:text='{foot}':x=17:y=h-32:fontsize=17:fontcolor=0x50605a,"
        "tpad=stop_mode=clone:stop_duration=1,setsar=1,format=yuv420p[out]")
    write(name, ';\n'.join(parts) + '\n')

pt(); car(); menu()
grid = lambda n: f'setpts=PTS-STARTPTS,fps=60,trim=end_frame={n},setpts=PTS-STARTPTS'
full('day5', grid(432), grid(432), 't*1000', 'before (original site)', 'after (final build g0.0l)',
     ['From the top of the page - the hero cards move out - the People section fades in',
      f'iPhone 15 Pro Max - Safari - three slow drags - 3x slower ({RATE}) - ms into the clip'], 0.6, '',
     'day5-hero', [(R + '20261009T132512Z-wc-hero-orig.mov', 50.4), (R + '20261009T132633Z-wc-hero-g0l.mov', 95.571)], [('grid', 0, 432)] * 2)
full('end', grid(60), grid(60), '(t-6/60)*1000', 'before (original site)', 'after (final build g0.0l)',
     [f'iPhone 15 Pro Max\\, end of page\\, open push - 3x slower ({RATE}) - ms after the menu moves'], 1.0, ',setpts=round(N/20/TB),fps=60',
     'day7-end', [(R + '20261009T144540Z-wc-end-orig.mov', 183.4483), (R + '20261009T141903Z-wc-end-g0l.mov', 111.9933)], [('grid', 0, 60)] * 2)
full('people', 'trim=start_frame=28:end_frame=113,setpts=PTS-STARTPTS', 'trim=start_frame=29:end_frame=114,setpts=PTS-STARTPTS',
     '(t-6/60)*1000', 'before (g0.0j)', 'after (no reveal fade)',
     [f'iPhone 15 Pro Max\\, same flick - 3x slower ({RATE}) - the reveal\\, ms after flick start'], 1.0, ',setpts=round(N/20/TB),fps=60',
     'day10-people', [(RP + 'fix-scrollcb-g0-pb-V-20261009T064210Z-1791528140392.mov', 52.9), (RP + 'fix-scrollcb-g0-pb-K-20261009T064518Z-1791528432500.mov', 21.86)],
     [('raw', 28, 113), ('raw', 29, 114)])
if False: simpanel('join', [('original site', '0.9470', '3.8000'), ('before · g0.0c', '0.7900', '3.8000'), ('after · g0.0d', '0.8030', '3.8000')],
         '612:180:630:213', 0, 'iOS Simulator (iPhone 15 Pro Max, Safari) · end of the page, the menu starts to open · 3x slower · real ms since the push', False)
if False: simpanel('logo', [('original site', '2.1080', '3.9200'), ('before · g0.0d', '2.0000', '3.9200'), ('after · g0.0e', '1.9880', '3.9200')],
         '612:180:18:213', 200, 'iOS Simulator (iPhone 15 Pro Max, Safari) · end of the page, the menu closes · 3x slower · red line = where the logo rests · ms = real time', True)
for w in widths: print(('OVER ' if w[1] > w[2] - 8 else 'ok   ') + f'{w[0]:7s} text {w[1]:5d} / frame {w[2]:5d}  {w[3]}')

json.dump(WINDOWS, open(f'{G}/windows-cu.json', 'w'), indent=1)
