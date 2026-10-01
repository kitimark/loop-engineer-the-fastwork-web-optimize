# iOS Simulator as a stand-in for the iPhone (arch-sim, 2026-10-01)

**User request (relayed by the lead):** "use the iphone simulator for testing the website ... research, plan,
implement and probe the stats compare with real device we was catch."

**Question.** For which of our measurement questions can the Xcode iOS Simulator (Mobile Safari on this Mac)
stand in for the real iPhone 15 Pro Max (iOS 26.6.1)? The phone is one device, serial, heats up and costs user
time; a faithful Simulator would take load off it.

**Answer so far:** see §6 (verdict table, filled after the probes). Until then, nothing here licenses a
Simulator number as a phone number.

Status words as in CLAUDE.md "Platform claims": OBSERVED (our data only), CONFIRMED (a reference agrees, cited),
REFUTED, UNRESOLVED. WebKit source is tag `WebKit-7624.4.5` (Safari 26.6, the phone's family) via
`https://cdn.jsdelivr.net/gh/WebKit/WebKit@WebKit-7624.4.5/<path>`, read 2026-10-01.

## 1. What is installed (2026-10-01)

| item | value | note |
|---|---|---|
| Host | MacBook Pro, Apple M1 Pro (8 cores), macOS 26.2, built-in 120 Hz ProMotion display | same host as every Chrome A/B |
| Xcode | 26.6 (17F113) | SDKs: iOS 26.5, Simulator iOS 26.5 |
| Simulator runtime | **iOS 26.5 (23F77)**, 7.9 GB, Ready | the only one; no 26.6 runtime installed |
| Device types | iPhone 15 Pro Max present (also 16/17 Pro Max) | created `fw-sim 15 Pro Max` (UDID local only) on iOS 26.5 |
| Inspector proxy | `ios_webkit_debug_proxy` 1.9.2 (Homebrew), has `-s` simulator socket | the phone's proxy runs on :9221/:9222 |
| WebDriverAgent | `~/.cache/fw-wda/WebDriverAgent` (appium v16.13.6), built only for the device (`Debug-iphoneos`) | a simulator build needs no signing |
| idb | not installed | not needed if WDA works (§3.3) |

**Version gap (CONFIRMED by the version map, claims-audit §2 header):** iOS 26.5 ships WebKit 624.2.5, the phone's
iOS 26.6.1 is in the 624.4.5 family. Two point releases apart: any WebKit fix between them is a Simulator/phone
difference. No iOS 26.6 Simulator runtime is installed and none is listed for Xcode 26.6 (UNRESOLVED whether Apple
publishes one; getting it would be a multi-GB download and needs the user's OK).

## 2. Platform differences that matter for timing

| # | factor | phone | Simulator | status, reference |
|---|---|---|---|---|
| D1 | Safari's rAF rate pref | `PreferPageRenderingUpdatesNear60FPSEnabled` default true | same default: the pref has no simulator condition | **CONFIRMED**: UnifiedWebPreferences.yaml 7624 l.6392-6406 (only `PLATFORM(VISION)` differs) |
| D2 | display link / refresh | Core Animation arbitrates; 60 Hz requested; 80 Hz runs in finger scrolls (claims-audit §2.7) | the simulated display is driven by the host's render server; the host panel is 120 Hz ProMotion | **UNRESOLVED** (no Apple doc on the Simulator's display link). Decisive check: idle rAF histogram, headless vs Simulator window visible (§4 FP-1) |
| D3 | CPU | A17 Pro; `cpu_bench.js` total **261 ms** (research/cpu-throttle-calibration/iphone.md §1) | native arm64 on the M1 Pro, shared with every other host process; no phone thermal throttling | Simulator uses the Mac's CPU and memory, "not an accurate test of performance": **CONFIRMED** (Apple, [Testing and Debugging in Simulator](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/TestingontheiOSSimulator/TestingontheiOSSimulator.html), archived guide). Factor: FP-1 runs the same `cpu_bench.js` |
| D4 | GPU / compositing | A17 Pro GPU, tile-based; GPU process + render server on the device | the host GPU through the Simulator's Metal path; Apple: "does not provide a pixel-accurate match", "rendering performance ... has no relation to" the device's | **CONFIRMED** for the old OpenGL ES wording (same archived guide, "OpenGL ES Differences"); for Metal, the Simulator exposes `MTLGPUFamilyApple2` features only ([WWDC19 418](https://developer.apple.com/videos/play/wwdc2019/418/), vendor talk). Compositing/raster cost: not comparable by design |
| D5 | WebKit build differences | device build | `PLATFORM(IOS_FAMILY_SIMULATOR)` build: no `HAVE_IOSURFACE_ACCELERATOR`, no `HAVE_IOSURFACE_COREIMAGE_SUPPORT`, no `HAVE_IOSURFACE_RGB10`, no `HAVE_IOS_JIT_RESTRICTIONS` | **CONFIRMED** by source: PlatformHave.h 7624 l.377, 381, 600, 871. `AcceleratedDrawingEnabled` (layer backing stores) is true for modern WebKit on both (UnifiedWebPreferences l.124-137: the simulator exception is WebKitLegacy only) |
| D6 | JIT | JIT on, gated by the `dynamic-codesigning` entitlement (`HAVE(IOS_JIT_RESTRICTIONS)`) | JIT on, no entitlement gate | **CONFIRMED**: ExecutableAllocator.cpp 7624 l.146-155; PlatformHave.h l.600. Both run JS JIT-compiled; device W^X uses the inline JIT-permissions API, the Simulator the pthread one (PlatformUse.h l.272, 389): cost difference UNRESOLVED, likely small |
| D7 | Low Power Mode | halves rAF to 30 Hz (claims-audit P9) | no battery; LPM state not settable in the Simulator UI | UNRESOLVED (no doc found); recorded as `lowPowerMode: 'n/a'` |
| D8 | Safari feature flags | phone's Settings > Safari > Advanced > Feature Flags | the Simulator's own Settings app; default = build defaults | same defaults expected (D1); record both |
| D9 | 80 Hz finger cadence (F-071) | moving gaps 12-13 ms in finger scrolls | depends on D2 and on touch input injection (WDA) | UNRESOLVED; FP-6 records the gap histogram under a WDA gesture |
| D10 | thermal | throttles after ~10 min of scrolling (iphone-wave2 "Thermal episode") | none on the phone side; host load and host thermal instead | Simulator runs need the host quiet (Hard rule 7), record host load |
| D11 | memory | 8 GB device, tile/backing-store memory limits (`cMaxPixelDimension` 1280 vs 1024 by `systemMemoryLevel()`, claims-audit P2) | host memory: `systemMemoryLevel()` reads the Mac's | inference from P2's code path; UNRESOLVED whether the Simulator ever takes the 1024 branch |

**What the Simulator should share with the phone by construction** (same WebKit family, same Safari UI code): the
style/layout/event engine (claims-audit §2.4 W1-W8), the compositing decisions (§2.1 P1-P6: which layers exist,
what repaints), event passivity defaults, the 60 Hz rAF request. **What it cannot share:** CPU and GPU speed (D3,
D4), thermal (D10), the device's display link (D2, UNRESOLVED). So the prior is: mechanism questions likely
transfer, timing questions likely don't, A/B direction in between. §4 tests that prior with numbers.

## 3. How to drive it (feasibility)

### 3.1 Boot, navigate, shut down: `xcrun simctl`
`simctl boot <udid>`, `simctl bootstatus <udid> -b` (blocks until booted), `simctl openurl <udid> <url>` (opens in
Safari), `simctl io <udid> screenshot <png>`, `simctl shutdown <udid>`. The Simulator shares the host network, so
it loads `http://localhost:<port>/` directly: no LAN address, no http twin, no certificate warning on http.

### 3.2 Inspector: our WIP stack, unchanged, on other ports
`ios_webkit_debug_proxy -c <cfg> -s unix:<socket> -F` (cfg: `null:9231`, every attached phone's UDID at port
`-1`, then `:9232`; §5.0 says why `SIMULATOR:9232` doesn't parse), where the socket is found with
`lsof -aUc launchd_sim` (name ends in `com.apple.webinspectord_sim.socket`; iwdp README, CONFIRMED by iwdp source:
the Simulator is attached under the fixed id `SIMULATOR` over that socket, `ios_webkit_debug_proxy.c` iwdp_start
l.370-372, iwdp_on_attach l.414-423). A device without a configured port is ignored before any attach
(`iwdp_listen` l.283-290), so with the phone's UDID at `-1` this proxy never attaches the real phone. It must start after Safari runs in the
booted Simulator (the attach is faked once at start). `tools/lib/wip.mjs` already takes the port
(`FW_IPHONE_PORT`), so the T1a probe, the scroll probe and the Timeline sequence run as they are.

### 3.3 Touch: WebDriverAgent on the Simulator
WDA builds for a Simulator destination without signing (no Apple ID needed). Port: the runner reads `USE_PORT`
(WebDriverAgentLib/Utilities/FBConfiguration.m l.128-129), and `xcodebuild` passes `TEST_RUNNER_<VAR>` to the
runner with the prefix stripped (CONFIRMED: `man xcodebuild`, "TEST_RUNNER_<VAR>"). So `TEST_RUNNER_USE_PORT=8101`
keeps the Simulator's WDA off the phone runner's 8100 and needs no `iproxy`. `simctl io` has no touch input;
idb (`ui tap/swipe`, Simulator only) is the fallback, not installed.

### 3.4 Pilot (FP-0, functional only; excluded from every verdict)
See §5.0. (Written before the pre-registered reading in §4; its numbers are a disclosed pilot.)

## 4. Fidelity protocol (pre-registered before any fidelity data)

**Rule:** same builds (byte-identical snapshot dirs), same drivers, same probes, same metrics as the real-device
records we hold. Simulator runs only inside an `arch-sim` chrome-measure hold (≤ 10 min each, requeued between),
Simulator booted and shut down inside the hold, host load recorded per run. Pilot FP-0 is excluded.

### 4.1 Real-device references (all iPhone 15 Pro Max, iOS 26.6.1, http, 430x775, rAF at 60 Hz)

| id | phone records (iphone-runner `fixes/iphone-wave2/raw/` = R, `out/iphone-runner/` = O) | driver | phone verdict |
|---|---|---|---|
| S | baseline R/goal-B1..B3 (`iphone.mjs scroll`); aw1-10e: passing controls R/ctl-B5, B6, B9, B12, B13, B14, B16-B20 (+ O/ctl-B21) | S (legacy scroll probe) | aw1-10e better |
| M | g O/md-r29-g{1,4,5,8} vs g-cdwc O/md-r29-gc{2,3,6,7} (P-029; block O/p029.sh) | M: O/mdrive.mjs `<out> <label> 2000 3` (`__fwMorphDrive`, rAF [t, dt, y, m]) | moving dt>50 1/2/3/27 → 0/0/0/0; dt>34 47-58 → 0-1; p50 29-40 → 18-23 |
| T | P3 O/p3-{B7,B8} (baseline-A = site-pretty), Q1/Q4 (Q = aw1-10e), D2/D6 (re-dur), K3/K5 (re-keep) + `.tl.json` (block O/p3.sh) | W: O/tlwin.mjs, `IDLE_MS=6000 R3_Y0=0 R3_Y1=1800`, stopY 1745, Timeline depth 1 (F-047 sequence) | Layout records at reveal ends +700/+900/+1150 per arm (postmortem-hero §7.9; scorer de-pm-hero `p3flip.mjs`, `p3x.mjs`) |
| R | rotator: idle phase (6 s at y 0) of the T runs; O/e-tc1, e-tc2, e-ta1 (+ `.tl.json`) | Timeline | whole-view Layout per rotator tick, 12-17 ms (claims-audit W3) |
| F | O/finger/F2-F4 (human finger), F-071 | F | no phone G-driver records yet: timing not comparable (F-071), see FP-6 |

### 4.2 Simulator blocks

| block | content | n | hold |
|---|---|---|---|
| FP-1 calibration | `cpu_bench.js` (sha 9ad70feb206b9ccf) ×5 on the blank standards-mode page; 10 s idle rAF histogram on a blank page and at the fastwork top, Simulator window hidden (headless) and shown | 5 / 2×2 | 1 |
| FP-2 S | baseline vs aw1-10e, order B A A B B A A B, `scroll` probe (same PROBE as `iphone.mjs scroll`), one uncounted warm-up per port | 4 + 4 | 1-2 |
| FP-3 M | g vs g-cdwc, order C V V C C V V C, iphone-runner's `mdrive.mjs` (byte-identical copy, port 9232), warm-up per port | 4 + 4 | 1-2 |
| FP-4 T+R | P3 arms baseline-A, Q, re-dur, re-keep, iphone-runner's `tlwin.mjs` with p3.sh's env (6 s idle at y 0, W to 1745, Timeline on), scored with de-pm-hero's scripts unchanged | 2 per arm | 2 |
| FP-5 A/A | baseline vs baseline in FP-2's hold if time allows (noise floor) | 3 + 3 | (in FP-2) |
| FP-6 touch (functional) | WDA `finger-protocol-v1` on aw1-10e and g: touchmove handler runs, toolbar-collapse resize, morph pin fight, gap histogram (D9) | 2 | 1 |

Metrics, the phone's ms forms (CLAUDE.md "Frame thresholds"): dt > 50, dt > 34, the ±4 ms counts (dt > 46 / 54,
dt > 30 / 38), p50 / p95 of the phase; for M: moving dt > 50, dt > 34, p50, held m=1 p95; for T: Layout record count
and durations per reveal end and per rotator tick, root quad (view or subtree). fps is reported, never judged
(D2 unknown).

### 4.3 Pre-registered reading (decision rule, X/Y fixed now)

Per question class:

1. **A/B direction (timing).** The decisive phone comparisons (phone ranges disjoint) are listed now: S dt>50,
   S dt>34 (baseline vs aw1-10e), M moving dt>50, M moving dt>34, M moving p50 (g vs g-cdwc): Y = 5. The Simulator
   "agrees" on one when its medians move the same way **and** its ranges are disjoint. **Usable** if it agrees on
   ≥ 4 of 5 (X = 4) and no comparison is reversed with disjoint ranges; **not usable** otherwise (a single disjoint
   reversal = not usable whatever the count). The T arms' frame shifts are mechanism, rule 4.
2. **Absolute counts.** Ratio per arm r = (sim median + 1) / (phone median + 1) for dt>50 and dt>34 in the four S/M
   arms (8 ratios). **Usable as is** if all 8 lie in [0.67, 1.5]; **usable with a calibration factor** (the
   geometric mean of the 8) if max r / min r ≤ 2; **not usable** otherwise.
3. **Attribution and timing positions.** Phone recurring slow frames = dt > 34 frames at the same section (±60 px,
   compared by crossing: the nearest code threshold, CLAUDE.md "Phone geometry") in ≥ 2 of 3 phone runs (S, both
   arms). Hit rate = share of them recurring in ≥ 2 of 4 Simulator runs; false share = Simulator recurring sections
   absent on the phone. **Usable** if hit ≥ 80 % and false ≤ 25 %; **lead generator only** (confirm on the phone)
   if hit ≥ 50 %; **not usable** below.
4. **Layout and paint mechanism.** 13 cells, phone values from postmortem-hero §7.9 / §7.1: a Layout record at
   +700, +900, +1150 from the y-687 crossing for Q, re-dur, re-keep, baseline-A (12 cells; phone: all present
   except re-dur +700 moved to +500 and re-keep +900 / +1150 gone), plus "the rotator timer's InvalidateLayout
   is the only one before a view-rooted Layout, every tick" (1). **Presence on the Simulator = a Layout record of
   any duration within ±60 ms of the phone offset**, in both runs of the arm (durations are timing: a faster host
   can push a Layout under the phone's 2/10 ms cuts without changing the mechanism). Scored with de-pm-hero's
   scripts unchanged, plus a duration-free variant. **Usable** if ≥ 12 of 13 agree. Layout durations are
   reported as a ratio of medians (rule 2's form), not judged here.
5. **Touch path (functional).** Binary facts from FP-6 vs the phone's finger records (handler ran, resize storm
   present, pin fight present). **Usable** if all agree.

A class whose block could not run says **untested**, not "not usable". A Simulator verdict never replaces a
phone verdict; "usable" means "good enough to pre-screen and to iterate before a phone slot".

**Disclosure.** Pilot hold 0b (functional, queued 14:13Z) measures one S run on the baseline and a 10 s idle
histogram. This reading was committed before that hold's output was read; the pilot's numbers are excluded from
every verdict and reported in §5.0 only.

**Second reader:** this reading was sent to arch-claims before any fidelity run (§7 log).

## 5. Results

### 5.0 Pilot FP-0 (functional)

Hold 0 (14:09-14:13Z): `fw-sim 15 Pro Max` boots in 35 s (first boot), `simctl openurl` opens the baseline mirror
in Safari and it renders (screenshot: hero, countdown, carousel). The webinspectord_sim socket is there.
Two findings for the tool:
- **iwdp's port config cannot name the Simulator.** Device ids must match `[a-fA-F0-9-]{25,}`, `*` or `null`
  (`port_config.c` l.95-100), so `SIMULATOR:9232` is rejected ("Unknown file") and the proxy serves nothing (it
  attached no device; checked: no TCP listener, no phone attach). Working form: a config file
  `null:9231` / `<each attached phone UDID>:-1` / `:9232`. Entries match in order (`pc_find`), a port of -1
  ignores that device before attach (`iwdp_listen` l.289), and `*` then takes the Simulator. The tool must
  also refuse to measure when :9231 lists anything but `SIMULATOR`.
- **Safari's first-run tip** ("View Bookmarks, Share Menu, and Open Tabs") overlays the page bottom on a fresh
  device. It is a composited overlay the phone doesn't have: dismiss it once (tap, WDA) before any measurement and
  keep the device (don't erase it between runs).

## 6. Verdict table

(pending: §4.3 applied to §5)

## 7. Log

- 2026-10-01 ~14:00Z: research, device created, pilot queued (hold, owner arch-sim).
