# Unknown fields: validity of our experiments (arch-unknowns)

Status: desk research, 2026-10-01 ~10:50Z. No Chrome, no iPhone, no locks. Asked by the user: things nobody has measured
or controlled that could distort or limit our experiments, each with its cheapest probe. Builds on
`measurement-protocol-v2.md` (v2) and does not repeat its §10 open items.
Split with the peers: `de-unknowns-render` owns the render-pipeline terms (image decode, layer memory, event regions,
GC, fonts, vendor cost); `de-unknowns-ux` owns what users perceive and do. Here: the *conditions* of a measurement
(device, host, page and network state) and the *design* (drivers, coverage, statistics).
Confidence tags: **data** (our raw files, recomputed here), **vendor source**, **vendor doc**, **inference**.
Raw phone data: `fixes/iphone-wave2/raw/` (41 scripted runs, 6 finger recordings). Times are UTC.

## 0. Ranked list

| # | unknown | evidence | cheapest probe | cost | value | owner |
|---|---|---|---|---|---|---|
| U1 | Mac display / power state during Chrome holds | strong (data) | join results with `pmset -g log`; one display on/off A/A | desk 15 min + 1 normal slot | **high**: explains the canary drift and the "new floor" | arch-ops, toolsmith (T8) |
| U2 | What a WebKit rAF gap means: not vsync-quantized | strong (data + vendor source) | report both thresholds now; join one control with Instruments (T10) | desk + phone 5 min | **high**: the goal's ">50 ms" count flips on it | arch-lead (§3.2), T3 toolsmith |
| U3 | Driver coverage: speed, toolbar geometry, direction, 2nd pass | strong (data) | fast-step and up-pass scripted runs; G for toolbar | phone 10 min | **high**: finger long-frame share is ~4-5x scripted, unexplained | iphone-runner, ts-gesture |
| U4 | Phone heat as a continuous covariate (charging, thermal policy) | medium (data + vendor source) | `idevicediagnostics` battery temperature per run | seconds per run | high | iphone-runner |
| U5 | Cold vs warm state per origin and after a screen lock | medium (data) | lock-vs-awake control pairs; warm-up per arm port | phone 10 min | medium-high | iphone-runner, arch-lead |
| U6 | Network activity inside the timed window (http twin, +150 ms) | weak (inference + I-003 untested) | Resource Timing dump per run | 0 extra (fold into T1a) | medium | T1a toolsmith |
| U7 | Wall-clock page state: the countdown | strong (code) | log `Date.now()` per run; Date-override mech count | desk + short lane | medium; **hard expiry 2026-11-02 05:00Z** | arch-bench, countdown owner, lead |
| U8 | Chrome field trials and persistent profile | medium (profile files) | archive `ChromeFeatureState` per hold; `--enable-benchmarking` A/A at a wave boundary | desk + 1 slot | medium | toolsmith (T8) |
| U9 | Phone settings never recorded (Reduce Motion, flags, blockers) | weak (unrecorded) | environment fingerprint per run; one settings check by the user | 0 + user 2 min | medium (cheap insurance) | iphone-runner, lead |
| U10 | Inspector attached during every phone run | weak (inference) | detached self-driving A/A | phone 10 min | low-medium | ts-iphone-run |
| U11 | Page states and starts never tested on the phone | medium (coverage) | load+1 s start; down-up-down pass | phone 10 min | medium | iphone-runner, de-unknowns-ux |
| U12 | Document height changes mid-run on the baseline | weak (data) | log `scrollHeight` per frame (T1a) | 0 | low | T1a toolsmith |

## U1. The Mac's display and power state changes Chrome numbers (top unknown)

**Unknown.** Whether the internal display's state (on with a user, off / DarkWake) changes Chrome's frame cadence or
main-thread budget at 6x. The host record (`tools/lib/host.mjs`) logs load, CPU, pressure, sleep, but not the display.

**Evidence (data).** `pmset -g log` on this Mac: display on 2026-09-30 16:59Z → off 2026-10-01 00:16:55Z; DarkWake with
"Maintenance Sleep" cycles from ~00:20Z; FullWake by user activity 06:21:51Z, display on since 06:22:55Z. Plain
baseline scroll fps at quiet load, by state:

