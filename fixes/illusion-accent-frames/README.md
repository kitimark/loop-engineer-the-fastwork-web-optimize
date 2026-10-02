# Fix: illusion-accent-frames

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. Proposal PR-001 rev 2: frozen-frame parity passed. Live playback FAILED in the Simulator. Parked
until a phone check, not withdrawn.
**Stage:** R / I (design-engineer PoC, illusion proposal; no D card)
**Device class / gate:** phone-only (WebKit). Chrome is gated to the original SVG.
**Driver(s) behind the claims:** Simulator functional sessions (no timing). Chrome per-draw trace counts (r14).
**Topic:** illusion proposal for the hero accent word (de-illusion-style, PR-001)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (the accent effect: a new `HEcanvas` arm),
`/_app/immutable/assets/2.gBuqKVzi.css` (`.is-canvas` rules), and new `assets/accent-frames/{manifest.json,w00.png}`.
The new assets are derived from captured frames. They live only in the gitignored overlay and in `out/`. The
manifest section is stripped from `patch.diff`, and the PNG shows only as "Binary files differ".

## Why it lags

The hand-drawn accent word under the hero title is erased and redrawn every ~3.05 s, 0.9 s each way. This is done
with CSS `stroke-dashoffset` animations on the SVG paths. In WebKit a stroke-dashoffset change is a layout change
(WebKit source, F-097).

WebKit Timeline counts per 'you' draw at scrollY 0 (Simulator, 4 draws, OBSERVED, counts only):

| | RecalculateStyles | Layout | Paint | Composite |
|---|---|---|---|---|
| original SVG | 57.8 | 57.3 | 61.3 | 54.3 |

## What changed (the PoC)

The user asked for apple.com-style image frames or video instead of a look-alike. So this PoC replays the word's own
captured pixels.

- **Frames.** The 'you' erase and draw were captured in Safari (Simulator, DPR 3) at every whole ms 0..900. The test clock was
  frozen (`out/de-illusion-style/frames/simcap.mjs`). Only the 16 px tiles that change between frames are stored: one atlas,
  512x2291, 6023 patches.
- **Playback.** The canvas sits on whole CSS px over the word, and the tiles are copied 1:1 in device px, so nothing
  is resampled.
  The frame is keyed to `currentTime` of an empty Web Animation started in the same task as the SVG's CSS animations.
- **Handback** to the SVG happens in the same frame, with the SVG animations' `startTime` set to the clock's. It
  triggers on scroll, on a clock value with no frame, or on a failed placement check.
- **Clock gate.** The canvas runs only when `document.timeline` gives whole ms:
  - WebKit: `Performance.cpp:73` `timePrecision { 1_ms }`. `reduceTimeResolution` floors the value. It is 20 us when
    cross-origin isolated (d6c1e30075b7). CONFIRMED.
  - fastwork.com sends COOP but no COEP, so it is not isolated. Our `serve.mjs` sends the same headers. If
    COEP is ever added, the gate falls back to the SVG.
  - Chrome: Blink's TimeClamper is 100 us, so Chrome stays on the SVG (r14: 0/16 canvas draws).
- **Loading.** The atlas loads after the window load event, at idle (`requestIdleCallback`, 3 s timeout). It is
  decoded with `img.decode()` + `createImageBitmap` before `A.ready`, never on the draw path.

## Results

**Frozen-clock parity on WebKit (Simulator Safari 26.5, run 3): PASS, OBSERVED.**
- in-w00 71/71 and out-w00 71/71 frames are byte-identical to the original's 1-ms frames (every 13th ms plus the last).
  Word crop: 279x219 device px.
- Ink floor 500 px: 1 frame per key falls under it, and those frames are identical too. 0 BLANK frames.
  Settle checks 6/6.
- `.is-canvas` was engaged in every frame. The Safari cache was cleared at boot (I-052).
- Runs 1-2 failed and were fixed:
  - Run 1: a full redraw was not on screen at screenshot time. Fixed with an incremental render plus a
    `getImageData` flush.
  - Run 2: edge pixels differed because of sub-pixel placement. Fixed by snapping to whole CSS px.

**Live playback on WebKit (Simulator): FAIL, OBSERVED, cause unknown.**

*Shipped arm.* Plain rAF counter, gaps over 50 ms logged, Timeline off:
- The original page ticks 53-55 rAF per 0.9 s draw (22 draws).
- Canvas draws tick 0-9 times (13 draws, 2 sessions). After that the whole page renders nothing for 1.05-1.89 s.
- No exceptions, unhandled rejections or console errors. `apply()` takes 0-1 ms per tick (attribution only).

