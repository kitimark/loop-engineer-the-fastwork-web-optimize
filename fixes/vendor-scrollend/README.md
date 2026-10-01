# Fix: vendor-scrollend

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured: **phase-shifted, not removed.** Analytics parity holds. The gtag `onscrollend`
LoAF is gone in 5/5 runs, but in 3/5 an `analytics.js` idle callback of the same size (50-61 ms)
replaces it, still inside the scroll phase. Frames >50 ms 2 [1-3] → 2 [1-3], within noise. Only the
site's GA setting (variant 03) removes the frame.
**Topic:** `fixes/TOPICS.md` N11 `vendor-scrollend`
**Files touched:** `/analytics.js` (first-party GTM bootstrap, runs before GTM/gtag): new block
`deferTagScrollDepth` before the GTM snippet. No vendor file is changed.

## Why it lags

- LoAF: one entry per run, `gtag/js:433439 c [event-listener DOMWindow.onscrollend]`, 59-76 ms with
  0-2 ms forced layout (e.g. the pain-offscreen-notes A/B, 10/10 runs). `research/architecture/measurement-review.md`
  finding 2 lists it as one of the four >50 ms LoAF entries per run.
- Code (served minified gtag; pretty line numbers are from `site-pretty/__vendor/www.googletagmanager.com/gtag/js.__q_218232fe7c`):
  - GA4 enhanced measurement "scroll" (`__ccd_em_scroll`, pretty 1600-1640) calls
    `internal.enableAutoEventOnScroll` with `verticalThresholds: 90`, unit PERCENT.
  - `WL` (26760-26806) registers `QL`'s `c` with `md(A, "scrollend", k)` and also `md(A, "resize", k)`.
    `md` is `window.addEventListener(type, fn, false)` (6643). When `onscrollend` is missing (older Safari),
    it registers a `scroll` listener with a 50 ms `setTimeout` debounce instead, which already runs in a task.
  - `c` (26655) runs `OL`. `OL` reads `scrollLeft/scrollTop` and `clientWidth/clientHeight` (`UL`,
    `mG` 23330) and `scrollWidth/scrollHeight`, which is cheap: ~1 ms forced. Then `TL`, for each
    threshold crossed, calls `ME({event: "gtm.scrollDepth", ...})` = `dataLayer.push`.
  - That push runs synchronously through GTM's `dataLayer.push` wrapper and gtag's wrapper
    (`yE.prototype.bind`, 22466). The GA4 'scroll' event is processed from there
    (`internal.sendGtagEvent`, deferrable command, `gD.push`/`flush` 21238-21260).
  - Then `PL` removes both listeners once no thresholds remain.
  - So the cost is the tag's event pipeline, not layout. It runs only on the scrollend where depth
    first reaches 90 %; every other scrollend costs a few ms.
- Probe, baseline, 1x (`research/vendor-scrollend/data/probe-2026-10-01T02-22-57-594Z.json`):
  - The window listeners are `scrollend` and `resize` at `gtag/js:903`, as read from the code.
  - At the 90 % crossing, `gtm.scrollDepth` is pushed. The GA4 `scroll` hit (`percent_scrolled=90`)
    goes out by `fetch` ~10 ms later; it isn't batched.
  - CPU-profile attribution of that one call (~10 ms at 1x, sampled every 250 µs):
    - 83 % `gtag/js`, spread over ~20 functions with no hotspot;
    - 7 % the `document.cookie` getter;
    - 7 % `gtm.js` (`DD.enqueue`, `xg`).
  - Nothing page-side can trim it.
- Safari 26.2+ supports `scrollend` (`research/architecture/webkit.md`), so iPhones take this path too.

## Options considered (research)

| option | page-side? | verdict |
|---|---|---|
| (a) gtag/GTM config flag that disables EM scroll per page | none documented. EM events are configured per data stream in GA admin | **needs the site's GA setting** (variant 03 what-if) |
| (b) defer the tag's scrollend call from `analytics.js` (wrap `window.addEventListener` before GTM loads) | yes | variants 01, 02 |
| (c) cache the layout reads | yes | pointless: forced layout is 0-2 ms of the 60 |
| (d) EM "Scrolls" off in GA admin, or a custom scroll trigger | no | **needs the site's GA setting**. Measured only as the 03 what-if |

