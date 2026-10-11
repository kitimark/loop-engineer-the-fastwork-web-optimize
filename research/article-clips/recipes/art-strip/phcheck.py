# playhead position per output frame (brightest column in the strip's label row) vs expected
import sys
f, W, D, slow, pw = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5])
b0 = open(f, "rb").read(); b = b"".join(b0[i:i + W] for i in range(0, len(b0), 2 * W)); n = len(b) // W
errs = []
for i in range(n):
    row = b[i * W:(i + 1) * W]
    m = max(row)
    if m < 200: continue
    xs = [x for x in range(W) if row[x] >= m - 10]
    xc = sum(xs) / len(xs)
    t_real = i / 60 / slow
    exp = min(max(t_real / D, 0), 1) * (W - pw) + pw / 2 - 0.5
    errs.append((i, xc, exp))
d = [abs(a - e) for _, a, e in errs]
px_per_frame = (W - pw) / (D * 60)
print(f, 'frames', n, 'with playhead', len(errs), 'max |x err| px', round(max(d), 1), 'median', round(sorted(d)[len(d)//2], 1), 'px per 60 Hz frame', round(px_per_frame, 2))
