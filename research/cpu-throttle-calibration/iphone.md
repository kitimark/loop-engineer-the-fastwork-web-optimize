# iPhone ground truth for CPU-throttle calibration

Real-device side of the Chrome CPU-throttling calibration for https://fastwork.com/ (public homepage, read-only probing).
The Chrome side (1/4/6/20x) uses `tools/chrome_scroll.mjs`. These iPhone measurements use the same page, the same bench
file and the same scripted-scroll steps, so the two can be compared directly.

## Device and setup

| | |
|---|---|
| Device | iPhone 15 Pro Max (A17 Pro), iOS 26.6.1, Safari (UA `Version/26.6.1 Mobile/15E148`) |
| Viewport | 430 x 775 CSS px, DPR 3 (toolbar expanded; scripted scroll never collapsed it) |
| `navigator.hardwareConcurrency` | 4 |
| rAF cadence | 60 Hz (16.7 ms). The panel is 120 Hz ProMotion, but Safari caps rAF / page rendering at 60 Hz |
| Timer resolution | `performance.now()` is coarsened to 1 ms, so bench and frame intervals are whole ms |
| Transport | `ios_webkit_debug_proxy -c null:9221,:9222-9322` + WebKit Inspector Protocol (`tools/iphone_wip.mjs`) |
| Date | 2026-10-01 (runs within about 15 min of each other; phone on Wi-Fi; battery and thermal state not controlled) |

Protocol quirks on iOS 26.6.1, all handled in `tools/iphone_wip.mjs`:
- Commands go through `Target.sendMessageToTarget` to the `page` target. Target ids change on every navigation, so the scripts reconnect after navigating.
- `Runtime.evaluate` ignores `awaitPromise`: it returns the Promise object. Async work stores its result on `window` and Node polls for it.
- `Page.navigate` is not available, so navigation uses `location.href` / `location.reload()`.
- Timeline record timestamps are always 0 over the proxy. Timeline is only used for counts, recorded in 1 s `Timeline.start`/`stop` chunks.
- `location.reload()` restores the scroll position. The runner calls `scrollTo(0,0)` before reloading and records `startY`, which was 0 in every kept run.

## 1. CPU microbenchmark (`tools/cpu_bench.js`)

`tools/iphone_bench.mjs` injects `cpu_bench.js` as-is (reps 5, warmup 1; each sub-bench reports the median of 5).
- **Quiet runs:** the tab goes to `about:blank`, then `document.write`s the same standards-mode blank document the Chrome side loads as a `data:` URL (`<!doctype html><meta charset=utf-8><title>bench</title><body></body>`; `compatMode = CSS1Compat`). iOS blocks top-level `data:` navigation, which is why the document is written in place. The bench ran 5 times; the table shows the median of the 5 run-medians.
- **On-page run:** one run on fastwork.com, started 8 s after reload, while the page's constant animation work was active.
- bench sha256[:16] `9ad70feb206b9ccf` is stored in `data/iphone/bench.json`. `cpu_bench.js` was edited once during the session (dom_create went from 300 to 1000 cards) without a VERSION bump. If it changes again, re-run `node tools/iphone_bench.mjs`.

| sub-bench (ms, median) | quiet: 5 run-medians | **quiet median** | on fastwork.com | page / quiet |
|---|---|---|---|---|
| js_numeric | 23 / 19 / 16 / 20 / 19 | **19** | 19 | 1.0x |
| js_alloc | 26 / 25 / 24 / 24 / 28 | **25** | 28 | 1.1x |
| dom_layout_thrash | 84 / 84 / 87 / 86 / 85 | **85** | 91 | 1.07x |
| style_recalc_var | 101 / 101 / 101 / 100 / 101 | **101** | 224 | **2.2x** |
| dom_create (1000 cards) | 32 / 31 / 31 / 31 / 31 | **31** | 57 | **1.8x** |
| total (sum of medians) | 266 / 260 / 259 / 261 / 264 | **261** | 419 | 1.6x |
| geomean | | **41.8** | 57.3 | |

On the fastwork page, pure JS is unaffected. The style-dependent benches get about 2x slower: style recalc of the bench's own
subtree gets more expensive in a document with fastwork's large stylesheet, and it competes with the page's per-frame
style/layout work. Keep this in mind if the Chrome calibration uses on-page numbers.
`data/iphone/bench_prelim_quirks_300cards.json` is an earlier run, superseded. It used a quirks-mode `about:blank` and the old 300-card dom_create. Its other four benches agree within ±5 %.

## 2. Scripted smooth scroll (`tools/iphone_scroll.mjs`)

