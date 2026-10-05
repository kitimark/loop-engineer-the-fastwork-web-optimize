# Fix: countdown-tick

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts, pixel identity, resume check); ready for the lead's land review. No timing A/B (memory
"defer timing"). The short phone no-worse check (P-130, through the lead) is still to run.
**Stage:** I → F. Landing basis: the less-work landing rule (memory `less-work-landing-rule`): cost-card counts, pixel
identity of the digits, then a short phone no-worse check.
**Device class / gate:** counts in Chrome with WebKit's timer grid forced by a shim (below); frozen-frame pixels in
Chrome. Phone: P-130 (idle, xcode-serious), not yet run.
**Driver(s) behind the claims:** `tick-probe.mjs` (Chrome, idle at the top, no scrolling); `model.mjs` (no browser).
**Spec:** `research/serious-heat/README.md` §3.3.1 (arch-serious-heat), with one correction made here (the tick writes
the second it was aimed at, not `Date.now()`; "The spec correction" below). arch-serious-heat agreed; its commit
b44850f4 points §3.3.1 to this README as the spec of record.
**Topic:** the countdown skips a shown second about every 50 s under Serious heat (F-266).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, the countdown component `cD`'s effect:
- baseline (`patch.diff`, 1 hunk at pretty l.3933): the `setInterval(e, 1e3)` and its `clearInterval`;
- v9 (`fixes/countdown-tick-v9/patch.diff`, stacked on `fixes/v9-best`, 3 hunks): countdown-faces' timer lines
  (`__cdStop`, `__cdGo`, the effect start). The same patch also applies on v8-best.

No CSS change. Nothing outside the countdown's timer changes.

## Why the countdown skips a second (research)

The countdown `cD` (baseline l.3917-3945) keeps one state `c` holding a time. Every second its timer callback `e`
writes `Date.now()` into it. The digits derive from it: `rD(t) = max(0, ceil((deadline - t)/1000))`, with
deadline 2026-11-02T12:00:00+07:00 (l.3905-3909). The timer is `window.setInterval(e, 1e3)` (l.3936).

- **WebKit re-arms a repeating timer at its actual fire time + interval, and under thermal mitigation rounds the fire
  time up to a 30 ms grid** once the timer's nesting level reaches 5. CONFIRMED, F-266: WebKit main bdc535f8fe,
  `ThreadTimers.cpp` (re-arm from `fireTime = now`), `Timer.cpp` l.502-520 and `DOMTimer.cpp` l.436-448
  (`alignedFireTime`, the next 30 ms grid point under thermal mitigation).
- So each fire is up to 30 ms late, and the next one is aimed 1000 ms after that late fire. The interval runs at
  ~1020 ms per fire (OBSERVED on the phone at real Serious, P-074; 1005 ms at Fair, P-071).
- The shown second is `ceil((deadline - fire time)/1000)`. A clock that runs 2 % slow drops one displayed value about
  every 50 s: the digits go 12 → 10. That happens in the original too, not only in our fixes.
- Chrome's native `setInterval` is drift-free (it re-arms from the scheduled time), so the plain Chrome A/B never
  shows this. That is why the probe below forces WebKit's semantics.

On v9 the same 1 s interval sits in countdown-faces' code (`__cdTimer`, `__cdGo`'s resume). countdown-faces' resume
model (`__cdRead`, `u`'s `Math.max`) assumes the original's fires land at `__cdT0 + k s`, which a drifting interval
does not do (F-266).

## What changed

The 1 s interval becomes a timeout chain aimed at the interval's own phase. `__ctT0` (v9: countdown-faces' `__cdT0`) is
the effect's first `Date.now()`, i.e. when the original interval starts. Fire k is aimed at `__ctT0 + k*1000`, the
time the original would fire at Fair. It re-aims on every fire, so it never drifts. Each fire:

1. works out the second it is for: `k = floor((now - T0)/1000)`. If the fire landed a little early (k is one less than
   the aimed `__ctK`), it takes the aimed k. If it is over 1 s late (throttled background tab) or the clock was set
   back, it takes the clock's own second;
2. arms the next fire for `T0 + (k+1)*1000`;
3. writes `T0 + k*1000` into the same state with the same call, `z(c, …, !0)`.

Baseline (pretty l.3933-3962 in the overlay):

