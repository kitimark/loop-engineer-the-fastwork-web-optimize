# 01 — Initial investigation: scroll-animation jank on fastwork.com

Personal, educational performance study of the public homepage <https://fastwork.com/>.
Not affiliated with Fastwork. Everything here comes from **read-only probing** of the public site.

- **Date:** 2026-10-01
- **Devices:** iPhone 15 Pro Max (iOS 26.6.1 Safari, 430×775 CSS px, DPR 3) and an Apple-Silicon Mac (Chrome 154)

## TL;DR

**Symptom:** scrolling the homepage feels laggy on iPhone, mostly at the **top** (hero) and the **end** of the page. On desktop it looks smooth.

**Root cause:** every scroll effect is **JavaScript on the main thread**:

- One passive `scroll` listener triggers a shared `requestAnimationFrame` engine (`2.DyWL8TcE.js` `iE` @75104).
- Each section registers a callback with that engine.
- The callbacks **read layout and write styles in the same frame** (`getBoundingClientRect`, `elementFromPoint`, `Range.getClientRects`, then `setProperty`). That forces a style recalculation and layout on every frame.
- They also keep easing by 22% per frame after the scroll stops.

**Why iPhone looks worse than desktop:**

- **Frame rate.** iOS Safari scrolls natively at up to 120 Hz, but page rendering updates are limited to about 60 Hz. So JS-driven effects trail the finger and step visibly.
- **Scroll-jack at the end.** It adds `touchmove`/`wheel` listeners with `{passive:false, capture:true}`, which makes each touch wait for the main thread.
- **Toolbar resize.** When the URL bar collapses, `resize` events fire and every section gets re-measured.

**Desktop:** at 1× CPU it is smooth (119 fps). With CPU throttling the same code lags. An early 4× run showed 38–54 fps with frames up to about 1.4 s, but that **did not reproduce**: later 4× runs gave 87–96 fps. Matching iPhone-level jank takes about 6×; see [`../cpu-throttle-calibration`](../cpu-throttle-calibration/).

## Method and tooling (`tools/`)

| Tool | What it does |
|---|---|
| `iphone_perf.py` | Page-load metrics on the real iPhone through `safaridriver`: FCP, LCP, the LCP element, resources and image bytes. **Warning:** synthetic touch `actions` hung and left the device paired to a dead automation session. Use it only for page loads. |
| `wip.mjs` | Minimal WebKit Inspector Protocol client for `ios_webkit_debug_proxy`. iOS 26 exposes a `page` and a `frame` target; commands are wrapped in `Target.sendMessageToTarget`. |
| `record.mjs` | Records the iPhone while **the user scrolls with a finger**. Samples the WebKit Timeline in about 1 s chunks and logs `requestAnimationFrame` frames with `scrollY` in the page. |
| `chrome_scroll.mjs` | Chrome over raw CDP (no MCP). Sets viewport and CPU throttle, injects a rAF frame logger and a Long Animation Frames observer, smooth-scrolls to the bottom, and can take an optional lightweight trace. |

**Gotchas we hit:**

1. **WebKit Timeline timestamps.** Over `ios_webkit_debug_proxy`, every WebKit Timeline timestamp is `0` on iOS 26 (`recordingStarted.startTime` is 0, and so are the CPU timestamps). All records nest into a single `RenderingFrame`. Workaround: start and stop the Timeline every ~1 s. Each stop flushes one tree, and counts of Layout, RecalculateStyles and Paint (with clip rects) plus FunctionCall `script:line:col` still come through.
2. **safaridriver.** It opens iOS sessions fine. But W3C touch `actions` hang, and afterwards the session can't be deleted until Safari is force-quit.
3. **chrome-devtools MCP.** `performance_stop_trace` on a 21 s trace at 4× CPU pinned the MCP server for more than an hour and blocked every other MCP call. Raw CDP with a narrow category list plus Python parsing works instead.

## Findings — real iPhone, finger scroll (`data/iphone-finger-scroll.json`)

That run logged 7,255 frames. Two `requestAnimationFrame` loops were running (a leftover probe), so deduplicate frames by timestamp.

| Phase | fps | Frames > 50 ms | Worst frame | Rendering work |
|---|---|---|---|---|
| Idle at top (not touching) | 58–60 | 0–1 per second | 36–59 ms | about 60 layouts, 60 style recalcs and 50–100 paints per second |
| Scrolling out of hero, top | 42–46 | 25–32 | 232 ms | about 119 layouts/s and 176 style recalcs/s (about 2 layouts per frame); 45–85 million CSS px² painted in about 10 s |
| Bottom of page, finger down | 16–37 | 3–8 per second | 153 ms | 600–1,500 paints/s; `touchmove` about 100/s and `pointermove` about 300/s go to JS; a 410×790 area repaints about 9 times per second |