These in-page steps match `chrome_scroll.mjs`:
1. Reload fastwork.com and wait 8 s after `readyState=complete`.
2. Inject a rAF logger that records `[performance.now, interval, scrollY]` per frame. WebKit has no long-animation-frame API, so the logger is the only thing injected.
3. 3 s idle.
4. Call `scrollBy({top:250, behavior:'smooth'})` every 300 ms until `scrollY >= maxY-5` (cap 45 s).
5. 3 s at the bottom.

Setup: `maxY = 5260`, scrollHeight 6035. The scroll phase took about 6.7 s (about 22 steps, about 780 px/s) and never hit the cap.
There were 3 clean runs with no instrumentation, plus 1 separate run with Timeline chunk recording (`--timeline`). The
Timeline run supplies event counts; its frame stats are shown for reference but are not included in the aggregate.

Metric definitions are the same as `chrome_scroll.mjs`: `frameStats` and `sectionOf` are copied verbatim into `tools/iphone_analyze.mjs`.

### Scroll results (mean ± sd over 3 runs)

| phase | fps | median | p95 | p99 | >20 ms | >34 ms | >50 ms | >100 ms | max | hit cadence | dropped ratio | fps / cadence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| idle (3 s, top) | 59.5 ±0.2 | 17 | 17.7 ±0.6 | 44.7 ±2.5 | 6.3 ±0.6 | 3.3 ±0.6 | 1.0 ±0 | 0 | 55 ±2.5 | 97.2 % | 4.3 % | 99.2 % |
| **scroll** (6.7 s) | **52.8 ±0.5** | 17 | **33.3 ±2.5** | **62 ±2.6** | **63.7 ±7.6** | **15.7 ±2.5** | **5.7 ±1.5** | 0.7 ±0.6 | **104 ±6** | **91.4 ±1.4 %** | **13.6 ±2.4 %** | **88.0 ±0.9 %** |
| bottom (3 s) | 60.2 ±0.2 | 17 | 17 | 17 | 0.3 ±0.6 | 0 | 0 | 0 | 20 ±1.7 | 100 % | 0 % | 100.3 % |

Per-run scroll phase:

| run | fps | p95 | p99 | >20 | >34 | >50 | >100 | max | dropped ratio |
|---|---|---|---|---|---|---|---|---|---|
| run1 | 52.2 | 36 | 64 | 72 | 18 | 7 | 1 | 111 | 16.4 % |
| run2 | 53.1 | 33 | 59 | 62 | 16 | 6 | 1 | 103 | 12.0 % |
| run3 | 53.1 | 31 | 63 | 57 | 13 | 4 | 0 | 99 | 12.5 % |
| Timeline-on run (reference) | 52.9 | 32 | 63 | 60 | 17 | 6 | 0 | 98 | 12.6 % |

The Timeline-on run falls inside the spread of the clean runs, so 1 s chunked Timeline recording barely changes these frame metrics.

### Normalising for refresh rate (for comparison with Chrome at 120 Hz)

Absolute interval counts are not directly comparable. On iOS Safari a healthy frame is 16.7 ms. On a 120 Hz Mac, Chrome's healthy frame is 8.3 ms, so its fps and "frames" counts are about twice as large for the same smoothness. Also, a 20 ms interval is one missed vsync at 60 Hz but more than two missed vsyncs at 120 Hz. `iphone_analyze.mjs` therefore adds, per phase, with P = cadence period (inferred from the idle median: > 12 ms gives 16.67 ms, otherwise 8.33 ms):
- **hit cadence %**: share of rAF intervals ≤ 1.5·P, i.e. frames that arrived on the next vsync.
- **missed vsyncs**: Σ max(0, round(dt/P) − 1).
- **dropped ratio %**: missed / (missed + frames). This is the share of display refreshes that got no new main-thread frame, and it is the fairest single number across 60 and 120 Hz.
- **fps / cadence %**: fps ÷ (1000/P).
- **over_2P**: count of intervals > 2.5·P.

To compare, apply the same formulas to the Chrome runs with their own P. The ms thresholds (>34, >50, >100 ms) are
absolute user-visible stalls and can be compared across devices as they are. That is not true of >20 ms and fps.

### Per-section jank (scroll phase, section under the viewport centre; 3 runs summed)

| section | frames | >34 ms | >50 | >100 | max | jank ms (per run) |
|---|---|---|---|---|---|---|
| hero-track | 94 | 5 (5 %) | 0 | 0 | 47 | 72 |
| people | 73 | 8 (11 %) | 2 | 0 | 57 | 158 |
| profile-showcase | 100 | 4 (4 %) | 3 | 0 | 64 | 90 |
| feed | 72 | 9 (13 %) | 3 | 0 | 80 | 178 |
| **pain** (`is-pain-dark`) | 112 | 12 (11 %) | 7 | 2 | **111** | **350** |
| commission (`compact shrinking`) | 255 | 6 (2 %) | 2 | 0 | 59 | 118 |
| platform | 361 | 3 (1 %) | 0 | 0 | 42 | 56 |