| when | display | baseline fps (scroll, median) | source |
|---|---|---|---|
| 2026-09-30 23:47Z | on | 74.9 (load1 3.0-4.4) | `fixes/wave1-partial/results.json` |
| 2026-10-01 04:25Z / 04:37-04:51Z | **off (DarkWake)** | ~92 canary / 93.8 | protocol v2 L8; `fixes/all-wave1/results.json` |
| 2026-10-01 08:31Z / 10:08Z | on | 78 / 75.9 canary | protocol v2 L8 |

The 75 → 93 jump was credited to the gated tools ("new floor, never compare with pre-gate numbers", DIRECTION), and
the 92 → 76 fall is v2's unexplained L8. Both coincide with display transitions. Also: `pmset -g assertions` shows
`PreventUserIdleDisplaySleep 0` (caffeinate holds only system sleep) and `displaysleep 20`, so the display sleeps
after 20 min without input: the state flips whenever the user steps away. Mechanism candidates (inference): no
WindowServer composition of the Chrome window, a different BeginFrame source without a display link, no swap
back-pressure. Wave-2 holds from 04:37Z to 06:21Z (all-wave1, N11, /10c, part 4, the N13 probe) ran
display-off; N12 (06:31Z), the N13 storm-catch (06:45Z) and later ran display-on. Within-hold A/Bs stay valid; every cross-hold comparison and the 6x calibration (state unknown)
are suspect.