**Attribution:**

- **Idle work.** At idle, about 51 repaints per second hit a 60×60 region in the hero. They come from the countdown digit spring, which runs `requestAnimationFrame` every frame (`2.DyWL8TcE.js` @126303).
- **Top of the page.** Three things stack up:
  - The scroll engine `iE` (@75104) and its callbacks.
  - `resize` events while the iOS toolbar collapses (36 in the first seconds).
  - Full-viewport repaints of the sections that overlap by −100svh.
- **End of the page.** Svelte's delegated event handler (`BSBv9QXB.js` @30474) handles about 110 touch and pointer events per second. This is the scroll-jack path. Hotjar (`modules.e762be2b…js`) also runs about 30 times per second, observing the style mutations.
- **Frame cadence.** iOS Safari page rendering ran at about 60 Hz on a 120 Hz ProMotion screen: 16.7 ms intervals and 61 composites per second.

## Findings — iPhone page load over Wi‑Fi (`data/iphone-load-wifi-5runs.json`)

Median of 5 cold loads:

| Metric | Value |
|---|---|
| FCP | 488 ms |
| LCP | 808 ms (`/selling/hero/mod-cover.jpg`) |
| DOMContentLoaded | 573 ms |
| Load | 2,150 ms |
| Images + CSS-referenced assets | 2.89 MB per cold load |

- About 1.06 MB of that is desktop-only hero covers, hidden with `display:none` on mobile but still fetched.
- Safari 26.6 supports the `largest-contentful-paint` and `event` entry types, but not `layout-shift` or `longtask`.

## Findings — desktop Chrome (`data/chrome-desktop-*.json`)

| Run | Scroll fps (target 120) | Frames > 50 ms | Worst frame |
|---|---|---|---|
| 1440×900, 1× | 119 | 0 | 24 ms |
| 1440×900, 4× (first runs, **not reproduced**) | 38–54 | 20–33 | 1,308–1,467 ms |
| 1440×900, 4× (later runs, calibration sweep) | 89 ± 0.5 (87–96 across all later runs) | 1 ± 1 | 56 ± 13 ms |
| 430×932 mobile emulation, 4× | 70 | 11 | 283 ms |

- **Same code as on iPhone.** The long tasks are the scroll engine `iE` (@75156) and its callbacks:
  - `l` (@109762): the hero/future callback. It calls `getBoundingClientRect` on `.hero-track` and eases by 22% per frame.
  - `f` (@103311): the profile-showcase shrink callback.
- **Svelte flush.** Svelte's effect/microtask flush (`BSBv9QXB.js` @4529) takes about 25–30 ms per frame at 4×.
- **Style recalculation.** `UpdateLayoutTree` (style recalc) was the second-largest self-time.
- **Desktop does more work than mobile.** The desktop layout turns on shrink/scale effects that mobile CSS disables.
- ~~**The seconds-long freezes are not main-thread work.**~~ **Retracted.** In the first traced 4× run, the GPU process was busy about 11 s of about 20 s, with single `FinishPaintRenderPass` tasks of 215–512 ms. These stalls **did not reproduce** in later traced runs at 1×, 4×, 6× or 20×: GPU main thread 17–24% busy, longest task 26–33 ms, `FinishPaintRenderPass` 4 ms or less. The most likely cause is host contention during that one run. CPU throttling only slows the renderer main thread. See [`../cpu-throttle-calibration/chrome-sweep.md`](../cpu-throttle-calibration/chrome-sweep.md).

## Motion inventory

See [`motion-inventory.md`](motion-inventory.md): a static analysis of every animation mechanism on the page, grouped by section.

## Fix directions (to be validated on the local mirror)

1. **Move scroll-linked effects to CSS scroll-driven animations.** Use `animation-timeline: scroll()` or `view()`, animating only `transform` and `opacity`. Safari 26 and Chrome support them, and they run on the compositor at display rate.
2. **Read, then write.** Batch all reads before any writes. Drop effects that are visually disabled on the current breakpoint (`matchMedia`). Stop the easing loops once they settle.
3. **Idle work.** Replace the countdown rAF spring with a CSS `transition: transform`, and pause it when it is off-screen.
4. **Remove the non-passive `touchmove`/`wheel` scroll-jack.** Use `overscroll-behavior` or scroll-snap instead.
5. **Blur.** Don't animate `filter: blur` or `backdrop-filter` on large layers. Cross-fade the `opacity` of a pre-blurred layer instead. Drop the permanent `filter: blur(0px)` on `#platform`.
6. **Toolbar resize.** Ignore `resize` events that only change the height on iOS. Use `svh`/`lvh` units.
