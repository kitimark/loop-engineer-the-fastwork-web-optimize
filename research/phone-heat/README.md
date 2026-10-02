# Phone heat: Fastwork vs apple.com (T-029, prediction P-068)

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork or Apple).
> apple.com is loaded live by the phone as an outside reference page; nothing of it is mirrored or committed.

Owner: de-heat. Runner: iphone-runner (after F3). **Stage: pre-data ticket.** No phone data exists for this ticket yet.
The second read is by mgmt-ops-7 before anything is queued. Any change after the first counted sample is a new ticket.

## The question

The phone gets warm during our test blocks. Is that the Fastwork page's own work, or just "a phone scrolling a
web page for an hour on a USB cable"? We find out by running one identical routine on four pages and comparing how
fast each one heats the phone:

- a near-empty page (the floor);
- a heavy apple.com product page;
- the original Fastwork page;
- the Fastwork page with the landed fixes, **without the countdown fix** (see X below).

B vs A vs F answers the user's question. A second question comes for free: do the landed fixes run the phone cooler
than the original? This test cannot answer it for the countdown fix, which is the largest cut to work at rest.

What we know before data, from the code and from earlier phone runs (all OBSERVED in our setup):
- The original page keeps working at rest. The countdown renders every frame, and the hero carousel swaps images every
  second (`fixes/countdown-faces/README.md`, `fixes/rotator-st6`).
- **Pilot, n=1** (iphone-runner, P-065 Block 1, 10-02 22:07-22:18Z): Safari sat untouched for 11.4 min on a Fastwork
  build (FP = user-bplus, not the baseline). It was left at the page bottom with no driver. The battery went 37.59 to
  41.50 °C, about 0.34 °C/min. No control was run, and there are no reads in between.
- Under back-to-back scripted runs on Fastwork builds, the phone warmed 0.30-0.51 °C/min ("Noise" below). Parked on
  about:blank on the cable, it cooled 0.05-0.24 °C/min (F-131).

## Arms

Every arm gets its own server and port. The ports are fixed for both sessions and must be new: never used by another
build. iOS Safari keeps immutable CSS per origin, and an old build's file can come back (F-115). The local arms use
production cache headers (no `--no-cache`), as the live site does. They are plain http, which the phone opens directly.
The phone URLs use the `lan` placeholder (I-073; `node tools/lan.mjs` prints the address; never commit it).

| arm | page | served from | identity (sha256/12 of what is served) |
|---|---|---|---|
| **F** floor | `http://lan:<pF>/heat-floor.html` | `node tools/serve.mjs --root site-pretty --overlay research/phone-heat/floor --port <pF> --vendors=local --latency 150` | `heat-floor.html` `30098372d8c1` |
| **A** apple.com | `https://www.apple.com/macbook-pro/` (live) | Apple; Safari's own cache | the run's `meta.served` per cycle (same-origin JS/CSS hashes); `docH` from `pre` |
| **B** Fastwork baseline | `http://lan:<pB>/` | `node tools/serve.mjs --root site-pretty --port <pB> --vendors=local --latency 150` | snapshot `b1789284481295-4ad4a84a`: JS `4606120cf392`, CSS `27776f3d4138` |
| **X** Fastwork, landed fixes without the countdown fix | `http://lan:<pX>/` | `node tools/serve.mjs --root site-pretty --overlay <st6-rb2 snapshot copy> --port <pX> --vendors=local --latency 150` | **st6-rb2**: JS `7bf7c4657d21`, CSS `f523598b2a24` |

- **Why the MacBook Pro page is "expensive".** The HTML was fetched from the Mac on 2026-10-03 with an iPhone user agent
  (sha256/12 `979e4fc32dbb`; it is live and changes). It has:
  - 21 `data-anim-scroll-group` and 8 `data-anim-keyframe` blocks: Apple's scroll-driven animation system, which runs
    JavaScript on scroll;
  - 13 inline `<video playsinline>` elements, which start at scroll keyframes (`data-inline-media-play-keyframe`);
  - 22 sticky-container markers, 9 lazy images, 15 scripts and 7 stylesheets.

  It had the most animation markers of the three product pages checked (AirPods Pro: 15 videos, 21 `anim-`; iPhone Air:
  15 videos, 25 `anim-`). Static HTML counts are OBSERVED; what the phone actually does is recorded per run.
  **Fallback**, fixed now: if the warm-up run on A reports `docH` < 5800 px (the driver needs y 5000), or the URL
  redirects off the MacBook Pro page, use `https://www.apple.com/iphone-air/` for both sessions.