A monolithic ~60 ms task can't be split from outside the tag. Deferring it therefore moves the
long frame; it doesn't delete it. The lab's rAF logger requests a frame every vsync, so a 60 ms task
makes one rAF gap >50 ms wherever it runs. Variant 01 (next task) only re-attributes the LoAF. Variant 02
runs the call when nobody interacts: the long frame happens while the visitor reads, not during the
scroll or at its end. That is the whole claimed gain. The honesty test is where the frame lands in the
A/B (scroll phase, morph phase or after the measured window); see "Before / after".

## What changed (variant 02, `patch.diff`)

`analytics.js` runs before GTM. It installs its own `window.addEventListener` / `removeEventListener`:

- Only a `scrollend` listener added on `window` from a `googletagmanager.com` script is wrapped. The
  caller is checked with an `Error().stack` URL test, once per registration. So is the `resize`
  listener that uses the same function. The page's own window `scrollend` listener (`2.DyWL8TcE.js`
  10868) and everything else goes straight through.
- On those events, the wrapper records the deepest `scrollTop` seen and queues one call. The call runs
  once there has been no page scroll, wheel, touchstart, pointerdown or keydown for 1.5 s, inside a
  `requestIdleCallback` (timeout 1 s; plain `setTimeout` where rIC is missing). If input arrives in
  between, the wait restarts.
- While the deferred call runs, `scrollingElement.scrollTop` reports the deepest position seen at the
  events. This is an own-property getter, removed right after the call. So a visitor who stops at 95 %
  and scrolls back up before the call runs is still counted at 90 %, as the tag would have counted them.
- `visibilitychange` (hidden) and `pagehide` run pending calls at once. These listeners are
  registered before gtag's own, so the 'scroll' event is queued before the tag's unload flush.
- `removeEventListener` maps the tag's function to the wrapper, so the tag's self-removal after 90 %
  still works.

Nothing visual changes. What analytics sees changes in one way: the GA4 `scroll` hit is sent after
the visitor pauses (1.5 s + idle), or at page hide, not at the scroll end. The threshold and event
parameters are the same.

## Analytics parity (probe, 1x, short lane, no timing claims)

`research/vendor-scrollend/probe.mjs`. It runs one Chrome, mobile 430x932, `--vendors=local --https
--latency 150`. It logs every foreign fetch/sendBeacon/XHR on top of `tools/vendor-shim.js`, which
still answers them locally, plus the shim's per-host counters, every `dataLayer` push, and the window
`scrollend`/`resize` listeners (`DOMDebugger.getEventListeners`). Unload events are recorded in
`localStorage` too, because CDP dropped some console messages during unload (run 11).

| scenario | base | 01 task | 02 quiet-idle | 03 drop (what-if) |
|---|---|---|---|---|
| listeners | gtag `scrollend`+`resize` at `gtag/js:903` | wrapped (`analytics.js`) | wrapped (`analytics.js:153`); page's own listeners untouched | none |
| A smooth scroll to the bottom | 1x `scroll` (percent_scrolled 90), pushed ~1.4 s before the scroll ends | same, 1 hit | 1 hit, pushed ~1.5 s after the last scroll input (53-63 ms after the scroll script ends) | no `scroll` hit (expected) |
| C bottom, back to top 400 ms later | 1 hit at the scrollend | - | 1 hit, pushed at y=0 with the deepest depth (shadowed `scrollTop`) | - |
| D bottom, leave 300 ms later | 1 hit at the scrollend | - | 1 hit, from the `pagehide` flush (fetch keepalive 7 ms after `pagehide`) | - |
| other vendors (Amplitude, Hotjar, Cloudflare) | same per-host counts in every variant | | | |

