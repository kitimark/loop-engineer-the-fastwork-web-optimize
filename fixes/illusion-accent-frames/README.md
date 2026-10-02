# Fix: illusion-accent-frames

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. PR-001 rev 2 was accepted (2026-10-02 06:31Z). The rev 3 arms are built, and phone ticket P-058 is
prepared but not run ("PR-001 rev 3" below). Rev 3 is posted after the phone blocks.
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

## PR-001 rev 3: arms and phone ticket P-058 (prepared, not run)

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
| V | HEVC with alpha (4:2:0), one `<video>` per direction, played from the draw start; handback when it drifts > 50 ms from the draw clock | - (media clock) | 2 MP4, 120 fps, 222x120, 117,919 + 116,284 B | video decoder buffers, not estimated |
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
| V | PENDING (I-054) | | | |
| B | 142 | 0 | 0 | 0 |

### Live functional check (Simulator, OBSERVED, no timing claim)

44 s at the top per arm, plain rAF counter.
- **F2:** engaged on both 'you' draws, 53-55 rAF ticks per 0.9 s draw. That equals the SVG draws on the same page. It
  reached frame 884-900. No errors.
- **F3:** engaged, but stalls like F1 in rev 2: 0-23 ticks per draw, gaps up to 1.27 s. This is a Simulator
  observation, not a verdict. The phone decides.
- **V:** never ready. `tools/serve.mjs` answered Safari's byte-range requests with 200, and the videos never loaded.
  Incident I-054 (Range support in serve.mjs) is fixed by ts-i054, not yet landed. **Arm V's served-content path depends
  on I-054's fix.** Apple: "HTTP servers hosting media files for iOS must support byte-range requests" (Safari Web
  Content Guide, "Configuring Your Server").
- 'you' cycle: draw-in at 22.0 s and draw-out at 24.2 s after navigation, period 21.44 s.

### Phone ticket P-058

Owner of the run: `iphone-runner`, scheduled by the lead (PR-001 is third, after G1 and the stack test). No
measurement has been made with this ticket. Run JSON and recordings stay in `out/` (Fastwork content; Hard rule 3).

**Question.** On the iPhone, which way of drawing the hero's 'you' word gives the fewest slow frames during and just
after its draws? The pre-registered rule is below.

**Builds.** Snapshot copies, read-only, in `.claude/worktrees/agent-afc7d9fff1fcc6154/out/de-illusion-style/arms/snap/`
(from the main checkout), one overlay root per arm. Full sha256 in `snap/sha256.json`.

| arm | files (sha256, first 12) |
|---|---|
| C | `assets/2.gBuqKVzi.css` `cc8d1340b449`, `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb` |
| F1 | `assets/2.gBuqKVzi.css` `1885674d4ee7`, `nodes/2.DyWL8TcE.js` `092a5c0cc4ee`, `assets/accent-frames/manifest.json` `2e1cda7bea3e`, `w00.png` `33be5edafe41` |
| F2 | CSS and JS as F1, `manifest.json` `d409535ca4ce`, `w00-0.png` `9eec489d78f8`, `w00-1.png` `652fcdbe0ce3`, `w00-2.png` `a11188a5d414`, `w00-3.png` `d3d732c9465b`, `w00-4.png` `ee7d720bcdbe`, `w00-5.png` `c52a4c8d4935` |
| F3 | CSS and JS as F1, `manifest.json` `ca4ace2d6119`, `w00-0.png` `020d399b05fa`, `w00-1.png` `e1ed6204df4a` |
| V | CSS and JS as F1, `manifest.json` `56d7c70fe43e`, `w00-in.mp4` `7d5b834b69c5`, `w00-out.mp4` `8e8f113f8565` |
| B | `assets/2.gBuqKVzi.css` `7e6b070e15c2`, `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb` |

Rebuild if gone: `node out/de-illusion-style/arms/snap.mjs out/de-illusion-style/arms/snap` in this worktree. Check the
hashes before serving.

**Serve** from the runner's checkout, one server per arm, restarted at the block start (`S` = the snapshot path).
**V needs a serve.mjs with I-054's Range fix** (on main once landed). Without it V never loads, and its runs are VOID-ARM.

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

**Recording.** One per counted run: QuickTime USB recording of the iPhone via osascript, the same method as
iphone-runner's C-017. Use the same method for every run, and name each file by its label.

**Metrics** (`node fixes/illusion-accent-frames/tools/youdraws.mjs <run.json>...`; per 'you' draw, window = draw start +
2000 ms on the probe's frame stamps):
- live frames in the 0.9 s draw;
- longest gap;
- frames > 50 ms and > 34 ms, with the ±4 ms twins (> 46 / > 54, > 30 / > 38) and the near bands;
- engaged / handed back (arms);
- the idle phase's own summary, all words, for context;
- per run, from readstats: draws, canvas draws, run to the end, handbacks by reason (scroll, miss, drift, play), and
  V's drift per draw (max and first 8 values, ms);
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

Cool 10 min between blocks. Record the battery temperature and the heat note per run.

| block | arms | counted order (rotated Latin square) | n per arm |
|---|---|---|---|
| A | C F1 F2 F3 | C F1 F3 F2 · F2 F3 F1 C (rows 1 and 3 of a Williams 4x4) | 2 runs = 4 'you' draws in, 4 out |
| B | C V B | C V B · V B C · B C V | 3 runs = 6 in, 6 out |

**Run validity.**
- **VOID-ARM:** readstats' `arm` is not the run's arm (C and B: no arm; F1/F2/F3/V: their label), or an arm never
  became ready (`gate` set, or 0 canvas draws). Re-run once at the block end. A second VOID-ARM makes the arm
  ineligible ("not engaged").
- **VOID-ID:** an engaged draw that is not at a 'you' time (youdraws `void-id`), or fewer than 2 'you' draws inside the
  idle phase.
- **VOID:** scrollY ≠ 0 during the idle; Low Power Mode (rafHz ~30); a missing run JSON.
- A failing sentinel voids the runs since the last passing one (CLAUDE.md "Phone blocks").
- A missing recording does not void the numbers. The visual check needs at least 2 recorded runs per arm.

**Decision rule (pre-registered with P-058).**
1. **Eligible to ship.** An arm is eligible when all of these hold:
   - it is engaged to the draw end in ≥ 75 % of its 'you' draws;
   - its recordings show no visual defect in the 'you' draws (a box, an offset, a flash, or a jump at a handback);
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