- **X is "the landed fixes without the countdown fix".** It is st6-rb2, the best build on `main` (PROGRESS `best`:
  seven fixes, `fixes/st6-rb2/README.md`). It is the same build as S7's V arm, and S7's snapshot copy (`out/st6t/snap/V`
  in fix-scroll-engine's worktree, `fixes/st6-rb2/README.md` S7) can be reused after a hash check.
  - **The countdown fix is not in this test.** It is the largest cut to work at rest, but it does not stack yet.
    PR-007 (countdown-faces, accepted 22:08Z) is built on the baseline and replaces `countdown-idle-raf`. A `patch -F3`
    dry run of its patch over st6-rb2 fails 5 of 12 hunks. Rebasing it is de-countdown's job. So X vs B measures the
    other landed fixes only; "no detectable change" there says nothing about the countdown fix.
  - **X2, later:** once an integrated build with the countdown fix exists, a follow-up ticket adds an X2 arm (B, F and
    X2, same routine and scorer) so the countdown fix gets its own heat number.
  - **Amendment rule (pre-data):** if a stacked "st6-rb2 + countdown-faces" build exists with checked hashes, it may
    replace X only if that is decided, and its hashes logged in this ticket, **before H1's first segment**. Then the
    ticket is re-read and P-068's X lines move to the new build. Once H1 has started on st6-rb2, H2 keeps st6-rb2,
    whatever exists by then (the two sessions must measure the same X), and the stacked build waits for X2.
- **F, the floor**, is a static page as tall as Fastwork on the phone (docH 6035 px in every recent Fastwork run;
  `min-height: 7000px`). It has no images, fonts, scripts, animations or sticky parts. What is left is Safari, the
  display, the reloads, scrolling, and the probe that `iphone.mjs run` injects, the same on every arm.

## Routine (identical per arm): one segment = 6 min

A segment starts with `iphone.mjs open <url>` at t = 0. Then:

1. **Idle on the page, 0-180 s.** The page sits at the top as it loaded: untouched, no probe, no reload. This is
   where always-on work (countdown, carousel) shows; the pilot suggests it heats as much as scrolling.
2. **Scroll cycles, 180-360 s.** Back-to-back `iphone.mjs run --driver window --probe std --from 0 --to 5000 --idle 20
   --hold 3 --sentinel 0 --settle 8 --no-park --low-power off` cycles. Each cycle is about 50 s: reload, 8 s settle,
   20 s idle at the top, smooth 250 px steps every 300 ms to y 5000, then a 3 s hold.
   - The **W driver with a fixed `--to`** gives every page the same scroll distance and time. With the S driver, a
     long page like apple.com would scroll several times longer than Fastwork's 5260 px.
   - The cycle in flight at 360 s is allowed to finish, then Safari is parked.
3. **Battery** every 30 s from t = 0 to t = 360 (13 reads). The research tool `heat.mjs` (below) does this, in its own
   process next to the runs.

`node research/phone-heat/heat.mjs segment --session H1 --seg <n> --arm <F|A|B|X> --url <u> --owner iphone-runner`
does all of the above. It appends samples and a segment line to `out/phone-heat/samples.jsonl`. It runs inside the
runner's own hold, so no other Mac job can make a cycle WAIT mid-segment (I-056):
`node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "phone heat <id>" -- node research/phone-heat/heat.mjs segment …`.
The segment keeps the Mac awake itself (I-070 `keepAwakeFor`): during the idle phase no `iphone.mjs` process runs,
and the hold's command line does not name one.

### Sessions and order (ABCD DCBA)

| session | segment order | start window, every segment |
|---|---|---|
| H1 | F, A, B, X | battery 36.0-37.0 °C |
| H2 | X, B, A, F | battery 36.0-37.0 °C |

**Why two sessions and 6-min segments, not 10-min arms in one hour.** The lead's outline (~10 min per arm, ABCD DCBA,
same start temperature, ~1 h) does not fit together:
- 8 arms × 10 min is already 80 min.
- Cooling back to a common start after each 10-min arm takes 15-20 min (k ≈ 0.05 /min parked, F-131 fit below), which
  makes ~3 h.