**Probe.** (a) Desk, 15 min: tag every `results.json`, canary and A/A with the display state from `pmset -g log`
(`grep -E "Display is turned|DarkWake|FullWake"`). If the 76-78 vs 92-94 split follows the display exactly, U1 replaces
"tools vs host bisect" in v2 §6.3. (b) One normal slot: canary A/A interleaved `on off on off`, display kept on with
`caffeinate -d -u -t 600`, off with `pmset displaysleepnow` (the user's machine: the lead asks first).
**Then:** hold the display state constant in every hold (`caffeinate -d` inside `lock.mjs run`, or document "off") and
add `display`, `fullWake`, `powerSource` to the host record (v2 T8).
**Value.** High: decides whether the floor is ~76 or ~93 and whether the canary drift is the host, not the tools.

## U2. A WebKit rAF gap is not a vsync count

**Unknown.** How a phone rAF dt maps to presented frames, hence what v2 §3.2's tick k = round(dt/8.333) means on WebKit.

**Evidence.** WebKit freezes the "now" timestamp at the *start* of each rendering update (`Page::updateRendering`,
`freezeNowTimestamp`, vendor source), so the rAF argument is the update start time (1 ms coarse), not a vsync time.
Our data agrees: over 41 scripted runs, 9.3 % of all gaps ≥ 12 ms but **74.8 % of gaps ≥ 34 ms (501 of 670)** lie
more than 1.2 ms off the 8.33 ms grid (values 35-48 ms are common). The goal metric is threshold-sensitive exactly
where it matters: aw1-10c goal runs count ">50 ms" 3/3/2 but k≥7 1/2/1; the baseline 5/5/13 vs 4/4/11; the hero
block's #people-entry frame (y≈687-705) sits at 51-53 ms in 6 of 15 hero-window runs, i.e. ">50" yet k=6. Chrome passes
the BeginFrame time, so the tick model holds there.
**Probe.** Desk now: report every phone verdict in both forms (dt > 50 and k≥7) and flag frames within 4 ms of a
threshold (T3 analysis lib). Phone, 5 min, with T10: one control run with Instruments Animation Hitches and the rAF
logger joined via `performance.mark`; per long frame, compare dt with the presented-frame interval.
**Value.** High: whether the #people frame "is over 50 ms" decides goal status and the hero v2 verdict (52 → 63).

## U3. The scripted drivers sample a different scroll than the finger

**Unknown.** Which part of the finger's extra jank comes from speed, toolbar geometry, direction, touch or heat.

**Evidence (data, finger-A2/B2/E1b/F1/F2, y < 4485 so the morph is excluded).** Velocity of moving frames: finger p10 /
p50 / p90 / p99 = 163 / 1174 / 3500 / 7063 px/s (n = 2704); scripted (goal-B2) 235 / 882 / 1302 / 1611: the driver
never exceeds the finger's median by much and never reaches its p90. innerHeight 815 (toolbar collapsed) in ~57 % of
finger frames, 0 % of scripted ones. Share of frames ≥ 37.5 ms: finger down 14.3 %, up 8.5 %; at 815 14.0 % vs 775
7.4 %; flat over velocity bins (<1k 11.8 %, 1-2k 11.2 %, 2-4k 13.1 %, >4k 12.1 %); scripted scroll phase 1.8-3.4 %.
So speed alone does not explain the ~4-5x gap. Confounders: the finger runs mixed builds and ran on a warm phone (ctl-B10
right after them: 22.8 fps, fail). No scripted run scrolls up or makes a second pass in the same load.
**Probe (phone, 10 min, after a passing control):** W runs with `scrollBy({top: 750})` every 300 ms (~2.5k px/s), and a
down-up-down pass, baseline vs aw1-10e, ABBA. Toolbar geometry needs G (ts-gesture V0/V1). Tag every finger
frame with the preceding control's heat state before comparing finger with scripted.
**Value.** High: tells whether the scripted gate can stand in for the finger, or which driver variant must.

## U4. Phone heat is a covariate, not a pass/fail

**Unknown.** The phone's thermal state run by run; how much a "passing" control is already slowed.

**Evidence.** The phone stays on USB and charges (74 % at 06:59Z, ~80 % at 07:44Z); whether Optimized Charging stops
at 80 % (changing heat mid-day) is unknown. WebKit halves rAF to 30 fps for `LowPowerMode`, `VisuallyIdle`,
`NonInteractedCrossOriginFrame` and `AggressiveThermalMitigation` (`AnimationFrameRate.cpp`, vendor source); the finger
A1 run's 29.8 fps cap fits that switch. Milder throttling has no cadence signature: failing controls ctl-B7/B8 show 117 /
160 gaps of ~25 ms vs 40-60 in passing ones, and the sentinel sees it only once bottom or scroll fps falls.
**Probe:** `idevicediagnostics ioregentry AppleSmartBattery` (Temperature, IsCharging, InstantAmperage,
CurrentCapacity) at each run start and end, into the block record. It reads over USB, does not touch Safari; it is
still the phone, so it runs inside the holder's lease. Battery temperature lags the SoC: use it for trend and ABBA balance.
The user answers once: Optimized Battery Charging / 80 % limit on or off.
**Value.** High: a heat trend inside a block biases ABBA when warming is non-linear; also an early stop signal.

## U5. Cold vs warm state per origin and after a screen lock

**Unknown.** What a "warm-up run" must warm. Mechanisms (decode caches, tile release) are de-unknowns-render's.

**Evidence (data).** ctl-B15 (first run after ~16 min idle) vs ctl-B15b 35 s later: scroll 42.3 vs 53.0 fps,
k≥5 44 vs 12, and the worst frame **moved**: y 600-800 max 109 vs 62 ms, y 1900-2000 max 44 vs 102 ms. goal-B1 (first
run of the session) 146 ms at y≈1960 vs 112-113. A cold run changes where the frames are. Each build is served on its own
port, i.e. its own origin, and the HTTP and memory caches are per origin; v2 §5.2's warm-up warms only the control's
port. One of the two first-on-port runs we have (goal-B1, not goal-P1) was an outlier. The screen auto-locks between
blocks (the runner once lost the page target).
**Probe (phone, 10 min):** control after 10 min locked, then after 10 min awake on the page; warm-up run on every arm's port.
**Value.** Medium-high: v2 amendment "warm up each arm's port" is one line.

## U6. Network work inside the timed window

**Unknown.** How many fetches, decodes and late responses land between scroll start and end, per device and protocol.

**Evidence.** The phone uses the plain-http twin (I-003: HTTP/1.1, no TLS; Safari opens ~6 connections per host,
inference); Chrome uses HTTP/2 + TLS; both add 150 ms before every response (`serve.mjs` `--latency`). I-003 was
resolved with "scroll metrics unaffected", never measured. The worst phone frame (y≈1960) involves the morph panel's
images (F-043/F-044), and the hero block served `--no-cache` while the goal block did not.
**Probe:** in every run, after the bottom phase, dump `performance.getEntriesByType('resource')` with `startTime`,
`responseEnd`, `nextHopProtocol`, `transferSize`, and count entries inside each phase (T1a standard probe; Chrome the
same via `Runtime.evaluate`). One Chrome hold (h2 vs `--https` off) answers the protocol question without the phone.
**Value.** Medium; zero device time if folded into T1a.

## U7. The snapshot is frozen, its clock is not

**Unknown.** How much the countdown's wall-clock state moves our numbers.

**Evidence (code).** Target `2026-11-02T12:00:00+07:00` (= 05:00Z, `nodes/2.DyWL8TcE.js` 3905); `rD` derives days /
hours / minutes / seconds, `cD` re-renders every 1 s (3931-3936), also in the hidden panel copy. Minute and hour
rollovers flip more faces than a plain second; the days face changes daily at 05:00Z. After the deadline every unit is
0 and the per-second flips stop: the page gets cheaper by itself, so **results before and after 2026-11-02 05:00Z do not
compare**, and no baseline run has the post-deadline state.
**Probe:** log `Date.now()` at the start of each run (phone and Chrome) so each long frame gets its seconds phase (desk
analysis: is any k≥5 cluster phase-locked?). Short lane: bench mech with a `Date` override 33 days ahead, counting face
writes (expect 0/s). Lead: note the expiry in `baseline.json` notes or the snapshot README.
**Value.** Medium; the expiry is a certainty.

## U8. Chrome field trials and a persistent profile

**Unknown.** Whether Chrome's server-side variations changed between holds.

**Evidence (profile files).** `verify.mjs` reuses `out/chrome-verify-profile` (persistent HTTP cache:
`Network.setCacheDisabled false`). Its `ChromeFeatureState` lists 178 enabled and 32 disabled field-trial features,
including `ThrottleRepeatedNoDamageFrames` (study `ThrottleConsecutiveNoDamageMainFrames`), `UnthrottleAsyncTouchMoves`,
`ScalableFrameEviction`, `ThrottleResizeIpc`; `Local State` shows the seed fetched at 09:51Z, i.e. refreshed during the
study. Whether no-damage throttling changes idle-phase rAF/s (v2 idle triple) is inference. The Chrome version is
constant: 154.0.8037.58 installed 2026-09-30 17:09Z (153 still on disk), before every committed result here.
**Probe:** desk: store Chrome version and a hash of `ChromeFeatureState` in every host record (T8). At a wave boundary,
one A/A with `--enable-benchmarking` (disables field trials, default variants: chrome-launcher flags doc) to re-baseline.
**Value.** Medium; it is measurement code: call it out and switch only between waves.

## U9. Phone settings nobody recorded

**Evidence.** Recorded only: Low Power Mode off (user; idle 59.5-60.6 fps is consistent, since WebKit would halve rAF to
30). Unrecorded (mgmt-ops-4, iphone-runner): Reduce Motion (the page has 28 `prefers-reduced-motion: reduce` CSS blocks
and 16 JS `matchMedia` checks), Limit Frame Rate, content blockers, Safari Feature Flags ("Prefer Page Rendering Updates
near 60fps" decides the 60 Hz rAF), auto-brightness, True Tone, Background App Refresh. The hero block counted 17 running
animations, so Reduce Motion is probably off (inference).
**Probe:** one-line fingerprint per run (prefers-reduced-motion, prefers-color-scheme, `devicePixelRatio`,
`screen.width/height`, `innerHeight`, `navigator.hardwareConcurrency`, `document.getAnimations().length`, UA). The user,
2 min, once: Accessibility > Motion, Battery, Safari > Extensions, Safari > Advanced > Feature Flags (changed or not).
**Value.** Medium as insurance: one wrong toggle voids every phone number.

## U10. The inspector is attached to every phone measurement

**Evidence.** All phone timing runs keep a Web Inspector frontend attached, and `iphone.mjs` polls `Runtime.evaluate`
every 1.5 s inside the timed window (line 127). Proxy Mac CPU is 0 % (iphone-runner); the phone-side cost is unknown.
v2 §5.5 A/As protocol-side probes against each other, never against "no inspector".
**Probe (phone, 10 min):** a self-driving overlay page (logger + `scrollBy` start 20 s after load, results to
`localStorage`); stop the proxy for the run, read back after. 3 attached vs 3 detached, ABBA. **Value:** low-medium.

## U11. Page states and starts we never drive on the phone

Never sampled by a phone driver: scroll within 1-2 s of load (every driver waits 8 s; /10c un-skips on Safari at load
+0.65-0.8 s, still loading at that time); a second pass in the same load after scrolling up (decoded, un-skipped,
mounted); BFCache restore; after a tap (iOS sticky `:hover`); the `th` and `id` locales (active in `bN.locales`, not
mirrored: Thai line breaking and font fallback are untested); landscape; other iPhones (60 Hz panels). v2 T5 adds
input-at-load and scroll-up for Chrome only. **Probe (phone, 10 min):** W start at load+1 s; down-up-down pass;
de-unknowns-ux ranks which states users hit. **Value:** medium.

## U12. The baseline's height changes during a run

**Evidence (data).** Baseline runs record `maxY` 5224 at scroll start and `finalY` 5239-5260 (docH 6035 at the end);
aw1-10c / aw1-10e record 5260 from the start. On the baseline, sections below the change sit up to 36 px off between
the first and the last frames. **Probe:** log `scrollHeight` per frame (T1a); crossing coordinates (v2 §3.4) then use the
frame's own element tops. **Value:** low; it matters only for baseline-vs-build position diffs.

## Checked at the desk and closed

- **Service workers:** the site registers none (`chunks/CzkAa0og.js` 558 only updates an existing registration).
- **Hover/pointer media in Chrome:** every `(hover: none) and (pointer: coarse)` and `device-width` branch is OR-ed with
  `width <= 860-1200 px`, so at 430 px Chrome takes the phone branch whatever touch emulation reports.
- **Chrome version** did not change during any committed result (U8).
- **Warm controls are stable over the day:** 10 passing baseline controls (06:55-09:52Z): scroll k≥5 11.5 ± 1.3,
  k≥7 4.1 ± 0.6, y≈1960 worst 108 ± 8 ms, fps 53.2 ± 0.7. Usable as a prior for 4v4 power: a 4v4 block resolves
  about 3-4 k≥5 frames or ~20 ms on the y≈1960 frame, not one frame.
- **Low Power Mode** ruled out for the logged runs (U9).

## Handed to peers, not analysed here

de-unknowns-render (`research/design-engineering/unknowns-render.md`): decode caches, font loading, layer memory, event
regions, GC, vendor script cost. de-unknowns-ux (`research/design-engineering/unknowns-ux.md`): perceived vs measured
hitches, 60 Hz rAF on a 120 Hz scroll, real users' gestures and populations. v2 §10 items (framebuffer capture of
backdrop, Instruments signposts, event-region term, Timeline overhead) are not repeated.

## Sources

- WebKit `Source/WebCore/page/Page.cpp` (`updateRendering`, `freezeNowTimestamp`, throttling reasons) and
  `Source/WebCore/platform/graphics/AnimationFrameRate.cpp` (`halfSpeedThrottlingReasons`), github.com/WebKit/WebKit,
  main branch, read 2026-10-01 (vendor source; the 26.6.1 build may differ).
- chrome-launcher, "Chrome flags for tools", `--enable-benchmarking`:
  https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md (vendor doc).
- This Mac: `pmset -g log`, `pmset -g assertions`, `pmset -g`; `out/chrome-verify-profile/ChromeFeatureState` and
  `Local State`; Chrome framework versions on disk (data, read-only).
- Phone: `fixes/iphone-wave2/raw/*.json`; `research/cpu-throttle-calibration/iphone.md`; answers from iphone-runner
  and mgmt-ops-4 (2026-10-01 ~10:45Z).
