# Chrome CPU-throttle sweep: fastwork.com homepage (Mac side of the calibration)

Date: 2026-10-01. Host: Apple M1 Pro (8 cores, 16 GB), macOS 26.2 (Darwin 25.2), Google Chrome 154.0.8037.58, 120 Hz built-in display.
Target: `https://fastwork.com/` (public homepage). All probing was read-only. We are not affiliated with the site.
The iPhone side (iPhone 15 Pro Max, same benchmark and same scripted scroll) is in `iphone.md` / `data/iphone/`, which the sibling agent owns.

## TL;DR

* **CPU throttling in Chrome only slows the renderer main thread, and it slows it more than the nominal rate.** On `cpu_bench.js`, rate 4 costs 5.0x, rate 6 costs 7.8x and rate 20 costs 30.9x. DOM, style and allocation work is the most superlinear; plain JS arithmetic is close to linear (4.4x at rate 4). The Lighthouse BenchmarkIndex, which DevTools calibration uses, is close to linear (4.3x at rate 4, 22x at rate 20).
* **Scroll smoothness by rate:** at 1x and 4x the page scrolls well (119 / 89 fps on desktop, about 1 frame >50 ms). At 6x it drops to 57 fps with about 9 frames >50 ms per pass. At 20x it collapses to 9 fps with about 157 frames >50 ms and a worst frame of about 0.5 s. Mobile emulation (430x932 @3x) behaves the same way, with slightly lower counts because the page is shorter (5.3k px vs 8.4k px).
* **The GPU-process stalls seen earlier do not scale with CPU throttle.** In four new traces (1x, 4x, 6x, 20x):
  * the longest GPU-main task stays at 26–33 ms;
  * `FinishPaintRenderPass` stays ≤ 4 ms;
  * `DoEndRasterCHROMIUM::Flush` stays ≤ 29 ms.

  The 215–730 ms GPU stalls in the earlier single 4x run did not reproduce, even with the *previous tool and its warm profile* (A/B below: 93 fps and 0–3 frames >50 ms). They were a transient condition on the host at that time (most likely GPU or WindowServer contention from other processes), not an effect of throttling.
