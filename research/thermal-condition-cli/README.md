# Xcode "Thermal State" device condition: can a CLI read it, and should Serious change Safari's rAF?

Desk research by de-thermal-cli, 2026-10-03. Read-only: no Chrome, no iPhone, no locks, nothing installed, no device
command run. Questions come from the user's heat test (Xcode Device Conditions > Thermal State "Serious", iOS 26.6.1,
Xcode 26.6; Safari rAF stayed at 59 Hz, frame counts unchanged, OBSERVED, `out/thermal-trial/` of the iphone-runner).
Status words follow CLAUDE.md "Platform claims". No personal data went into any web request.

How the sources were read. Apple pages: WebFetch (the JS-rendered pages return only a title; the
`developer.apple.com/tutorials/data/...json` form and `help.apple.com/xcode/mac/current/en.lproj/<id>.html` work).
WebKit: the files at the `main` branch through jsdelivr's mirror (real line numbers, a snapshot of `main` whose date I
could not read; the facts below were re-checked on the release tags WebKit-7622.1.10 ... WebKit-7625.1.29), commit
pages through WebFetch (summaries by a small model; the commit message and diff were quoted by it, treat the quotes as
read-through-a-summarizer). pymobiledevice3: raw files on its `master`. WebSearch was exhausted in this session.

## Answers

### Q1. What Apple documents for the thermal condition

