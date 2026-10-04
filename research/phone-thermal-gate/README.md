# Phone heat-state gate (iphone-runner, 2026-10-03)

Why: user T-039 #19-#22 chose condition **B** as an experiment: phone blocks run at the device's *real* thermal
state Serious (not induced by Xcode). The fallback is A, starting at Fair. Battery temperature is only a loose stand-in
for that state, so every hold reads the state directly.

## The gate

`node research/phone-thermal-gate/thermal-gate.mjs --owner <you> --label <x> [--expect serious|fair] (--url http://lan:<port>/ | --no-timer) [--max-c 44]`

- Reads Xcode's "Thermal State" instrument (`xcrun xctrace record --instrument 'Thermal State' --all-processes
  --time-limit 10s`, then `xctrace export`). It installs nothing; the device id is never printed. It also reads the
  battery °C and, unless `--no-timer`, Safari's timer grid (a 5 s `setTimeout(0)` chain through the inspector).
- It prints one `GATE …` line and appends a record to `out/thermal-gate/gates.jsonl`. About 40 s with the timer
  part, 25 s without. The timer part navigates Safari, so it needs the `iphone` lease.
- Exit codes:

  | exit | meaning |
  |---|---|
  | 0 | PASS |
  | 2 | too cool for B |
  | 3 | ceiling: Critical, or ≥ `--max-c` |
  | 4 | induced by Xcode |
  | 5 | Serious during a `--expect fair` check |
  | 6 | the timer grid disagrees with the state |
  | 1 | no read |

- Per the lead and ops (P-079 ticket): read at the start and end of every hold; ceiling 44 °C or Critical; report
  every failure to the lead; two failing holds in a row stop the block and switch to A.

## Evidence

Status words as in CLAUDE.md "Platform claims".

1. **Mechanism, CONFIRMED in source.** In WebKit main 13a1f29, `Page::updateDOMTimerAlignmentInterval` gives a
   visible page `DOMTimer::defaultAlignmentIntervalInLowPowerOrThermallyMitigatedMode()` = 30 ms when
   `isLowPowerModeEnabled() || isThermalMitigationEnabled()`, and 0 otherwise.
   `Document::domTimerAlignmentInterval` applies it only to timers at nesting level ≥ 10, with a 4 ms floor
   (`minimumAlignmentForMaximallyNestedTimers`). Whether the shipping iOS 26 Safari matches main is UNRESOLVED;
   our data fits it.
2. **Timer grid by state, OBSERVED.** Plain baseline page, LPM off (rAF 17 ms):

   | when (Z) | xctrace state, induced | battery °C | setTimeout(0) gap median | share on 30 ms grid |
   |---|---|---|---|---|
   | 09:58 | (not read) | 39.3 | 30 ms | 0.85 |
   | 10:02 | Serious, No | 39.5 | 30 ms | 0.88 |
   | 10:12 | Nominal (map) | 36.8 | 8 ms | 0.005 |
   | 10:14 | Fair, No (gate self-test) | 36.9-37.1 | 8 ms | 0 |

   At Nominal/Fair the gaps are 7-9 ms rather than 4 ms: the page's own main-thread work delays each timer. There is
   no grid.
3. **Cooling map, OBSERVED, one run.** Safari parked, phone plugged in, no page load, no pre-warm. The start was at
   Serious after P-074 and the timer checks.

   | min | battery °C | state | induced |
   |---|---|---|---|
   | 0 | 39.0 | Serious | No |
   | 3 | 37.8 | Fair | No |
   | 6 | 36.9 | Nominal | No |

   Serious → Fair happened between 39.0 and 37.8 °C on the battery, and the phone left Serious within 3 min of
   parking. Two minutes later, after one page load, the state read Fair at 36.9-37.1 °C. The state follows sensors
   other than the battery, so battery °C cannot replace the gate.
4. **Earlier blocks.** P-074 (met 38.1-39.2 °C after pre-warm) ran at real Serious. Its Timelines show
   `setInterval(1000)` gaps of 1020 ms and one-shot timer lateness p90 of 22-26 ms. P-071 (06:21Z) shows 1005 ms and
   3.9 ms. To check an old Timeline the same way, use the one-off reader `out/iphone-runner/tl-timers.mjs` in the
   iphone-runner checkout (not committed).

## Profile xcode-serious (user T-162 #3, 2026-10-04 21:35Z; lead and mgmt-devices R9)

The default test profile from the v9 block on: Xcode's Device Conditions > Thermal State "Serious" (Is Induced = Yes), **no
heat pre-warm** (211 gate reads: 41 of 109 hold starts were not at real Serious; the 4 pre-warm episodes of 10-04 took
1.4, 6.6, 19.4 and 30.6 min). P-118 stays as signed (real heat, pre-warm). Condition B (real Serious) and A (Fair) stay
available; every ticket names its profile and blocks of different profiles never pool.

- `thermal-gate.mjs ... --accept-induced`: PASS = Serious with Is Induced = Yes, battery < max-c (44 C) and not Critical.
  Real Serious (induced No) exits 7, a Nominal or Fair read exits 2, Critical or the battery ceiling exits 3. The timer grid
  is recorded and not judged (whether an induced Serious also moves WebKit's timers is UNRESOLVED, see the decisive check
  below). Each record in `gates.jsonl` and the `GATE` line carry `profile`: `xcode-serious`, `real-serious` or `real-fair`.
- Verdict logic: `verdict.mjs`; self-test (no device): `node research/phone-thermal-gate/selftest.mjs` (16 cases).
- Hold shape under xcode-serious: no pre-warm; the gate once at the start and once at the end of the hold; the one uncounted
  load warm-up per arm port stays (A3/U5: first-load costs, not heat). The condition is on the Mac side (Xcode > Window >
  Devices and Simulators > the phone > Device Conditions > Thermal State > Serious > Start) and is torn down when the phone
  is disconnected from Xcode (WWDC19 s412), so the start-of-hold gate also detects a dropped condition (exit 2).
- Decisive check before the first block (research/thermal-condition-cli "Decisive local check"): a fixed CPU loop and a GPU
  animation on a cool phone, condition off and then on. If the induced Serious slows nothing, add one real-heat
  confirmation block for the final best build only (milestone 2b), not per fix.
- Measure: phone minutes spent on pre-warm per block, to go to 0.