```js
let __ctT0 = Date.now(), __ctK = 1, t = 0,
  __ctArm = () => { t = window.setTimeout(__ctFire, __ctT0 + __ctK * 1e3 - Date.now()); },
  __ctFire = () => {
    let k = Math.floor((Date.now() - __ctT0) / 1e3);
    (k === __ctK - 1 && (k = __ctK), (__ctK = k + 1), __ctArm(), z(c, __ctT0 + k * 1e3, !0));
  };
__ctArm();
// cleanup: window.clearTimeout(t) in place of clearInterval
```

v9 (`fixes/countdown-tick-v9/patch.diff`): the same `__cdArm`/`__cdFire` pair next to `__cdTimer`. `__cdStop` clears
`__cdTimer` with `clearTimeout`. `__cdGo` sets `__cdK` to the next whole second and its one aligned wait calls
`__cdFire()` (in place of `__cdTick()` + `setInterval`). The effect start arms the chain (`__cdK = 1`). `__cdTick` (the
`visibilitychange` handler, `Date.now()`) and the 60 s `__cdSlow` label refresh are unchanged.

What stays the same:
- one state write per second, the same state `c`, the same derived digits and DOM writes (only `t`'s value is the
  aimed second, not the moment the fire happened to land);
- the `visibilitychange` write (`e`, `Date.now()`), unchanged;
- **expiry:** `rD` clamps at 0 and the original's interval keeps writing after the deadline. The chain keeps writing
  too, so after 2026-11-02 05:00Z both show 0 and both go on with one write per second. Not run (every run here is
  before expiry; the probe refuses within 15 min of it). By code reading the expiry path is unchanged;
- `prefers-reduced-motion`, desktop, the hero and panel instances: same code path, nothing branches on them.

### The spec correction (§3.3.1 as first written skips too)

§3.3.1 first said: keep `z(c, Date.now(), !0)` and only re-aim the timer. That still skips. Let r = (deadline - T0)
mod 1000 ms. A fire aimed at `T0 + k s` that lands L ms late writes a time L ms past the aim. If L > r, the shown value
crosses one more second boundary: it skips that second, and the next on-time fire shows it again (a repeat). Under the
30 ms grid L is 0-30 ms. So a page loaded with r < ~30 ms (about 2.5 % of loads) skips and repeats every few seconds.
Writing the aimed time `T0 + k s` makes L irrelevant: the shown value is exactly the original's at second k at Fair.

`model.mjs` (no browser) sweeps r over 0-999 ms and the grid phase, 10 min per load, lateness 0-2 ms on top of the grid:

| arm (writes) | grid | fires / 60 s | skipped s / 10 min | repeated s / 10 min | loads with any skip/repeat | worst load |
|---|---|---|---|---|---|---|
| orig: interval, `Date.now()` | 0 (Fair) | 59.9 | 0.60 | 0 | 59.6 % | 1 |
| orig | 30 ms | 58.8 | **11.68** | 0 | 100 % | 12 |
| chain, `Date.now()` (§3.3.1 as written) | 30 ms | 59.9 | 3.97 | 3.96 | 2.5 % | 199 |
| **chain, aimed second (this fix)** | 0 | 59.9 | **0** | 0 | 0 % | 0 |
| **chain, aimed second (this fix)** | 30 ms | 59.9 | **0** | 0 | 0 % | 0 |

The original even skips at Fair: a 1-5 ms late fire (Fair lateness, P-071) crosses a boundary once when the drift
passes r. That happens about once per 10 min.

## Forcing the timer grid (how the counts were made)

Chrome does not align timers and does not drift. `tick-probe.mjs` installs an init script (CDP
`Page.addScriptToEvaluateOnNewDocument`, before any page script). It wraps `setTimeout`/`setInterval`/
`clearTimeout`/`clearInterval` with a model of WebKit's `DOMTimer` on top of Chrome's own timers:

- nesting level: a timer created inside a timer callback has that callback's level + 1 (0 outside timers). A repeating
  timer's level grows by 1 per fire, up to 5 (`DOMTimer::fired`);
- at level ≥ 5 the fire time is rounded UP to the next multiple of GRID ms on `performance.now()`
  (`DOMTimer::alignedFireTime`, `Page::domTimerAlignmentInterval` = 30 ms under thermal mitigation);
- a repeating timer re-arms at its actual fire time + interval (`ThreadTimers.cpp`), so it drifts like WebKit's.