* **Main-thread work is what scales.** While scrolling, the main thread is busy 30% of the time at 1x, 93% at 4x, 97% at 6x and 99% at 20x. The largest costs are `UpdateLayoutTree`, script and layout. LoAF attribution points at the page's **scroll-linked rAF handlers** in `nodes/2.DyWL8TcE.js`. Each frame they read `getBoundingClientRect()` and then write CSS custom properties or transforms, so most of their time is *forced style/layout*.
* **DevTools calibrated presets on this Mac:** I reproduced the Chrome 134+ algorithm exactly (3 runs). Host BenchmarkIndex is about 2,860–2,940. **Low-tier mobile = 10.3–10.8x** and **mid-tier mobile = 2.77–2.86x**.
* **Preliminary mapping to the iPhone** (from the sibling's `data/iphone/bench.json`, same `cpu_bench.js`, sha256 prefix `9ad70feb206b9ccf`): the iPhone 15 Pro Max total is 262 ms vs 255 ms for this Mac at 1x, so it is **equivalent to about 1.0x** (per sub-benchmark 0.8x–1.6x). By this measure, even "4x" on this Mac is 4–5x slower than an iPhone 15 Pro Max.

## Method

### Tools (all in `tools/`)

| file | what it does |
|---|---|
| `chrome_scroll.mjs` | Raw CDP over Node 24 WebSocket, no deps. Launches its **own** Chrome on `--port` (default **9335**) and refuses to start if the port is already in use, so it never attaches to another Chrome. Each run uses a **fresh temporary profile** (cold HTTP cache, no cookies or storage), which is deleted after `Browser.close`. Flags: `--viewport desktop\|mobile --rate N --runs N --out PREFIX --scroll-cap-ms --trace --trace-dir --no-frames`, plus `--bench --rates` mode. Computes per-phase metrics, top LoAF scripts and per-section jank in the tool. |
| `cpu_bench.js` | Deterministic main-thread microbenchmark, shared verbatim with the iPhone agent. The file is one expression that evaluates to a Promise of JSON. |
| `lh_benchmark_index.js` | Lighthouse BenchmarkIndex, copied verbatim from DevTools' `CalibrationController.ts`. It can also run on the iPhone to give a second mapping. |
| `devtools_calibrate.mjs` | Headless re-implementation of DevTools "Calibrate CPU throttling", plus a BenchmarkIndex(rate) curve. |
| `trace_summary.py` | Streams a trace (one event per line, as written by `chrome_scroll.mjs`) and summarizes per thread and phase: busy %, long tasks, self time and a watch list of GPU/raster names. |
| `chrome_tables.py` | Builds the markdown tables below from `data/chrome/*.json`. |
| `bench_to_rate.py` | Maps a device's `cpu_bench.js` result (and optionally a BenchmarkIndex score) to the equivalent Chrome rate by log-log interpolation. |
| `run_chrome_sweep.sh` | The exact sequential sweep that produced this data. |

### Viewports

* **desktop:** 1440x900, DPR 1, `mobile:false`.
* **mobile:** 430x932, DPR 3, `mobile:true`, touch emulation, iPhone Safari UA (`iPhone OS 18_0 … Version/18.0 Mobile/15E148 Safari/604.1`).

Window size is 1500x1000. Chrome runs with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`, so rAF keeps running when other windows overlap it. It also runs with `--disable-extensions --disable-sync --disable-background-networking --disable-component-update`.

### Scroll script

This is kept identical to the iPhone side:

1. Navigate, wait for the `load` event, then wait **8 s**.
2. Clear the logs. **3 s idle.**
3. Every **300 ms**, call `window.scrollBy({top:250, behavior:'smooth'})` until `scrollY >= maxY-5`. `maxY = scrollHeight - innerHeight` is measured at the start of the scroll. There is a 60 s cap, which was never hit.
4. **3 s at the bottom.**

A rAF loop logs `[t, dt, scrollY]` for every frame. A `PerformanceObserver` logs `long-animation-frame` entries with scripts: invoker, source URL, function name, `sourceCharPosition`, duration and `forcedStyleAndLayoutDuration`. Both are injected with `Page.addScriptToEvaluateOnNewDocument`. The script also calls `performance.mark('phase:*')` so traces can be split by phase.

### Metrics per phase

Metrics are computed in `chrome_scroll.mjs` for the idle, scroll and bottom phases:

* fps (frames / phase duration);
* median, p95, p99 and max frame interval;
* counts of frames >20, >34, >50 and >100 ms;
* **smooth %** = frames ≤ 20 ms (meets a 60 Hz budget with tolerance);
* **jank ms** = Σ max(0, dt − 16.7);
* LoAF count, total duration, total `blockingDuration` and style+layout time;
* top LoAF scripts, aggregated by (sourceURL, function, sourceCharPosition, invokerType) with total and forced style/layout.

**Per-section jank:** each scroll-phase frame and LoAF is assigned to the innermost `section`/`footer` whose box contains `scrollY + innerHeight/2`. Section offsets are measured at the bottom of the page. Sections are labelled by id, first heading or class.

### Sweep and bench

* **Sweep:** rates 1, 4, 6 and 20 × {desktop, mobile} × 3 runs. Runs are strictly sequential, with a new Chrome for every run. The 20x runs finished in about 13–21 s of scroll (no cap needed), about 45 s per run in total.
* **Bench curve:** `cpu_bench.js` on a blank **standards-mode** `data:` page (`<!doctype html>…`) at rates 1, 2, 4, 6, 10 and 20 × 3 runs, each run in a fresh Chrome. Throttling is applied after load; the result is the median of 5 reps after 1 warm-up.

## Results: scroll phase (mean ± sd over 3 runs)

| viewport | rate | fps | median ms | p95 ms | p99 ms | max ms | >34 | >50 | >100 | smooth % | jank ms | LoAF n | LoAF ms | LoAF blocking ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | 1x | 118.7 ± 0.6 | 8.3 | 10.1 ± 0.1 | 12.1 ± 3.1 | 31 ± 9 | 0 ± 1 | 0 | 0 | 99.9 | 23 ± 19 | 0 | 0 | 0 |
| desktop | 4x | 89.3 ± 0.5 | 8.7 | 18.1 ± 0.1 | 30.7 ± 3.5 | 56 ± 13 | 4 ± 2 | 1 ± 1 | 0 | 96.5 | 501 ± 30 | 0 ± 1 | 20 ± 35 | 0 |
| desktop | 6x | 57.0 ± 1.4 | 16.7 | 32.9 ± 0.4 | 55.4 ± 5.0 | 100 ± 16 | 18 ± 2 | 9 ± 3 | 1 ± 1 | 73.3 ± 1.8 | 2225 ± 127 | 5 ± 1 | 358 ± 91 | 50 ± 12 |
| desktop | 20x | 9.1 ± 0.7 | 94.3 ± 8.7 | 250.7 ± 22.8 | 441.2 ± 36.5 | 525 ± 38 | 169 ± 4 | 157 ± 4 | 86 ± 1 | 4.0 ± 3.6 | 17565 ± 720 | 134 ± 8 | 14873 ± 834 | 6166 ± 440 |
| mobile | 1x | 119.8 ± 0.1 | 8.3 | 10.0 | 10.3 ± 0.1 | 16 ± 2 | 0 | 0 | 0 | 100.0 | 1 ± 1 | 0 | 0 | 0 |
| mobile | 4x | 87.2 ± 1.2 | 8.6 | 17.5 ± 0.1 | 28.2 ± 4.3 | 52 ± 5 | 3 ± 1 | 1 ± 1 | 0 | 96.5 ± 0.3 | 288 ± 29 | 0 ± 1 | 17 ± 30 | 0 |
| mobile | 6x | 53.1 ± 0.8 | 16.7 | 33.5 ± 0.2 | 52.4 ± 4.7 | 89 ± 10 | 12 ± 2 | 5 ± 2 | 0 ± 1 | 67.9 ± 2.3 | 1532 ± 96 | 2 ± 1 | 164 ± 37 | 21 ± 7 |
| mobile | 20x | 9.5 ± 0.2 | 94.3 ± 4.3 | 244.4 ± 5.0 | 363.5 ± 46.3 | 428 ± 44 | 108 ± 2 | 98 ± 4 | 52 ± 2 | 4.7 ± 2.9 | 10688 ± 214 | 85 ± 4 | 9048 ± 417 | 3647 ± 238 |

### Scroll length and time

* **Desktop:** 35 scroll steps; the scroll phase takes about 10.5–11.5 s up to 6x and about 20–21 s at 20x (40–43 steps).
* **Mobile:** 22 steps; about 6.6–7.3 s up to 6x and about 12.4–12.9 s at 20x (25–26 steps). Page height is 5,345 px.
* **Load:** the load event fired after 2.1–4.7 s up to 6x and after 5.0–13.6 s at 20x (cold cache).

### Idle and bottom phases

Up to 6x both phases stay at about 120 fps with 0 frames >50 ms. At 20x:

* **idle:** desktop 34 fps (27% smooth, about 5 LoAFs); mobile 41 fps;
* **bottom:** desktop 43 fps; mobile 44 fps.

Even when idle, the page does per-frame main-thread work. Traced main-thread busy while idle is 14% at 1x, 58% at 4x, 84% at 6x and 98% at 20x. Part of that is the measurement rAF loop itself (see Caveats). Full idle and bottom tables are in `data/chrome/scroll-*.summary.json` (`aggregate.idle` / `aggregate.bottom`).

The previous single-run numbers (desktop 4x: 38–54 fps, 20–33 frames >50 ms, worst about 1.3–1.5 s) are **not** representative; see the A/B test below.

### Per-section jank (scroll phase, frames >50 ms summed over 3 runs)

| section (by viewport centre) | desk 6x | desk 20x | mob 6x | mob 20x |
|---|---|---|---|---|
| hero "Show the world what … can do" | 7 | 67 (max 307 ms) | 1 | 18 |
| `people` (mobile only) | – | – | 6 | 24 (max 469 ms) |
| `profile-showcase` | 6 | 120 (max 391) | 0 | 25 |
| "Freelancing is hard enough…" | 7 (max 116) | 76 (max 416) | 3 | 48 |
| Services | 1 | 24 (max 484) | 0 | 25 |
| "Other platforms keep taking fee…" | 3 | 53 | 5 | 59 (max 417) |
| `platform` (to footer) | 4 (max 108) | 131 (max 559) | 0 | 94 |

Jank is spread across the whole page, not concentrated in one section. That fits a per-frame scroll-handler cost rather than one expensive section. At 4x the only frames >50 ms (1 per run) fall in `platform` / "Other platforms…".

### Top LoAF script attributions

Values are summed over 3 runs. Positions refer to `/_app/immutable/nodes/2.DyWL8TcE.js`, which is also mirrored locally at `site/_app/immutable/nodes/2.DyWL8TcE.js`.

| script @ sourceCharPosition | invoker | what the code is | desk 20x total / forced | mob 20x total / forced |
|---|---|---|---|---|
| `iE` @75155 | FrameRequestCallback | Shared scroll/resize → rAF dispatcher. Runs every registered scroll callback (`for (e of $T) e.active && e.callback()`). | 8360 / 4707 ms (n=283, max 348) | 4676 / 2084 ms |
| `f` @296345 | FrameRequestCallback | Hero/profession shrink animation: `h.getBoundingClientRect().top`, `v.clientWidth`, then eased writes to transform / custom props. | 6012 / 4550 ms (max 239) | – |
| `l` @302796 | FrameRequestCallback | `.hero-track` progress plus `--future-shrink`: reads `getBoundingClientRect()` and then writes `style.setProperty`. | – | 5934 / 5615 ms |
| `s` @135943 | FrameRequestCallback | `--exit-opacity` from `getBoundingClientRect()`. | 2200 / 2092 ms | – |
| `n` @329561 | FrameRequestCallback | Section progress: `getBoundingClientRect()` then state toggles. | 1906 / 1802 ms | – |
| `a` @87539 | FrameRequestCallback | `--commission-enter-shrink` / `--commission-shrink`: two `getBoundingClientRect()` reads, then writes. | – | 2390 / 1888 ms |
| `/analytics.js` @7999 | IntersectionObserverCallback | Third-party analytics IO callback (no forced layout). | 1898 ms (max 175) | 1578 ms |
| `/gtag/js?id=G-ZHPMJ436RV` | `DOMWindow.onscrollend` | gtag scroll-end listener. | – | 751 / 173 ms (max 188) |
| `(inline)` pos −1 | FrameRequestCallback | **Our own rAF frame logger** (reads `scrollY`, which forces the pending style/layout; see Caveats). | 6114 / 5357 ms | 2939 / 2528 ms |

At 6x the same set appears at about 1/40th the volume. Examples are `nodes/2` @343804, an IntersectionObserver callback with 145 ms total and 67 ms forced; `f` @296345 with 130 ms; and `iE` with 107 ms. The pattern is **read layout → write style in rAF on every scroll frame**. Each frame then pays a forced style recalc and layout, and `UpdateLayoutTree` is the largest self-time item in the traces. `cpu_bench.js` sub-benchmarks (b) and (c) model exactly this.

## `cpu_bench.js` curve: bench_ms(rate) on this Mac

Values are mean ± sd over 3 fresh-Chrome runs of the per-run median of 5.

| rate | total ms | geomean ms | js_numeric | js_alloc | dom_layout_thrash | style_recalc_var | dom_create | total / total@1x |
|---|---|---|---|---|---|---|---|---|
| 1x | 254.7 ± 1.1 | 40.9 ± 0.1 | 25.7 ± 0.2 | 34.6 ± 0.5 | 110.1 ± 1.4 | 66.7 ± 0.3 | 17.6 ± 0.3 | 1.00 |
| 2x | 575.5 ± 22.9 | 93.7 ± 3.1 | 54.8 ± 0.8 | 89.0 ± 5.9 | 241.6 ± 18.2 | 148.8 ± 4.1 | 41.2 ± 2.3 | 2.26 |
| 4x | 1282.4 ± 28.1 | 212.4 ± 3.9 | 112.2 ± 1.2 | 206.8 ± 6.7 | 532.5 ± 15.9 | 322.5 ± 7.7 | 108.4 ± 1.2 | 5.03 |
| 6x | 1987.6 ± 19.7 | 320.4 ± 2.7 | 170.2 ± 0.8 | 322.8 ± 3.7 | 843.4 ± 17.3 | 507.8 ± 3.8 | 143.5 ± 2.2 | 7.80 |
| 10x | 3383.1 ± 162.2 | 536.9 ± 17.6 | 278.7 ± 4.5 | 565.2 ± 45.9 | 1435.9 ± 111.5 | 876.1 ± 19.6 | 227.3 ± 30.0 | 13.28 |
| 20x | 7857.6 ± 106.4 | 1226.1 ± 3.9 | 573.0 ± 3.3 | 1272.1 ± 44.7 | 3601.0 ± 126.2 | 1836.1 ± 30.5 | 575.4 ± 5.1 | 30.85 |

**Slowdown is superlinear in the nominal rate.** Rate r costs about 1.1–1.5 × r in wall time. The effect is strongest for `dom_layout_thrash` (32.7x at 20x) and `js_alloc` (36.8x at 20x) and weakest for `js_numeric` (22.3x at 20x).

The likely reason is the throttling mechanism. On POSIX, a helper thread sends `SIGUSR2` to the main thread about every 200 µs, and the signal handler busy-spins for `(rate−1) × run_time` (run time capped at 1 ms; see [thread_cpu_throttler.cc][tct]). These constant interrupts evict caches and branch-predictor state, which hurts large-working-set DOM, style and GC work more than tight arithmetic loops. The busy-spin also burns a full core, so the renderer shows about 100% CPU while throttled.

**Mapping a device:**

```sh
python3 tools/bench_to_rate.py DEVICE.json [--key quiet] [--lhbi SCORE]
```

This interpolates each sub-benchmark on log(ms) against log(rate).

### Preliminary iPhone 15 Pro Max mapping

Input is `data/iphone/bench.json` (`quiet`, about:blank in standards mode, 5 runs), owned by the sibling agent.

| metric | iPhone ms | Mac 1x ms | iPhone / Mac1x | equivalent Chrome rate |
|---|---|---|---|---|
| js_numeric | 19.4 | 25.7 | 0.75 | 0.77x |
| js_alloc | 25.4 | 34.6 | 0.73 | 0.80x |
| dom_layout_thrash | 85.2 | 110.1 | 0.77 | 0.80x |
| style_recalc_var | 100.8 | 66.7 | 1.51 | 1.43x |
| dom_create | 31.2 | 17.6 | 1.77 | 1.59x |
| **total_ms** | **262.0** | 254.7 | 1.03 | **1.02x** |
| geomean_ms | 42.0 | 40.9 | 1.03 | 1.02x |

Rates below 1 are extrapolated. The iPhone's timer resolution is 1 ms, so `js_numeric` and `js_alloc` are ±1 ms (about ±5%).

Conclusion: on main-thread CPU, an iPhone 15 Pro Max ≈ this M1 Pro with **no throttling**. The ~1x mapping is a JavaScriptCore/WebKit vs V8/Blink comparison, so sub-benchmarks diverge: WebKit is faster on JS and layout and slower on custom-property style recalc and on node creation. For "what an iPhone 15 Pro Max user sees", use rate 1 (at most about 1.5x if the page is dominated by custom-property style recalc, which this page partly is). DevTools' "mid-tier mobile" preset (2.8x here) is a Pixel 5-class Android. It is **not** a recent iPhone.

## DevTools calibrated CPU presets (Chrome 134+)

Chrome 154 includes the DevTools feature. Performance panel → CPU throttling → **Calibrate…** creates "Low-tier mobile" and "Mid-tier mobile" presets that are specific to the machine ([What's new in DevTools 134][dt134]; [Throttling docs][thr]; [blog: grounded in real-world data][grounded]). The result is stored in DevTools settings (`calibrated-cpu-throttling`) and is not available through CDP.

**How it works.** From [`CalibrationController.ts`][cc] at commit `1e16983d`:

1. Navigate to `about:blank` and inject the Lighthouse **BenchmarkIndex** (see below).
2. Run `computeBenchmarkIndex(250 ms)`: 1 warm-up, then a score at rate 1 (`actualScore`).
3. Bisect `Emulation.setCPUThrottlingRate`, up to 8 iterations, stopping when |score − target| < 10, with rates truncated to 0.01:
   * **low** (target **264**, "Moto G4 Power 2022-class"): search in [1, actualScore/264 × 1.5];
   * **mid** (target **1000**, "Pixel 5-class"): search in [r − r/4, r + r/4], where r = low / (1000/264).
4. If the host scores below 1000, mid is reported as `DEVICE_TOO_WEAK`; below 264, both are.

`CPUThrottlingManager.ts` uses the same nominal scores (LOW 264, MID 1000, HIGH 2350, ULTRA 3000) to derive the emulated performance tier. BenchmarkIndex is `(GC-heavy string-building index + array-copy index) / 2`, in iterations per second / 10 ([Lighthouse #9085][lh9085]).

**Reproduced on this Mac** (`tools/devtools_calibrate.mjs`, 3 fresh-Chrome runs, `data/chrome/devtools-calibration.json`):

| run | host BenchmarkIndex (rate 1) | **low-tier mobile** | **mid-tier mobile** |
|---|---|---|---|
| 1 | 2934 | 10.80x | 2.86x |
| 2 | 2939 | 10.32x | 2.77x |
| 3 | 2860 | 10.30x | 2.81x |

BenchmarkIndex against rate (median of 3 per run; the three runs agree within ±2%):

| rate | 1 | 2 | 4 | 6 | 10 | 20 |
|---|---|---|---|---|---|---|
| score | about 3000 | about 1410 | about 705 | about 462 | about 276 | about 136 |

That is close to 1/rate (4.3x at 4x, 22x at 20x). So DevTools' calibrated rates are "fair" for simple JS/GC work. For DOM and style-heavy pages like this one, the same rate costs more (5x at nominal 4x on `cpu_bench.js`).

To place the iPhone on this scale too, run `tools/lh_benchmark_index.js` in iPhone Safari and pass its median score to `bench_to_rate.py --lhbi`.

## Traces: does throttling affect GPU-process stalls?

Each trace is one desktop run at 1x, 4x, 6x or 20x. Trace categories: `devtools.timeline`, `disabled-by-default-devtools.timeline(.frame)`, `blink.user_timing`, `v8.execute`, `cc`, `gpu`, `viz`, `toplevel`. The raw traces (218–243 MB, 1.1–1.4 M events each) are kept in the scratchpad only. The summaries are `data/chrome/trace-desktop-{1,4,6,20}x.tracesummary.json` (made by `trace_summary.py`), and the scroll-probe metrics for those runs are in `trace-desktop-*x.summary.json`.

### Scroll phase

| rate | scroll phase | **renderer main busy** | main max task | main tasks >50 / >100 ms | main self time: UpdateLayoutTree / script (FunctionCall) / Layout / Paint | **GPU main busy** | GPU max task | FinishPaintRenderPass max | DoEndRasterCHROMIUM::Flush max (total) |
|---|---|---|---|---|---|---|---|---|---|
| 1x | 10.5 s | **29.7%** | 12 ms | 0 / 0 | 806 / 412 / 209 / 216 ms | 24.0% | 26 ms | 2.7 ms | 16.9 ms (432 ms) |
| 4x | 11.0 s | **93.4%** | 39 ms | 0 / 0 | 2701 / 1531 / 681 / 723 ms | 23.7% | 33 ms | 3.0 ms | 17.3 ms (374 ms) |
| 6x | 11.4 s | **97.4%** | 68 ms | 3 / 0 | 2951 / 1554 / 803 / 755 ms | 22.4% | 29 ms | 3.9 ms | 28.5 ms (359 ms) |
| 20x | 20.3 s | **98.7%** | 346 ms | 152 / 54 | 5609 / 3554 / 1106 / 1089 ms | 17.0% | 27 ms | 3.0 ms | 27.2 ms (330 ms) |
| *earlier run, 4x (whole trace)* | – | – | 84 ms | – | – | – | **729 ms** | **511 ms** (11 >50 ms) | **728 ms** (20 >50 ms) |

Other threads, per scroll phase:

* **Renderer compositor thread:** 0.8–1.2 s busy (5–11%); max task ≤ 16 ms at 20x.
* **Viz compositor thread** (GPU process): 0.8–1.5 s; max task ≤ 4.6 ms.
* **Raster/decode workers:** RasterTask ≤ 17 ms; ImageDecodeTask ≤ 59 ms.

### Conclusions

* **GPU-process cost is flat across rates.** About 2.5 s of GPU-main busy per about 11 s of scrolling at 1x–6x, with no tasks >34 ms. This is expected: `Emulation.setCPUThrottlingRate` throttles only the renderer **main thread** (Blink `ThreadCPUThrottler`). The compositor thread, raster workers and the GPU process run at full speed.
* **Main-thread saturation explains the frame-rate collapse.** At 1x the main thread is 30% busy while scrolling and delivers 120 fps. At 4x it is already 93% busy, so frames start to be skipped (89 fps; p95 18 ms). At ≥6x the rAF loop runs at 60 fps or less. At 20x each main frame takes 100–350 ms (`ProxyMain::BeginMainFrame` max 329 ms).

  At 20x the longest tasks are about 50% script (the scroll rAF handlers) and about 50% forced `Layout` / `UpdateLayoutTree`. In the longest task (346 ms), Layout alone takes 154 ms.

  Note what the metric measures: the rAF intervals are *main-thread* frame intervals. The compositor may animate the scroll offset more smoothly than the rAF intervals suggest, but the page's scroll-linked effects (shrink, opacity and progress custom properties) only update at the main-frame rate. So what the user sees for those effects matches the rAF numbers.
* **The earlier 4x run was not a throttling effect.** Its 200–730 ms GPU stalls in `FinishPaintRenderPass` / `DoEndRasterCHROMIUM::Flush` came from something transient on the host at the time.

  **A/B test:** I re-ran the *previous* tool unchanged (warm persistent profile copy, 8 s after navigate, no anti-occlusion flags) at 4x. It gave **93.5 and 92.8 fps, 3 and 0 frames >50 ms, max 67 / 50 ms**, which matches the new tool (89 fps).

  During this sweep, another agent's Chrome (port 9333), an automation Chrome and Arc renderers were each using about 100% CPU. Load average was about 7–16 on 8 cores, and GPU stalls still did not recur. The earlier stalls were more likely GPU or WindowServer contention (for example, screen mirroring or another GPU-heavy client) than CPU.

## Caveats

* **Host not quiet.** Other agents' browsers were running throughout the sweep (1-minute load average about 7–16, sampled 18:51–19:03 UTC). Run-to-run sd is small (scroll fps sd ≤ 1.4 below 20x; sd of the bench total ≤ 5%; individual sub-benchmarks up to 13% at 10x), but absolute numbers could be a few percent better on an idle machine.
* **Cold cache.** Every run uses a fresh profile, so the HTTP cache is cold and cookies, storage and consent state are empty. This affects load time, not the scroll phase, which starts at least 8 s after load. If the iPhone runs with a warm cache, compare scroll and idle phases, not load.
* **120 Hz on both sides.** The Mac display runs at 120 Hz. The iPhone 15 Pro Max is ProMotion, but Safari may cap rAF at 60 Hz. Compare `>34`, `>50` and `>100` counts and `jank ms` (both relative to 16.7 ms) rather than raw fps.
* **Observer effect.** The injected rAF logger reads `scrollY` every frame. In Blink that forces any pending style/layout inside our callback, which is why `(inline)` shows large "forced" time in LoAF. Mostly this *moves* work that the frame would do anyway rather than adding new work, but it does distort forced-layout attribution between our callback and the page's callbacks. The rAF loop also keeps a main frame scheduled every vsync (part of the idle-phase busy time). The iPhone side uses the same logger, so the comparison is like-for-like.
* **Emulation is not a phone.**
  * Mobile emulation keeps the Mac GPU, V8/Blink and 3x DPR raster at 1290x2796.
  * Throttling slows only the renderer main thread, and superlinearly: about 5x at rate 4 for DOM work.
  * The compositor, raster and GPU run at desktop speed, which flatters emulated off-main-thread work compared with a real low-end phone.
* **`cpu_bench.js` on Safari:** `performance.now()` is 1 ms-granular. The sub-benchmarks were sized to take ≥ 18 ms at 1x on the Mac to limit quantization error. An earlier draft had `dom_create` with 300 cards; it was bumped to 1000 within minutes, and the iPhone data used the final file (sha256 prefix `9ad70feb206b9ccf`).
* **Section attribution** uses the viewport centre and section offsets measured at the bottom. A long frame is charged to the section where it *ended*.

## Reproduce

```sh
cd research/cpu-throttle-calibration
sh tools/run_chrome_sweep.sh "$SCRATCH"                     # bench curve + 24 scroll runs + 3 traces (4/6/20x)
node tools/chrome_scroll.mjs --viewport desktop --rate 1 --runs 1 --trace --trace-dir "$SCRATCH" --no-frames --out data/chrome/trace-desktop-1x
node tools/devtools_calibrate.mjs --runs 3 --out data/chrome/devtools-calibration.json
for r in 1 4 6 20; do python3 tools/trace_summary.py "$SCRATCH/trace-desktop-${r}x.run1.trace.json" data/chrome/trace-desktop-${r}x.tracesummary.json; done
python3 tools/chrome_tables.py > /tmp/tables.md
python3 tools/bench_to_rate.py data/iphone/bench.json --key quiet
```

## Files

* `data/chrome/bench-curve.json`: `cpu_bench.js` at rates 1, 2, 4, 6, 10 and 20 × 3 runs (curve plus raw per-run results).
* `data/chrome/devtools-calibration.json`: reproduced DevTools calibration (3 runs), bisection trail and BenchmarkIndex(rate) curve.
* `data/chrome/scroll-{desktop,mobile}-{1,4,6,20}x.summary.json`: per-phase aggregates (mean/sd/values) and per-run summaries, sections and top scripts.
* `data/chrome/scroll-*.runN.json`: per-run summary plus raw frames `[t, dt, scrollY]` and LoAF entries (≤ 90 KB each).
* `data/chrome/trace-desktop-{1,4,6,20}x.summary.json` / `.run1.json`: scroll metrics of the traced runs (no raw frames).
* `data/chrome/trace-desktop-{1,4,6,20}x.tracesummary.json`: per-thread, per-phase trace summaries.

## Sources

* [dt134]: https://developer.chrome.com/blog/new-in-devtools-134 ("What's new in DevTools, Chrome 134", CPU throttling calibration)
* [thr]: https://developer.chrome.com/docs/devtools/settings/throttling (DevTools throttling docs)
* [grounded]: https://developer.chrome.com/blog/devtools-grounded-real-world ("More accurate DevTools performance debugging using real-world data")
* [cc]: https://github.com/ChromeDevTools/devtools-frontend/blob/1e16983d27a40f1e449fe73503e6fdbb797c31d4/front_end/panels/mobile_throttling/CalibrationController.ts (calibration algorithm, targets 264/1000, BenchmarkIndex source)
* `CPUThrottlingManager.ts`: https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/CPUThrottlingManager.ts (nominal tier scores 264/1000/2350/3000)
* [tct]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/scheduler/common/thread_cpu_throttler.cc (SIGUSR2 + busy-spin main-thread throttler)
* [lh9085]: https://github.com/GoogleChrome/lighthouse/issues/9085 (BenchmarkIndex background)
* DebugBear, "CPU Throttling In Chrome DevTools and Lighthouse": https://www.debugbear.com/blog/cpu-throttling-in-chrome-devtools-and-lighthouse

[dt134]: https://developer.chrome.com/blog/new-in-devtools-134
[thr]: https://developer.chrome.com/docs/devtools/settings/throttling
[grounded]: https://developer.chrome.com/blog/devtools-grounded-real-world
[cc]: https://github.com/ChromeDevTools/devtools-frontend/blob/1e16983d27a40f1e449fe73503e6fdbb797c31d4/front_end/panels/mobile_throttling/CalibrationController.ts
[tct]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/scheduler/common/thread_cpu_throttler.cc
[lh9085]: https://github.com/GoogleChrome/lighthouse/issues/9085