Data: `research/vendor-scrollend/data/probe-2026-10-01T02-35-01-789Z.json` (A, C, 01, 03),
`…T03-15-43-024Z.json` (D), `…T02-56-51-304Z.json` and `…T03-10-08-549Z.json` (pagehide diagnosis).
Host: load1 1.5-5, CPU 77-81 % idle, `caffeinate -dis` (I-026).
The "B" tab-switch/minimize hide could not be produced in this Chrome: the window flags keep the
page `visible`. So `visibilitychange` is not exercised separately, only the `pagehide` path (D).
**Untested here: the tab/app-switch hide path.** It calls the same `runPending` as `pagehide`.
If the lead wants it checked, it is an iPhone look-only item: Safari, reach 90 %, switch app within
1.5 s, then look for the hit in the mirror's request log.

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| vendor-scrollend/01 | `setTimeout(0)` deferral of the tag's scrollend/resize call (`variants/01.diff`) | moves the ~60 ms out of the scrollend dispatch | functional parity ok. Timing: not measured; by mechanism it only re-attributes the LoAF (the same task one turn later) | 1x probe only | push time same as base (~1.4 s before the scroll ends) | probe run 8 | a monolithic task can't leave the frame budget by changing its task boundary | dropped (no expected gain) | pending runner |
| vendor-scrollend/02 | quiet-idle deferral (1.5 s without input, then rIC), deepest-depth shadow, pagehide/visibilitychange flush (`variants/02.diff` = `patch.diff`) | the frame leaves the scroll; it runs while the visitor reads | within noise: phase-shifted, not removed | clean (0/10 contaminated, load1 ≤ 3.6) | gt50 2 [1-3] → 2 [1-3]; gtag LoAF 5/5 → 0/5, analytics.js idle-callback LoAF 50-61 ms in 3/5; push 0.4 s before the scroll phase ends | results.json, phases-2026-10-01T05-12-36-882Z.json | deferral moves a monolithic vendor task; it can't remove it from a measured window that keeps rendering | on branch (not counted toward the >50 ms goal) | pending runner |
| vendor-scrollend/03 | what-if, **needs the site's GA setting** (EM "Scrolls" off): tag listener dropped (`variants/03.diff`) | ceiling: no tag frame at all | no tag frame (1 phases run), no GA4 `scroll` event (by design) | clean, n=1 | gt50 scroll 2 (base 3/2) | phases-2026-10-01T05-12-36-882Z.json | only the GA admin can remove the cost | what-if only | pending runner |
| vendor-scrollend/probe-1..7 | probe tool attempts | - | broke: run 1 chrome-error (self-signed cert not accepted); run 6 hit the 180 s cap silently; run 7 lost to host sleep (I-026); run 9 "B" could not hide the page | - | - | commits 9764e0f, 41b58d9, I-026 | load guard, bounded steps, caffeinate; console is unreliable during unload | fixed | no patch kept |

## Before / after