GRID=30 is the Serious case. GRID=0 is Fair: no grid, but still WebKit's interval re-arm (Chrome's own interval would
not drift at all). The shim also records every fire of a timer armed from the countdown's own lines (site from the
call stack, inside `cD`'s line range), with its aim and its actual fire time. The probe reads the hero clock's
`aria-label` (`.hero-track [role=timer]`) after each fire and records every label change.

Known gap: microtasks queued by a timer callback run after the shim has reset the nesting level (WebKit runs them inside
the fire). Only v9's `__cdGo` first wait, which is created from a Svelte effect, could see a lower level. The 1 s chain is
always created inside its own timer callback, so it sees the right level.

Setup: headless Chrome, 430x932 DPR 3, mobile, touch, no CPU throttle (counts only). All arms of one run load side by
side in one browser and stay idle at the top with the hero clock on screen. Serve: `serve.mjs --vendors=local --https
--latency 150 --no-cache` from hash-pinned copies (`out/countdown-tick/snap/<arm>`). Each job ran in its own shared-lane
hold (`lock.mjs run chrome-measure --shared --weight probe --max-seconds 300`).

## Cost card: counts

There were 3 runs of 240 s at GRID 30 (12 min per arm) and 1 run of 240 s at GRID 0. All four arms ran side by side in
each run. The data is in `results.json` → `counts`, from `out/countdown-tick/counts-2026-10-05T05-{15-30,19-46,25-14,31-53}*.json`.

| arm | grid | s | fires / 60 s | skipped s (per run) | skipped s / 10 min | repeated | wrong value | lateness from T0 + k s (ms) | fires in [0, 40] ms |
|---|---|---|---|---|---|---|---|---|---|
| orig (baseline) | 30 | 720 | 58.92 | 14 (5, 5, 4) | **11.67** | 0 | n/a | 130 … 5012 (drifts) | 0 / 707 |
| **tick** (baseline + patch) | 30 | 720 | **60.00** | 0 (0, 0, 0) | **0** | 0 | 0 | 2 … 31 | 720 / 720 |
| v9 (step 4) | 30 | 720 | 58.92 | 14 (5, 5, 4) | **11.67** | 0 | n/a | 106 … 4986 (drifts) | 0 / 707 |
| **v9tick** (v9 + delta) | 30 | 720 | **60.00** | 0 (0, 0, 0) | **0** | 0 | 0 | 1 … 33 | 720 / 720 |
| orig | 0 (Fair) | 240 | 60.00 | 0 | 0 | 0 | n/a | 13 … 247 (drifts ~1 ms/s) | 24 / 240 |
| tick | 0 | 240 | 60.00 | 0 | 0 | 0 | 0 | 0 … 3 | 240 / 240 |
| v9 | 0 | 240 | 59.75 | 0 | 0 | 0 | n/a | 18 … 265 | 30 / 239 |
| v9tick | 0 | 240 | 60.00 | 0 | 0 | 0 | 0 | 0 … 3 | 240 / 240 |

