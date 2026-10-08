---
name: phone-checks-start-warm
description: "phone tests run at thermal Serious; since T-162 #3 (2026-10-04) Xcode-induced Serious is the default, no heat pre-warm; real heat once for the final build; 44 °C / Critical ceiling; LPM dropped"
type: project
audience: every agent
since: 2026-10-03
---

**Update 2026-10-04 21:35Z (user T-162 #3: "Why we don't test on Serious profile by default ? no need to warm up").**
The default profile is now Xcode's Device Conditions > Thermal State "Serious" (set once by the user; the gate accepts
Is Induced = Yes with `--accept-induced`, profile `xcode-serious`). No heat pre-warm; the one uncounted load warm-up per
arm port (A3/U5) stays. Why: on 10-04, 41 of 109 hold starts were not at real Serious and 4 pre-warms took 1.4-31 min.
Whether induced Serious also slows CPU/GPU is UNRESOLVED (one decisive check, owner mgmt-devices). Real heat runs only
once, for the final best build. xcode-serious and real-heat blocks never pool. Blocks already signed for real heat (P-118)
keep it. Real-heat blocks name `--profile real-serious` in iphone.mjs (I-246, 2026-10-08, 8f2d9e8c; an induced
condition is refused there, and `--warmup` runs warm the phone by use). The text below is the earlier rule.

**Rule (user decision, T-039 #19-#21, 2026-10-03 10:06-10:08Z: option B, as an experiment; replaces the 38-40 °C band of
T-029 #30).** If B hits a blocker (e.g. the state won't hold at Serious, or holds keep failing the gate), the lead reports it
in T-039 and rolls back to option A: each block starts only at Fair/Nominal (same xctrace gate), battery °C recorded.
- Phone tests run at the phone's **real thermal Serious state** (warmed by the page / pre-warm, not by Xcode).
  Every hold reads the state with Xcode's command-line recorder (`xctrace`, Thermal State instrument, ~40 s,
  nothing installed) at its start and end; a hold counts only when both say Serious with Is Induced = No, else it
  is re-run. Each hold also logs battery °C and the timer-grid median (setTimeout chain: 30 ms at Serious, ~4 ms normal).
- Ceiling: stop at 44 °C battery or at Critical; cool before the next hold.
- A block keeps one start method for every run (P-073 lesson: method confounded with arm); pre-warm on the plain
  baseline page the same way for every arm.
- Before the goal is called done, each top-3 fix gets one short no-worse check at Fair (cooler phone).
- Blocks from before 2026-10-03 10:06Z at the ~4 ms timer grid (P-071 and earlier) never pool with Serious blocks.
- Low Power Mode (30 Hz) is left out: record it, drop and re-run any LPM run; not tested unless the user asks.
- No countdown-only test page: isolation uses the real page with the rest frozen (FRZ, P-075/P-076).

**Why.** 2026-10-03: the 38-40 °C warm start already put this phone in real Serious (xctrace 10:02Z, not induced;
timers on WebKit's 30 ms thermal-mitigation grid, Page::updateDOMTimerAlignmentInterval, CONFIRMED in source; rAF
stayed ~60 Hz, OBSERVED). Battery °C is only a loose stand-in for the state. The user chose to optimise for the hot
phone ("smooth on Serious means smooth on Fair", T-039 #7) and accepted the trade-offs the lead listed in #20 (timer
rhythm differs when cool, state flips, heat ceiling, old blocks don't compare).

**How to apply.** Gate by state, not by temperature; `wait.mjs phone-temp --below <X>` only to get under the ceiling.
The heat-state map from Serious to Fair (iphone-runner, 2026-10-03) tells where the Fair checks start.
Related: [[milestone-2-heat-profiles]].
