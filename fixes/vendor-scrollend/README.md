# Fix: vendor-scrollend

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. Mechanism and analytics parity checked (probe, short lane). The timing A/B is
still to come: it runs `--on` the wave-1 combined base, one slot (mgmt-ops decision).
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

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| vendor-scrollend/01 | `setTimeout(0)` deferral of the tag's scrollend/resize call (`variants/01.diff`) | moves the ~60 ms out of the scrollend dispatch | functional parity ok. Timing: not measured; by mechanism it only re-attributes the LoAF (the same task one turn later) | 1x probe only | push time same as base (~1.4 s before the scroll ends) | probe run 8 | a monolithic task can't leave the frame budget by changing its task boundary | dropped (no expected gain) | pending runner |
| vendor-scrollend/02 | quiet-idle deferral (1.5 s without input, then rIC), deepest-depth shadow, pagehide/visibilitychange flush (`variants/02.diff` = `patch.diff`) | the frame leaves the scroll; it runs while the visitor reads | parity ok in A/C/D; timing pending (final slot, `--on all-wave1` + `phases.mjs`) | 1x probe | 1 hit everywhere, same params | probe runs 8, 12 | see "Before / after" | on branch | pending runner |
| vendor-scrollend/03 | what-if, **needs the site's GA setting** (EM "Scrolls" off): tag listener dropped (`variants/03.diff`) | ceiling: no tag frame at all | no GA4 `scroll` event (by design); timing pending (1 run in `phases.mjs`) | 1x probe | 0 scroll hits | probe run 8 | only the GA admin can remove the cost | what-if only | pending runner |
| vendor-scrollend/probe-1..7 | probe tool attempts | - | broke: run 1 chrome-error (self-signed cert not accepted); run 6 hit the 180 s cap silently; run 7 lost to host sleep (I-026); run 9 "B" could not hide the page | - | - | commits 9764e0f, 41b58d9, I-026 | load guard, bounded steps, caffeinate; console is unreliable during unload | fixed | no patch kept |

## Before / after

(pending: `fix.mjs ab vendor-scrollend --runs 5 --on <wave-1 combined>`)

## Risks, conflicts, follow-ups

- Timing of the GA4 `scroll` hit shifts by seconds. It is not lost on leave (hide flush), but a tab
  killed without `visibilitychange`/`pagehide` would lose a pending 'scroll' that the baseline would
  already have queued. (The baseline also only sends its batch later, see parity.)
- Relies on the tag calling `window.addEventListener` from its own script URL (a Google-served
  `googletagmanager.com` script) and on `onscrollend`. If either changes, the wrapper does nothing and
  the page behaves like the baseline.
- No overlap with other topics: `analytics.js` is not owned by any other fix.