- CONFIRMED. Xcode help "Test under adverse device conditions"
  (https://help.apple.com/xcode/mac/current/en.lproj/dev308429d42.html): three thermal profiles. Fair: the app "defers work
  that's not immediately needed"; Serious: "measure app metrics like frames per second ... while scrolling"; Critical: the app
  "responds by quickly reducing its resource usage". The page is about what the APP does. It does not say whether the system's
  own throttling follows. It does not say how to verify the condition is on.
- CONFIRMED. WWDC19 session 412 "Debugging in Xcode 11", Device Conditions part
  (https://developer.apple.com/videos/play/wwdc2019/412/): "you're able to use the new thermal state condition to safely and
  reliably raise the thermal state of a device to any of the elevated levels, fair, serious, or critical ... to debug and
  verify your handling of thermal state changes. Just note the device does not actually get physically warmer".
  "Device conditions are tied to the Xcode device connection. So if the device becomes disconnected from Xcode, we
  automatically tear down that device condition." A status bar indicator on the phone shows a condition is active; tapping
  it shows the condition and a stop button. The Xcode Instruments window has a "thermal state track" that confirms it.
  Two Apple-documented ways to verify "it is on": that status bar indicator, and the thermal state track.
- CONFIRMED. `ProcessInfo.ThermalState.serious`
  (https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum/serious, read through
  https://developer.apple.com/tutorials/data/documentation/foundation/processinfo/thermalstate-swift.enum/serious.json):
  "The system takes moderate steps to reduce thermal state, which reduces performance. Fans are running at maximum
  speed", then app advice incl. "Reduce the target framerate from 60 FPS to 30 FPS". The parent enum page
  (.../thermalstate-swift.enum.json) points to the Xcode help page above for testing. The older archive page
  (https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/RespondToThermalStateChanges.html)
  says apps query `NSProcessInfo.thermalState` and observe `NSProcessInfoThermalStateDidChangeNotification`.
- UNRESOLVED from Apple's text: whether the condition changes only `ProcessInfo.thermalState` (and the notification) as apps
  see it, or the system's real thermal pressure (CLTM level / the system's own throttling). No Apple page found says. The
  "network link condition" and "thermal state" pages are silent on mechanism. Pointers (OBSERVED, strings only):
  `DTConditionInducerService`, `_processInfoThermalStateToCLTMPressureLevel:` in Xcode's DVTInstrumentsFoundation: a
  conversion from the ProcessInfo level to a CLTM pressure level exists in Xcode's code, which hints that the inducer works
  on the CLTM side and ProcessInfo is derived (inferred, not shown).
  The decisive local check is in Q4.

### Q2. A CLI that lists or reads the active condition

- CONFIRMED (our own check, no device): Xcode 26.6's `xctrace` (16.0, 17F113) commands are record, import, export, remodel,
  symbolicate, list, version (`xcrun xctrace help`). `xctrace record` has no condition option. `instruments` is not
  installed as a tool (`xcrun --find instruments` fails). `xcrun simctl help` has no thermal or condition word (simctl is
  for the Simulator anyway). Earlier established: `devicectl` 518.33 has no condition or thermal command.
- NEW, CONFIRMED to exist: `xcrun xctrace list instruments` lists an instrument named "Thermal State" (next to "Power
  Profiler", "System Load"). So an Apple-shipped CLI can record the thermal state track the WWDC talk shows:
  `xctrace record --instrument 'Thermal State' --device <name|UDID> --all-processes --time-limit 20s --output x.trace`,
  then `xctrace export --input x.trace --toc` and `--xpath` to read the table. UNRESOLVED (needs the phone): whether it
  works on a physical iPhone over USB without Xcode UI, whether the exported table has the thermal level and the time it
  changed, and whether the level it shows is the same signal WebKit reads (probably `NSProcessInfo.thermalState`,
  inferred). I did not run it (a device command).
- CONFIRMED (source): pymobiledevice3 is third party. `developer dvt condition list|set|clear` in
  `pymobiledevice3/cli/developer/dvt/__init__.py` (https://github.com/doronz88/pymobiledevice3, file path as in the
  repo's `master`): `list` prints `ConditionInducer(dvt).list()` as JSON, `set <profile_identifier>` calls `set()` and then
  `OSUTILS.wait_return()` (keeps the session open, so the condition does not drop), `clear` calls `clear()`.
  `pymobiledevice3/services/dvt/instruments/condition_inducer.py`: DTX channel
  `com.apple.instruments.server.services.ConditionInducer`, methods `availableConditionInducers`,
  `enableConditionWithIdentifier:profileIdentifier:` (group identifier, profile identifier) and `disableActiveCondition`
  (no reply). Only these three exist in the class. `list` returns "condition groups, each a dict with an `identifier` and a
  list of selectable `profiles`". UNRESOLVED: no "is active" getter is defined in that class, so `list` shows an active
  one only if the device puts a flag into those dicts (unknown, needs a device). Xcode's own client class uses the
  longer Objective-C names (`listAvailableConditionInducersWithReply:`, `enableConditionInducerWithIdentifier:profileIdentifier:reply:`,
  `disableActiveConditionInducerWithReply:`, OBSERVED strings); the wire names above are pymobiledevice3's.
  Since a condition is "tied to the connection", a second client's `list` while Xcode holds one may or may not report
  it, and a `set` from the CLI ends when the CLI session ends (WWDC19 transcript, CONFIRMED; the pymobiledevice3
  `wait_return` is consistent).
- Cost: iOS 17+ routes DVT through a tunnel that needs root (lead's earlier note), plus an install. Needs the user's OK.

### Q3. WebKit: what throttles rAF, what Serious does

All CONFIRMED from `github.com/WebKit/WebKit` (paths in `Source/`; line numbers from `main` through jsdelivr).

- Signal. `WebCore/platform/cocoa/ThermalMitigationNotifier.mm:38-41`: `isThermalMitigationEnabled()` returns
  `NSProcessInfo.processInfo.thermalState >= NSProcessInfoThermalStateSerious`; line 58 observes
  `NSProcessInfoThermalStateDidChangeNotification`. So the signal is the same app-visible value as Apple's page, with the
  threshold at Serious. It is not LPM and not an OSThermalNotification read. Active on iOS:
  `WTF/wtf/PlatformHave.h:1389-1391`: `HAVE_APPLE_THERMAL_MITIGATION_SUPPORT` for `PLATFORM(IOS) || PLATFORM(VISION)`.
  (It was visionOS-only until Jan 2025, commit a8c0b8f below.) Introduced by commit 3088454, 2023-08-31, "Timers are
  not coalesced during thermal throttling; should match low power mode" (bug 260931).
- What it does at Serious (the "ThermalMitigation" reason). `WebCore/page/Page.cpp:459-462` creates the notifier,
  `:559-562` seeds the throttling reasons at page creation, `:3061-3079` `handleThermalMitigationChange` sets
  `ThrottlingReason::ThermalMitigation`. Effect 1: `Page.cpp:3321-3325`, `updateDOMTimerAlignmentInterval`: with
  low power mode or thermal mitigation, DOM timers align to `DOMTimer::defaultAlignmentIntervalInLowPowerOrThermallyMitigatedMode()`
  = 30 ms (`WebCore/page/DOMTimer.h:54`; normal is 0). This is the mild step. It is observable from a page.
- What halves rAF. `WebCore/platform/graphics/AnimationFrameRate.cpp:33`: `halfSpeedThrottlingReasons` =
  `LowPowerMode, NonInteractedCrossOriginFrame, VisuallyIdle, AggressiveThermalMitigation`. `ThermalMitigation` alone is
  NOT in that set (`:47-65` `preferredFramesPerSecond`, `:67-86` `preferredFrameInterval`; the halving is `framesPerSecond
  /= 2`, `:62`). So only the aggressive reason halves, and it is set only when
  `Page.cpp:561` / `:3071-3073` `settings().respondToThermalPressureAggressively()` is true.
- Preference. `WTF/Scripts/Preferences/UnifiedWebPreferences.yaml:5171` `RespondToThermalPressureAggressively`:
  `status: internal`, `defaultsOverridable: true`, `defaultValue: false` for WebKitLegacy, WebKit and WebCore, i.e. false
  on iOS too. History: added by commit 984773a (2024-12-15, "Respond to thermal pressure more aggressively", 287858@main)
  with `PLATFORM(IOS_FAMILY): true`; commit a8c0b8f (2025-01-31, "Disable RespondToThermalPressureAggressively by default",
  bug 286776, rdar 143918242) removed the iOS true. Quoted reason: it "causes a MotionMark regression, so it can't be
  enabled as-is", and on visionOS the system already throttles globally, so doing it in WebKit too "could lead to
  something like 1/4 the normal frame rate". The default is false in every release tag I read that has the preference
  (WebKit-7621.2.1, 7621.2.4, 7622.1.7, 7622.1.10, 7622.1.21.3, 7622.2.11, 7623.1.8, 7624.1.16, 7625.1.29) and on `main`.
  Quote of the useful sentence from the a8c0b8f message: "On visionOS, the system is in charge of throttling the global
  framerate for all processes when it detects thermal pressure."
- Other things the aggressive preference gates (commit 984773a message): lower animation frame rate, no autoplay video
  without a gesture, no HDR, no speculative loads in the network process. Same gate, so also off by default.
- Not found / UNRESOLVED: I could not see (a) the exact WebKit build in iOS 26.6.1 (the open tags end where Apple
  stops publishing; `status: internal` means no public Safari setting, but Apple could still override the default in a
  non-public way), (b) the iOS Safari Advanced > Feature Flags list for this key (internal flags are not shown).

### Q4. Would Serious be expected to change Safari's rAF on iOS 26?

- No, by the open-source code. CONFIRMED (source, the tags and `main` above) that at Serious WebKit's only change is
  30 ms timer alignment, and the rAF halving needs a preference that defaults to off on iOS. So the user's unchanged 59 Hz
  rAF is what WebKit predicts; The claim "Serious should have halved rAF on iOS" is REFUTED by the source. It is NOT evidence about whether the Xcode condition
  reached Safari: the rAF test cannot tell active from inactive, because the expected rAF is identical in both cases.
- UNRESOLVED: (i) whether the Xcode condition reaches `NSProcessInfo.thermalState` inside Safari's WebContent process (the
  rAF code only matters if it does); (ii) the shipped iOS 26.6.1 default.
- The same experiment cannot show the system's own "moderate steps" either (Apple's text above), because Xcode's condition
  might not engage them (UNRESOLVED, Q1). So "the Xcode condition is not a stand-in for a really hot phone" is
  OBSERVED in our setup (no frame change), and still cause-unknown.

Decisive local checks, cheapest first (all need the iPhone lease via the lead; none run here):
1. Timer probe on the page under Serious (and a control run without): a chain of `setTimeout(f, 0)` or `setInterval(f, 1)`
   on a visible, interacted page. Source predicts, under thermal mitigation, fire times fall on a 30 ms grid (`DOMTimer.cpp:437-448`,
   alignment `Page.cpp:3325`); normal is not aligned. If the 30 ms grid appears, the condition reached Safari's process
   and WebKit did its mild step: then the unchanged rAF is a true negative. If it does not appear, the condition does not
   reach WebKit's `NSProcessInfo` read (or that build differs). Caveat: low power mode also does it, so record Low Power
   Mode off. Deeply nested timers get a minimum interval clamp anyway (inferred from `DOMTimer.cpp` `intervalClampedToMinimum`, not read in full), so use a fresh `setTimeout` per tick from a
   rAF or an event, not a deep chain.
2. `xcrun xctrace record --instrument 'Thermal State' --device <udid> ...` during the same window (Q2), to prove the level
   the system reports. Plus the phone's status bar indicator (Apple's documented sign, WWDC19).
3. Only if both are positive and a real slowdown still never shows: the system's moderate steps do not engage under the
   condition.

## Follow-ups that need the user's OK

1. Run the timer probe and the `xctrace` Thermal State recording on the phone during an Xcode Serious window (user turns
   the condition on and off in Xcode; phone lease through the lead; nothing installed; the page itself is not changed).
2. Install pymobiledevice3 (third party, pip) and use a root tunnel for iOS 17+ so `dvt condition list` can be tried and
   `condition set` could replace Xcode's UI. Not needed for item 1; decide after it. Hard rule 12 applies (no device
   identifiers in any report to outside services).

## Links (all read for this note)

- https://developer.apple.com/videos/play/wwdc2019/412/
- https://help.apple.com/xcode/mac/current/en.lproj/dev308429d42.html
- https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum/serious
- https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/RespondToThermalStateChanges.html
- WebKit: Source/WebCore/platform/graphics/AnimationFrameRate.cpp, Source/WebCore/platform/cocoa/ThermalMitigationNotifier.mm,
  Source/WebCore/page/Page.cpp, Source/WebCore/page/DOMTimer.h, Source/WTF/wtf/PlatformHave.h,
  Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml (https://github.com/WebKit/WebKit); commits 3088454, 984773a, a8c0b8f.
- pymobiledevice3: pymobiledevice3/cli/developer/dvt/__init__.py, pymobiledevice3/services/dvt/instruments/condition_inducer.py
  (https://github.com/doronz88/pymobiledevice3).
