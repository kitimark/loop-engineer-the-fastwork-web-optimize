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
difference. Exact builds: the Simulator runtime's `WebKit.framework` is CFBundleVersion **8624.2.5.10.4**, built arm64 (not
arm64e, so no pointer authentication); the nearest public source tags are `WebKit-7624.2.5.10.5` (Simulator) and
`WebKit-7624.4.5` (phone), and every source claim in §2 was re-read at both. No iOS 26.6 Simulator runtime is installed and none is listed for Xcode 26.6 (UNRESOLVED whether Apple
publishes one; getting it would be a multi-GB download and needs the user's OK).

## 2. Platform differences that matter for timing

| # | factor | phone | Simulator | status, reference |
|---|---|---|---|---|
| D1 | Safari's rAF rate pref | `PreferPageRenderingUpdatesNear60FPSEnabled` default true | same default: the pref has no simulator condition | **CONFIRMED**: UnifiedWebPreferences.yaml 7624 l.6392-6406 (only `PLATFORM(VISION)` differs); identical at `WebKit-7624.2.5.10.5` l.6392, the public tag nearest the Simulator's build: **CONFIRMED at both tags** |
| D2 | display link / refresh | Core Animation arbitrates; 60 Hz requested; 80 Hz runs in finger scrolls (claims-audit §2.7) | the simulated display is driven by the host's render server; the host panel is 120 Hz ProMotion | **UNRESOLVED** (no Apple doc on the Simulator's display link). Decisive check: idle rAF histogram, headless vs Simulator window visible (§4 FP-1) |
| D3 | CPU | A17 Pro; `cpu_bench.js` total **261 ms** (research/cpu-throttle-calibration/iphone.md §1) | native arm64 on the M1 Pro, shared with every other host process; no phone thermal throttling | Simulator uses the Mac's CPU and memory, "not an accurate test of performance": **CONFIRMED** (Apple, [Testing and Debugging in Simulator](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/TestingontheiOSSimulator/TestingontheiOSSimulator.html), archived guide). Factor: FP-1 runs the same `cpu_bench.js` |
| D4 | GPU / compositing | A17 Pro GPU, tile-based; GPU process + render server on the device | the host GPU through the Simulator's Metal path; Apple: "does not provide a pixel-accurate match", "rendering performance ... has no relation to" the device's | **CONFIRMED** for the old OpenGL ES wording (same archived guide, "OpenGL ES Differences"); for Metal, the Simulator exposes `MTLGPUFamilyApple2` features only ([WWDC19 418](https://developer.apple.com/videos/play/wwdc2019/418/), vendor talk). Compositing/raster cost: not comparable by design |
| D5 | WebKit build differences | device build | `PLATFORM(IOS_FAMILY_SIMULATOR)` build: no `HAVE_IOSURFACE_ACCELERATOR`, no `HAVE_IOSURFACE_COREIMAGE_SUPPORT`, no `HAVE_IOSURFACE_RGB10`, no `HAVE_IOS_JIT_RESTRICTIONS` | **CONFIRMED at both tags** by source: PlatformHave.h 7624 l.377, 381, 600, 871 (same simulator lines at `WebKit-7624.2.5.10.5`). `AcceleratedDrawingEnabled` (layer backing stores) is true for modern WebKit on both (UnifiedWebPreferences l.124-137: the simulator exception is WebKitLegacy only) |
| D6 | JIT | JIT on, gated by the `dynamic-codesigning` entitlement (`HAVE(IOS_JIT_RESTRICTIONS)`) | JIT on, no entitlement gate | **CONFIRMED at both tags**: ExecutableAllocator.cpp 7624 l.146-155 (identical at `WebKit-7624.2.5.10.5`); PlatformHave.h l.600. Both run JS JIT-compiled; device W^X uses the inline JIT-permissions API, the Simulator the pthread one (PlatformUse.h l.272, 389): cost difference UNRESOLVED, likely small |
| D7 | Low Power Mode | halves rAF to 30 Hz (claims-audit P9) | no battery; LPM state not settable in the Simulator UI | UNRESOLVED (no doc found); recorded as `lowPowerMode: 'n/a'` |
| D8 | Safari feature flags | phone's Settings > Safari > Advanced > Feature Flags | the Simulator's own Settings app; default = build defaults | same defaults expected (D1); record both |
| D9 | 80 Hz finger cadence (F-071) | moving gaps 12-13 ms in finger scrolls | depends on D2 and on touch input injection (WDA) | UNRESOLVED; FP-6 records the gap histogram under a WDA gesture and reads it with P-031's PRESENT/ABSENT rule (arch-claims amendment 5) |
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

Phone state to record with every reference (arch-claims amendment 5): Lockdown Mode **off** (Apple: in Lockdown Mode
"certain complex web technologies are blocked", support.apple.com/105120, CONFIRMED; which ones, the doc doesn't
say. Confirm the phone's state with iphone-runner before scoring), Low Power Mode off, display on. The
Simulator has Lockdown Mode off by default; `meta.sim` records it.

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
   reversal = not usable whatever the count). **Independence** (arch-claims amendment 2): the 5 come in two
   pairs of correlated metrics (S: one build pair; M: another), so "usable" also needs agreement on at least one
   metric of S **and** one of M. **Floor case:** if both Simulator medians are 0 for a comparison, it is scored
   "floor" (neither agreeing nor reversed), reported apart, and counts against X (a floor can't show a gain).
   The verdict is scoped to the change types tested (S: JS/scroll-handler work, aw1-10e; M: morph
   compositing, cdwc); other change types stay untested. The T arms' frame shifts are mechanism, rule 4.
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
   scripts unchanged, plus a duration-free variant. **Before scoring presence, rotator-timer Layouts are removed
   (de-pm-hero's p3x rule: Layouts whose initiator is the rotator timer) in both variants**, and the chance-hit
   rate is reported: 120 ms ÷ the rotator tick period (a random Layout lands in the ±60 ms window that often).
   **Usable** if ≥ 12 of 13 agree. The phone mechanism behind these cells is CONFIRMED (claims-audit §2.8,
   F-075), so a Simulator miss points at the version gap (§1) or at timing (a faster host moves a Layout), not at
   the phone record. Layout durations are reported as a ratio of medians (rule 2's form), not judged here.
   **Amendment 6 (15:51Z, before any FP-4 data; second read requested from arch-claims).** Running the class-4
   scorer (`score4.mjs`, p3flip/p3x's walk) on the phone records showed that the any-duration variant can't
   discriminate. The phone makes a ~0.1 ms view-rooted Layout almost every frame, so every ±60 ms window hits.
   - Presence is now a non-rotator Layout **≥ 2 ms** (p3flip's default) within ±60 ms. At 1 ms and 5 ms the phone
     cells come out identical (durations are bimodal, 0.1 ms vs 12-18 ms). On all 8 phone runs it reproduces §7.9.
   - Rotator cell: every rotator-timer InvalidateLayout in the 6 s idle is followed within 100 ms by a view-rooted
     Layout dirtied only by the rotator (phone: 8/8 runs, 10-11 ticks each, ~525-590 ms apart, 11-34 ms each).
   - Chance rate per arm (share of random ±60 ms windows in +400..+1300 holding a kept ≥ 2 ms Layout), phone:
     Q 54-58 %, D 47-54 %, K 22-27 %, B 86-87 %. Presence cells sit near chance, so **usable** also needs the
     3 phone-absence cells (D +700, K +900, K +1150) to agree.
   **Amendment 6 pins (arch-claims second read, 15:5xZ, still before FP-4 data):**
   - *Cut on the Simulator* = min(2 ms, ½ × the shortest Sim rotator Layout in its idle phase), taken from the idle
     phase, not the scored windows. The Sim Layout duration histogram for +400..+1300 is reported; if any Layout
     lies between the cut and 3× the cut, every cell is scored at the cut and at 1 ms, and a cell whose verdict
     changes is "threshold-sensitive" and does not count as agreeing.
   - *Rotator cell edges:* the rotator Layout must itself be ≥ the cut; ticks whose +100 ms window passes the end of
     idle are excluded; a tick whose Layout also carries another dirtier is "coalesced" (neither pass nor fail,
     count reported); "every tick" applies to the non-coalesced ticks, and needs ≥ 5 of them per run.
   - *Chance rate* is computed on the Sim records too, per arm, and reported next to the phone's. Null (independent
     cells, phone mid rates Q .56, D .50, K .25, B .865): a random engine passes all 13 with p ≈ 0.0017 and the
     amended rule (≥ 12/13 with all 3 absences) with p ≈ 0.015.
   - *Agreement over the two runs:* present = present in both Sim runs; absent = absent in both; split = disagree.
     D +700 is a pure absence test; a Sim Layout near +500 is reported apart, not credited.
   - Status: the phone mechanism is CONFIRMED (claims-audit §2.8, F-075); the bimodality and chance rates are
     OBSERVED on our phone data.
5. **Touch path (functional).** Binary facts from FP-6 vs the phone's finger records (handler ran, resize storm
   present, pin fight present). **Usable** if all agree.

A class whose block could not run says **untested**, not "not usable". A Simulator verdict never replaces a
phone verdict; "usable" means "good enough to pre-screen and to iterate before a phone slot".

**Disclosure.** Pilot holds 0 and 1 (functional; hold 1 queued 14:13Z) measure one S run on the baseline and a 10 s idle
histogram. This reading was committed before those holds' output was read; the pilot's numbers are excluded from
every verdict and reported in §5.0 only.

**Second reader:** this reading was sent to arch-claims before any fidelity run; its five amendments (version
re-read, class 1 independence and floor, class 4 rotator exclusion and chance rate, class 4 mechanism status,
Lockdown Mode and P-031 for D9) are applied above, still before any fidelity data (§8 log).

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

Hold 1 (14:26-14:28Z, config-file proxy, baseline served `--vendors=local --latency 150`, http):
- **Isolation works.** `:9231/json` listed one device, `SIMULATOR`; `:9232/json` listed only the Safari tab
  (`localhost:<port>/`). The phone was never attached. Second boot took 11 s, the first 35 s.
- **Facts.** UA `iPhone OS 18_7 … Version/26.5 Mobile/15E148 Safari/604.1` (the phone sends Version/26.6.1);
  innerWidth x innerHeight **430 x 775**, DPR 3, screen 430 x 932, the phone's scripted geometry;
  `hardwareConcurrency` 8 (the host's cores); reduced motion off; docH 6035.
- **Idle rAF, 10 s (D2, pilot only):** headless (Simulator.app not open), at the top: 589 frames, 59 fps, dt
  mostly 16-17 ms, with stray 2-10 ms and 21-25 ms gaps and 8 gaps > 34 ms. Window shown: 598 frames, 60 fps,
  0 gaps > 34 ms, **but measured at the page bottom** (after the headless scroll), so the two differ in position,
  not only window mode. The simulated display runs at 60 Hz here, not at the host panel's 120 Hz (OBSERVED, in
  our setup; D2 stays UNRESOLVED as to why). My first reading, "headless is noisier", is **REFUTED by FP-1**
  (§5.1): same position, same gaps in both modes.
- **Scroll (pilot's own probe, not `iphone.mjs`'s PROBE, so no phone comparison):** about 7 s to the bottom;
  headless dt>50 16, dt>34 42, p95 50 ms; window dt>50 17, dt>34 30, p95 53 ms. The Simulator janks on this
  page. Whether it janks like the phone is FP-2's question.
- **First-run tip:** no popover in hold 1's screenshot, although it was never dismissed. It showed on the first
  Safari launch only (OBSERVED, in our setup). Its close button sits at about (393, 656) pt; a blind tap there
  when the tip is absent would hit page content (the hero carousel). So the tool taps only when a screenshot shows
  the tip (pixel check; `wda.mjs` forbids element queries), or does it once in `setup` (sent to ts-sim).

### 5.1 FP-1 calibration (hold 15:34-15:38Z; calibration, not a verdict class; all OBSERVED, in our setup)

Records `out/arch-sim/fp1-{hidden,shown}.json` (local), script `fp1.mjs` (bench sha `9ad70feb206b9ccf`, the
phone's harness logic, port 9232). Baseline served `--vendors=local --latency 150`, http.

| cpu_bench (ms, median of 5 run-medians) | phone (iphone.md §1) | Sim hidden | Sim shown | Sim / phone |
|---|---|---|---|---|
| js_numeric | 19 | 14 | 16 | 0.75-0.85 |
| js_alloc | 25 | 35 | 36 | 1.4 |
| dom_layout_thrash | 85 | 119 | 123 | 1.4-1.45 |
| style_recalc_var | 101 | 150 | 154 | 1.5 |
| dom_create (1000 cards) | 31 | 48 | 50 | 1.55-1.6 |
| **total** | **261** | **369** | **380** | **1.41-1.46** |
| on the page (phone: live site; Sim: mirror top) | 419 | 589 | 607 | 1.4 |

The Simulator on this M1 Pro is about **1.4x slower than the A17 Pro** in style, layout and DOM work, and faster
in pure JS. Its counts can't be read as phone counts as they are (rule 2 decides the counts).

| idle rAF, 10 s | frames | > 34 ms | < 12 ms |
|---|---|---|---|
| blank page, hidden / shown | 600 / 600 | 0 / 0 | 4 / 3 |
| fastwork top, hidden / shown | 584 / 581 | 9 / 9 | 29 / 28 |
| phone, fastwork top (6 s idle of P3 B7, B8, Q1, Q4; Timeline on) | 361, 360, 361, 359 | 3, 3, 8, 6 | 18, 15, 22, 18 |

Window mode makes no difference. The page makes the idle gaps, on the phone too (paired short and long gaps:
a late frame, then a catch-up). Per 10 s the Simulator shows 9 against the phone's 5-13 (scaled from 6 s), the
same order. **Host:** the Simulator boot raises load1 from 4 to about 30 while CPU busy stays at 15-30 %, so
Simulator holds record CPU %, not load1.

### 5.2 FP-3 (M driver: g vs g-cdwc; hold 15:41-15:47Z, window shown)

Byte-identical `mdrive.mjs` (sha `252a9b91ad5d26a9`); builds served from copies of iphone-runner's snapshots; JS/CSS
hashes equal to the phone block's (`22efa0ab69ba` / `c6aad94b455f`, `5dc6e8e37388`); `--vendors=local --latency
150`, http; warm-up per port; C V V C C V V C. Records `out/arch-sim/sim-md-s3-*.json` (local, retagged
`meta.device: "simulator"`). Host CPU busy 17-49 %.

| moving phase | phone g (C) | phone g-cdwc (V) | Sim g (C) | Sim g-cdwc (V) | rule 1 |
|---|---|---|---|---|---|
| frames | 91-120 | 155-195 | 35-41 | 83-99 | |
| dt > 50 | 1, 2, 3, 24 | 0, 0, 0, 0 | 37, 31, 33, 31 | 17, 16, 5, 5 | agree (disjoint) |
| dt > 34 | 48, 45, 46, 52 | 0, 0, 1, 0 | 41, 35, 36, 36 | 58, 64, 65, 53 | **reversed, disjoint** |
| p50 (ms) | 29, 29, 30, 40 | 18, 18, 23, 19 | 103, 119, 119, 119 | 39, 38, 37, 35 | agree (disjoint) |
| held m=1 p95 (ms) | 17-18 | 17 | 24-27 | 19-29 | (phone sentinel ≤ 18: fails on the Sim) |

On the Simulator the morph is about 4x the phone's frame time (p50 103-119 vs 29-40 ms), against a 1.4x CPU gap
(§5.1), consistent with D4: the GPU/compositing path is not comparable (OBSERVED, in our setup). Because every
g frame is > 34 ms and g renders fewer frames, the dt > 34 count inverts. Under §4.3 rule 1 a single disjoint
reversal makes **class 1 not usable**. Rule 2's ratios (sim+1)/(phone+1) for the M arms are 9.4 (C > 50),
12 (V > 50), 0.77 (C > 34) and 62 (V > 34), so **class 2 is not usable**. Both verdicts stand whatever FP-2 shows.

### 5.3 FP-4 (T+R: P3 Timeline arms; hold 15:52-15:59Z, window shown)

Byte-identical `tlwin.mjs` (sha `3c8345c3b02bd93d`) with p3.sh's env (`IDLE_MS=6000 R3_Y0=0 R3_Y1=1800`, stop 1745,
Timeline on); arms Q (aw1-10e), D (hero-re-dur), K (hero-re-keep), B (baseline), served from copies of the
phone block's snapshots; warm-up per port; counted Q D K Q K D, then B B (the phone's order). Scored with the
frozen scorer `tools/score4.mjs` (sha `8aed996e7d687152`; amendment 6 and pins; rotator line JS:11571, baseline
11332). Records `out/arch-sim/sim-p3-*.json` + `.tl.json` (local, retagged). Host CPU busy 16-35 %.

| arm | phone cells +700 / +900 / +1150 | Sim run 1 | Sim run 2 | cell agreement (both Sim runs) |
|---|---|---|---|---|
| Q | Y / Y / Y | Q1: Y / Y / Y | Q4: Y / Y / Y | 3/3 |
| D | − / Y / Y | D2: − / Y / Y (+1207) | D6: − / Y / − | 2/3 (+1150 split) |
| K | Y / − / − | K3: Y / − / − | K5: Y / − / − | 3/3 |
| B | Y / Y / Y | B7: Y / Y / − | B8: Y / Y / Y (+1187) | 2/3 (+1150 split) |
| rotator (1 cell) | HOLDS in 8/8 phone runs | HOLDS in all 8 Sim runs | (rotator-only Layouts 17.8-31.6 ms) | agree |

- Cut 2 ms in every run (the Sim's shortest rotator-only idle Layout is ≥ 17.8 ms); no Layout of the reveal band
  falls in [cut, 3·cut), so no cell is threshold-sensitive; `CUT=1` gives the same 13 scored cells.
- Chance rates (share of 5 ms centres in +400..+1300 with a Layout ≥ cut within ±60 ms), Sim vs phone: Q 55/46 vs
  54-58 %, D 45/43 vs 47-54 %, K 38/27 vs 22-27 %, B 80/82 vs 86-87 %. The Sim's Layouts are not denser than the
  phone's, so agreement is not the busy-engine artefact amendment 6 guards against.
- **Score: 11/13, all 3 phone-absence cells agree (D +700, K +900, K +1150).** The rule needs ≥ 12/13, so **class 4
  is not usable** by the pre-registered rule, missing by one cell.
- Both misses are the late +1150 window: the Sim's Layout lands at +1178..+1207 ms (phone +1136..+1152), just past
  the ±60 ms band. The scripted scroll runs slower on the Sim (crossing at the same y-687, then y at +700 ms is
  1133-1149 vs the phone's 1218-1224, and at +1150 ms 1453-1490 vs 1540-1555), so a fixed time offset from the
  crossing reaches a smaller y on the Sim. A position-indexed cell would likely have caught both, but that is a
  post-hoc reading and does not change the verdict (OBSERVED, in our setup).
- Read: the Layout **mechanism** (which reveal phases lay out at all, the absences the hero fixes create, the
  rotator's view-rooted Layout per tick) matches the phone in every cell where the Sim's slower clock does not
  move the event across a window edge. It can screen "does this change remove/add a Layout", not "when".

## 6. Verdict table

(pending: §4.3 applied to §5)

## 7. Tool spec: `tools/sim.mjs` (for ts-sim; test-first, separate commits, NEW MEASUREMENT CODE)

Goal: drive the Simulator the way `tools/iphone.mjs` drives the phone, reusing its probes, so a Simulator record
has the phone record's schema plus `meta.device: "simulator"` and `meta.sim`.

**Commands**

| command | does | guard |
|---|---|---|
| `sim.mjs setup` | create `fw-sim 15 Pro Max` (device type iPhone-15-Pro-Max, newest installed iOS runtime, or `--runtime`) if absent; store `{udid, runtime, runtimeBuild, deviceType, xcode}` in the shared state dir (`.git/fastwork-mirror/sim/config.json`) | none (cheap, no boot) |
| `sim.mjs session --owner o [--window hidden\|shown] -- <cmd>` | **the normal entry point**: boot, wait (`bootstatus -b`), start the proxy, dismiss the first-run tip once (below), run `<cmd>` with `FW_SIM_PORT`, `FW_IPHONE_PORT=9232` and `FW_SIM_UDID` set, then always stop the proxy (and WDA if it started it), `simctl shutdown`, quit Simulator.app only if it opened it, in `finally` and on SIGINT/SIGTERM/SIGHUP (process group, like `wda-runner.mjs` `runGroup`) | refuses unless inside the caller's own **normal** chrome-measure hold (`$FW_LOCK_HELD` token, same test as `wda-runner.mjs` `buildGate`); refuses a short-lane hold; refuses if the fw-sim device is already booted by someone else |
| `sim.mjs boot` / `shutdown` / `proxy start\|stop` | the parts of `session`, for debugging; `shutdown` and `proxy stop` need no hold (cleanup must always work) and kill only pids from our pidfiles after checking the command line | boot: as `session` |
| `sim.mjs open <url>` | `simctl openurl`, then wait until the proxy lists the URL and `readyState` is complete; `LANDED_JS` check as in `iphone.mjs open` | inside a session |
| `sim.mjs scroll` / `record` / `run` / `gesture` | the same code paths as `iphone.mjs scroll` / `record` / `run` / `gesture`, with port 9232, device "simulator", no iphone lease (the session's hold instead), **no battery read** (`idevicediagnostics` would read the phone), `measureGuard` inverted (must be inside own normal hold); output `out/sim/<owner>-<label>-<ts>.json` | inside a session |
| `sim.mjs wda build\|start\|stop` | WDA for the Simulator: separate DerivedData (`$FW_WDA_HOME/DerivedData-sim`), `-destination 'platform=iOS Simulator,id=<udid>'`, `CODE_SIGNING_ALLOWED=NO` (no team, no Apple ID); start with `TEST_RUNNER_USE_PORT=8101` (never 8100, the phone's), no iproxy; gesture runs get `FW_WDA_URL=http://127.0.0.1:8101` | build inside a normal hold (xcodebuild, minutes of CPU) |
| `sim.mjs status` | device, booted?, proxy pid/ports, WDA-sim pid, config (UDIDs masked) | none |
| `sim.mjs doctor` | a booted fw-sim with no live session = leak: say so, `--fix` shuts it down | none |

**Proxy (Hard rules 9 and 12; the lead's requirements):**
- Socket: `lsof -aUc launchd_sim -Fn`, the name ending `com.apple.webinspectord_sim.socket`, only after Safari runs.
- Config **file** (iwdp can't name `SIMULATOR` on the command line, §5.0), written to the shared state dir
  (`.git/fastwork-mirror/sim/iwdp.cfg`, mode 600, never committed, never printed): `null:9231`, then
  `<udid>:-1` for **every** device `idevice_id -l` lists (deduplicated), then `:9232`. The UDIDs appear nowhere
  else: not in argv (the file path is), logs, output JSON or errors (`redact()`).
- After start, `GET :9231/json` must list exactly one device whose id is `SIMULATOR`; anything else: kill the
  proxy, exit non-zero ("proxy sees a non-simulator device"), print no id. Re-check before every timed run.
- Ports 9231/9232 fixed (overridable by env for tests); never 9221/9222.
- The proxy never navigates; `open` uses `simctl openurl`. No command of `sim.mjs` talks to the phone's proxy,
  the phone's WDA (8100) or iproxy.

**First-run tip:** Safari's "View Bookmarks, Share Menu, and Open Tabs" popover appears on a fresh device. `session`
dismisses it once after boot (WDA-sim tap on its close button, or, if a `defaults write` key for it is found and
documented, that) and records `meta.sim.tipDismissed`. A screenshot (`simctl io screenshot`) after `open` goes to
`out/sim/` for the check. Never `simctl erase` the device in normal use (the tip would come back).

**Record schema:** exactly the phone records' (`fw-iphone-run/1` for `run`, the `scroll`/`record` JSON for those) plus
`meta.device: "simulator"` and `meta.sim: {runtime, runtimeBuild, deviceType, xcode, window, tipDismissed,
hostLoad (tools/lib/host.mjs sample at start and end), proxyPorts}`; `meta.settings.lowPowerMode: 'n/a'`,
`batteryPct`/`charging`: 'n/a'. `tools/lib/stats.mjs` treats "simulator" as its own device: it refuses to pool it
with phone or Chrome runs (mgmt-ops-5 guardrail 3).

**Refactor (measurement code, call out):** `iphone-run.mjs`'s `DEVICE` constant becomes a parameter, the battery read
and `measureGuard` become options; `iphone.mjs scroll`/`record` keep their bytes for the phone
(`tests/unit/iphone-unchanged.test.mjs` pins them): move the shared PROBE/summarize into a module only if the pin
test is updated with a callout, otherwise `sim.mjs` carries a copy whose hash the test pins equal to the phone's.
Phone behaviour must not change (same output bytes on the fake proxy).

**Tests (fakes via env, like `wda-runner.mjs`):** `$FW_SIMCTL`, `$FW_IWDP`, `$FW_LSOF`, `$FW_IDEVICE_ID`,
`$FW_XCODEBUILD`; fake WIP server on the sim port. Cover: the hold gate (no hold, short hold, someone else's hold);
config file content and mode, UDIDs never in stdout/stderr/JSON; the `:9231` check aborting on a non-simulator
device; `session` cleanup on success, on failure and on SIGTERM (shutdown always called, only own pids killed);
`meta.device`/`meta.sim` present; phone `iphone.mjs` outputs unchanged; `stats` refuses mixed devices.

**Out of scope:** idb; HTTPS (the Simulator loads plain http from localhost; `simctl keychain add-root-cert` is the
later option); any runtime download.

## 8. Log

- 2026-10-01 ~14:00Z: research, device created, pilot queued (hold, owner arch-sim).
- 2026-10-01 14:13Z: hold 0 (functional): boot/Safari ok; iwdp config finding (§5.0); probe blocked by it.
- 2026-10-01 ~14:30Z: arch-claims' amendments 1-5 applied to §1, §2, §4.1, §4.3; §7 tool spec for ts-sim
  (lead's requirements: phone UDID only in a local mode-600 config, proxy never attaches to or navigates the phone,
  first-run tip dismissed once at boot). Hold 1 (functional, fixed iwdp config) queued.
- 15:28Z: hold 1 read (§5.0). 15:34-15:38Z FP-1 (§5.1). 15:41-15:47Z FP-3 (§5.2): classes 1 and 2 not usable.
- 15:51Z: amendment 6 (class 4 operationalized on phone data only; FP-4 queued, unread), sent to arch-claims.
- 15:56Z: arch-claims' pins added; class-4 scorer frozen as `tools/score4.mjs` (sha256 `8aed996e7d687152`). On the 8
  phone runs it reproduces §7.9's 12 cells, and the rotator cell HOLDS in 8/8. FP-4 running since 15:52Z, output unread.
- 16:01Z: FP-4 scored (§5.3): 11/13, all absences agree, rotator HOLDS 8/8; class 4 not usable (needs 12/13), both
  misses at the +1150 window edge.
