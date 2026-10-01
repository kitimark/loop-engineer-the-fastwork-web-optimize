# Headless Chrome for functional checks (design, ts-headless, 2026-10-02)

The user asked on 2026-10-02 for functional tests that run in Chrome headless: "it'd be run faster then normal. let's investigate,
plan and implement."

A **functional check** confirms that something works and gives no timing number. Examples: console errors, first-party 404s,
`morphReached`, a screenshot sanity check, DOM and page-state probes, served-file checks, `bench mech` counts.
**Timing work** stays headed and exclusive, unchanged: `verify.mjs` frames and LoAF, `fix.mjs ab` verdicts, `bench gain`
and `bench calibrate`.

Data: `headless-functional/equivalence-2026-10-02.json`. Probes: `headless-functional/{probe.mjs,treecpu.mjs,run.sh,run2.sh}`.
There were two holds of the normal chrome-measure lock: r1 at 18:09Z and r2 at about 18:36Z. Setup: Chrome 154.0.8037.58,
the M1 Pro Mac, baseline snapshot b1789284481295-4ad4a84a against the `fixes/all-wave1` overlay, served with the `fix.mjs ab`
defaults (`--vendors=local --https --latency 150`), 430x932 DPR 3 with touch, unthrottled.

## 1. Answer in one paragraph

Headless works for functional checks, with two required corrections.

1. **Override the UA.** Hotjar's bootstrap refuses any UA that matches `/headless/i`. Without the override the headless page
   loads one script and one iframe fewer.
2. **Give the virtual screen the host's DSF.** Use `--screen-info={0,0 1512x982 devicePixelRatio=2}`. Without it the layout
   shifts by 1 px, and screenshots differ from headed by ~3 %.

With both corrections the headless page matches headed on every functional field we checked:

| Field | Headless vs headed |
|---|---|
| Errors (0) and 404s (0) | equal |
| `morphReached` | true in both |
| Page state, height, element count | equal |
| Layer count | 106/120 in both |
| IntersectionObserver, fonts, platform fonts | equal |
| Animation-timeline support, visibility | equal |
| Top screenshot | 0.35-0.40 % apart, inside the 0-0.4 % countdown noise band |

"Faster" needs care:
- **Wall time per page is the same** (17.7-17.9 s), because the page's own waits dominate.
- **Headless costs 35-38 % fewer CPU-s** (16 vs 25 per probe pair).
- **3 headless jobs at once took 38 s**, against 36.5 s for one, so about 2.9x the throughput.

The speed gain comes from three sources:
1. a leaner flow that drops the timing-only steps: 6x throttle, the 6 s idle phase, the 10 s warm-up, the host recheck and the
   smooth-scroll phase;
2. the shared lane: no queueing behind each other;
3. parallelism.

## 2. How Chrome is launched today

