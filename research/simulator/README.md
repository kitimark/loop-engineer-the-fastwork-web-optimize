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
- **Idle rAF, 10 s at the top (D2, pilot only):** headless (Simulator.app not open) 589 frames, 59 fps, dt mostly
  16-17 ms, but with stray 2-10 ms and 21-25 ms gaps and **8 gaps > 34 ms**. With the window shown: 598 frames,
  60 fps, dt 15-20 ms, 0 gaps > 34 ms. So the simulated display runs at 60 Hz here, not at the host panel's 120 Hz (OBSERVED, in our setup; D2 stays
  UNRESOLVED as to why).
  Headless pacing is noisier: OBSERVED, in our setup, cause unknown. Until FP-1 says otherwise, **measure with
  the window shown**.
- **Scroll (pilot's own probe, not `iphone.mjs`'s PROBE, so no phone comparison):** about 7 s to the bottom;
  headless dt>50 16, dt>34 42, p95 50 ms; window dt>50 17, dt>34 30, p95 53 ms. The Simulator janks on this
  page. Whether it janks like the phone is FP-2's question.
- **First-run tip:** no popover in hold 1's screenshot, although it was never dismissed. It showed on the first
  Safari launch only (OBSERVED, in our setup). Its close button sits at about (393, 656) pt; a blind tap there
  when the tip is absent would hit page content (the hero carousel). So the tool taps only when a screenshot shows
  the tip (pixel check; `wda.mjs` forbids element queries), or does it once in `setup` (sent to ts-sim).

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