The measured 11.67 skipped seconds per 10 min matches the model's 11.68. "wrong value" is checked only for the chain
arms (the interval arms have no fixed k phase to compare with). Host load: load1 was 8-10 in the first run and 150-167
in runs 2-3 (other agents' Simulator and Chrome work in the shared lane). This is a count, not a timing claim; even
then the fix's fires stayed within 33 ms of their aim, and the skip counts per run did not change with the load.

- **fires / 60 s**: the fix fires once per shown second, like the original at Fair. The original under the grid fires
  less often (58.9 per 60 s), because each fire comes ~20 ms late. So the work per second is the same (one state write,
  one digit update); there is just one more fire per ~50 s than the drifting original.
- **lateness**: measured from `T0 + k s`. The fix's fires land 0-30 ms after their aim (the grid). The original's
  interval falls further behind by ~20 ms per fire, so its lateness from the Fair phase grows without bound (5.0 s after
  240 s).
- **wrong value**: a shown value that differs from `rD(T0 + k s)`, the original's value at second k at Fair.

## Pixel identity of the digits

`tick-probe.mjs pixels` (GRID 0, `out/countdown-tick/pixels-2026-10-05T05-13-35-314Z.json` + PNGs). Per arm it shoots
the hero clock (clip of its box) once its value has changed and the digit spring is at rest: wait for the label change,
400 ms, then shoot until two shots in a row are byte-equal with the same label before and after. The shots are paired
across arms by equal `aria-label`. `orig2` is a second baseline page (A/A).

| pair | labels paired | diff pixels | max channel delta |
|---|---|---|---|
| orig / orig2 (A/A) | 6 | 0 (all 6) | 0 |
| orig / tick | 6 | 0 (all 6) | 0 |
| v9 / v9tick | 6 | 0 (all 6) | 0 |
| orig / v9 | 5 | 0 (all 5) | 0 |

The paired values include a minute rollover (46:00 → 45:59). Every pair is byte-identical (`bytesEqual` true). The
digits' motion between values is the spring of the original (`GE`), started by the same state write once per second.
Its timing within the second moves by the lateness difference above (≤ 30 ms under the grid), not its shape.

## countdown-faces' resume (v9)

`tick-probe.mjs resume` (GRID 30, `resume-2026-10-05T05-14-04-916Z.json`). The hero clock is hidden for 7.4 s (instant
scroll to 3 viewports: countdown-faces stops the 1 s tick), then the page scrolls back to the top. This happens twice.

| arm | resume | first label after (ms) | equals the live chain's value | label changes while hidden |
|---|---|---|---|---|
| v9 | 1 / 2 | 9 / 19 | yes / yes | 0 / 0 |
| v9tick | 1 / 2 | 11 / 19 | yes / yes | 0 / 0 |

- v9tick: lateness 0-29 ms on all 56 fires, 0 wrong values. On resume `__cdGo` aims its first wait at the next whole
  second of `__cdT0`. The chain then continues on the phase that `__cdRead` and `u` assume, so countdown-faces' model
  is exact by construction.
- v9: the resume value is right here. But the interval it starts after resume drifts again under the grid, so v9 still
  skips a shown second while visible (the counts above).
- In this run, "skipped seconds" and the interval arm's lateness count the hidden stretches (no writes while unseen), so
  they don't compare with the counts table.

## Phone check (P-130, not yet run)

This is the lead's short no-worse check, ticket P-130 (mgmt-ops-10). The card below is rev 1 plus ops' pre-data read
(NOT YET, N1-N9). It runs only after v9 lands (lead), and before the 2026-11-02 05:00Z expiry.

- **Question.** Does the chain remove v9's shown-second skips under heat on the phone, with nothing worse?
- **Profile** xcode-serious. **Driver** G-idle: `phone/idle-p130.json` (GESTURE_HASH 58b3e0b3f502). It reloads, waits 128 s at the
  top with the hero clock on screen and no touch, then does one 40 px still stroke. gesture-run compiles no program
  without a stroke, and this one comes after the window and the end grid read, so nothing counted sees it.
- **Arms.** C = the landed v9-final (main 8b5ce9b3; `fixes/v9-best/patch.diff` 4196eaa61d96, no scroll-cb, no close rule): JS 647c9ef2b1e2 / CSS e1359ab9994a.
  V = C + the countdown-tick delta, rebuilt on v9-final. Both are served from immutable snapshots with a HASHES.txt and
  a served-hash check before each item. Built 2026-10-05 ~09:25Z: V JS 6841352e0328 (CSS = C's); `serve.sh snap` and a
  start + `check` gave B 4606120cf392 / 27776f3d4138, C 647c9ef2b1e2 / e1359ab9994a, V 6841352e0328 / e1359ab9994a.
- **Logger.** `phone-logger.mjs`: one MutationObserver on `.hero-track [role=timer]`'s `aria-label`, no polling, the
  `--inject` contract. The window is 120 s from the first logged change. A skip is two consecutive values that drop by
  ≥ 2 s (each counts drop − 1).
- **Grid read.** The logger runs a 32-hop `setTimeout(0)` chain twice: at install, and 121 s after the first change.
  The read must come **≥ 123 s after the first change**, so the end read (about 1 s at a 30 ms grid) is done.
- **Strata** (p50 of the hop gaps): ≥ 25 ms "30ms"; [6, 12] "8ms"; < 6 "fair"; (12, 25) "other". A run's stratum
  needs start and end to agree, else "mixed". "other" and "mixed" runs count for no-worse only.
- **Void run.** Any of these voids a run:
  - thermal state not Serious at start or end;
  - hidden > 0;
  - fewer than 100 changes, or a window under 115 s;
  - the part (hold) VOID: the WDA check, the idle sentinel, a served-hash check, an open failure, the end gate or the
    Mac sleep check;
  - the gesture run's exit not 0 (e.g. the stroke after the logger read failed, or gesture-run refused for budget);
  - the logger installed late (no 'initial' record);
  - the read earlier than 123 s after the first change (the logger's own `readAt`, the phone's clock);
  - a grid read missing;
  - started after 04:45Z on 2026-11-02.
- **Verdict** (`p130-read.mjs`, self-test 25/25; `p130-block.mjs` builds its input from the holds' manifest, self-test 6/6). Exit codes: 0 PASS, 1 FAIL, 2 INSUFFICIENT, 3 VOID.
  - No-worse, over all valid runs: total V skips ≤ total C skips, and V repeats = 0 in every run.
  - Fix claim, 30ms stratum only: needs ≥ 2 valid C and ≥ 2 valid V runs. It passes when every V run has 0 skips and C
    has > 0. Fewer runs, or C at 0, is INSUFFICIENT.
  - VOID when there is no valid C or no valid V run.
  - A repeat is also what a no-op `setAttribute` gives: the DOM spec queues a mutation record even for an unchanged
    value. So a V repeat is read as "one write per second broken or a no-op write", and fails either way. In all
    Chrome runs here repeats were 0 in every arm.
- **Predictions.**

  | id | prediction | p |
  |---|---|---|
  | P1 | V: 0 skips and 0 repeats in every valid run, any stratum | 0.95 |
  | P2 | 30ms: every C run ≥ 2 skips (drift ~20 ms/s, so ~2.4 s per 120 s) | 0.8 |
  | P2b | 30ms: every C run ≥ 1 skip | 0.95 |
  | P3 | 8ms / fair: every C run 0-1 skips | 0.9 |
  | P4 | V gap p50 in [985, 1015] ms, and C gap p50 ≥ 1015 ms in the 30ms stratum | 0.85 |

  If all runs read 8ms or fair, P-130 is a no-worse check only. The heat-skip claim then rests on the Chrome shim
  counts and the WebKit source.
- **Claim status.**
  - WebKit aligns timers at nesting level ≥ 5 to 30 ms under thermal mitigation, and re-arms a repeating timer from
    its actual fire: CONFIRMED (F-266: WebKit main bdc535f8fe, `DOMTimer.cpp` l.436-448 `alignedFireTime`, `Timer.cpp`
    l.502-520, `ThreadTimers.cpp`).
  - A 30 ms grid on this phone under Xcode-induced Serious: UNRESOLVED (F-255). The interval's 1020 ms on the phone
    was OBSERVED only at real Serious (P-074). The grid read in every run is the decisive local check.
- **Runner kit** (`phone/`, everything pinned in `phone/PINS`):
  - `serve.sh`: snap (C from the v9-final overlay, V = C + the delta by `patch`), HASHES.txt, read-only copies;
    B/C/V servers on OS ports; `check` before every item. It refuses while a pin is OPEN, and `snap` refuses a delta other than the pinned DELTA.
  - `hold.sh`: TICKET=P-130 guard; logger, program, GESTURE_HASH and idle-sentinel pins; a start and an end gate
    (`thermal-gate.mjs --expect serious --accept-induced --max-c 44`); the idle sentinel after the start gate; per item open → gesture `--inject` logger →
    park; the I-098 Mac sleep check; VOID exits 3/4/5. One manifest line per run.
  - Length: about 150 s per item. A gesture run needs GESTURE_BUDGET_S = max(150 s, 3x the estimate) = 397 s left in
    its chrome-measure hold (idle-p130 estimate 132 s; I-112), so a part takes at most 2 items: the second starts with
    ~470 s of a declared 700 s left (WDA check, gate and the ~15 s idle sentinel come first). 5 parts, each in its own Mac-quiet no-timing hold (declared 700 s, ~360-400 s
    used), in one `--block P-130 --max-seconds 3600` phone hold: H1 wC wV (warm-ups only), H2 gC1 gV1, H3 gV2 gC2,
    H4 gC3 gV3, H5 gV4 gC4. Each part runs `iphone.mjs wda check` before its start gate. Over the block that is
    C V V C C V V C. A VOID part is re-run whole, once, at the end.
  - Sentinel: **the lead's ruling on N5 (signed 2026-10-05): this idle sentinel replaces the protocol v2 S-run control
    sentinel.** The block has no scroll, so an S-run control would add a run per part and test scroll frame rate,
    which is not the question. Instead `phone/idle-raf.mjs` runs right after each part's start gate: it opens page C at
    the top, settles 3 s, counts rAF callbacks for 5 s in the page and reads the result back once (one poll after
    9 s; nothing faster than ~1 Hz, protocol §5.5). Below 58 fps, or a page not visible, voids the part (`HOLD <H> VOID
    idle sentinel …`, exit 5). The measured fps goes into the part's end line (`idleRafFps`), `p130-block.mjs`
    copies it to each run, and the reader shows it per run (and voids a run below 58 again). Its pure verdict has a
    self-test (8/8: 60 and 80 Hz pass, 58.0 passes, 57.9 fails, 10 % dropped frames fail, hidden fails, no frames is
    an error). Validity also rests on the induced-Serious gate at each part's start and end, and the per-run grid read.
- **Pins** (sha256/12, from the committed files):
  - logger 49d7a6c3da4c, program d7ee0153e439, idle sentinel 51f7a8e38150, reader f1229fd5a0c7, block builder
    357f369b2672 (all in `phone/PINS` or `results.json` → `scripts`);
  - hold.sh 5ccf5d050098 and serve.sh cc2203ef105e (`results.json` → `scripts`; build pins in `results.json` → `p130Pins`);
  - C JS 647c9ef2b1e2 / CSS e1359ab9994a (landed v9-final); V JS 6841352e0328 / CSS e1359ab9994a; delta
    `fixes/countdown-tick-v9/patch.diff` 5bcc05af690c, rebuilt on the landed v9-final (`fix.mjs apply countdown-tick-v9
    --on v9-best`, then `fix.mjs diff … --on v9-best`). Its 3 hunks are byte-identical to the earlier 8a4a6a16e217
    (built on step 4, de237379b556); only the base sha and the line offsets (−82) changed.

Chrome functional check of the logger under the shim (`tick-probe.mjs logger`, `out/countdown-tick/logger-*.json`,
`results.json` → `loggerCheck`):

| grid | arm | logger changes / skips (at) | gap p50 (ms) | grid read start / end (ms) | probe's own count |
|---|---|---|---|---|---|
| 30 | v9 | 118 / 2 (39.8 s, 90.8 s) | 1020 | 30.1 / 29.9 | 2 skips |
| 30 | v9tick | 121 / 0 | 991 | 29.9 / 30.1 | 0 |
| 0 | v9 | 120 / 0 | 1001 | 4.7 / 4.6 | 0 |
| 0 | v9tick | 121 / 0 | 1000 | 4.6 / 4.6 | 0 |

At Fair, Chrome's hop gap is its own 4 ms nesting clamp, which lands in the "fair" stratum. The chain's gap p50 at
30 ms is 991, not 1000: 1000 mod 30 = 10, so the grid lateness cycles through 0/10/20 ms and the gaps run 990, 990,
1020.

**Scenarios not run:**
- expiry (after 2026-11-02 05:00Z);
- a throttled background tab (over 1 s late fires; the chain then takes the clock's own second, by code reading);
- a clock set back while open;
- the real phone (P-130).

## Risks, conflicts, follow-ups

- **countdown-faces (de-countdown, parked):** the v9 delta edits only its timer lines. F-267 tells them; no action is
  needed from them.
- **cd-roll-ca / countdown-ca:** these read the same state `c`. The value they get is the aimed second, which they
  already treat as "now" (one write per second). Not touched.
- **int-v8 / the next best build:** `fixes/countdown-tick-v9/patch.diff` (base sha de237379b556…) applies with
  `node tools/fix.mjs apply countdown-tick-v9 --on v9-best` (also on v8-best). No request to int-v8 until v9-final
  lands (lead's order).
- **The grid phone-side:** F-255 — whether the phone runs the 30 ms grid at xcode-serious, or another one — is open.
  The fix is exact for any grid.
- A visible change: none. The fix moves when within the second the digits roll, by ≤ 30 ms, and only under heat.

## Files

- `patch.diff`: baseline patch. `fixes/countdown-tick-v9/patch.diff`: the same change on v9-best.
- `results.json`: every count, pixel pair, resume check and the model (built by `mkresults.mjs` from
  `out/countdown-tick/*.json`).
- `tick-probe.mjs` (Chrome probe and the grid shim), `model.mjs` (no-browser model), `phone-logger.mjs` (P-130 logger), `p130-read.mjs` (P-130 reader, `--selftest`), `p130-block.mjs` (its input from the manifest), `phone/` (P-130 runner kit: `PINS`, `serve.sh`, `hold.sh`, `idle-p130.json`),
  `mkresults.mjs`.
- No change to `tools/`. Measurement code untouched; the probe uses `tools/lib/cdp.mjs` and `tools/serve.mjs` as they
  are.
