# CPU-throttle calibration: Chrome 1×/4×/6×/20× vs a real iPhone 15 Pro Max

**Question.** When fastwork.com's scroll animations are tested in desktop Chrome with CPU throttling, which rate reproduces what an iPhone user sees?

**Setup.** The same tools were used on both sides:

- A CPU microbenchmark: [`tools/cpu_bench.js`](tools/cpu_bench.js), sha256 prefix `9ad70feb206b9ccf`.
- The same scripted scroll:
  1. Wait 8 s after load.
  2. Record 3 s idle.
  3. Call `scrollBy({top: 250, behavior: 'smooth'})` every 300 ms until the bottom.
  4. Record 3 s at the bottom.
- A `requestAnimationFrame` frame logger injected into the page.

**Devices and runs.**

- Chrome 154 on an M1 Pro Mac (120 Hz), 3 cold runs per configuration.
- iPhone 15 Pro Max, iOS 26.6.1 Safari (page rendering capped at 60 Hz), 3 runs.

The full reports are:

- [`chrome-sweep.md`](chrome-sweep.md): the sweep, bench curve, DevTools calibration, traces and script attribution.
- [`iphone.md`](iphone.md): the iPhone bench, scripted scroll and comparison with finger scrolling.

## Answer: two different "equivalent rates"

| What you want to match | Equivalent Chrome rate on this Mac | Evidence |
|---|---|---|
| **Raw main-thread CPU speed** | **≈ 1× (0.8–1.6× per sub-bench)** | `cpu_bench.js` total: iPhone 261 ms, Mac Chrome 1× 255 ms. |
| **Scroll jank on this page, scripted scroll** | **≈ 6× (between 4× and 6×, closer to 6×)** | Long-frame counts match best at 6×; see the table below. |
| **Scroll jank with a real finger** | **> 6×, probably** (not measured) | Finger scrolling drops about 2× more frames than scripted scrolling on the iPhone: 24–30% vs 13.6%, worst frame 232 ms. |
| DevTools "Mid-tier mobile" preset | 2.8× | Calibrated for a Pixel 5-class device. |
| DevTools "Low-tier mobile" preset | 10.3–10.8× | Calibrated for a Moto G4-class device. |

**The iPhone is not slow at JavaScript.** Its CPU is about as fast as this Mac. The page still janks on it because of three things:

1. **Different engine costs.**
   - WebKit is slower at custom-property style recalculation and node creation.
   - On the fastwork page, `style_recalc_var` takes 2.2× longer than on a blank page, because the page's own every-frame animations compete with it.
2. **60 Hz rendering.** Every miss costs a full 16.7 ms frame.
3. **Touch-only code paths** during a real finger scroll:
   - the non-passive `touchmove` scroll-jack,
   - the `resize` storm when the Safari toolbar collapses.

So **use Chrome 6× (mobile viewport) to reproduce iPhone jank on this page**. Don't treat that as "the iPhone is 6× slower".

## Jank comparison (scroll phase, mean of 3 runs)

Reproduce with `python3 tools/calibrate_jank.py` (output in `data/jank-calibration.json`).

| Config | dropped %* | frames >34 ms | >50 ms | >100 ms | worst | distance to iPhone** |
|---|---|---|---|---|---|---|
| **iPhone 15 Pro Max Safari** | 13.6 | **15.7** | **5.7** | **0.7** | **104** | 0 |
| Chrome mobile 1× | 0.2 | 0.0 | 0.0 | 0.0 | 16 | 0.76 |
| Chrome mobile 4× | 27.3 | 3.3 | 0.7 | 0.0 | 52 | 0.60 |
| **Chrome mobile 6×** | 55.8 | 12.3 | 5.0 | 0.3 | 89 | **0.17** |
| Chrome mobile 20× | 92.1 | 108.3 | 97.7 | 52.3 | 428 | 13.18 |
| Chrome desktop 1× | 1.1 | 0.3 | 0.0 | 0.0 | 31 | 0.72 |
| Chrome desktop 4× | 25.6 | 4.3 | 1.0 | 0.0 | 56 | 0.56 |
| **Chrome desktop 6×** | 52.5 | 18.3 | 9.3 | 0.7 | 100 | **0.18** |
| Chrome desktop 20× | 92.4 | 169.0 | 157.0 | 86.0 | 525 | 21.48 |

\* **Dropped %** counts missed vsyncs at each device's own refresh period: 16.7 ms on the iPhone, 8.3 ms on Chrome. A 120 Hz display punishes small slips that a 60 Hz one hides, so this column is **not** comparable across devices. Use the absolute long-frame counts instead.
\*\* **Distance** is the mean relative difference in (>34, >50, >100, worst), with +1 smoothing. Lower is a closer match.

## Other key facts

- **Chrome's throttle is super-linear for DOM work.** On `cpu_bench.js`, nominal 4× costs 5.0×, 6× costs 7.8× and 20× costs 30.9×. Layout thrash and allocation are hit hardest.
- **CPU throttling does not slow the GPU process.** GPU main-thread busy time stays at about 17–24% at every rate. The renderer main thread saturates instead: 30% busy at 1×, 93% at 4×, 97% at 6× and 99% at 20× while scrolling.
- **Same culprits at every rate.** The top scripts are the scroll-linked rAF handlers in `nodes/2.DyWL8TcE.js`:
  - `iE` @75155 (the dispatcher)
  - `f` @296345
  - `l` @302796
  - `s` @135943
  - `a` @87539

  Most of their cost is forced style and layout. Style recalculation (`UpdateLayoutTree`) is the largest main-thread cost.
- **Correction to [01-initial-investigation](../01-initial-investigation/README.md).** The first desktop 4× run showed 38–54 fps with 1.3–1.5 s GPU stalls. **That did not reproduce.** Every later 4× run (the sweep, re-runs with the original tool and profile, and the mirror agent's live runs) gave 87–96 fps with 0–3 frames over 50 ms. The GPU stalls were most likely host contention at that moment, not something the page does.

## Caveats

- **The rAF logger measures main-thread frames.** Native scrolling, especially on iOS, can stay smooth while the effects driven by the main thread stutter.
- **The logger itself forces layout.** It reads `scrollY` every frame; the logger is the same on both devices.
- **Host load.** The Mac had background load (other Chrome instances, load average 7–16), but run-to-run spread was small.
- **The iPhone page is short.** It is 5,260 px, so about 350 scroll frames per run and few frames over 100 ms.
- **Scripted scroll misses touch-only behaviour.** It doesn't trigger the touch scroll-jack or the toolbar-collapse `resize` events. Matching finger-scroll jank in Chrome needs CDP touch input (`Input.dispatchTouchEvent` / `Input.synthesizeScrollGesture`), which is a next step.

## Next steps

1. **Replay touch gestures in Chrome.** Use `Input.synthesizeScrollGesture` with touch source and add it to `chrome_scroll.mjs`, so the scroll-jack and pointer handlers run. Then recalibrate against the finger-scroll data in `data/iphone/finger_scroll1.json`.
2. **Place the iPhone on DevTools' scale.** Run `tools/lh_benchmark_index.js` on the iPhone and pass the result to `tools/bench_to_rate.py --lhbi`.
3. **Use Chrome mobile 6× as the fast local loop** on the local mirror (`tools/serve.mjs`, `tools/verify.mjs`) to A/B the fixes. Confirm each winner on the real iPhone.
