#!/usr/bin/env python3
# Privacy check: is Safari's address bar text anywhere in the GIF crop?
# (a) every source frame used (430-wide exports): best template match (expanded and compact address text, several
#     scales) over the whole frame -> its row; and the best match inside the crop rows (54..819 at 430 wide).
# (b) every GIF frame: best match of the same templates (scaled to the GIF's 398 px halves) anywhere in each half.
# Templates are cut in memory from two reference frames and never written to disk.
# usage: barcheck.py <workdir> <ref_expanded.png> <ref_compact.png> <crop_top_430> <crop_bot_430> <arm:first:last>... -- <gif>...
import sys, numpy as np
from PIL import Image, ImageSequence
args = sys.argv[1:]
wd, ref_e, ref_c, ct, cb = args[:5]; ct, cb = int(ct), int(cb)
k = args.index('--'); specs, gifs = args[5:k], args[k + 1:]
L = lambda im: np.asarray(im.convert('L'), dtype=np.float32)
def text_box(a, y0, y1):
    rows = [y for y in range(y0, y1) if (a[y, 100:330] < 120).sum() > 3]
    cols = [x for x in range(100, 330) if (a[rows[0]:rows[-1] + 1, x] < 120).sum() > 0]
    return rows[0] - 2, rows[-1] + 3, cols[0] - 2, cols[-1] + 3
tpls = []
for ref, (y0, y1) in ((ref_e, (850, 895)), (ref_c, (885, 925))):
    a = L(Image.open(f'{wd}/{ref}'))
    r0, r1, c0, c1 = text_box(a, y0, y1)
    tpls.append((ref, a[r0:r1, c0:c1], r0, c0))
    print(f'template {ref}: rows {r0}-{r1} cols {c0}-{c1} (430-wide frame)')
def ncc_best(a, t, x_lo=None, x_hi=None):
    # normalized cross-correlation over every valid position (FFT + integral images); returns (best score, its row)
    a = a.astype(np.float64); t = t.astype(np.float64)
    H, W = a.shape; h, w = t.shape
    if H < h or W < w: return (-1, None)
    tz = t - t.mean(); tn = np.sqrt((tz ** 2).sum()) + 1e-6
    num = np.fft.irfft2(np.fft.rfft2(a) * np.conj(np.fft.rfft2(tz, s=a.shape)), s=a.shape)[:H - h + 1, :W - w + 1]
    I1 = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0))); I2 = np.pad((a * a).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    box = lambda I: I[h:, w:] - I[:-h, w:] - I[h:, :-w] + I[:-h, :-w]
    S1, S2 = box(I1), box(I2); n = h * w
    var = np.maximum(S2 - S1 * S1 / n, 0)
    s = num / (np.sqrt(var) * tn + 1e-6)
    s[var < 25 * n] = 0  # flat windows (no texture) cannot hold text
    i = np.unravel_index(np.argmax(s), s.shape)
    return float(s[i]), int(i[0])
def scaled(t, f):
    im = Image.fromarray(t.astype(np.uint8)); return L(im.resize((max(4, round(im.width * f)), max(4, round(im.height * f))), Image.BILINEAR))
SC = [0.7, 0.8, 0.9, 1.0, 1.1]
worst_in_crop, bar_rows = -1, []
for sp in specs:
    arm, f0, f1 = sp.split(':')
    for n in range(int(f0), int(f1) + 1):
        a = L(Image.open(f'{wd}/{arm}/f_{n:04d}.png'))
        full_best, crop_best = (-1, None), -1
        for _, t, r0, c0 in tpls:
            for f in SC:
                ts = scaled(t, f)
                s, y = ncc_best(a, ts, c0 - 60, c0 + 60)
                if s > full_best[0]: full_best = (s, y)
                s2, _ = ncc_best(a[ct:cb + 1], ts, c0 - 60, c0 + 60)
                crop_best = max(crop_best, s2)
        bar_rows.append((arm, n, full_best[0], full_best[1]))
        worst_in_crop = max(worst_in_crop, crop_best)
ok = [r for r in bar_rows if r[2] >= 0.6]
print(f'(a) source frames checked: {len(bar_rows)}; address text found (NCC>=0.6) in {len(ok)}, its top row min {min(r[3] for r in ok) if ok else None} (crop ends at row {cb});'
      f' lowest full-frame best score {min(r[2] for r in bar_rows):.2f}; median of the found matches {float(np.median([r[2] for r in ok])) if ok else 0:.2f};'
      f' rows of all best matches {min(r[3] for r in bar_rows)}-{max(r[3] for r in bar_rows)}; best score inside the crop rows {worst_in_crop:.2f}')
low = [r for r in bar_rows if r[2] < 0.6]
if low: print('    frames where the text was not found confidently (bar moving/scaling):', [(r[0], r[1], round(r[2], 2), r[3]) for r in low][:20])
for g in gifs:
    im = Image.open(g); worst, nfr = -1, 0
    for fr in ImageSequence.Iterator(im):
        a = L(fr.convert('RGB')); nfr += 1
        for x0 in (0, 402):
            half = a[:, x0:x0 + 398]
            for _, t, r0, c0 in tpls:
                for f in SC:
                    ts = scaled(t, f * 398 / 430)
                    s, _ = ncc_best(half, ts, int(c0 * 398 / 430) - 60, int(c0 * 398 / 430) + 60)
                    worst = max(worst, s)
    print(f'(b) {g.split("/")[-1]}: {nfr} frames x 2 halves, best address-text match anywhere {worst:.2f}')