- 10-min arms also run into the plateau. Under load the phone levels off near 39.5-42 °C (P058-A/B blocks, p039),
  where the slope says more about the start temperature than about the page.

Six minutes is enough. The slope's standard error from the sensor's ~0.1 °C read noise is about 0.02 °C/min over the
5-min window. Each session holds one segment per arm, so a session-level offset (room, battery state) cancels inside
every within-session comparison.

**Between segments:** Safari is parked (the segment does it). Then:
- **Above 37.0 °C:** cool with `node tools/wait.mjs phone-temp --below 37.0 --every 30 --timeout 900 --reason "phone
  heat: cooling to the segment start window"`. If it TIMEOUTs, start anyway and record it; the correction handles a
  modest miss.
- **Below 36.0 °C** (a cold start): pre-warm with uncounted W cycles on **B's** page until 36.0, the same for every
  arm that needs it. Then open the arm and start. Record `start: cooled | prewarmed | direct` per segment.

## Signal

- **Battery temperature**, `Temperature` of AppleSmartBattery in 1/100 °C (as `tools/lib/iphone-run.mjs` batteryInfo
  and `wait.mjs phone-temp` read it), plus `VirtualTemperature`, `IsCharging`, `ExternalConnected`, `CurrentCapacity`.
  - Resolution: the 317 reads in iphone-runner's battery log take only 10 distinct hundredths (x.00, x.09, x.19, …,
    x.89), so the reading moves in ~0.1 °C steps. The read-to-read RMS around a smooth cooling fit is 0.09-0.12 °C.
    OBSERVED.
  - The battery sensor lags the chip: temperatures kept rising for 1-2 min after load ended (18:44-18:46Z, 20:19-20:22Z
    on 10-01), hence the 60 s skipped at each segment start. OBSERVED.
- **Power draw (secondary, descriptive only).** `heat.mjs` also keeps `Voltage`, `Amperage`, `InstantAmperage` and
  `AdapterDetails.Watts` when the entry has them.
  - **Key names:** `Amperage` and `Voltage` are IOPMPowerSource keys in Apple's xnu `iokit/IOKit/pwr_mgt/IOPM.h`
    (`kIOPMPSAmperageKey`, `kIOPMPSVoltageKey`, ~l. 661-663, with `kIOPMPSBatteryTemperatureKey "Temperature"`,
    `kIOPMPSIsChargingKey`, `kIOPMPSAdapterDetailsWattsKey "Watts"`): **CONFIRMED** as names.
    https://github.com/apple-oss-distributions/xnu/blob/main/iokit/IOKit/pwr_mgt/IOPM.h
  - `InstantAmperage` is not in IOPM.h. pymobiledevice3's `diagnostics battery monitor` reads `InstantAmperage`,
    `Temperature`, `Voltage`, `IsCharging` and `CurrentCapacity` from an iOS device's IOPMPowerSource entry
    (`pymobiledevice3/cli/diagnostics/battery.py`, l. ~30-36). That source is **third-party**: it is evidence the key exists on iOS, not
    Apple documentation. https://github.com/doronz88/pymobiledevice3/blob/master/pymobiledevice3/cli/diagnostics/battery.py
  - **Units: UNRESOLVED.** Apple's `IOPSKeys.h` gives mV for `Voltage` and mA for `Current` in the IOPowerSources
    dictionary (l. 554-572,
    https://github.com/apple-oss-distributions/IOKitUser/blob/main/ps.subproj/IOPSKeys.h). The raw ioreg entry is a
    different layer: its `Temperature` is 1/100 °C where IOPS says °C, so the ioreg units need not match.
  - **The decisive local check** is pre-flight step 1: `heat.mjs keys` prints the entry's key names (names only, never
    values, depth ≤ 2), and one `heat.mjs once` gives a plausibility check (a Li-ion cell reads ~3700-4400 if mV).
  - `libimobiledevice`'s `idevicediagnostics ioregentry <KEY>` returns one IORegistry entry
    (`diagnostics_relay_query_ioregistry_entry`, `tools/idevicediagnostics.c`): CONFIRMED.
  - **What battery current can and cannot say.** On the cable, the battery's current is only the battery's share: if
    the cable covers the phone's load and the battery is held (not charging), the current is ~0 whatever the page does.
    It becomes a power signal only when the battery discharges or charges. The log shows the phone at 80 % and not
    charging in 250 of 317 reads, but also drifting to 77-78 % on the cable, then charging (OBSERVED; whether this is
    the 80 % limit or the load is UNRESOLVED). So battery watts are reported per segment, never decided on.
  - If `keys` shows a system-power key (a name with "SystemPower", "SystemLoad" or "PowerTelemetry"), report it to
    de-heat. Using it as a metric is a pre-data amendment, not a change made after data.
