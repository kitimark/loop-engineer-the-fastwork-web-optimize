# window pacing from frames.json: for each (run, ss, mode, a, b): raw mode = raw frames a..b after ss; grid mode = 60 Hz grid frames 0..b
import json, sys
W='.claude/worktrees/'
J=[
 ('day10-people A','agent-ac97cdb0aa8f3a8b2/out/iphone-screen/fix-scrollcb-g0-pb-V-20261009T064210Z-1791528140392',52.9,'raw',22,178),
 ('day10-people B','agent-ac97cdb0aa8f3a8b2/out/iphone-screen/fix-scrollcb-g0-pb-K-20261009T064518Z-1791528432500',21.86,'raw',23,179),
 ('people-wc A','agent-a4147eb3c10989361/out/iphone-screen/20261009T134759Z-wc-people-orig',25.0,'raw',71,227),
 ('people-wc B','agent-a4147eb3c10989361/out/iphone-screen/20261009T134853Z-wc-people-g0l',8.28,'raw',73,229),
 ('middle A','agent-a4147eb3c10989361/out/iphone-screen/20261009T135711Z-wc-middle-orig',84.09,'raw',10,142),
 ('middle B','agent-a4147eb3c10989361/out/iphone-screen/20261009T135904Z-wc-middle-g0l',15.98,'raw',23,155),
 ('end A','agent-a4147eb3c10989361/out/iphone-screen/20261009T144540Z-wc-end-orig',183.3483,'grid',0,102),
 ('end B','agent-a4147eb3c10989361/out/iphone-screen/20261009T141903Z-wc-end-g0l',111.8933,'grid',0,102),
 ('open4 A','agent-a4147eb3c10989361/out/iphone-screen/20261009T144540Z-wc-end-orig',183.348,'grid',0,80),
 ('open4 B','agent-a4147eb3c10989361/out/iphone-screen/20261009T141903Z-wc-end-g0l',111.893,'grid',0,80),
 ('day5 A','agent-a4147eb3c10989361/out/iphone-screen/20261009T132512Z-wc-hero-orig',50.4,'grid',0,432),
 ('day5 B','agent-a4147eb3c10989361/out/iphone-screen/20261009T132633Z-wc-hero-g0l',95.571,'grid',0,432),
 ('car A','agent-a4147eb3c10989361/out/iphone-screen/20261010T042754Z-ar-carousel-orig',36.9,'grid',0,252),
 ('car B','agent-a4147eb3c10989361/out/iphone-screen/20261010T042903Z-ar-carousel-g0m',20.44,'grid',0,252),
 ('pt A','agent-a4147eb3c10989361/out/iphone-screen/20261010T071845Z-ar-ptitle-orig',49.53,'grid',0,240),
 ('pt B','agent-a4147eb3c10989361/out/iphone-screen/20261010T071753Z-ar-ptitle-g0m',26.02,'grid',0,240),
 ('menu1 A','agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig',80.4,'grid',0,264),
 ('menu1 B','agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14',76.68,'grid',0,264),
 ('menu2 A','agent-a4147eb3c10989361/out/iphone-screen/20261010T041207Z-ar-menu-orig',88.01,'grid',0,264),
 ('menu2 B','agent-a4147eb3c10989361/out/iphone-screen/20261010T041016Z-ar-menu-v14',84.17,'grid',0,264),
]
for name, run, ss, mode, a, b in J:
    fr=json.load(open(W+run+'.frames.json'))['frames']
    p0=fr[0][0]; ts=[f[0]-p0 for f in fr]
    after=[t for t in ts if t>=ss-1e-6]
    if mode=='raw':
        win=after[a:b+1]
        t0=win[0]; span=win[-1]-t0
        g=[(y-x)*1000 for x,y in zip(win,win[1:])]
        print(f'{name:16s} raw {a}-{b}: movie t {t0:.4f}..{win[-1]:.4f} span {span*1000:.1f} ms = {span*60:.2f} grid frames; gaps>20ms {[round(x,1) for x in g if x>20]}; <13ms {[round(x,1) for x in g if x<13]}')
    else:
        t0=after[0]; win=[t for t in after if t < t0+b/60]
        g=[(y-x)*1000 for x,y in zip(win,win[1:])]
        print(f'{name:16s} grid {b}: first t {t0:.4f}, raw frames in window {len(win)}; gaps>20ms {[round(x,1) for x in g if x>20]}')
