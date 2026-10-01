# Finger simulation on the real iPhone (arch-finger, 2026-10-01)

By `arch-finger` (architecture team). This was a read-only study: no Chrome, no iPhone session, no locks, and
nothing was installed or sent to the phone. The user asked: "can you simulate a test similar to my finger test?"

Confidence tags:
- **vendor**: Apple, WebKit or Appium docs or source;
- **issue**: a bug tracker or forum post;
- **local**: this repo's own evidence;
- **inference**: our reasoning, not verified.

The web research used generic queries only (Hard rule 12).

## 0. Decision

**Drive real OS-level touches with WebDriverAgent (WDA, the XCUITest runner).** The repo talks to it directly
over USB from a small, dependency-free `tools/lib/wda.mjs`. `ios_webkit_debug_proxy` keeps doing the recording
and the morph logging, unchanged.

Why WDA:
- XCTest synthesizes touches as HID events inside iOS (`XCPointerEventPath` + `XCSynthesizedEventRecord`). WDA's
  W3C actions map each `pointerMove` to `moveToPoint:atOffset:` on one event path, and the device plays that path
  back by itself. Source:
  [FBW3CActionsSynthesizer.m](https://raw.githubusercontent.com/appium/WebDriverAgent/master/WebDriverAgentLib/Utilities/FBW3CActionsSynthesizer.m), vendor.
- So one HTTP call carries a whole stroke with its own velocity profile, and USB round trips play no part
  (inference).
- Safari's own scroll view then does the scrolling, as for a finger: momentum, rubber band and the toolbar
  collapse. The page should get real `touchstart`/`touchmove`/`touchend` with the same cancelable and
  `preventDefault` behaviour (inference from the HID path).

Nobody has confirmed those last two claims on this phone. Step V0 in §5c checks them first.

**WDA does not interpolate.** It moves straight from one point to the next
([source](https://raw.githubusercontent.com/appium/WebDriverAgent/master/WebDriverAgentLib/Utilities/FBW3CActionsSynthesizer.m), vendor).
Our compiler therefore emits a point every 8 ms (one 120 Hz touch sample), so the velocity profile is ours and not
the synthesizer's.

Rejected or secondary:
- **safaridriver touch actions: no.**
  - On this phone they hung and left Safari stuck in a dead automation session until Safari was force-quit
    (local: `research/01-initial-investigation/README.md`, gotcha 2).
  - By design, iOS automation runs in a separate window and tab set with a "glass pane" that blocks other input,
    and it suppresses system gestures ([WebKit blog](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/), vendor).
  - That window is not the page our WIP recorder attaches to, and the toolbar behaviour in it is unknown.
- **idb: no.** Its `ui tap/swipe` works on simulators only ([idb #836](https://github.com/facebook/idb/issues/836), issue).
- **`xcrun devicectl`: no.** It has no input verb (secondary sources only).
- **CoreDevice HID** (pymobiledevice3 `universal-hid-service`, go-ios, ipb): **not on iOS 26.** The service is
  reported only on iOS/Xcode 27 ([go-ios PR 849](https://github.com/danielpaulus/go-ios/pull/849),
  [ipb](https://github.com/ipbtools/ipb), issue; the sources conflict). Revisit if the phone moves to iOS 27: it
  would need no runner app.
- **Appium: optional, not required.** It is the easiest way to build and launch WDA, but it brings a Node server
  and an npm tree. The repo's tools stay dependency-free and speak WDA's HTTP API. Appium's XCUITest driver is
  Apache-2.0, as is WDA.
- **AssistiveTouch custom gestures: no.** Replay is real on-device touch, but it is started from the on-screen menu
  by hand, and a recorded multi-stroke sequence replays at the same time, not in order
  ([Apple support](https://support.apple.com/en-us/111794), vendor). Not automatable.
- **iOS Simulator: a complement only**, for functional checks and toolsmith development, never for timing (§3).

**Fidelity is not taken on faith.** §5c is a validation block. Before any verdict rests on the simulated gesture,
it must reproduce the finger's signatures:
- toolbar 775↔815 transitions;
- rubber band past 5220 and below 0;
- the 5220↔5312/5334 pin alternation on aw1-10c, and no alternation on mw-g;
- the touchmove preventDefault ratio;
- morph-active p95.

## 1. Options compared

| option | native scroll + momentum | rubber band / toolbar | real DOM touch, cancelable touchmove | setup | phone overhead | with WIP recorder | verdict |
|---|---|---|---|---|---|---|---|
| WDA W3C actions (XCTest HID) | yes (HID path, inference until V0) | expected (inference) | expected (inference) | Apple ID in Xcode, Developer Mode, UI Automation toggle, trust cert, 7-day profile | 1 runner process, idle between calls; XCTest idle-waits must be off | Appium runs WDA + Web Inspector together for Safari tests (inference: no conflict); V0 checks it | **chosen** |
| WDA `mobile: swipe` / `dragFromToWithVelocity` | yes | expected | expected | same | same | same | fallback only: `dragFromToWithVelocity` forces hold ≥ 0.5 s, so no fling ([Appium docs](https://appium.github.io/appium-xcuitest-driver/latest/reference/execute-methods/), vendor) |
| safaridriver W3C touch | HID generator at 16 ms steps (WebKit source, medium) | unknown: separate automation window | likely | `--enable` + Remote Automation | light | separate window; hung here before (local) | no |
| CoreDevice HID (pmd3/go-ios/ipb) | real digitizer | unknown | yes | tunnel + DDI | none | unknown | iOS 27 only |
| idb / devicectl | - | - | - | - | - | - | no (sim only / no verb) |
| Simulator + WDA | yes, Mac-rendered | probably | yes | iOS 26 runtime download (~8 GB), no signing | Mac CPU/GPU | `ios_webkit_debug_proxy` sim socket ([PR 306](https://github.com/google/ios-webkit-debug-proxy/pull/306), issue) | functional only |

**Known WDA pitfalls, all handled in the spec (§4.2):**
- **XCTest waits for the app to be idle**, up to ~10 s. This page never idles: it has infinite animations. Set
  `waitForIdleTimeout: 0` and `animationCoolOffTimeout: 0`
  ([Appium discussion 16302](https://github.com/appium/appium/discussions/16302), issue).
- **Never request `/source` or element lookups during a run.** Accessibility snapshots of Safari cost phone CPU,
  and the phone already throttles (inference; F-028).
- **WDA failed to launch** on iOS 26.0.1 with an early Xcode 26 ([appium #21643](https://github.com/appium/appium/issues/21643), issue).
  Here Xcode 26.6 matches iOS 26.6.1 (inference: fine; V0 confirms).
- **Runner memory grew** over 12 h+ runs ([appium #15457](https://github.com/appium/appium/issues/15457), issue).
  Start WDA per block and stop it afterwards.

## 2. What is installed now (read-only checks)

| item | state |
|---|---|
| Mac | MacBook Pro M1 Pro, 8 cores, macOS 26.2 |
| Xcode | 26.6 (17F113), `xcode-select -p` → `/Applications/Xcode.app`; iOS DDI in `~/Library/Developer/DeveloperDiskImages` |
| iPhone | iPhone 15 Pro Max, **available (paired)** with CoreDevice. Source: `xcrun devicectl list devices`, a read-only listing that needed no lease and touched no Safari. Developer Mode not queried |
| signing | **no** Apple Development identity (`security find-identity -p codesigning`: 0) and no provisioning profiles, so an Apple ID must be added to Xcode once |
| simulator | **no iOS simulator runtime** (`xcrun simctl list runtimes` is empty) |
| present | `safaridriver` (Safari 26.2), `ios_webkit_debug_proxy` 1.9.2, `iproxy` (Homebrew libimobiledevice) |
| absent | Appium, WDA (no build in DerivedData), idb, go-ios, pymobiledevice3, Maestro |

So the Mac has everything WDA needs except a signing identity, and `iproxy` (port 8100 forward) already exists.

## 3. The iOS Simulator as a complement

**What it gives:**
- The same WebKit and Safari UI driven by the same WDA gestures, with no signing, no lease and no phone heat.
- Development and end-to-end testing of the gesture driver.
- Functional parity checks of the touch path:
  - Does a push past the end start the morph?
  - Is the pin fight present (scrollY reversals at the end)?
  - Does dragging back up collapse the morph?
  - Are touchmoves cancelable and prevented?
  - Does `overscroll-behavior: none` stop the rubber band (mw-g)?
  - Does the toolbar collapse fire the 120 ms-debounced resize (scroll-engine)?
- Those are state-machine questions, and a wrong answer there is wrong on any GPU.

**What it cannot give: timing.**
- It renders with the Mac's CPU/GPU and emulates neither the device GPU nor its CPU and memory limits
  ([Apple simulator guide](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/TestingontheiOSSimulator/TestingontheiOSSimulator.html), vendor).
  So no fps, no frames > 50 ms, no blur cost (the morph's lag is rendering, F-033).
- Thermal behaviour is absent too.

**Costs:**
- The iOS 26.6 runtime must be downloaded once (Xcode > Settings > Components, ~8 GB, inference on size).
- A running simulator loads the Mac like a second Chrome: run it only when `chrome-measure` is free or inside
  your own short-lane hold (Hard rule 7).
- On Xcode 27 betas, simulator input injection reportedly changes
  ([argent #932](https://github.com/software-mansion/argent/issues/932), issue). Pin the toolchain.

## 4. Gesture script spec

### 4.1 What the finger actually did

Sources (local): `fixes/iphone-wave2/raw/finger-A2.json` and `finger-B2.json`, plus iphone-runner's morph logs
E1b, F1 and F2. Speeds are in CSS px = points.

**Traverse, top to bottom.** The written protocol says ~10 s. The finger did it in **3-3.5 s**: 2-3 strokes of
1.0-1.6 s each, momentum included, peaking at **2500-5700 px/s**. Before that came **~10 s of back-and-forth
in the hero** (y 0-1450, 9 strokes peaking at 1600-2800 px/s, B2; A2 had 2). That is where the user feels the "top" lag.

**Momentum.** After lift-off, velocity decays with a median **τ ≈ 0.43 s** (23 log-linear fits; most fall at 0.26-0.65 s, a few mix drag and momentum and come out long). This
matches UIKit's normal deceleration rate of 0.998 per ms, τ = 0.50 s
([UIScrollView.DecelerationRate](https://developer.apple.com/documentation/uikit/uiscrollview/decelerationrate), vendor).
It is the cheapest proof that a synthetic fling is native.

**Rubber band.**
- At the top: down to **-16 to -74**.
- At the end: up to **5276-5345** over maxY 5220 with the toolbar collapsed.
- The end overscroll fights the pin: **5220↔5312/5334**, 8-50 reversals per dwell (E1b, B2).
- With the toolbar expanded, the bounce happened once only (F2: 5260↔5412).

**Toolbar.**
- innerHeight is 775 when expanded and 815 when collapsed.
- Each transition takes **280-410 ms** (median ~320; one outlier at 599).
- There were 8-15 transitions per pass, collapsing on the way down and expanding on the way up.

**Push past the end.**
- Short pushes: 0.1-0.25 s of finger contact, 6-13 touchmoves, all prevented.
- Long holds: 1.4-3.7 s, 75-190 touchmoves at ~40-55 Hz.
- The dwell at the pin lasted 10-60 s.
- 431/470, 300/318 and 165/184 touchmoves were prevented (E1b, F1, F2).

**Back up and to the top.** Drags back up from the end went to y ≈ 3200-3400. The fling to the top took 1.6-4 s.

**Reload.** After a reload, scrolling started within ~0.3 s of the new document's first frame (A2 seg 1).

**Open question.** Each morph log counts only ~8-11 touchmoves for the first 0→5000 px traverse. Either iOS
delivers few touchmoves during a native pan, or the traverse was mostly momentum. A gesture with known strokes
answers this in V0. It matters for any "touchmove count" metric.

### 4.2 Script format and the protocol script

A script is JSON: `{name, version, screen: [430, 932], steps: [...]}`. Coordinates are screen points.

**Safe zone: x 140-290, y 200-760.**
- It keeps clear of the left and right edges, where an edge swipe means back/forward navigation.
- It keeps clear of the status bar, where a tap scrolls to the top.
- It keeps clear of Safari's bottom bar and the home indicator.

**Pull-to-refresh.** A downward finger drag that starts at scrollY ≤ 0 would trigger it, so the compiler refuses
a `down` stroke unless the step that precedes it guarantees scrollY > 300.

Step types (compiled to W3C `touch` pointer actions, one `POST /session/:id/actions` per stroke):

| step | fields | compiles to |
|---|---|---|
| `stroke` | `dir: up\|down` (finger direction), `px` (≤ 560), `ms`, `profile: fling\|still\|minjerk`, `pressMs` (default 40), `holdMs` (default 0), `x` | `pointerMove` to the start (0 ms), `pointerDown`, a pause of `pressMs`, then moves every 8 ms along the profile, then a pause of `holdMs` and `pointerUp` |
| `pause` | `ms` | Mac-side sleep (no action) |
| `until` | `cond: atEnd\|atTop\|y>=N\|settled`, `timeoutMs` | polls `scrollY` over WIP between strokes, never during one |
| `reload` | `scrollAfterMs` | `location.reload()` over WIP, reconnect, wait for `readyState !== 'loading'`, then `scrollAfterMs`; logs the real delay |
| `mark` | `name` | `performance.mark` in the page over WIP, for the timeline |

Velocity profiles over normalised time u ∈ [0, 1]:
- **`minjerk`** follows the human minimum-jerk shape, 10u³-15u⁴+6u⁵
  ([Flash & Hogan 1985](https://www.jneurosci.org/content/5/7/1688), paper). It ends at zero velocity, so the
  finger stops before lift-off: no momentum.
- **`fling`** follows the first half of that curve, stretched. Velocity peaks at lift-off, at 1.875·px/ms (px over ms of the stroke).
- **`still`** is `minjerk` plus `holdMs ≥ 150`.

**Protocol script `finger-protocol-v1`.** It matches FINGER_TESTS.md and row 1's criteria. Each step lists its
parameters, then what it reproduces.

1. `reload`, `pause 6000`.
   - Reproduces: the Chrome idle phase (6 s).
2. **Hero:** 4 strokes (up 450 px / 900 ms / minjerk, then down 400, then up 450, then down 300), 300 ms pauses.
   - Reproduces: the user's hero back-and-forth.
3. **Traverse:**
   - variant `slow`: 11 strokes, up 480 px / 700 ms / `still`, 250 ms re-grip, about 10 s in all;
   - variant `asPerformed`: 3 strokes, up 520 px / 160 ms / `fling` (~6000 px/s at lift-off), `until atEnd`.
   - Reproduces: the written ~10 s profile, or what the finger did (3-3.5 s).
4. **Push past the end ×3:** up 300 px / 400 ms / `still` / hold 300, with 800 ms pauses.
   - Reproduces: the morph start and the pin vs rubber-band fight (criterion b).
5. **Dwell:** `pushes` × (up 250 / 300 ms / hold 1500), default 6 (~15 s).
   - Reproduces: B2 pass 2 and E1b, the long morph run at ~13 fps.
6. **Continuous drag into the end:** first down 450 / 700 ms / `still` (to maxY-450), then one stroke up 560 px /
   1500 ms / minjerk / hold 500.
   - Reproduces: criterion (a), one drag from above the end into it with no lift.
7. **Drag back up:** down 500 / 800 ms / `still`.
   - Reproduces: criterion (c), the morph collapses.
8. **Fast fling to the top:** down 520 / 140 ms / `fling`, repeated until `atTop`, at most 3.
   - Reproduces: /10c item 5b (fling bottom → top, y ≈ 4.0-4.5k).
9. **Toolbar:** up 250 / 100 ms / `fling` (collapse), `pause 1500`, then down 120 / 400 ms / `still` (expand).
   - Reproduces: FINGER_TESTS row 3 and /10c 5c.
10. `reload` with `scrollAfterMs` ∈ {0, 500, 1000}, then up 520 / 160 ms / `fling` ×2.
    - Reproduces: rows #13 and /10c 5a, scrolling within 1 s of load.

**Parameters to vary:** traverse variant; fling lift-off speed (2500-7500 px/s); `pushes` and `holdMs`; the
toolbar state on arrival at the end (`toolbarAtEnd: collapsed` arrives by a fling, `expanded` adds a 60 px down
drag first, because the pin fight showed only when collapsed); `scrollAfterMs`; and the stroke x (a fixed
default, 215). There is no pressure: XCTest touches carry no force, and the page reads none. Runs are
deterministic, with no jitter by default.

**One run is ~70 s (`asPerformed`) or ~80 s (`slow`).**

**Pairing with the instruments.** Gestures go over WDA (port 8100 through `iproxy`); everything else goes over WIP:
- The recorder (`rec.mjs` frame log, `[t, dt, scrollY, innerHeight]`) gains passive `touchstart`/`touchend`
  timestamps, and the gesture marks land in its buffer, which aligns strokes to frames exactly.
- The morph logger (`fixes/morph-webkit/morph-log.mjs`) is installed after step 1.
- The driver writes `{script, compiled-actions sha256, per-stroke Mac send/return times}` into the output JSON.

**Heat rule (F-028, standing rule from 07:41Z).**
- Every block starts with a passing control: a plain `iphone.mjs scroll` on the baseline, with the WDA runner
  already started. That way the runner's own cost is inside the control.
- A block holds at most 6 gesture runs (~8 min of load), then 10 min locked and cooling.
- A failed control (idle or bottom < 58 fps, scroll < 44 fps) voids the block.
- Step 5's dwell is the hottest part: keep `pushes` ≤ 6 except in a dedicated dwell block.

## 5. Plan to delegate (ranked)

### (a) The user, once (~20-30 min). The Apple ID is typed by the user only; agents never handle it.

1. **Mac, Xcode:** Settings… > Accounts > "+" > Apple Account. A free personal team is enough.
   - Xcode registers the phone and a free 7-day profile with Apple. This is the user's own account action.
2. **iPhone:** Settings > Privacy & Security > Developer Mode > On, then restart and confirm. Skip this if it is
   already on (the phone is paired with Xcode, which suggests it is).
3. **iPhone:** Settings > Developer > **Enable UI Automation** > On.
4. **iPhone:** Settings > Safari > Advanced > Web Inspector stays On. Remote Automation is not needed.
5. **After the toolsmith's first `wda build` installs the runner:** Settings > General > VPN & Device Management >
   the "Apple Development: …" developer app > **Trust**.
6. **Optional (simulator):** Xcode > Settings > Components > iOS 26.6 Simulator (~8 GB). Start the download only
   while `chrome-measure` is free.
7. **Weekly:** when the free profile expires, the runner stops launching. Re-run `node tools/iphone.mjs wda build`
   with the phone unlocked. It re-signs; no clicks are needed unless iOS asks to trust again.

### (b) Toolsmith, test-first, with no phone and no lease needed for the tests (~5-7 h agent time, 2 commits)

**Commit 1, the libraries and their unit tests:**
- **`tools/lib/gesture.mjs`** (pure): parses and validates a script (safe zone, the pull-to-refresh guard, caps on
  ms and px), compiles strokes to W3C action JSON with the profiles in §4.2, and returns the expected kinematics
  (lift-off speed per stroke).
  - Unit tests: profile shapes (the end velocity is 0 for `minjerk`, the peak is at lift-off for `fling`), the
    8 ms spacing, the safe-zone rejections, and a stable compiled hash.
- **`tools/lib/wda.mjs`**: an HTTP client for `/status`, a session with settings `waitForIdleTimeout: 0` and
  `animationCoolOffTimeout: 0`, `activateApp com.apple.mobilesafari`, `POST /actions`, and delete.
  - It must never call `/source` or find elements.
  - Unit tests run against a fake WDA HTTP server: it checks the payloads and settings and injects latency and
    errors. There is no Appium dependency.

**Commit 2, the CLI and its e2e test:**
- `iphone.mjs wda build|start|stop|status`:
  - It runs `xcodebuild build-for-testing` / `test-without-building` on a WDA checkout pinned to a tag in
    `out/wda/` (gitignored; the team id comes from a local, gitignored config).
  - It starts `iproxy 8100 8100` with a pidfile and kills only its own pids.
  - `build` compiles for minutes, so it runs only when `chrome-measure` is free or inside a short-lane hold
    (Hard rule 7).
- `iphone.mjs gesture <script.json> --owner <t> --label <l> [--variant asPerformed] [--morph-log]`:
  - It is lease-guarded (`requireLease`) and has the same Safari-tab and certificate-warning checks as `scroll`.
  - It refuses to run if Safari is not the foreground app.
  - It writes `out/iphone/<owner>-gesture-<label>-<ts>.json` with segments, frames, touches, marks, strokes and a
    summary.
  - The summary has the iphone-wave2 metrics: hero 0-900 moving, middle, last screen + morph; morph-active
    p50/p95/> 50 %; pin reversals ≥ 20 px; touchmove prevented/total; toolbar transitions and their ms;
    overscroll extremes; momentum τ per fling.
  - e2e test: a fake WIP and a fake WDA, plus `npm test`.

**This is measurement code (a new stimulus).** `scroll` and `record` stay byte-identical. Report it to the lead as
an incident-style tool change, and have a `fix-reviewer` review it as measurement code. Gesture numbers compare
only with gesture numbers from the same script version and hash, never with `scroll` runs or finger runs, except
through (c).

**Script location:** `research/finger-simulation/scripts/finger-protocol-v1.json` (no Fastwork code in it), or
`tools/` if the lead prefers.

### (c) Validation, iphone-runner, one block of ~60 min of phone time plus ~1 h of analysis

**V0, smoke (5 min, baseline, WDA started):**
- One fling, one `still` stroke, one push past the end, while the recorder and the morph log run.
- Pass requires all of these:
  - momentum τ of 0.3-0.7 s after the fling (finger median 0.43 s, UIKit 0.50 s), and none after `still`;
  - an innerHeight 775→815 transition of 280-410 ms;
  - scrollY > 5220 at the push;
  - touchmoves arriving with `cancelable` true and prevented at the end;
  - the WIP recorder staying connected through every WDA call.
- **Fail: stop and report.** Fall back to the human finger with this spec as the protocol card.

**V1, signatures (n=3, alternating B P P B B P, after a passing control):** `finger-protocol-v1` `asPerformed`,
on baseline vs aw1-10c, then E g g E (aw1-10c vs mw-g) with the morph log. Compare each against the finger data:

| signature | finger reference | pass if |
|---|---|---|
| pin alternation on aw1-10c (toolbar collapsed) | E1b 8, B2 dwell ~50 reversals 5220↔5312/5334 | ≥ 1 per push block on aw1-10c, and 0-1 on mw-g (F1 0, F2 1) |
| touchmove prevented ratio at the end | 92 %, 94 %, 90 % | 85-100 % |
| morph-active p50 / p95 / > 50 % | E1b 24/73/10 %, F1 17/86/21 %, F2 19/117/26 % | p95 and > 50 % share within the finger range ±25 %, on the same phone state |
| hero window 0-900 moving > 50 ms | A2 12/3, B2 50/4 per pass | same order of magnitude; the direction B vs P matches the finger (no difference felt) |
| toolbar | 8-15 transitions per pass, 280-410 ms | transitions present, same duration band |

**V2 (optional): the user watches** one baseline gesture run and says whether it "looks like my finger".

**Outcome:** if V1 passes, the gesture run becomes the iPhone's touch-path A/B. It can run without the user, n=3
alternating, for the morph render ablations (mw-b, mw-e), hero-exit and N10. Finger tests become a final
look-and-feel confirmation only.

### (d) Effort

| part | who | effort |
|---|---|---|
| one-time setup | user | 20-30 min (plus ~10 min to download the simulator, optional), 1 min weekly |
| `gesture.mjs` + `wda.mjs` + CLI + tests | toolsmith | 5-7 h agent time; the WDA build is a few min of Mac CPU (in a short lane) |
| measurement-code review | fix-reviewer | ~1 h |
| V0 + V1 | iphone-runner | ~60 min of phone time incl. control and cooling, ~1 h analysis |
| simulator path (`--sim`, functional parity) | toolsmith, later | +2 h, optional |

**Risks:**
- WDA may fail to launch on 26.6.1. Mitigation: pin a WDA tag known to work with Xcode 26.x; V0 catches it.
- The synthesized pan might differ from a finger in touchmove rate. V0 measures it, and §4.1's open question
  needs that answer anyway.
- Phone heat from the runner. The control is run with WDA up.
- The weekly re-sign expiry is easy to forget. `wda status` should print the profile's expiry date.
