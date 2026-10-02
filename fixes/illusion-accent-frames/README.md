# Fix: illusion-accent-frames

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. PR-001 rev 2 was accepted (2026-10-02 06:31Z). Phone ticket P-058 ran (blocks A and B): no arm beats
the SVG ("P-058 results" below). Rev 3 was posted as PR-004 (6 options, recommending "keep"); the visual recording is deferred by the user.
PR-004 rev 2 (a plain report plus 4 next steps) got changes-requested: the user asked whether the word was measured
alone, without the page's other parts. It was not (see "Full page, not isolated" below). PR-004 rev 3 answers that and
offers 4 options, recommending a word-alone test page. The user accepted rev 3, option word-alone (11:15Z). The test page
is built and checked in Chrome and the Simulator; phone ticket P-065 is pre-registered ("Word-alone test page" below).
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

**Video:** not pixel-identical. HEVC with alpha (Apple's transparent video format, used for V) is Main Profile with
chroma_format_idc 1, i.e. 4:2:0. CONFIRMED: Apple, "HEVC Video with Alpha Interoperability Profile (Preliminary)", v0.9, 2019-05-30 (developer.apple.com/av-foundation/HEVC-Video-with-Alpha-Interoperability-Profile.pdf), p. 4: "Both layers shall conform to Main Profile" and "Both Sequence Parameter Sets shall indicate chroma_format_idc equal to 1, meaning 4:2:0 chroma format." That Safari plays no other transparent video format is not cited (UNRESOLVED).

## PR-001 rev 3: arms and phone ticket P-058

The user accepted rev 2 (2026-10-02 06:31Z) and asked which solution performs best. A bit of pixel difference is now
acceptable for PR-001 only. Timing claims are allowed for PR-001 only. The user's "3 ways" are the three frame layouts
F1-F3 below. The rev 1 wipe stays out ("also tried, not chosen"). CSS `contain` stays out: refuted by WebKit source.

### Arms

Every arm is built on the same base, C = the user's B+ build (`fixes/user-bplus/overlay`). F1, F2, F3 and V share one
JS (HEcanvas v3). The manifest picks the path: tiles, one box per changed ms, a whole frame, or video. v3 reads no
localStorage or query flags. Its manifest's `arm` field is what the run logs.

| arm | what draws the 'you' word | per 60 Hz tick | 'you' assets | decoded: 'you' (sheet px x 4 B) / 7 words (ESTIMATE, x7) |
|---|---|---|---|---|
| C | the original SVG (CSS stroke-dashoffset) | - | - | - |
| F1 | canvas, 16 px tiles of the changed area (rev 2 atlas) | 38-73 drawImage on average, up to 195 | 1 PNG 512x2291, 908,860 B | 4.5 / ~31 MB |
| F2 | canvas, the whole latest frame (one copy per frame) | 1 drawImage | 6 PNG sheets ≤ 2048 px, 1,540,135 B | 83.3 / ~580 MB |
| F3 | canvas, one bounding box per changed ms | ~5-17 drawImage | 2 PNG sheets ≤ 2048 px, 1,303,356 B | 20.1 / ~140 MB |
| V | HEVC with alpha (4:2:0), one `<video>` per direction, primed at load (muted play + pause), played from frame 0 at the draw start. Its start lag l0 is logged. Handback if it has not moved by 150 ms, or its lag moves > 50 ms from l0 | - (media clock) | 2 MP4, 120 fps, 222x120, 117,919 + 116,284 B | video decoder buffers, not estimated |
| B | the SVG; only the visible copy animates (CSS rule, illusion-accent-onecopy) | - | - | - |

B's CSS = C's CSS plus one rule: `.script-accent.svelte-1fn2go6:is(.is-drawing-in, .is-drawing-out)
.is-idle-frame.svelte-1fn2go6:not(.is-idle-frame-0) :is(.accent-path, .accent-fill) { animation: none !important; }`.

**F2 memory: 83 MB or 580 MB?** Both numbers are right; they measure different things.
- Rev 2, which the user accepted, said about 83 MB. That is F2's real 'you' set: 863 frames of 216x117 device px,
  both directions. They sit in 6 sheets, five of 1944x1989 and one of 1944x1287, at 4 bytes per px: 87,334,416 B
  (83.3 MiB) decoded. This is what the phone check loads.
- About 580 MB is 7 x 83 MB, an ESTIMATE for all seven words. Only 'you' is built. The other words would need
  capturing, and their frame counts may differ (Thai, Chinese and Korean).
- The table's "7 words" column uses the same x7 scaling for every arm.
- The rev 3 proposal states both numbers, because the user approved on 83 MB.

**Memory risk.**
- WebKit can end a web page's process for using too much memory. `ProcessTerminationReason::ExceededMemoryLimit` is
  in `Source/WebKit/Shared/ProcessTerminationReason.h`, WebKit main, read 2026-10-02. CONFIRMED that the mechanism
  exists.
- The iPhone's limit, and whether 83 MB (or ~580 MB) of decoded frames comes near it, is UNRESOLVED. Canvas
  ImageBitmaps are created in the GPU process (see Results), so this memory may count there and not against the web
  page.
- Decisive local check: the per-process footprint during a run, if the runner can read it.

Frame counts: out 565 changed ms, in 297-298. F1 has 3956 + 2067 tiles and at most 13 per ms. F2 and F3 have one
patch per changed ms.

### Pixel difference against C (Simulator, frozen clock, OBSERVED)

Method: the WebKit frames of each arm at every 13th ms plus the last, in both directions. The arms render frame t
through their test hook; B's SVG is seeked to t. Each frame is compared with C's 1-ms frames, a screenshot crop of
279x219 device px (61,101 px) at 3x.

| arm | frames compared | frames with any change | most changed px in one frame | max channel delta |
|---|---|---|---|---|
| F1 | 137 (in 71, out 66: the session ended before out 858-900; rev 2 covered those with the same atlas, identical) | 0 | 0 | 0 |
| F2 | 142 | 0 | 0 | 0 |
| F3 | 142 | 0 | 0 | 0 |
| V | 142 (in 71, out 71) | 140 (all but the empty first in frame and the empty last out frame) | 9059 of 61101 (14.8 %, in 299 ms) | 217 |
| B | 142 | 0 | 0 | 0 |

**V is the only arm that is not pixel-identical.** The alpha is composited correctly: the background never changes
(0 of ~49,000 pure-background pixels change by more than 8 levels), and the ink is the same colour. Inside the
strokes the mean is RGB (44, 49, 59) against (43, 49, 59). Breakdown of the fully drawn frame (in 900 ms, 9047
pixels change):
- 6811 by 1-2 levels (codec rounding inside the ink);
- 493 by 3-8 levels and 1159 by 9-32 levels;
- 582 by 33-64 levels, all on the anti-aliased stroke edges (4:2:0 chroma and 8-bit alpha);
- 2 by more than 64 levels.

While a stroke is still drawing, up to 127 pixels per frame change by more than 64 levels, at most 217 (out 481 ms).
Most likely that is the moving tip (OBSERVED, not traced per pixel): a video frame lasts 8.3 ms (120 fps), so V shows the tip up to 8 ms behind the 1-ms reference.
These are Simulator frames captured with the clock frozen, compared with C's frames (`cmp-V.json`).

### Live functional check (Simulator, OBSERVED, no timing claim)

44 s at the top per arm, plain rAF counter.
- **F2:** engaged on both 'you' draws, 53-55 rAF ticks per 0.9 s draw. That equals the SVG draws on the same page. It
  reached frame 884-900. No errors.
- **F3:** engaged, but stalls like F1 in rev 2: 0-23 ticks per draw, gaps up to 1.27 s. This is a Simulator
  observation, not a verdict. The phone decides.
- **V, step 1: no Range support.** `tools/serve.mjs` answered Safari's byte-range requests with 200, and the videos
  never loaded. Incident I-054 is fixed on main (67847b4). **Arm V's served-content path depends on that fix.** Apple:
  "HTTP servers hosting media files for iOS must support byte-range requests" (Safari Web Content Guide, "Configuring
  Your Server").
- **V, step 2: no preload.** With 206 answers, both videos stayed at readyState 1 (metadata), networkState idle, with
  no error.
  - WebKit adds `MediaElementSession::AutoPreloadingNotPermitted` when `!document->mediaDataLoadsAutomatically()`
    (HTMLMediaElement.cpp:763-764; last commit on that file a09645c2ee47). Only a user gesture lifts it (:9259-9263).
    CONFIRMED that the mechanism exists. UNRESOLVED that iOS Safari has the setting off; our result fits it.
  - A muted `play()` resolved, and the videos then reached readyState 4 with [0, 0.909] s buffered. So V now primes
    each video at load, and logs the result per video (`stats().prime`).
  - `canPlayType('video/mp4; codecs="hvc1"')` returns "probably". MediaCapabilities `decodingInfo` (hvc1.1.6.L60.B0,
    222x120, 120 fps) says supported: false, smooth: false in the Simulator. The clip plays anyway, so the Simulator
    probably decodes it in software. V's Simulator timing does not stand for the phone.
- **V, step 3: live** (start-lag design, 44 s). Engaged and run to the end on 4/4 'you' draws, 53-55 rAF ticks each, no
  errors.
  - The video starts moving 2-6 frames after `play()`, then holds a constant lag l0 of -34 to -53 ms: the drift after
    start stays within 1 ms.
  - So V shows each frame 34-53 ms late, and the last 34-53 ms of a draw are cut when the next state starts. This is a
    timing difference, not a pixel one.
  - The first 'you' draw after the prime found the video at 0.415 s and handed back (drift). V now seeks to 0 before
    `play()`.
  - An earlier variant without the start allowance handed back 2 of 4 draws at the 50 ms drift limit. A 1.5x
    catch-up rate made the lag grow to 80-90 ms. Neither is used.
- 'you' cycle: draw-in at 22.0 s and draw-out at 24.2 s after navigation, period 21.44 s.

### Phone ticket P-058

Owner of the run: `iphone-runner`, scheduled by the lead. Block A ran 10-02 from 08:42Z (warm-ups) to 08:59Z (last counted run). Block B waits for the
user's answer on the camera-free route. Run JSON stays in `out/` (Fastwork content; Hard rule 3). No run is recorded
(T-018).

**Question.** On the iPhone, which way of drawing the hero's 'you' word gives the fewest slow frames during and just
after its draws? The pre-registered rule is below.

**Builds.** Snapshot copies, read-only, in `.claude/worktrees/agent-afc7d9fff1fcc6154/out/de-illusion-style/arms/snap/`
(from the main checkout), one overlay root per arm. Full sha256 in `snap/sha256.json`.

| arm | files (sha256, first 12) |
|---|---|
| C | `assets/2.gBuqKVzi.css` `cc8d1340b449`, `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb` |
| F1 | `assets/2.gBuqKVzi.css` `1885674d4ee7`, `nodes/2.DyWL8TcE.js` `a330f386556d`, `assets/accent-frames/manifest.json` `2e1cda7bea3e`, `w00.png` `33be5edafe41` |
| F2 | CSS and JS as F1, `manifest.json` `d409535ca4ce`, `w00-0.png` `9eec489d78f8`, `w00-1.png` `652fcdbe0ce3`, `w00-2.png` `a11188a5d414`, `w00-3.png` `d3d732c9465b`, `w00-4.png` `ee7d720bcdbe`, `w00-5.png` `c52a4c8d4935` |
| F3 | CSS and JS as F1, `manifest.json` `ca4ace2d6119`, `w00-0.png` `020d399b05fa`, `w00-1.png` `e1ed6204df4a` |
| V | CSS and JS as F1, `manifest.json` `120f23bcae4f` (drift 50, start 150), `w00-in.mp4` `7d5b834b69c5`, `w00-out.mp4` `8e8f113f8565` |
| B | `assets/2.gBuqKVzi.css` `7e6b070e15c2`, `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb` |

**The arm JS changed after the canvas arms' pixel checks: `092a5c0cc4ee` → `a330f386556d`.** The canvas path is
byte-identical. All 4 hunks of the diff lie in code only arm V runs:
- `tick()`'s `if (VID)` block: the start allowance and lag l0;
- `go()`'s video branch: seek to 0 before `play()`;
- `clear()`'s log entry: a video-only `l0` field;
- `load()`'s `if (VID)` block: the prime.

The diff is `fixes/illusion-accent-frames/tools/arm-js-092a-a330.diff`, between the HEcanvas function sources. Spliced
into the page JS as `snap.mjs` does, the old source reproduces `092a5c0cc4ee` and the new one `a330f386556d`. So F1,
F2 and F3's pixel results above stand for the new hash.

Rebuild if gone: `node out/de-illusion-style/arms/snap.mjs out/de-illusion-style/arms/snap` in this worktree. Check the
hashes before serving.

**Serve** from the runner's checkout, one server per arm, restarted at the block start (`S` = the snapshot path).
**V needs a serve.mjs with I-054's Range fix** (main 67847b4 or later). Without it V never loads, and its runs are
VOID-ARM.

```sh
node tools/serve.mjs --root site-pretty --overlay $S/<arm> --port 0 --https --vendors=local --latency 150 --no-cache --state out/p058/serve-<arm>.json
node tools/wait.mjs serve out/p058/serve-<arm>.json
curl -s -D - -o /dev/null http://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js   # x-mirror-source: overlay; shasum the body
curl -s -D - -o /dev/null -H 'Range: bytes=0-1' http://localhost:<port>/_app/immutable/assets/accent-frames/w00-in.mp4   # V only: 206
```

**Driver W** at the top of the page, Timeline off. The page is never scrolled during the idle, so every arm keeps
its draws:

```sh
node tools/iphone.mjs open <arm URL> --owner <runner>
node tools/iphone.mjs run --driver window --probe std --owner <runner> --to 1 --settle 8 --idle 44 --hold 2 --sentinel 3 \
  --block P058-<A|B> --build <arm> --arm <C for C, V otherwise> --pos <n> --label P058-<blk>-<n>-<arm> --no-park
node fixes/illusion-accent-frames/tools/readstats.mjs out/p058/P058-<blk>-<n>-<arm>-stats.json   # the arm's own counters
node tools/iphone.mjs park --owner <runner>
```

The 44 s idle (from ~8 s to ~52 s after navigation) holds two 'you' cycles: draw-in at ~22.0 / 43.5 s, draw-out at
~24.2 / 45.6 s.

**Recording: dropped** [amended 10-02 09:0xZ, during block A, before any counted run was analysed]. The user stopped
all QuickTime and camera use by agents (T-018, 08:49Z). Runs are not recorded. The visual-defect criterion (decision
rule 1) now uses other sources, listed there.

**Metrics** (`node fixes/illusion-accent-frames/tools/youdraws.mjs <run.json>...`; per 'you' draw, window = draw start +
2000 ms on the probe's frame stamps):
- live frames in the 0.9 s draw;
- longest gap;
- frames > 50 ms and > 34 ms, with the ±4 ms twins (> 46 / > 54, > 30 / > 38) and the near bands;
- engaged / handed back (arms);
- the idle phase's own summary, all words, for context;
- per run, from readstats: draws, canvas draws, run to the end, handbacks by reason (scroll, miss, drift, play), and
  V's start lag l0 and drift per draw (max |lag - l0| and the first 8 lag values, ms);
- V's prime result per video (`prime`: ok, or the rejection's name). A rejected prime (Low Power Mode may refuse even
  a muted `play()`) leaves V on the SVG for that run, and its draws count as not engaged. The 75 % rule covers it.
  Pass Low Power Mode per run as set on the phone (`run --low-power on|off`); the probe's `lowPowerSuspect` flags a 30 Hz page;
- memory: decoded MB per arm as in the arms table (ESTIMATE). Also the WebContent footprint, if the runner has a way
  to read it (I know none).

Timeline counts (style / layout / paint per draw) come from **attribution runs after the end sentinel**, one per arm:
`node fixes/illusion-accent-frames/tools/tlcounts.mjs out/p058/tl-<arm>.json <arm URL> 46`. These are counts only, not
timed.

**Blocks** (protocol §5). Each block:
1. Park Safari and start the block's servers.
2. One uncounted warm-up W run per arm's port.
3. Sentinel: one uncounted control run, `iphone.mjs run --driver scroll --probe std --arm C` on C (bottom ≥ 58 fps,
   scroll ≥ 44 fps).
4. The counted runs below.
5. End sentinel as in step 3.
6. Attribution runs (Timeline).
7. Park Safari.

Cool between blocks with `node tools/wait.mjs phone-temp --below auto` (at most 10 min, protocol §5.3; never a fixed `wait.mjs time`). Record the battery temperature and the heat note per run.

**Mac load** [amended 10-02 08:4xZ, pre-data, lead]. Log the Mac's load1 at each run start, every run.
- *Preferred, not blocking:* run the blocks in the Mac-quiet window. That is an exclusive `--no-timing` chrome-measure
  hold, with load1 ≤ 8 at each run start. Use it only if I-056(b) has landed by the time the blocks are due, so that
  `iphone.mjs` does not wait on its own hold.
- *Otherwise:* run without the hold, log load1, and do not wait for it.
- *Why not blocking:* iphone-runner found that Mac load does not pace the S driver, which runs on the phone (ρ +0.11).
  W runs on the phone too. A run with load1 > 8 is flagged in the result, not voided.

| block | arms | counted order (rotated Latin square) | n per arm | minutes (ESTIMATE) |
|---|---|---|---|---|
| A | C F1 F2 F3 | C F1 F3 F2 · F2 F3 F1 C (rows 1 and 3 of a Williams 4x4) | 2 runs = 4 'you' draws in, 4 out | ~25 (as run), plus cooling |
| B | C V B | C V B · V B C · B C V | 3 runs = 6 in, 6 out | 22-25, plus cooling |

**Run validity.**
- **VOID-ARM:** readstats' `arm` is not the run's arm (C and B: no arm; F1/F2/F3/V: their label), or an arm never
  became ready (`gate` set, or 0 canvas draws). Re-run once at the block end. A second VOID-ARM makes the arm
  ineligible ("not engaged").
- **VOID-ID:** an engaged draw that is not at a 'you' time (youdraws `void-id`), or fewer than 2 'you' draws inside the
  idle phase.
- **VOID:** scrollY ≠ 0 during the idle; Low Power Mode (rafHz ~30); a missing run JSON.
- A failing sentinel voids the runs since the last passing one (CLAUDE.md "Phone blocks").
- No run is recorded (T-018). The visual check uses the sources in decision rule 1.

**Decision rule (pre-registered with P-058).**
1. **Eligible to ship.** An arm is eligible when all of these hold:
   - it is engaged to the draw end in ≥ 75 % of its 'you' draws;
   - no visual defect in the 'you' draws (a box, an offset, a flash, or a jump at a handback). Without recordings
     (T-018) this is judged from three sources:
     - the Simulator frozen-pixel table above, for the drawn pixels (V's codec differences are disclosed, not a defect);
     - the phone runs' handbacks, from readstats `back` by reason and youdraws `back`. Each one is a possible jump at
       the switch to the SVG, and is listed per arm;
     - the phone frame metrics. A gap is a visible freeze of the word mid-stroke, and it is reported as such, e.g.
       "the word stops for up to 2.3 s" (F1, warm-up).
     A live look at the winner on the phone (flash, box, jump) stays open. The user can do it, or it waits for a route
     the user approves. Rev 3 says so;
   - no new console errors.

   Memory does not make an arm ineligible. The lead and the user set no limit. Rev 3 reports each arm's decoded memory
   next to its timing and states the risk below. The user weighs memory against speed. If F2 wins on timing, rev 3
   shows it with its memory, beside the runner-up.
2. **Rank** all arms, eligible or not, by frames > 50 ms per 'you' draw: the per-run value, median across valid runs.
   Then rank by frames > 34 ms per 'you' draw. Then by pixel difference against C (fewer changed px wins).
   Across blocks: when the two blocks' C ranges do not overlap, rank by each arm's difference from its own block's C
   median.
3. **Not separated.** The result is "not separated" when either holds:
   - the top two arms' per-run ranges overlap on the deciding metric;
   - the order of the top two changes under either ±4 ms twin. This is "threshold-sensitive", reported as such and
     treated as not separated.

   A decider block (C vs the top two) is then a new question with its own prediction row. P-058 runs no third block.
4. A winner that does not beat C (C's range overlaps it on > 50 and > 34) is reported as "no arm beats the SVG on the
   phone". In that case rev 3 recommends keeping the original SVG.

### P-058 results (phone, W driver, OBSERVED)

iPhone 15 Pro Max, iOS 26.6.1 Safari, 430x775, Low Power Mode off. Run by iphone-runner on 10-02: block A 08:42Z-08:59Z,
block B counted runs 09:16Z-09:26Z. Every sentinel passed, no run was void, every V prime was `ok`. Counts are per run, i.e. per 4
'you' draws (2 in, 2 out), in run order. Run JSON: the runner's `out/p058/` (gitignored). B runs carry `meta.arm: "V"`
(the runner's flag sends every non-C build as V); `meta.build` is the key, and youdraws groups by it.

**Post-data change, disclosed.** youdraws missed a stall that started inside a draw's 2000 ms window and ended after it
(F1's 1.8-2.1 s stalls after its in-draws). The fix (ec9b414, after block A's data was in) counts a gap that overlaps
the window: `x.t > s.t && x.t - x.dt < s.t + 2000`. It applies to every arm. It moved F1 run 1 from 6 to 8 frames
> 50 ms and C run 1 from 1 to 2; nothing else changed. The visual-defect criterion of rule 1 changed earlier (7dbc973,
after block A's runs were in, before any was analysed), when recordings were dropped (T-018).

| block | arm | > 50 (46 / 54) | > 34 (30 / 38) | live frames per draw | longest gap ms | engaged to the end |
|---|---|---|---|---|---|---|
| A | C | 2, 0 (3/1, 2/0) | 8, 5 (11/7, 6/3) | 53-55 | 60 | - |
| A | F1 | 8, 10 (8/10, 8/10) | 10, 11 (11/12, 9/10) | 3-24 | 2065 | 8 of 8 |
| A | F2 | 1, 2 (2/5, 0/0) | 9, 11 (12/12, 8/9) | 53-55 | 53 | 8 of 8 |
| A | F3 | 17, 17 (17/18, 16/15) | 22, 23 (22/23, 20/23) | 17-25 | 639 | 8 of 8 |
| B | C | 2, 0, 0 (2/0/2, 1/0/0) | 6, 5, 4 (8/10/8, 5/5/3) | 53-55 | 57 | - |
| B | V | 0, 1, 0 (3/1/1, 0/0/0) | 8, 7, 9 (9/10/12, 6/4/7) | 54-55 | 52 | 8 of 12 (67 %) |
| B | B | 0, 3, 1 (1/4/1, 0/2/0) | 7, 7, 7 (8/11/13, 5/5/3) | 53-56 | 59 | - |

Idle page fps (all words, context): C 59.4 / 59.8, F2 59.6 / 59.6, F3 55.3 / 55.4, F1 51.5 / 51.4. Mac load1 was > 8 at
the start of block A's runs 1-7 (flagged, not void, per the Mac-load amendment).

Timeline counts per 'you' draw (attribution runs after the end sentinel, counts only):
- block A: C style 57-60, layout 56-58, paint 57-70; F2 style 30-43, layout 4-6, paint 31-39. F1 and F3 are low
  because rendering stalled, so they are not savings.
- block B: taken by iphone-runner 09:47Z-09:49Z after all (`out/p058/tl-B-*.json` in its worktree); rev 3 and PR-004 rev 2
  said "not taken" because I had missed the files (corrected in PR-004 rev 3). Per 'you' draw: C style 55-60, layout 55-59,
  paint 55-67; V style 31-42, layout 4-6, paint 3-12; B style 57-59, layout 57-59, paint 58-70 (as C).

**Full page, not isolated (answer to the user's PR-004 rev 2 note).** Every phone number above, and the Chrome r14 counts,
were taken on the full page with every other part loaded and running; only the Simulator stall diagnosis used a
word-only page. What that does to the numbers (OBSERVED unless tagged):
- Style and layout run once per rendering update for the whole document (CONFIRMED: HTML Living Standard, "update the
  rendering", html.spec.whatwg.org/multipage/webappapis.html, "Recalculate styles and update layout for doc", read
  2026-10-02). Timeline counts are per frame, not per part, so they cannot be split into word and rest.
- With 'you' on a canvas or video (F2, V), the page still did 30-43 style recalcs and 4-6 layouts per draw: mostly the
  rest of the page.
- C, 5 runs: the 2 s 'you' windows are 18 % of the 44 s idle and hold 4 of 31 frames > 50 ms (13 %) and 28 of 226 > 34 ms
  (12 %). The whole idle had 0-12 frames > 50 ms per run on the same build. So the 1-3 frame differences between
  the smooth arms are within the rest of the page's noise; the F1/F3 freezes are the word's own.

**Eligibility (rule 1).**
- F1 and F3: freeze (gaps up to 2065 / 639 ms, 3-25 live frames per draw against ~54). Not eligible.
- V's pixels: colour at half resolution (4:2:0) is CONFIRMED by Apple's HEVC Video with Alpha Interoperability Profile
  v0.9, p. 4 (cited under "Video" above); the softer edges and the trailing pen tip are OBSERVED in the Simulator frames.
- V: 8 of 12 draws to the end (67 % < 75 %). Not eligible. Its 4 handbacks were all `drift`, at 66-84 ms. Cause, our
  own design (OBSERVED on the phone): V latches its start lag l0 at the first tick where `currentTime > 0 && !paused`,
  but the picture only advances 4-5 frames later. The lag then grows ~16.7 ms per frame and passes the 50 ms drift
  limit. In the engaged draws l0 was -12 to -69 ms (the video runs behind the SVG's clock by that much, and the draw's
  last 12-69 ms are cut). Fixable (latch l0 on the first frame that moves), but V's fully engaged draws did not beat C
  on frames either, so no fix block is proposed; the user can ask for one.
- F2 and B: eligible. F2 holds ~83 MB of decoded frames for 'you', 1 of the 7 words (ESTIMATE, arms table).

**Rank (rule 2) and separation (rule 3).** Medians of > 50 per run: V 0, C 0 (A) / 0 (B), B 1, F2 1.5, F1 9, F3 17.
- F2 vs C (block A): > 50 overlaps; threshold-sensitive (> 54: F2 0/0 vs C 2/0, looks better; > 46: 2/5 vs 3/1,
  looks worse). > 34: F2 9, 11 vs C 8, 5, worse; the twins agree.
- B vs C (block B): > 50 overlaps (also at 46 and 54). > 34: B 7, 7, 7 vs C 6, 5, 4, worse at 34; threshold-sensitive
  (> 38: identical 5/5/3; > 30: overlap).
- V vs C: > 50 overlaps (also at 46 and 54). > 34: V 8, 7, 9 vs C 6, 5, 4, worse at 34; threshold-sensitive (> 38 and
  > 30 overlap).

**Verdict (rule 4): no arm beats the SVG on the phone.** Rev 3 recommends keeping the original SVG. F2's Timeline saving
(a third to a half fewer style recalcs and paints, ~10x fewer layouts per draw) is main-thread work only; it did not turn into
fewer slow frames, and it costs ~83 MB for one word.

**Visual check (C-021 / C-023, the user's own Screen Recording, numbers only).** `out/de-illusion-style/arms/visan.mjs`
finds the word by template match against the Simulator frame, fits the visits in nav.json, and scores each draw
(frames, longest still, flash, jump, box, rest difference against C). No agent views the frames. Deferred by the user (T-019 #9: make the test easier first); rev 3 says so.

## Word-alone test page (PR-004 rev 3, option word-alone, accepted 10-02 11:15Z)

**What it is.** One page per arm with the hero title alone: "Show the world / what [word] can do". The word is the
page's own accent component (`HE`), with the arm's own code and CSS. Nothing else from the page is on it: no orbit
cards, countdown, buttons, other sections, router or analytics. 22 elements in `<body>`.
- **Same CSS.** The four stylesheets of the full page (`app`, `DialogHeader`, `0`, `2`), byte for byte from the arm.
- **Same place.** The title sits in the same chain of parents with the same classes and attributes: `start-selling` >
  `main` > `section.hero-track` > `div.hero.is-ring-splash-done` > `header.hero-copy` > `div.hero-copy-main` > `h1`.
  So the word lands on the same device pixels. That matters: F2's pictures only engage when the word sits at the
  captured pixel phase.
- **Same code.** `word-alone.js` imports Svelte's own `mount` (`k` from `chunks/BSBv9QXB.js`) and mounts `HE`. `HE`
  is reached by one appended line in the arm's node JS, `export { HE as __fwHE };`. Nothing else in the JS changes. The
  module's top level runs as on the full page (event delegation, selector registry, SvelteKit's fetch wrapper). The app
  itself is not started.
- **Same cycle.** 7 words, idle 2200 ms (first) / 1250 ms, draw-out 900 ms, draw-in 900 ms. The timing comes from the
  component.

**Builds.** Read-only snapshot copies in `.claude/worktrees/agent-afc7d9fff1fcc6154/out/de-illusion-style/arms/snap/WA-<arm>`.
Each is an `--overlay` on `site-pretty`, and serves the test page at `/word-alone.html`. Each WA node JS is the arm's JS
plus the one export line, byte for byte (checked: `wa/hashes.mjs`). Rebuild if gone:
`node out/de-illusion-style/wa/build-wa.mjs`, from the arm snapshots (`snap/{C,F2,B}`, P-058).

| arm | from | files (sha256, first 12) |
|---|---|---|
| WA-C | C (SVG, as shipped) | CSS `cc8d1340b449`, JS `dcc585773503` (= `dbd5fdb4f1fb` + export line), `word-alone.html` `a321a1404911`, `word-alone.js` `ed482f3b84b9` |
| WA-F2 | F2 (one picture per frame) | CSS `1885674d4ee7`, JS `c39a875e9355` (= `a330f386556d` + export line), `manifest.json` `d409535ca4ce`, `w00-0..5.png` as F2, html and js as WA-C |
| WA-B | B (one visible copy) | CSS `7e6b070e15c2`, JS `dcc585773503`, html and js as WA-C |

The full-page control **FP** is P-058's C snapshot, unchanged (`snap/C`: CSS `cc8d1340b449`, JS `dbd5fdb4f1fb`), at `/`.

**Chrome check (shared lane, 430x932 DPR 3, CPU 1x, counts only; `wa/check.mjs`, OBSERVED).**
- **Works.** No console errors, exceptions, 404s or failed loads. The cycle runs:
  you → คุณ → 你 → 너 → あなた → kamu → du → you, labels every 3.05 s, draws 1800-1804 ms.
- **Same size and place.** em at x 167.016, y 238.516, 66.25 x 46.25 ('you', 40 px), the same as on the full page;
  h1 at 69.266 / 192.516.
- **Same pixels.** Word-alone against the full page, two held poses (first Thai word idle with its animations held at
  300 ms; its draw-out held at 450 ms), crop = word + 24 px: 0 changed pixels in both poses, for all three arms.
- **Main-thread work, per draw** (out + in, 1.8 s) **on the word-alone page:**

  | arm | style recalcs | layouts | paints | between draws (1.25 s) |
  |---|---|---|---|---|
  | WA-C | 108 | 2 | 430 | 2-3 style, 1-2 layouts, 2-4 paints |
  | WA-F2 | 108 | 2 | 430 | same as WA-C |
  | WA-B | 108 | 2 | 218 | same as WA-C |

  WA-F2 is the SVG in Chrome: F2's clock gate keeps the SVG on Chrome's 100 µs timeline, as on the full page.
- **Compared with the full page** (r14, per 0.9 s draw, SVG): 58.6 style recalcs, 7.9 layouts, 220.5 paints. The word
  alone has ~54 style recalcs, ~1 layout and ~215 paints per 0.9 s.
  So in Chrome nearly all of the style and paint work in a draw is the word's own. The rest of the page adds about
  7 layouts per draw (OBSERVED, counts, different window code).

**Simulator check (one `sim.mjs session --functional`, Safari 26.5, 15 Pro Max; `wa/sim-hold.sh`, OBSERVED, no timing).**
- **Works.** No errors in any arm. The draws run 897-906 ms with 53-55 rAF ticks each. No 404s.
- **F2 engages.** On WA-F2, both 'you' draws went to the canvas, and every other word stayed on the SVG, as on the full
  page. 28 frame requests, no gate.
- **Pixels against the full page** (`frames/simpix.mjs`: same held pose, Simulator screenshots; crop = the title + 30 px).
  - C and B, draw-out: 1.3 % of pixels differ, by at most 8 levels of 255.
  - C and B, draw-in: 1.0 %, at most 2 levels.
  - F2, 'you' on the canvas, draw-in: 1.1 %, at most 2 levels.
  - The differences cover the title's text columns as well as the word's. My guess is that WebKit tiles and layers the
    page differently when the page holds less (UNRESOLVED, not checked). Visually the word is the same.
  - Below the title, the full page has its subtitle; the word-alone page is white there (expected).
- **Fit to the W driver.** The 'you' draws fall at the same times as on the full page: draw-in ~22.8 / ~44.1 s,
  draw-out ~24.9 / ~46.3 s after navigation, so 2 'you' cycles fall inside the 44 s idle.

### Phone ticket P-065 (word-alone)

Owner of the run: `iphone-runner`, slotted by the lead after fix-scroll-engine's P2-1. Run JSON stays in `out/`
(Hard rule 3). No recording (T-018).

**Question.** With nothing else on the page, do the drawing methods differ in slow frames? And how many of the full
page's slow frames during the 'you' draws are the word's own?

**Arms (4), one block.**
- FP: the full page, P-058's control C.
- WA-C: the SVG alone.
- WA-F2: pictures alone.
- WA-B: one visible copy alone.

FP sits in the same block, so the isolation question is answered within one block, on one heat state, not against
P-058's numbers from another block.

**Serve** from the runner's checkout, one server per arm, restarted at the block start. `S` is the snapshot directory
above. FP uses `--overlay $S/C`; the WA arms use `--overlay $S/WA-<arm>`.

```sh
node tools/serve.mjs --root site-pretty --overlay $S/<dir> --port 0 --https --vendors=local --latency 150 --no-cache --state out/p065/serve-<arm>.json
node tools/wait.mjs serve out/p065/serve-<arm>.json
curl -sk https://localhost:<port>/word-alone.html | shasum -a 256          # WA arms: a321a1404911...
curl -sk https://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256   # per the table
```

**URLs.**
- FP: `https://<LAN>:<port>/`
- WA arms: `https://<LAN>:<port>/word-alone.html`

**Driver W**, as in P-058:

```sh
node tools/iphone.mjs open <URL> --owner <runner>
node tools/iphone.mjs run --driver window --probe std --owner <runner> --to 1 --settle 8 --idle 44 --hold 2 --sentinel 3 \
  --block P065 --build <FP|WA-C|WA-F2|WA-B> --arm <C for FP, V otherwise> --pos <n> --label P065-<n>-<arm> --no-park
node fixes/illusion-accent-frames/tools/readstats.mjs out/p065/P065-<n>-<arm>-stats.json
node tools/iphone.mjs park --owner <runner>
```

**Block** (protocol §5):
1. Park Safari; start the four servers.
2. One uncounted warm-up W run per arm's port.
3. Sentinel: `iphone.mjs run --driver scroll --probe std --arm C` on FP (bottom ≥ 58 fps, scroll ≥ 44 fps).
4. 12 counted runs. The order is rows 1-3 of a Williams 4x4 (a = FP, b = WA-C, c = WA-F2, d = WA-B):
   FP WA-C WA-B WA-F2 · WA-C WA-F2 FP WA-B · WA-F2 WA-B WA-C FP.
5. End sentinel, as in step 3.
6. Attribution runs, Timeline on, counts only, one per arm:
   `node fixes/illusion-accent-frames/tools/tlcounts.mjs out/p065/tl-<arm>.json <URL> 46`.
7. Park Safari.

Estimate: ~14 min of counted runs (P-058 block B ran 9 in 10 min), plus ~5 min of warm-ups, ~3 min of sentinels and
~4 min of attribution: ~26 min, plus cooling before it (`wait.mjs phone-temp --below auto`).
Short slot: rows 1 and 3 only (n = 2, ~18 min), with the same rule. With n = 2 a non-overlap is weaker, and the result
says so. Battery temperature and Mac load1 are logged per run, as P-058 (load1 > 8 is flagged, not void).

**Metrics.** As P-058 (`youdraws.mjs`): per 'you' draw (start + 2000 ms), counted per run (4 draws):
- frames > 50 ms and > 34 ms, with the ±4 ms twins and the near bands;
- live frames per draw;
- the longest gap;
- engaged to the end (WA-F2).

Also the **whole 44 s idle**, all words: frames > 50 and > 34 per run, and the idle fps. P-058 used it only as context;
here it carries the isolation question.

**Run validity.** As P-058:
- **VOID-ARM:** WA-F2's readstats `arm` is not F2; it is gated; or it has 0 canvas draws. Re-run once at the block end.
- **VOID-ID:** fewer than 2 'you' draws in the idle, or an engaged draw at a non-'you' time.
- **VOID:** scrollY ≠ 0; Low Power Mode; a missing JSON.
- A failing sentinel voids the runs since the last passing one.

Predictions and the decision rule: P-065 in `fixes/PREDICTIONS.md`, registered before any phone data. In short:

**Predictions** (OBSERVED basis: P-058 phone numbers, the Chrome counts above):
- (a) WA-C's whole idle is quiet:
  - > 50: 0 per run [0, 1];
  - > 34: ≤ 10 per run [0, 10];
  - FP: > 50 [0, 12] and > 34 [30, 60] per run, as P-058.
- (b) In the 'you' windows, WA-C has fewer slow frames than FP:
  - > 34: WA-C [0, 3] against FP [3, 9] per run;
  - > 50: both [0, 2];
  - i.e. most of the full page's > 34 frames during 'you' come from the rest of the page.

  Low confidence: Chrome says the draw's style and paint work is nearly all the word's own.
- (c) The arms alone are not separated: WA-F2 and WA-B within WA-C's range on > 50 and > 34 in the 'you' windows. No
  arm beats the SVG alone.
- (d) Timeline per 'you' draw (counts):
  - WA-C: style 50-60, layout 50-60, paint 50-70. That is FP's level: on WebKit the SVG draw itself lays out every
    frame (OBSERVED in P-058: F2 and V drop layout to 4-6).
  - WA-F2: style ≤ 12, layout ≤ 3.
  - So most of the full-page F2's 30-43 style recalcs per draw were the rest of the page.
- (e) WA-C idle fps ≥ 59.5.

**Decision rule.**
1. **Isolation (the user's question).**
   - "The rest of the page adds slow frames in the word's windows" when FP's and WA-C's per-run ranges do not
     overlap on > 34 or > 50 in the 'you' windows, and both ±4 ms twins agree.
   - Otherwise: "the slow frames during the draws are the word's own (or noise)".
   - The whole idle is read the same way, for the page as a whole.
2. **Arms alone.** As P-058 rules 1-3: eligibility, rank by > 50 then > 34 per 'you' window, and separation. An arm
   beats the SVG alone only when its range lies wholly below WA-C's and the twins agree.
3. **Recommendation.**
   - No arm beats WA-C: keep the SVG; the illusion topic closes.
   - An arm beats WA-C (P-058 found no full-page win): report "it saves the word's own cost, which the rest of the page
     hides today". Keep the SVG now, and offer a full-page re-test after the other fixes land. That would be a new
     question with its own row. F2's ~83 MB for 'you' is shown next to it.
   - Threshold-sensitive or not separated: keep the SVG. No second block unless the user asks.
4. **Counts.** Timeline counts are reported per arm with FP minus WA (the rest of the page's share). Counts only, not
   timing.

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

- P-058 decided it: no arm beats the SVG on the phone, so rev 3 recommends keeping it. Open only if the user asks: a V
  fix block (latch l0 on the first moving frame), as a new question with its own prediction row.
- Placement is verified at scrollY 0 only. Sim-vs-phone frame identity is UNRESOLVED.
- How often the phone's clock gives a ms with no frame (a handback) is UNRESOLVED.
- reduced-motion is unchanged: the effect returns early before the arm is created.
- Overlaps: any topic that changes the hero copy's position or transform moves the word under the canvas. The
  placement check hands back to the SVG then, but the frames would need recapturing.