| Caller | Mode | Profile / port | Lock | What it checks |
|---|---|---|---|---|
| `lib/cdp.mjs launchChrome` | `headless` option exists (`--headless=new`) | caller's dir, port 0 = auto | none | none |
| `verify.mjs` | headed | `out/chrome-verify-profile` (`--profile`), port 0 | exclusive, normal | timing (frames, LoAF, CDP metrics, trace, paint-rects) **plus** functional side outputs: `errors`, `notFound`, `morphState`, `state`, `shots`, `shimStats`, screenshot diffs |
| `fix.mjs ab` | spawns verify (headed) | verify's | verify's | timing verdicts; `regressions` (newErrors, new404s, morphReached, screenshotDiffPct) from the same runs; servedCheck (HTTP, no Chrome) |
| `bench.mjs mech` | **already headless**, no UA override, DPR 1 screen | `out/chrome-bench-profile`, **fixed and shared with gain** | short, 180 s (ts-lock-share moves it to shared) | counts and parity (functional) |
| `bench.mjs gain/calibrate`, reconfirm Tier B | headed | `out/chrome-bench-profile` | exclusive, normal | timing |
| `mirror.mjs --crawl` | headed | port 9333 | none (user's snapshot tool) | not in scope |
| `tests/chrome/verify, fix-ab` | headed | temp | exclusive (test:chrome) | timing fields plus functional |
| `tests/chrome/bench` | headless (mech) | temp repo `out/` | moving to `test:chrome:fn` | functional |
| `tests/chrome/vendor-shim` | headless | temp | moving to `test:chrome:fn` | functional |
| `tests/chrome/host-real` | no Chrome | none | exclusive | host samplers (timing-adjacent) |
| ad hoc research probes (e.g. `research/design-engineering/pacing-result.md` "Chrome check, short lane, headless") | headless | own | short | functional |

The vendor shim and the serve flags behave the same in both modes. They act on what is served (`serve.mjs`) and on page
scripts (`vendor-shim.js`), not on the browser mode. The browser mode only changes what the **page** does with the UA (§3, C9).

## 3. Platform claims

Status words follow CLAUDE.md.

| # | Claim | Status | Reference / evidence |
|---|---|---|---|
| C1 | `--headless` (new headless) is the real Chrome browser and shares its code; old headless was a separate implementation | **CONFIRMED** | developer.chrome.com/docs/chromium/headless ("Chrome now has unified Headless and headful modes"; old headless "didn't share any of the Chrome browser code"), updated 2024-10-21 |
| C2 | Since Chrome 132.0.6793.0 old headless exists only as the separate `chrome-headless-shell` binary (Chrome for Testing); it is lighter, but it is not the Chrome browser | **CONFIRMED** | same page, "Use old Headless mode"; developer.chrome.com/blog/chrome-headless-shell (shell = "lightweight wrapper around //content", new = "the real Chrome browser") |
| C3 | On macOS, new headless renders with the same GPU path as headed (ANGLE on Metal, Skia Graphite/Dawn), not SwiftShader | **CONFIRMED** (macOS) | Source: chrome/browser/headless/headless_mode_init.cc `SetUpCommandLine()` (main, read 2026-10-02) appends `--use-angle=swiftshader-webgl` only under `#if BUILDFLAG(IS_LINUX)`. Local check: `SystemInfo.getInfo` gives `gl=egl-angle,angle=metal`, `GraphiteDawnMetal`, gpu_compositing and rasterization `enabled` in both modes. The header comment in headless_mode_switches.h (`kEnableGPU`: "Headless uses swiftshader by default") and A. Kosyakov's chromium-dev post (groups.google.com/a/chromium.org/g/chromium-dev/c/8eR2GctzGuw, m111/m112) describe the Linux / older default: **REFUTED for macOS on Chrome 154** |
| C4 | Headless has a virtual screen, 800x600 at devicePixelRatio 1 by default, set with `--screen-info` | **CONFIRMED** | components/headless/screen_info/headless_screen_info.h (defaults `gfx::Rect(800, 600)`, `device_pixel_ratio = 1.0f`; format `{0,0 800x600 devicePixelRatio=2}`); CDP Emulation.pdl `getScreenInfos`: "in headless mode, a virtual headless screen configuration is provided". Local: pre-emulation `devicePixelRatio` 1 and screen 800x600 headless, against 2 and 1512x982 headed |
| C5 | Mobile emulation (`setDeviceMetricsOverride` 430x932 DPR 3, touch, focus emulation) behaves the same headless | **CONFIRMED** for what we check | CDP Emulation.pdl documents these with no mode condition. Local: same `innerWidth/innerHeight` 430x932, DPR 3, `(pointer: coarse)`, `hover: none`, 1290x2796 screenshots; touch `Input.synthesizeScrollGesture` reaches the morph (`is-morphing is-expanded`) in 15/15 headless page loads |
| C6 | Layout under emulation does **not** depend only on the emulated DPR: the host/virtual screen DSF moves layout by 1 px (scrollHeight 6241 at DSF 1 against 6240 at DSF 2), and the top screenshot then differs by ~3.1 % | **OBSERVED** (cause unknown, in our setup) | r1/r2: DSF 1 runs (B, r1 headless) h 6241, pixel diff 3.06-3.19 %; DSF 2 runs (C, A2, P1-P3) h 6240, diff 0.35-0.40 % against headed. Decisive check done: only `--screen-info` changed between B and C |
| C7 | `Emulation.setCPUThrottlingRate` works headless | **UNRESOLVED / not needed** | CDP doc: "Enables CPU throttling to emulate slow CPUs", no mode condition. Functional checks run unthrottled, and timing refuses headless, so this design never relies on it |
| C8 | `Page.captureScreenshot` gives the same size and content headless | **CONFIRMED** (size, by C5), **OBSERVED** (content) | Same 1290x2796. Content within 0.35-0.40 % with C4 corrected; within-mode noise headless 0.08-0.32 %, headed 0-0.55 % (base vs fix). **Rule:** compare screenshots only within one mode; the cross-mode numbers are a separate baseline (`equivalence-2026-10-02.json`) |
| C9 | The UA string says `HeadlessChrome/154.0.0.0` (the `/json/version` and `Browser.getVersion` **product** string stays `Chrome/154.0.8037.58`); Hotjar's bootstrap skips such UAs | **CONFIRMED** | The UA is read directly (`Browser.getVersion.userAgent`, `navigator.userAgent`). Vendor source: site/__vendor/static.hotjar.com/c/hotjar-6772436.js, `hjBootstrap`: `new RegExp("bot\|google\|headless\|baidu\|…","i")`. Local: headless loads 5 shim scripts against 6 (no `script.hotjar.com/modules.*.js`, no Hotjar IFRAME); with `Emulation.setUserAgentOverride` (HeadlessChrome/ → Chrome/) it loads 6, with the same element counts (1337 base, 1510 fix) |
| C10 | `navigator.webdriver` is true in both modes (DevTools-controlled), so it is no difference | **OBSERVED** | Probe: `webdriver: true` headed and headless |
| C11 | rAF / frame cadence: headless 60 Hz; headed follows the panel (120 Hz ProMotion here) | **OBSERVED** (cause unknown, in our setup); a reference for the headless begin-frame rate was not found (**UNRESOLVED**: references silent) | 9/9 headless probes 59.7-60.0 fps, p50 16.7 ms; headed 119.6-119.9 fps, p50 8.3 ms. This contradicts "headless rAF runs at ~120/s" in fixes/layout-animations/README.md (line 129) for Chrome 154 here. Consequence: **no frame or time number from headless means anything for the phone or for headed Chrome** |
| C12 | IntersectionObserver, CSS animations and transitions, `animation-timeline: view()` support, document visibility, web fonts and platform fonts behave the same | **CONFIRMED** at the renderer level by C1 (same Blink); **OBSERVED** equal here | IO 9/9 and 10/10 entries, intersecting 2 and 3 in both; `CSS.supports('animation-timeline','view()')` true in both; `visibilityState` visible and `hasFocus` true in both; `document.fonts` 6 faces, the same loaded set; `CSS.getPlatformFontsForNode` equal (h1 GoogleSans-Regular_Medium, body GoogleSans-Regular_opsz…, custom fonts). Running-animation counts differ by 0-2 between any two loads, headed included (transient CSSTransitions, the accent's `.is-drawing-out`/`.is-idle` phase): compare names, not counts |
| C13 | `will-change` / compositing: layer counts match with C4 corrected | **OBSERVED** | LayerTree layers 106/120 (base/fix) in headed and in headless with DSF 2; 103/116 at DSF 1; 111 in 2 of 3 parallel base loads (timing). Layer counts are attribution data and are not a functional pass/fail |
| C14 | What does NOT carry over: vsync and frame timing (C11); presentation (no real display or window server compositing of a window, so no DroppedFrame / presentation meaning); the display scale factor (C4: paint-rects `layerScale` would be 1, F-086); CPU contention (headless costs ~35 % less CPU, so it loads the host differently) | Mixed: C4 **CONFIRMED**, the rest **OBSERVED** | → every timing, trace, paint-rects and host-load number is headed-only |

## 4. Equivalence check (both holds)

Per page load, base and fix. "Same" means equal to headed within the run-to-run noise of headed itself.

| Field | headless as is | headless + UA override | + UA + `--screen-info` DPR 2 |
|---|---|---|---|
| console errors / first-party 404 / failed requests | same (0/0/0) | same | same |
| `morphReached` (verify flow and probe flow) | same (true) | same | same |
| state probe (kit, nav, hero, vendors, dataLayer) | same | same | same |
| vendor shim scripts / Hotjar iframe | **5 vs 6, no iframe** | same | same |
| scrollHeight | 6241 vs 6240 | 6241 | **6240** |
| layers (base/fix) | 103/116 vs 106/120 | 103/116 | **106/120** |
| top screenshot vs headed (>48 sum) | 3.08-3.16 % | 3.15 % | **0.35 / 0.40 %** |
| verify.mjs middle / bottom vs headed | 1.71 / 2.17-2.34 % | not run | not run (top only in r2) |
| base-vs-fix diff within the mode (verify) | top 0.13 / mid 0 / bottom 0.55 % (headed 0.19 / 0 / 0.55) | | |

The verify.mjs flow (r1: `--cpu 1 --idle 0 --max-wait 0 --chrome-warm 0`, verify unchanged, headless through a `$CHROME`
wrapper) gave the same errors, 404s, morph state and state probe in both modes. The only differences were the Hotjar module
and the 1 px height. Middle and bottom screenshots were not re-run with the screen-info correction. The implementation's
chrome test must show them inside the noise band before `fix.mjs check` screenshots are trusted against headed ones. Until
then the rule in C8 stands: no cross-mode screenshot comparison.

Not yet shown: that headless *detects* a fault that headed detects. The page had zero errors in both modes. The planned
`tests/chrome/check.chrome.test.mjs` injects a throwing overlay and a missing file on the fixture and asserts both appear
(§6).

## 5. Speed (CPU-s = the job's whole process tree, ps-sampled every 250 ms)

| Job | Mode | Wall s | Tree CPU-s |
|---|---|---|---|
| verify flow, base + fix, 1 run each, screenshots, unthrottled (r1) | headed | 86.1 | 54.6 |
| same | headless | 76.9 | 32.9 (−40 %) |
| probe pair (load, probes, walk, morph, 1 screenshot) ×2 URLs | headed (r1, r2 A) | 36.2, 44.7 | 24.5, 25.7 |
| same | headless (r1, B, C) | 36.3, 36.5, 36.8 | 16.0, 15.8, 16.2 (−35-38 %) |
| 3 probe pairs at once | headless + UA + screen | **38.2** | 50.7 (1.33 cores average) |
| for scale: `fix.mjs ab --runs 1`, default 6x/idle 6 (user-bplus, 17:37Z) | headed | ~66 + launch/warm-up, + queue | not measured |
| for scale: `fix.mjs ab --runs 5` (mw10e-arm-scope) | headed | ~432 + queue | not measured |

The queue dominated both holds: r1 waited 583 s, r2 about 25 min (a lead reorder). With the shared lane, functional jobs no
longer queue behind each other.

Conclusions:
- headless saves CPU, not wall time per page;
- a lean functional flow (~18 s per URL without screenshots, ~30 s with) is about 2x shorter than verify's per-target
  flow (~40 s);
- several checks run at once at about the cost of one in wall time.

For ts-lock-share: one headless check job ≈ 0.45 cores average and ≈ 16 CPU-s per URL pair. Weight 1 with cap 4 gives ≈ 1.8
cores, which fits load1 ≤ ncpu (8).

## 6. Design

### 6.1 New tool `tools/check.mjs` (functional only, always headless)

```
node tools/check.mjs <label>=<url>... [--viewport mobile|desktop|both] [--no-screens] [--probe <name>=<js expr>]...
     [--out out/check/<stamp>] [--result <file>] [--owner <o>] [--max-seconds 300]
```

- **Chrome:** `launchChrome({port: 0, profileDir: <per-job>, headless: true, args: [SCREEN_INFO]})`.
  - `SCREEN_INFO = '--screen-info={0,0 1512x982 devicePixelRatio=2}'` (C4/C6). It is overridable with `--screen-dpr`, and
    the result records it.
  - `args` is a new, additive `launchChrome` option. Its default `[]` leaves the headed argv byte-identical, which a unit
    test pins.
- **Per page:** `Emulation.setUserAgentOverride` to the browser UA with `HeadlessChrome/` → `Chrome/` (C9), then verify's
  viewport, touch and focus emulation, and `Security.setIgnoreCertificateErrors`. Never `setCPUThrottlingRate`.
- **Flow per target and viewport:**
  1. load and settle (quiet 2 s);
  2. verify's state probe (the same expression);
  3. DOM fingerprint (element count, tag + class token set);
  4. `--probe` expressions;
  5. stepped instant walk to the bottom (`scroll.y`, `h`);
  6. verify's morph gestures (touch on mobile, wheel on desktop), then `morphState` and `morphReached`;
  7. with screenshots: a fresh load, then top / middle / bottom exactly like verify's walk;
  8. errors (exceptions plus `Log` errors), first-party 4xx, failed requests, vendor shim stats.
- **Output:** `check.json` with `kind: "functional"`, `chromeMode: "headless"`, `browser`, `uaOverride`, `screenInfo`,
  `lock: {mode, weight}`, `baselineSnapshot`, and per target the fields above. Screenshot diffs against the first target
  use verify's canvas method and are **labelled within-mode**.
  - **No timing field anywhere.** No fps, frames, LoAF, `*Ms` or CDP durations. A unit test walks the JSON and fails on such
    keys. Only `job.seconds`, the tool's own run time, is recorded, as metadata.
- **Exit codes:** 0 ok; 1 a functional failure (a page error during load, a target that did not scroll, the state probe
  missing its nav); 2 usage; 3 baseline (`requireBaseline` as in verify); 124 the lane budget.

### 6.2 `fix.mjs check <topic> [--on <o>] [--viewport mobile] [--no-screens] [-- serve args]`

This is the functional twin of `ab`:
- the same servers (the `DEFAULT_SERVE` "lags like live" setting, `--port 0`) and the same served-file check;
- then `check.mjs base=… fix=…`;
- it writes `out/check/<topic>/<stamp>/check.json` plus a short `fixes/<topic>/check.json`. The latter is optional to
  commit, and it never touches `results.json`.

Its `regressions` block has the shape of ab's: `newErrors`, `fixedErrors`, `new404s`, `morphReached {baseline, patched}`,
`screenshotDiffPct` (headless, within-mode), and `domDiff`. Exit 1 on new errors, new 404s, or a morph lost on the patched
side. Use it before queuing `fix.mjs ab`, and as the screenshot sanity check before a user sitting.

### 6.3 Timing refuses headless

- **`launchChrome`:** it returns `userAgent` and `headless: /HeadlessChrome\//.test(UA)` from the `/json/version` it already
  fetches. That is no new CDP command, so `verify-default-cdp.json` stays untouched.
- **`verify.mjs`:** exit 2 when `browser.ch.headless` is true, for example through a `$CHROME` wrapper. The message points
  to `tools/check.mjs`. It also exits 2 on `--headless` or `--functional`, which today are silently ignored as unknown
  flags.
- **`fix.mjs ab`:** exit 2 on `--headless` or `--functional`, pointing to `fix.mjs check`. Its verify child covers the
  `$CHROME` case.
- **`bench gain/calibrate`** and reconfirm Tier B: the same `ch.headless` guard after launch.
- **`verify.json`:** gets `chromeMode: "headed"` at the top level, as a result field only.
- **ts-lock-share's layer (theirs):** exclusive acquires are refused inside `FW_LOCK_SHARED`, and `--shared` is refused by
  verify, ab and gain.

### 6.4 Isolation (several jobs at once)

- **Profile:** `out/chrome-fn/<owner>-<pid>-<random>/`, made by a new `lib/cdp.mjs tempProfileDir()` and removed after
  `close()`, also on exit. This is safe because a dir is never shared.
- **Ports:** `--remote-debugging-port=0` (DevToolsActivePort is read back, as today), and mirror servers on `--port 0`.
- **Outputs:** a stamped `--out` dir.
- r2 ran 3 such jobs at once with no collision.
- `bench mech` moves from the fixed `out/chrome-bench-profile` to `tempProfileDir()`. gain/calibrate keep theirs: they are
  headed and exclusive, and the field-trial hash is logged from it.

### 6.5 Lock: ts-lock-share's shared lane

The interface was agreed with ts-lock-share, and the lead approved their design.

- `check.mjs` calls `acquire('chrome-measure', {kind: 'process', shared: true, weight: 'check' (1), maxSec: 300, meta:
  {cmd: 'check', chromeMode: 'headless'}})`.
- Inside a `--shared` hold it re-enters through `FW_LOCK_SHARED`; inside an exclusive hold, through `FW_LOCK_HELD`.
- The result records `handle.mode` ('shared' | 'short' | 'reentrant-exclusive' | 'reentrant-shared').
- Until the lane lands on main, a feature test (`SHARED_LANE` exported by `lib/lock.mjs`) falls back to `{short: true,
  maxSec: 300}`. The tool needs no rebase ordering, and it runs in parallel only once the lead turns the lane switch on.
- The tool stops itself at maxSec − 3 s (exit 124), as `bench mech` does.
- `bench mech` gets `lock.mode` and `chromeMode` in its record. Its acquire is ts-lock-share's change.
- Tests: `tests/chrome/check.chrome.test.mjs` joins `test:chrome:fn` (vendor-shim, bench and check; weight 1, 300 s).
  `test:chrome` keeps verify, fix-ab and host-real.

### 6.6 Which callers switch

| Caller | Change |
|---|---|
| fix owners: "does my overlay break anything" before an A/B, and before a user sitting | new `fix.mjs check` (headless, shared) instead of `fix.mjs ab --runs 1` |
| `bench mech` | per-job profile; `chromeMode`, `lock.mode`, `screenInfo` recorded. **Decision for the lead (Q1):** also apply the UA override and `--screen-info` so mech counts the page the timing runs see (Hotjar loaded, DSF 2). That changes mech's counting conditions, so existing `bench-results.json` mech records are not comparable across it, and the record says so (`mechPage: "headed-equivalent"`). Recommended: yes |
| ad hoc headless probes (design engineering, mappers' page checks) | `check.mjs --probe` |
| `tests/chrome/vendor-shim`, `bench` | → `test:chrome:fn` (ts-lock-share) |
| `verify.mjs`, `fix.mjs ab`, `bench gain/calibrate/reconfirm`, `mirror --crawl`, `sim`, `iphone` | unchanged, except the refusals in 6.3 |
| `fix.mjs ab` `regressions` | unchanged. It stays as it is, because it comes free from the timing runs |

### 6.7 Tests (Phase 2, test-first)

- **unit `cdp.test.mjs`:**
  - headed `launchChrome` argv unchanged, pinned as an exact list;
  - `headless` + `args` add `--headless=new` and the screen-info;
  - `tempProfileDir` gives unique dirs;
  - the `HeadlessChrome` detection.
- **e2e with fake Chrome:**
  - fake-chrome logs its argv as a `(launch)` line, which `cdpTokens` already ignores, so the golden is untouched;
  - `FAKE_CHROME_HEADLESS=1` serves a `HeadlessChrome` UA;
  - verify exits 2 on a headless browser and on `--headless`; ab exits 2 on `--headless`;
  - `check.mjs` sends `setUserAgentOverride` before navigating, never sends `setCPUThrottlingRate`, writes
    `chromeMode: 'headless'`, contains no timing keys, takes the short lane (shared once available) and re-enters
    `FW_LOCK_HELD`;
  - `fix.mjs check` regressions: a new error and a new 404 on the patched side give exit 1;
  - two concurrent `check.mjs` runs use different profile dirs and ports.
- **golden:** `verify-default-cdp.json` and its test stay byte-identical.
- **chrome (`test:chrome:fn`):**
  - real headless `check.mjs` on the fixture: 0 errors on the baseline;
  - an overlay that throws plus a missing asset gives `newErrors` and `new404s` (the fault-detection proof §4 lacks);
  - `navigator.userAgent` has no `Headless`;
  - pre-emulation DPR is 2.
- Then the full `npm test` in the short lane, and `npm run test:chrome` because verify, `lib/cdp.mjs` and `fix.mjs` change
  (measurement code: called out in the commit and the land request).

## 7. Open questions for the lead

- Q1: Should `bench mech` get the UA override and screen-info (recommended; this breaks comparability with older mech
  records)? See 6.6.
- Q2: Should `fixes/<topic>/check.json` be a committed deliverable? The proposal: optional, and never instead of
  `results.json`.
- Q3: Is `--screen-info` pinned to this Mac's 1512x982 at DSF 2 acceptable? The proposal: yes, recorded per result, with
  `--screen-dpr` to override.
- Q4: The "headless rAF ~120/s" line in fixes/layout-animations/README.md is contradicted here (C11, F-091). Leave it as
  history, or add a note?