- **Charging confounder.** `IsCharging` is logged every 30 s. The phone stays on the USB cable the whole time: the
  Web Inspector link needs it. iOS decides when to charge (80 % limit / Optimized Charging; arch-unknowns U4), so
  charging cannot be switched from the Mac.
- **State read before the ticket** (10-02 22:42-22:45Z, the read-only `batteryInfo` call that `wait.mjs phone-temp`
  uses; no lease, no page): on the cable, `IsCharging` false, `FullyCharged` false, `CurrentCapacity` 80 of 100,
  37.8 °C, `Amperage` 0, `InstantAmperage` 2. So the battery is **held** at 80 %: the cable carries the load and the
  battery neither charges nor discharges. The earlier log matches this: held in 250 of 317 reads, with short charging
  stretches after drifts to 77-78 %.
- **Confirmed by the user** (T-029 #8, via the lead, 10-02 ~22:5xZ): the phone's 80 % charging limit is on, and it
  stays on, with the phone on the cable, for the whole test. So "held at 80 %" is the setting, not a guess; the
  console question about the charging setting is answered and not asked again.

### Charging rule (pre-registered)

**Rule: every arm runs "held"** (on the cable, `IsCharging` false). This is the state the phone was in at the read
above, so it is the expected one, and B, A, X and F are compared only in that state.
1. **Gate before every segment:** `heat.mjs charge-wait --want held` runs first, then the temperature gate. It exits
   0 at the first held read. If the phone is charging, it waits (a top-up from 77-78 % back to the limit takes a few
   minutes) up to 20 min (`PRE.chargeGateS`), reading every 30 s.
2. **During a segment:** a single read that is not held (charging, or off the cable) excludes that segment
   (`chargeExcluded`). This counts **every read of the segment, 0-360 s** (13 reads), not only the 60-360 s fit
   window. The arm is re-run once at the end of the session, after the gate. The arm order is kept: the re-run goes
   last, and the score takes the arm's last valid segment in the session.
3. Every segment line records its `chargeMode` and its session `attempt`, so the score can check the rule.

**Fallback: the session runs "charging", and is compared as such.** It applies if the gate times out at 20 min (the
phone keeps charging), or if a second segment in the same session is excluded for charging:
- The session stops. Its segments so far stay in `samples.jsonl` but are not used: they belong to attempt 1.
- It restarts from its first arm as **attempt 2**: `--attempt 2 --charge-mode charging`, with the gate
  `charge-wait --want charging`. Every arm then runs while charging, and a segment with a held read is excluded
  instead. Segment ids carry the attempt (`H1a2-1F`), so the two attempts never mix.
- **The score uses only each session's last attempt** (`verdicts()`: `attempt`, `live`): the charge mode, the arms
  and the excluded segments all come from that attempt, never from the aborted one.
- **If the fallback gate times out** (`charge-wait --want charging` exits 3 after 20 min: likely with the 80 % limit,
  which may not start charging at all), the session ends there as **incomplete**. Its verdicts are "incomplete". A
  new session needs the lead; it is never improvised on the spot.
- **A cross-session verdict needs both sessions in the same state.** `heat.mjs score` checks this. If one session
  ran held and the other charging, both verdicts are "incomplete (the sessions differ in charge state)", and each
  session's deltas are reported separately. A third session in the matching state needs the lead.
- **Caveat for a charging session:** charging adds its own heat, and that heat falls as the battery fills. Both arms
  of a pair share it, and the reversed order in H2 cancels a steady trend. Its deltas are still read as "under
  charging" and are never pooled with held ones.

**Not chosen:** waiting for `FullyCharged` true. With an 80 % limit the phone may never report full while held, so
the block could wait forever. "Held" is the steady state that the limit gives.

## Controls

- **Same start temperature:** the 36.0-37.0 °C window above, plus a correction for what is left. Corrected slope =
  slope + k × (mean T in the window − 37.0) with **k = 0.045 /min**, fixed now from two independent fits ("Noise").
  The raw slope is the check: a verdict whose raw deltas disagree in sign is labelled start-sensitive.
- **Phone settings for the whole study (H1 and H2).** These are user steps, posted by the lead to the console before H1,
  and the answers are recorded:
  - Auto-Lock Never (the idle phase must not lock the screen);
  - Auto-Brightness off and a fixed brightness;
  - Low Power Mode off (also `--low-power off`);
  - True Tone and Night Shift unchanged;
  - the same Wi-Fi, Bluetooth unchanged, no other apps in the foreground;
  - the phone flat in the same spot, same surface, same case, not touched.
- **Order:** F A B X in H1, X B A F in H2. A linear drift inside a session pushes B − A one way in H1 and the other way
  in H2. Because the decision needs both sessions to agree, drift turns into "inconclusive", not a false "more".
- **Room:** neither the room temperature nor the Mac's heat near the phone is controlled. The user is asked to keep the
  AC or fan unchanged during a session and to note it. The parked floor (~32-33 °C on the cable, F-131) depends on the
  room, so H1 and H2 should run on the same day, ideally back to back.
- **Countdown expiry:** both sessions must run before 2026-11-02 05:00Z. After that, the frozen page stops counting
  down and gets cheaper (CLAUDE.md "Baseline snapshot").
- **Validity:**
  - A segment is VOID if two cycles in a row fail, if fewer than 9 of its 11 window reads exist, or if a served hash is
    wrong (B, X).
  - Also VOID if the phone was touched, an inspector was attached, or Low Power Mode was on.
  - A cycle whose run reports `lowPowerSuspect` (rAF ~30 Hz: thermal mitigation or Low Power Mode, arch-unknowns U4)
    is reported with its segment, not voided: throttling is part of heat.

## Noise and effect size, from records we already have (pre-data)

Sources:
- iphone-runner's battery log: `batt.jsonl`, 317 reads, 10-01 11:22Z to 10-02 11:55Z. It is local only, in iphone-runner's
  worktree `out/`.
- The battery start/end reads of 107 `iphone.mjs run` records under `.claude/worktrees/*/out/`.

None of this is committed (raw phone records with page data stay local). The derived numbers are below.

**Slope of back-to-back blocks on Fastwork builds** (OLS of the per-run start temperature; S/W/G drivers, ~35-60 s
runs; all not charging):

| block | start °C | min | slope °C/min |
|---|---|---|---|
| S1 (10-02 08:00Z) | 34.3 | 6.9 | 0.49 |
| S1b2 before charging (08:19Z) | 35.4 | 4.8 | 0.51 |
| G2 (21:50Z) | 35.6 | 7.0 | 0.36 |
| C1 (11:05Z) | 37.1 | 6.4 | 0.30 |
| A1 (09:54Z) | 37.3 | 6.3 | 0.31 |
| T011 (10:45Z) | 37.4 | 6.7 | 0.37 |
| G1b rest / no-pause (10:10Z, 10:26Z) | 37.9 | 6.1 / 6.0 | 0.39 / 0.37 |

- **Fit:** slope = 1.84 − 0.040 × start (°C/min). The residual SD of 0.061 °C/min is the noise for one segment. This is
  an upper bound, since it also holds build and driver differences.
- **Replicate pair** (same builds, same driver): S1 vs S1b2 differ by 0.02-0.04 °C/min.
- **Cooling, parked on the cable** (T-009 curve, 40 reads over 42 min): T = 32.1 + (T0 − 32.1)·e^(−0.052 t), RMS 0.09 °C.
- The two estimates of the Newton term, 0.040 (load) and 0.052 (cooling), give **k = 0.045**.
- **Noise for one session's B − A:** about √2 × 0.061 ≈ 0.085 °C/min at worst, and ~0.03 from the replicate pair.
- **Plateaus:** p039 fell 41.9 to 40.1 °C under runs; sr2 sat flat at ~42 °C; P058-A/B levelled near 39.3-39.5 °C. Ten-minute arms
  would end on these plateaus, where the start temperature sets the slope.

**Error rates of the rule below, at the noise above** (Gaussian, σ(Δ) per session 0.085, both sessions must agree):
- false "Fastwork heats more" when the true Δ = 0: about 0.12² ≈ 1.4 %;
- power at a true Δ = 0.20 °C/min: 0.88² ≈ 77 %;
- at σ(Δ) = 0.04, the power is about 99 %.

## Decision rules (pre-registered; `heat.mjs score`, sha256/12 in "Files")

Per segment: the OLS slope of battery temperature against time over 60-360 s (11 reads), corrected to 37.0 °C (k =
0.045). Per session h, Δ_h = corrected(B) − corrected(A); the same for B − X. Excluded: VOID segments, and segments
with any read outside the session's charge state ("Charging rule"). Both sessions must share one charge state;
otherwise every verdict is "incomplete (the sessions differ in charge state)".

| comparison | verdict | condition, BOTH sessions |
|---|---|---|
| Fastwork vs apple.com | **Fastwork heats more** | Δ_h ≥ +0.10 °C/min (≈ 1 °C more per 10 min, 10 sensor steps) |
| | **apple.com heats more** | Δ_h ≤ −0.10 |
| | **about the same** | \|Δ_h\| < 0.05 |
| | inconclusive | anything else (incl. the sessions disagreeing) |
| fixes (X) vs baseline (B) | **the fixes cool the phone** | B − X ≥ +0.05 (lower confidence: per-session noise can reach 0.085) |
| | **the fixes heat the phone** | B − X ≤ −0.05 |
| | **no detectable change** | \|B − X\| < 0.05 |
| | inconclusive | anything else |

- **Start-sensitive:** a "more" verdict whose raw (uncorrected) deltas do not share its sign gets this label.
- **Floor check:** in each session, F must be the lowest arm. If it is not, that session cannot see a page's cost,
  which is reported as is.
- **Excess over the floor:** E_arm = corrected(arm) − corrected(F) per session; E_B / E_A is reported as "how much
  more the Fastwork page heats than apple.com, beyond the browser itself".
- **Descriptive only:** the per-phase slopes (idle 60-180 s and cycles 210-360 s, 5 reads each, SE ≈ 0.06 °C/min:
  too noisy to decide on), battery watts, and rAF rate per cycle.

**What each outcome means** (fixed now, one line to the user each):
- **Fastwork heats more:** the page's own computation heats the phone, not the phone or the cable. Work at rest
  becomes a ranked goal: countdown-faces, then the carousel.
- **About the same:** the heat in our blocks is mostly the phone doing scripted runs on a cable. The user is told the
  page is not unusually hot, and fixes are ranked on smoothness first.
- **apple.com heats more:** same as "about the same" for Fastwork's ranking, plus the note that apple.com's video and
  scroll animations cost more.
- **Inconclusive:** report the numbers. No third session without the lead.
- For X vs B: **the fixes cool the phone** goes into PROGRESS as a heat gain. **No detectable change** means "the
  fixes on main do not touch the always-on work yet", which is expected without the countdown fix.

## Prediction P-068 (pre-data; row in `fixes/PREDICTIONS.md`)

Corrected slopes at 37.0 °C, per segment, °C/min:

| arm | predicted [interval] | basis |
|---|---|---|
| F | −0.10 [−0.25, +0.10] | parked at 37 °C cools −0.25 °C/min; display, Safari, the reloads and the rAF probe add some back |
| A | 0.30 [0.10, 0.50] | heavy per cycle (reloads, image and video decode, scroll-driven JS), light at rest once the hero video settles |
| B | 0.45 [0.30, 0.60] | Fastwork builds 0.34-0.45 corrected under runs; the pilot idle on FP is ~0.45 corrected; the baseline does more at rest than those builds |
| X | 0.40 [0.25, 0.55] | st6-rb2 cuts carousel and off-screen scene work, but the countdown still renders every frame |

- **Fastwork vs apple.com:** Δ(B − A) = +0.15 [−0.10, +0.35]. The verdict is "Fastwork heats more" at ~50 %, "about
  the same" ~20 %, inconclusive ~20 %, "apple.com heats more" ~10 %.
- **Idle phase (descriptive):** B's idle slope is above A's in both sessions (~75 %).
- **Fixes vs baseline:** "no detectable change" or inconclusive, ~65 %; "the fixes cool the phone", ~30 %.
- **Excess ratio:** E_B / E_A = 1.5 [0.8, 2.5].
- **Falsifiers of the premise "Fastwork's always-on work heats the phone":** F not below B in a session, or B's idle
  slope ≤ F's idle slope in both sessions.

## Tooling plan

**What works today** (read from the code, not run on the phone; pre-flight step 2 is the check):
- **`iphone.mjs open https://www.apple.com/macbook-pro/` accepts a non-LAN URL.**
  - `mirrorInfo` asks `/__mirror/info` from the Mac. apple.com answers 404, so info is null.
  - `iphoneTarget` then keeps the URL unchanged, and `landedProblem` with null info only rejects a certificate-warning
    title (`tools/lib/iphone-url.mjs`).
  - Side effect: the Mac sends one GET for `https://www.apple.com/__mirror/info`. It carries no personal data.
- **`iphone.mjs run` reloads whatever page Safari shows** (`tools/lib/iphone-run.mjs` runCmd). A lease URL that
  differs only prints a warning. `meta.href` passes `lanSafeUrl`, which leaves public hosts as they are.
- **The Mac-side GETs to apple.com.** After every run, `tools/lib/iphone-run.mjs` runCmd calls
  `servedHashes(await c.evaluate(RESOURCES_JS))`. That function `fetch`es each same-origin script and stylesheet the
  page loaded, from the Mac, and hashes it into `meta.served`. For apple.com that is up to ~22 GETs per cycle (15
  scripts and 7 stylesheets in the HTML), sent while the phone holds at y≈5000. The cycle's wall time is recorded, so
  this is visible. They carry no personal data: plain GETs for public files, with Node's default headers.
  - **No skip exists today.** The call is unconditional: there is no flag, and no check whether the page is our
    mirror. A read-only use of `iphone.mjs run` without the fetch does not exist either. `iphone.mjs scroll` (driver
    S) is not the W routine, so switching would break "identical per arm".
  - **Pre-registered handling:** the GETs are **accepted for now** on arm A, and logged as a known deviation. They
    are tracked in incident I-075 (a skip for non-mirror pages, or a `--no-served` flag). If that lands on `main`
    before H1's first segment, A runs with the skip (only Mac-side traffic and `meta.served` change; the phone does
    the same work), and the run sheet names the flag. If it lands between H1 and H2, H2 keeps the H1 tooling so both
    sessions match.
