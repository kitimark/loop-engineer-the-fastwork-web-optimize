import sys
sys.path.insert(0, '.')
import strips
def rows(f, W):
    b = open(f, 'rb').read(); return [b[i:i + W] for i in range(0, len(b), 2 * W)]
def pos(r):
    m = max(r); xs = [x for x in range(len(r)) if r[x] >= 235]
    return sum(xs) / len(xs) if xs else None
def check(name, f, W, PW, expf):
    R = rows(f, W); e = []
    for i, r in enumerate(R):
        x = pos(r)
        if x is None: continue
        e.append(abs(x - expf(i)))
    print(f'{name}: {len(R)} frames, playhead |x err| max {max(e):.1f} px, median {sorted(e)[len(e)//2]:.1f} px')
check('middle-60fps', 'ph-middle.raw', 644, 3, lambda i: min(i / 60 / 2.2, 1) * 642 + 1)
check('hero-worst 3x', 'ph-hero3x.raw', 644, 3, lambda i: min(i / 60 / 3 / 2.8, 1) * 642 + 1)
check('day8-menu-60fps', 'ph-menu60.raw', 644, 3, lambda i: min((i % 264) / 60 / 4.4, 1) * 642 + 1)
mov = '.claude/worktrees/agent-ac97cdb0aa8f3a8b2/out/iphone-screen/fix-scrollcb-g0-pb-V-20261009T064210Z-1791528140392.mov'
ts = strips.movie_times(mov); after = [t for t in ts if t >= 52.9 - 1e-9]; D = after[113] - after[28]
check('day10-people 3x (raw frames)', 'ph-people3x.raw', 796, 3, lambda i: min((after[28 + min(i // 3, 84)] - after[28]) / D, 1) * 793 + 1)
