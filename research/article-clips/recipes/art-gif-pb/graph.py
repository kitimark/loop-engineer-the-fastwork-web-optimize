#!/usr/bin/env python3
# Writes an ffmpeg filtergraph for a side-by-side before|after GIF from two phone recordings.
# usage: graph.py out.txt SA SB N FPS_OUT HOLD_S "left label" "right label" "footer" [CROP_TOP CROP_H] [PRE_FRAMES]
# SA/SB: 0-based frame index (after the input's -ss) of the clip's first frame; N frames each;
# PRE_FRAMES: frames before the flick start (timer 0 = the clip's frame PRE).
import sys
out, sa, sb, n, fps, hold, la, lb, foot = sys.argv[1:10]
crop_top = int(sys.argv[10]) if len(sys.argv) > 10 else 162
crop_h = int(sys.argv[11]) if len(sys.argv) > 11 else 2295
pre = int(sys.argv[12]) if len(sys.argv) > 12 else 12
CFR = len(sys.argv) > 13 and sys.argv[13] == 'cfr'
sa, sb, n, fps, hold =int(sa), int(sb), int(n), int(fps), float(hold)
HW, HH, HEAD, FOOT, GAP = 398, round(crop_h * 398 / 1290), 28, 22, 4
FONT = '/System/Library/Fonts/Helvetica.ttc'
def esc(s):
    return s.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'").replace(',', '\\,')
def half(i, start, label, padr):
    # timer: ms since the flick start, from the phone frame's own timestamp (t after trim + setpts=PTS-STARTPTS)
    # CFR mode (argv[13] == 'cfr'): the input is cut by -ss at the clip start; frames go onto a 60 Hz grid by their
    # own timestamps (a frame the recorder did not deliver shows as a repeat of the previous one), then N grid slots
    head = (f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=end_frame={n},setpts=PTS-STARTPTS," if CFR else
            f"[{i}:v]trim=start_frame={start}:end_frame={start + n},setpts=PTS-STARTPTS,")
    return (head +
            f"crop=1290:{crop_h}:0:{crop_top},scale={HW}:{HH}:flags=lanczos,setsar=1,"
            f"pad={HW + padr}:{HH + HEAD}:0:{HEAD}:color=white,"
            f"drawtext=fontfile={FONT}:text='{esc(label)}':x=8:y=7:fontsize=15:fontcolor=black,"
            f"drawtext=fontfile={FONT}:text='%{{eif\\:round((t-{pre}/60)*1000)\\:d}} ms':x={HW}-tw-8:y=8:fontsize=13:fontcolor=0x444444,"
            f"setpts=N/{fps}/TB,fps={fps}[h{i}]")
g = [half(0, sa, la, GAP), half(1, sb, lb, 0)]
W = HW * 2 + GAP
g.append(f"[h0][h1]hstack=inputs=2,pad={W}:{HH + HEAD + FOOT}:0:0:color=white,"
         f"drawtext=fontfile={FONT}:text='{esc(foot)}':x=(w-tw)/2:y=h-17:fontsize=12:fontcolor=0x444444,"
         f"tpad=stop_mode=clone:stop_duration={hold},split[s0][s1];"
         f"[s0]palettegen=max_colors={128 if fps == 50 else 256}:stats_mode=diff[p];"
         f"[s1][p]paletteuse=dither=bayer:bayer_scale={5 if fps == 50 else 3}:diff_mode=rectangle")
open(out, 'w').write(';\n'.join(g) + '\n')
print('size', W, 'x', HH + HEAD + FOOT)