- **No tool logs the battery on a schedule, and `BATTERY_KEYS` drops the power keys.** The research tool
  `research/phone-heat/heat.mjs` covers both without touching `tools/`:
  - it calls `idevicediagnostics ioregentry AppleSmartBattery` itself and parses the plist properly (depth-aware: a
    nested `AdapterDetails.Voltage` is not taken for the battery's);
  - it keeps only the whitelisted numeric keys;
  - it runs the segment through `tools/iphone.mjs`.

  It was checked with a fake `idevicediagnostics` (`FW_IDEVICEDIAGNOSTICS`, a serial in the fixture never reaches the
  output), a `--dry-run` segment, and synthetic Newton-model samples through `score`, in three scenarios (Fastwork
  more, the same, apple.com more). All gave the expected verdicts.

**Minimal toolsmith changes:** none is needed for this ticket. All three below are tracked as **incident I-075**
(`--class tool`, non-blocking), since work at rest is now a goal and every fix reports it:
1. `iphone.mjs battery [--every 30] [--seconds N] [--out f.jsonl]`, a scheduled logger. This moves `heat.mjs`'s reader
   (and its `charge-wait` gate) into `tools/`, with tests.
2. `BATTERY_KEYS` extended with the power keys the pre-flight confirms (`Voltage`, `Amperage`, `InstantAmperage`,
   `VirtualTemperature`, `AdapterDetails.Watts`).
3. `servedHashes` skips pages that are not our mirror (`mirrorInfo` null), or a `--no-served` flag on `iphone.mjs
   run`. This removes the apple.com re-fetches (see above).

## Run sheet (iphone-runner)

Pre-flight, once, before H1 (inside the `iphone` lease):
1. `node research/phone-heat/heat.mjs keys` (names only), then `node research/phone-heat/heat.mjs once --label preflight`.
   Send the key list to de-heat. If it holds a system-power key, that is an amendment before data.
2. Start the three servers (F, B, X; fresh fixed ports, plain http). Check the served hashes against the Arms table
   with `curl -s http://localhost:<port>/<path> | shasum -a 256`.
3. Run one uncounted warm-up per arm (A3), A included:
   `iphone.mjs open <url>` + one `iphone.mjs run --driver window … --warmup --label heat-warm-<arm>` (same flags as a
   cycle). From A's warm-up, check `docH` ≥ 5800 and the URL (else the fallback page).
4. User console steps: the phone settings above (the 80 % charging limit is already confirmed), and room/AC "unchanged" for the session.
5. Before H1 only: log which X is used (st6-rb2, or a stacked build per the amendment rule, with hashes) and whether
   I-075's skip is on `main`. Both stay fixed for H2.
6. Bring the phone into 36.0-37.0 °C (cool or pre-warm as above).

Per segment (H1: F A B X; H2: X B A F), the charging gate first, then the temperature gate, then the segment:
```sh
node research/phone-heat/heat.mjs charge-wait --want held          # exit 3 after 20 min = the fallback ("Charging rule")
node tools/wait.mjs phone-temp --below 37.0 --every 30 --timeout 900 --reason "phone heat: cooling to the segment start window"
node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "phone heat H1-1F" -- \
  node research/phone-heat/heat.mjs segment --session H1 --seg 1 --arm F --charge-mode held --url http://lan:<pF>/heat-floor.html --owner iphone-runner
```
In a fallback session, replace `held` with `charging` in both places and add `--attempt 2` to every `segment`. If the
`charging` gate exits 3, stop the session (incomplete) and tell the lead.
At the end: `node research/phone-heat/heat.mjs score --out out/phone-heat/score.json`. Send de-heat the score output,
`samples.jsonl` and the console answers. de-heat commits the derived numbers: samples without URLs beyond the
placeholder, and no apple.com run records.

**Cost:**
- H1 ≈ 65 min: pre-flight with warm-ups ~12, reaching the window ≤ 15, 4 segments × ~7.5, 3 cools × ~6-8.
- H2 ≈ 55 min.
- Best run back to back on the same day: ~2 h of phone time in two blocks of about an hour. H1 alone gives one
  session's deltas: a provisional reading only, no verdict.

## Files

- `heat.mjs`: battery reader, segment runner, pre-registered scorer. sha256/12 `1280a97d9f6d` at this commit (pre-data amendments, 10-02 22:4xZ: charge mode, `charge-wait` gate, charge-state exclusion, was `38f81442ccad` at 4bf2319, `341a774801ae` at 56636f8; 22:5xZ: session attempts, last-attempt scoring).
- `floor/heat-floor.html`: the floor page. sha256/12 `30098372d8c1`.
- `heat.check.mjs`: checks of the scorer on synthetic samples (held, exclusion over 0-360 s, end-of-session re-run, fallback restart with an aborted attempt, sessions in different charge states, fallback gate timeout): `node --test research/phone-heat/heat.check.mjs`, 7 pass. The two fallback checks fail on the 56636f8 scorer.
- Results (after data): `results.json` and `samples.jsonl` (derived, LAN-scrubbed), plus a result section here.