(Section offsets were taken at the end of each run, so they reflect the final layout. Nested sections are assigned to the innermost one, as on the Chrome side.)

### WebKit Timeline counts (Timeline-on run, per second)

| phase | Layout/s | RecalcStyle/s | Paint/s | paint Mpx/s | Composite/s | FireAnimationFrame/s | events |
|---|---|---|---|---|---|---|---|
| idle (top) | 47 | 55 | 49 | 0.9 | 58 | 88 | a few scroll |
| scroll | 102 | 186 | 216 | 6.7 | 53 | 219 | scroll 1144, scrollend 38; **no touch*, no resize** |
| bottom (idle) | 110 | 171 | 259 | 0.7 | 59 | 120 | none |

Top FunctionCalls during the scroll phase (calls/s):

| function | calls/s |
|---|---|
| `(inline):4:16` (the injected rAF logger) | 53 |
| `/_app/immutable/nodes/2.DyWL8TcE.js:1:126303` (also runs every frame at idle) | 39 |
| `modules.e762be2b6b709245aabb.js:2:212214` | 34 |
| `2.DyWL8TcE.js:1:75104` | 34 |
| `2.DyWL8TcE.js:1:75156` | 34 |
| `2.DyWL8TcE.js:1:87540` | 22 |
| `2.DyWL8TcE.js:2:136527` | 22 |
| `2.DyWL8TcE.js:2:109762` | 17 |