*Host attribution* (ps %cpu every 500 ms, decaying average, attribution only):
- During the pauses, `com.apple.WebKit.GPU` averages 80 % CPU (73-100 %). It sits at about 14 % outside them.
- Canvas 2D (willReadFrequently too) and ImageBitmaps are created in the GPU process. CONFIRMED on WebKit main
  e2016889:
  - `CanvasRenderingContext2DBase.cpp:3580-3591`
  - `ImageBuffer.cpp:82-87`
  - `WebChromeClient.cpp:1199-1206`
  - `WebProcess.cpp:2604-2608`
  - `WebPageProxy.cpp:15092`
  - `UnifiedWebPreferences.yaml:6494-6505`
  - `PlatformEnableCocoa.h:397-401`
  - `ImageBitmap.cpp:131-137, 232-238`
- The value of that flag in the shipping Simulator/iOS build: UNRESOLVED.

*Diagnosis (hold 5).* Flags were passed through localStorage, and each run's draw log matches its variant. Ticks per
canvas draw:
- **SVG hidden, nothing drawn:** 55, 55. No gaps.
- **Tick runs, no drawImage:** 55, then 40, with one ~260 ms gap after `go()`.
- **One drawImage per tick:** 47, 28, 28 (~37 fps).
- **Standalone page** (`tools/standalone.html` + `.js`, no Fastwork code, same atlas):
  - One 216x117 blit per rAF: ~21 rAF/s, GPU process at 76 % CPU.
  - Patch replay: a 15.0 s pause with the GPU process at 97-100 % CPU.
  - Probe flaw: its clock was `document.timeline` read in a timer. On a page with no animations it was stale, so the
    first tick jumped to k=900 and redrew everything.

Reading (OBSERVED): in the Simulator the stall grows with the number of drawImage calls from the atlas. A minimal
page stalls the same way, so the Simulator cannot tell whether Safari on the phone stalls. The phone was not used
before the user's decision.

**Not claimed as savings:** the canvas Timeline counts (5.0 / 4.0 / 4.5 / 3.3 per draw) are low because rendering
paused.

**Chrome (r14, 12 draws each, trace counts):**
- Gated (ships) vs SVG: UpdateLayoutTree 56.8 vs 58.6, Layout 6.0 vs 7.9, Paint 219.3 vs 220.5, RasterTask 62.1 vs 62.5.
  Equal within noise, because the gate keeps the SVG.
- `nearest` mode (injected global, TEST ONLY, not pixel-exact, never shipped): Paint 4.9, RasterTask 3.0.
- Whole-viewport parity in Chrome: 0 px outside the countdown and photo-card boxes in 16/16 frames, and 0 px in the
  canvas rect. Those two boxes also differ between two loads of the original.

**Sizing (ESTIMATES except 'you'):**
- 'you' atlas: 908,860 B PNG / 325,426 B lossless WebP. The WebP decodes byte-identical to the PNG.
  Decoded: 4,691,968 B.
- 7 words: about 6.4 MB PNG / 2.3 MB WebP, about 31 MB decoded. Scaled from 'you'; Thai, Chinese and Korean may
  differ.
- Page today: 5,307,301 B transfer.
- Capturing the other 6 words: 0.37-0.39 s per frame, about 82 min of Simulator time. Only on approval.

**Phone-check layouts (ESTIMATE, not built):**
- Today's tile arm: 38-73 drawImage per 60 Hz tick on average, up to 195.
- One full frame per tick: 'you' has 863 distinct frames, 83.2 MB decoded, ~4.0 MB PNG. Test only.
- One bounding box per changed ms: 5.5-10.4 blits per tick (max 17), 18.6 MB decoded per word.

**Video:** not pixel-identical. HEVC with alpha (the only transparent video Safari plays) is Main Profile with
chroma_format_idc 1, i.e. 4:2:0. Source: Apple, "HEVC Video with Alpha Interoperability Profile". CONFIRMED.

## Void results

- **Query-string flags never reached the arm.** The SvelteKit router drops `location.search` via
  `history.replaceState` (F-120). These runs silently ran as shipped:
  - the r13 `?fwaccentnearest` counts (replaced by r14's injected global);
  - the Simulator source/canvas variants (`?fwaccentimg`, `?fwaccentgpu`, both);
  - hold 4 (a)-(c);
  - the code-comment observation "an accelerated canvas was resampled (Chrome)", which came from `?fwaccentgpu`.
    Void unless re-run.
- **Cached Simulator arm results (F-115):** d2 arm in-w00 1/109, the canvas simtime runs, and diag 1/2 as captured.
- **r13 canvas-exact Chrome counts:** a failed start (Chrome's fractional clock), fixed by the gate. Not quoted.

## Risks, conflicts, follow-ups

- The live stall decides this proposal. Next step, if the user approves: a phone check comparing the tile arm with a
  one-blit-per-tick arm. Withdraw if both stall.
- Placement is verified at scrollY 0 only. Sim-vs-phone frame identity is UNRESOLVED.
- How often the phone's clock gives a ms with no frame (a handback) is UNRESOLVED.
- reduced-motion is unchanged: the effect returns early before the arm is created.
- Overlaps: any topic that changes the hero copy's position or transform moves the word under the canvas. The
  placement check hands back to the SVG then, but the frames would need recapturing.