One `lock.mjs run` hold (05:05-05:15Z, `caffeinate -dis`, tools at `dd6ece9`, I-023 fixes included):
`fix.mjs ab vendor-scrollend --runs 5 --on all-wave1` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA,
`--vendors=local --https --latency 150`, idle 6 s), then `research/vendor-scrollend/phases.mjs --on all-wave1`.
Host: 0 of 10 runs contaminated, load1 1.7-3.6, other CPU max 19.5 %; `uptime` before 1.65 and after
2.81, CPU 80 % idle. Both sides use the same tools, so compare only within this A/B (mgmt-ops). The
all-wave1 overlay was rebuilt locally with `fix.mjs combine` from the 8 wave-1 patches; its hashes
(JS `69b91556…0db57`, CSS `213e21d3…34d25`) match wave1-dry's.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 109.2 [108.5-110.2] | 110.2 [109.4-110.7] | +1 (+0.9%) | within noise |
| scroll: frames >20 ms | 14 [13-16] | 11 [10-14] | -3 (-21.4%) | within noise |
| scroll: frames >34 ms | 3 [3-5] | 4 [3-4] | +1 (+33.3%) | within noise |
| scroll: frames >50 ms | 2 [1-3] | 2 [1-3] | 0 (0%) | within noise |
| scroll: frames >100 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| scroll: worst frame ms | 60.2 [58-66.9] | 59.7 [57.9-66] | -0.5 (-0.8%) | within noise |
| scroll: p95 frame ms | 16.4 [15.2-16.6] | 15.8 [15.3-16.5] | -0.6 (-3.7%) | within noise |
| scroll: LoAF ms | 116 [108-118] | 109 [51-118] | -7 (-6%) | within noise |
| scroll: LoAF script ms | 52 [51-54] | 50 [0-61] | -2 (-3.8%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 0 [0-1] | 0 [0-0] | 0 | within noise |

Regressions: none. No new errors or 404s, screenshot diff top 0.13 % / middle 0 / bottom 0, `morphReached` 5/5 on both sides.

**Where the tag's frame went** (raw `out/ab/vendor-scrollend/2026-10-01T05-05-00-740Z/verify.json`, per run):

| run | baseline: scroll LoAF entries with a script | patched (02) |
|---|---|---|
| 0 | `gtag/js c [DOMWindow.onscrollend]` 52 ms | none (LoAF count 1, the unattributed frame) |
| 1 | gtag 52 ms | `analytics.js [IdleRequestCallback]` 50 ms |
| 2 | gtag 54 ms | analytics.js 56 ms |
| 3 | gtag 51 ms | analytics.js 61 ms |
| 4 | gtag 51 ms | none |

The other >50 ms scroll frame (~56-64 ms) has no script attribution in either side: a render/style
frame, not this topic.

`phases.mjs` (`research/vendor-scrollend/data/phases-2026-10-01T05-12-36-882Z.json`) repeats verify's
scroll + morph phases and adds a 10 s no-input tail:

| variant, run | `gtm.scrollDepth` push | tag frame (LoAF ≥50 ms) | rAF gaps >50 ms scroll / morph / tail |
|---|---|---|---|
| base 0 | scroll phase, 1.9 s before its end (the 90 % scrollend) | scroll, 61 ms, gtag `onscrollend` | 3 / 0 / 0 |
| base 1 | scroll, -1.9 s | scroll, 58 ms, gtag | 2 / 0 / 0 |
| 02 run 0 | scroll, -0.4 s (the still tail at the bottom) | none ≥50 ms | 2 / 0 / 0 |
| 02 run 1 | scroll, -0.4 s | scroll, 53 ms, `analytics.js IdleRequestCallback` | 2 / 0 / 0 |
| 03 (what-if, needs the site's GA setting) | none | none | 2 / 0 / 0 |

**Verdict (honesty test): phase shift inside the measured window, not a removal.**
- 02 moves the call from the 90 % scrollend, while the page still scrolls, to ~1.5 s after the last
  scroll input. In the lab that is the still tail at the bottom of the scroll phase, 0.4 s before the
  phase ends, so the A/B still counts it.
- In 3/5 A/B runs and 1/2 phase runs it is still a 50-61 ms frame. In the other runs it stayed under
  the 50 ms LoAF threshold. That hints it costs a little less in idle time than inside the scrollend
  dispatch, but n is too small to claim.
- For a real visitor, the hitch now happens after they stop scrolling, not at scroll end. Scrolling
  itself is compositor-driven either way, so the visible gain is small.
- Frames >50 ms: 2 [1-3] → 2 [1-3]. Frames >34 ms: 3 [3-5] → 4 [3-4]. Both within noise.
- The frame class "gtag `onscrollend`" goes away only with variant 03, i.e. GA4 enhanced measurement
  "Scrolls" off: **needs the site's GA setting**. That loses the GA4 `scroll` event unless the site
  sends its own.

iPhone: not measured. The tab/app-switch hide path is an iPhone look-only item (see parity).

## Risks, conflicts, follow-ups

- Timing of the GA4 `scroll` hit shifts by seconds. It is not lost on leave (hide flush), but a tab
  killed without `visibilitychange`/`pagehide` would lose a pending 'scroll' that the baseline would
  already have queued. (The baseline also only sends its batch later, see parity.)
- Relies on the tag calling `window.addEventListener` from its own script URL (a Google-served
  `googletagmanager.com` script) and on `onscrollend`. If either changes, the wrapper does nothing and
  the page behaves like the baseline.
- No overlap with other topics: `analytics.js` is not owned by any other fix.