`2.DyWL8TcE.js:1:126303` runs about once per frame even at idle (the page's constant rAF animation). That is why an
idle page does about 50 layouts/s. At the bottom it does about 110 layouts/s and 260 paints/s (the `platform` section
animates), yet it still hits cadence 100 % of the time.

## 3. Scripted smooth scroll vs real finger scroll

The ground truth is `data/iphone/finger_scroll1.json`, a copy of the earlier `scratchpad/scroll1.json` recorded with
`record.mjs`. That session had Timeline chunks on the whole time and two duplicate rAF loggers. Frames were deduped
by rounded `t`, and `FireAnimationFrame`/logger counts in that file are doubled. The windows below come from the frame
log:
- **scroll_down:** first touch until `scrollY` first reaches max.
- **bottom_touch:** repeated touches at the page end, until the last frame within 100 px of max.
- **scroll_up:** flick back to the top.

| phase | dur s | fps | median | p95 | p99 | >34 | >50 | >100 | max | hit cadence | dropped ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| finger idle before | 3.2 | 58.5 | 17 | 23 | 51 | 6 | 2 | 0 | 59 | 95.7 % | 6.5 % |
| **finger scroll_down** | 23.5 | 47.3 | 17 | **53** | 88 | 107 | 57 | 9 | 232 | 84.9 % | **24.4 %** |
| **finger bottom_touch** | 10.8 | 41.9 | 17 | **58** | 117 | 50 | 29 | 7 | 153 | 81.5 % | **29.5 %** |
| finger scroll_up | 5.5 | 50.4 | 17 | 35 | 58 | 14 | 6 | 1 | 129 | 83.5 % | 19.4 % |
| finger idle after | 13.7 | 59.4 | 17 | 23 | 40 | 11 | 2 | 0 | 57 | 96.2 % | 5.0 % |
| scripted scroll (mean of 3) | 6.7 | 52.8 | 17 | 33 | 62 | 15.7 | 5.7 | 0.7 | 104 | 91.4 % | 13.6 % |
| scripted bottom (mean of 3) | 3.0 | 60.2 | 17 | 17 | 17 | 0 | 0 | 0 | 20 | 100 % | 0 % |

Share of frames over 34 ms, per section, while scrolling down:

| section | finger | scripted |
|---|---|---|
| hero-track | 3 % | 5 % |
| people | 34 % | 11 % |
| profile-showcase | 68 % | 4 % |
| feed | 70 % | 13 % |
| pain | **74 %** (7 frames > 100 ms, max 232) | 11 % (max 111) |
| commission | 2 % | 2 % |
| platform | 0 % | 1 % |

Finger scroll is clearly worse. Scripted smooth scroll underestimates real-touch jank by about 2x on dropped ratio and p95, and misses the end-of-page problem entirely:

1. **End-of-page touchmove scroll-jack.** Only touch triggers it. In `bottom_touch`, the page runs non-passive touch/pointer handlers:
   - `chunks/BSBv9QXB.js:1:30474` / `:30585`, up to 112 calls/s
   - `nodes/2.DyWL8TcE.js:1:146551`, `2:150174`, `2:149531`, about 55 calls/s

   Paint count reaches 650–1590 paints/s in the 1 s chunks with about 100 touchmove/s (scripted bottom: about 265/s). Frames drop 29.5 % there. None of those handlers appear in the scripted run: 0 calls, and no touch or pointer events. In the scripted run, sitting at the bottom is a perfect 60 fps.
2. **Toolbar collapse and `resize`.** A finger scroll collapses Safari's toolbars, which fires about 150 `resize` events on the way down (and about 120 more on the flick back up). The page's resize work then adds layout. Scripted `scrollBy` leaves `innerHeight` at 775 and fires zero `resize`.
3. **Velocity profile.** The script moves at a steady ~780 px/s. Flicks are bursty and much faster, which pushes more section entry/exit work into fewer frames. The difference is sharpest in the mid-page sections (people, profile-showcase, feed, pain). Both methods agree on the ranking: `pain` is the worst section, and `platform` and `commission` are fine.
4. **Instrumentation is not the explanation.** The Timeline-on scripted run matches the clean runs (p95 32 vs 33 ms). The finger run's extra Timeline and duplicate logger therefore account for at most a small part of the gap.

**Implication for calibration.** When matching a Chrome throttle rate to "iPhone feel", compare Chrome scripted-scroll numbers to the iPhone **scripted** numbers (same stimulus). The rate that matches them is a **lower bound** on real-world jank. Real touch scrolling on this page is roughly 2x worse in dropped-frame ratio. Its end-of-page scroll-jack cannot be reproduced by `scrollBy` in either browser; it needs touch emulation (for example CDP `Input.dispatchTouchEvent` / `Input.synthesizeScrollGesture` with touch source) to exercise the non-passive `touchmove` path.

## Caveats

- **rAF measures the main thread, not what the user sees.** iOS scrolls asynchronously in the UI process, so the page can keep moving visually while main-thread frames drop. What stutters are the scroll-linked JS effects (transforms and reveals driven by scroll handlers), which is what these metrics capture. Chrome's rAF has the same main-thread meaning.
- **60 Hz cap on iOS vs 120 Hz Chrome.** Use the normalised metrics or the absolute ≥34 ms stall counts, not raw fps or frame counts.
- **1 ms timer granularity** in Safari. Medians sit at 16–17 ms and bench values are whole ms (±1 ms quantisation; the smallest bench, about 19 ms, is about ±5 %).
- **Short scroll phase.** The mobile page is only 6035 px tall, so each run has about 350 scroll frames. Stats for >100 ms are 0–1 events per run.
- **Uncontrolled conditions.** Network, cache and thermal state were not controlled. Reloads came from a warm cache. Runs were sequential over about 10 minutes.
- **Finger-scroll windows cross Timeline chunk boundaries.** In that recording, chunk flushes sometimes took 4–10 s, so its per-window Timeline rates in `scroll_summary.json` mix neighbouring phases. The frame-based stats are exact.
- **safaridriver was not used**, because it wedged the device earlier.

## Files

- `tools/iphone_wip.mjs`: WebKit Inspector client (derived from scratchpad `wip.mjs`). Adds reconnect-on-navigate, timeouts with backoff, a clear "unlock the iPhone" error, and `runAsync` (stash on window and poll).
- `tools/iphone_bench.mjs`: `node tools/iphone_bench.mjs [quietRuns=5] [out]` writes `data/iphone/bench.json`.
- `tools/iphone_scroll.mjs`: `node tools/iphone_scroll.mjs data/iphone/scroll_runN.json [--timeline]`.
- `tools/iphone_analyze.mjs`: `node tools/iphone_analyze.mjs [dataDir] [fingerScroll.json]` writes `data/iphone/scroll_summary.json` (per run, aggregate mean/sd, normalised metrics, Timeline rates, finger comparison) and prints the tables.
- `data/iphone/bench.json`: 5 quiet runs + 1 on-page run, with a summary.
- `data/iphone/bench_prelim_quirks_300cards.json`: superseded preliminary run.
- `data/iphone/scroll_run{1,2,3}.json`: raw per-run frames, marks and sections.
- `data/iphone/scroll_timeline.json`: Timeline-on run, including `chunks`.
- `data/iphone/scroll_summary.json`: all derived metrics.
- `data/iphone/finger_scroll1.json`: finger-scroll ground truth (copy of scratchpad `scroll1.json`).
