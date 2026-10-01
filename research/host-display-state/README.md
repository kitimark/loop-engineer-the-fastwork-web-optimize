# Host display state during Chrome holds (U1 back-tag)

Desk task for arch-unknowns U1 (`research/architecture/unknowns-validity.md`) and the T8 host-record ticket.
It back-tags every Chrome A/B and A/A found on this machine with the Mac's display state, wake type and power
source, taken from `pmset -g log`. By fix-scroll-engine, 2026-10-01 ~11:10Z. Read-only: no Chrome, no locks,
no tooling changes.

**Verdict.** The plain-baseline scroll fps follows the display state, with no overlap:
- display on (FullWake): **63.5-78.3** over 7 post-I-002 holds;
- display off (DarkWake): **92.2-93.8** over 3 holds.

Stacked bases show the same step: aw1-10c runs 108.6 with the display off, against 95.3 and 84 with it on. Power
source shows no effect. The "~93 floor" and the canary drift 92 → 76 are therefore the display state, not the tools.
This is a correlation from logs; U1 (b), the interleaved on/off A/A, is still the controlled test.

## Method

- `pmset -g log` (the PM ASL store reaches back to 2026-09-24, so every hold below is covered). Events used:
  - `Notification Display is turned on/off`;
  - `Wake ... DarkWake to FullWake` / `Wake from`;
  - `DarkWake from Deep Idle`;
  - `Sleep Entering Sleep state`;
  - the `Using AC|Batt` field on every line (power source).
  - The pmset log is not committed: it carries device and network details.
- The holds are every `verify.json` under the main checkout's `out/` and every live worktree's `out/` (27 files). The
  span runs from the directory stamp (start) to the file mtime (end).
- Times are UTC. pmset logs local time (+0700).
- Scripts in this directory:
  - `scan.mjs <pmset.log> <roots…>` writes JSON lines;
  - `table.mjs <jsonl>` renders the table below.
  - The "base side" column was added by hand from each topic's `results.json` `config.baseline`.

## Host timeline (UTC)

| span | display | wake | power |
|---|---|---|---|
| 09-30 16:59:17 → 10-01 00:16:55 | on | FullWake (lid open, user) | battery until 21:17:42 → battery 21:17:42-22:13:42 (after brief AC blips) → AC |
| 00:16:55 → 00:20:09 | off | FullWake | AC |
| 00:20:09 → 02:31:17 | off | asleep, with 45 s-3 min maintenance DarkWakes | AC |
| 02:31:17 → 04:00:07 | off | DarkWake (held ~89 min) | AC |
| 04:00:07 → 04:36:15 | off | asleep / short DarkWakes (04:00:34-04:02:34, 04:02:35-04:04:36, 04:20:03-04:20:48) | AC |
| 04:36:15 → 06:21:51 | off | DarkWake (held ~105 min) | AC |
| 06:21:51 → now (≥ 11:06) | on (off 06:22:21-06:22:55 only) | FullWake (user activity) | AC |

Since 06:22:55Z there is no display-off event, and the 15-min "Prevent sleep while display is on" summaries run
unbroken through 10:52Z. So every hold after 06:22Z ran with the display on, before as well as after the
`caffeinate -d` from 11:01:46Z.

## Holds

| # | hold (topic, store) | span (UTC) | n, idle | base side | display | wake | power | base fps | fix fps | pmset transitions inside |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | _aa (wt a03218c) | 09-30 21:11-21:16 | 5, pre-I-002 | plain | on | FullWake | AC | 74.5 | — | — |
| 2 | pain-offscreen-notes (wt a700c6e) | 09-30 21:15-21:21 | 5, pre-I-002 | plain | on | FullWake | AC → battery | 66.2 | 72.6 | — |
| 3 | commission-forced-layout (wt a53f4ec) | 09-30 21:15-21:26 | 5, pre-I-002 | plain | on | FullWake | AC → battery | 69.3 | 73.5 | — |
| 4 | countdown-idle-raf (wt a03218c) | 09-30 21:17-21:43 | 5, pre-I-002 | plain | on | FullWake | AC → battery | 71.3 | 68.7 | — |
| 5 | large-area-blur (wt a4091af) | 09-30 21:19-21:56 | 5, pre-I-002 | plain | on | FullWake | battery | 69 | 69.3 | — |
| 6 | nav-hit-test (wt a277ea0) | 09-30 21:19-22:01 | 5, pre-I-002 | plain | on | FullWake | battery | 69.1 | 75.3 | — |
| 7 | commission-forced-layout (wt a53f4ec) | 09-30 21:43-22:19 | 3, pre-I-002 | plain | on | FullWake | battery → AC | 71.8 | 72.2 | — |
| 8 | large-area-blur (wt a4091af) | 09-30 21:57-22:46 | 5, pre-I-002 | plain | on | FullWake | battery → AC | 68.2 | 66 | — |
| 9 | layout-animations (wt a7da36d) | 09-30 22:11-22:16 | 5, pre-I-002 | plain | on | FullWake | battery → AC | 69.6 | 71.9 | — |
| 10 | scroll-engine /01 (wt a1722cf) | 09-30 22:22-22:25 | 3, pre-I-002 | plain | on | FullWake | AC | 69.2 | 66.6 | — |
| 11 | commission-forced-layout (wt a53f4ec) | 09-30 22:23-23:02 | 5, pre-I-002 | plain | on | FullWake | AC | 66.5 | 70.2 | — |
| 12 | hero-exit-scroll-timeline (wt a77e2ec) | 09-30 22:26-22:29 | 3, pre-I-002 | plain | on | FullWake | AC | 63.7 | 69.5 | — |
| 13 | layout-animations (wt a7da36d) | 09-30 23:08-23:13 | 5, 6 | plain | on | FullWake | AC | 63.5 | 64.3 | — |
| 14 | nav-morph-all (wt a277ea0) | 09-30 23:32-23:37 | 5, 6 | plain | on | FullWake | AC | 74.9 | 87.3 | — |
| 15 | wave1-partial (wt a304ca7) | 09-30 23:41-23:47 | 5, 6 | plain | on | FullWake | AC | 74.9 | 95.4 | — |
| 16 | nav-morph-all-v2 (wt a277ea0) | 09-30 23:50-23:53 | 3, 0 | plain | on | FullWake | AC | 77 | 87.7 | — |
| 17 | _aa canary (main) | 10-01 04:00-04:02 | 1, 6 | plain | off | DarkWake (sleep 04:00:07-04:00:34 in the gate) | AC | 92.2 | — | 04:00:07Z sleep; 04:00:34Z darkwake; 04:02:34Z sleep |
| 18 | _aa (wt a304ca7) | 10-01 04:37-04:44 | 5, 6 | plain | off | DarkWake | AC | 93 | — | — |
| 19 | all-wave1 (wt a304ca7) | 10-01 04:44-04:51 | 5, 6 | plain | off | DarkWake | AC | 93.8 | 110.6 | — |
| 20 | vendor-scrollend (wt a6a570e) | 10-01 05:05-05:12 | 5, 6 | all-wave1 | off | DarkWake | AC | 109.2 | 110.2 | — |
| 21 | se10c-aw1 (/10c) (wt a1722cf) | 10-01 05:39-05:46 | 5, 6 | all-wave1 | off | DarkWake | AC | 110.6 | 108.6 | — |
| 22 | abl-aw1i (wt a1722cf) | 10-01 06:06-06:11 | 3, 6 | se-aw1i | off | DarkWake | AC | 110.6 | 110.8 | — |
| 23 | n12-aw1 (N12) (wt a277ea0) | 10-01 06:31-06:39 | 5, 6 | aw1-10c | on | FullWake | AC | 95.3 | 99 | — |
| 24 | aw1-10c (wt a13d7bf) | 10-01 07:42-07:44 | 1, 6 | plain (by fps; no results.json) | on | FullWake | AC | 70.4 | 84 | — |
| 25 | _aa canary (main) | 10-01 08:27-08:30 | 1, 6 | plain | on | FullWake | AC | 78.3 | — | — |
| 26 | _aa canary (main) | 10-01 09:48-09:53 | 1, 6 | plain | on | FullWake | AC | 75.9 | — | — |
| 27 | se10d-aw1 (/10d) (wt a1722cf) | 10-01 09:57-10:04 | 5, 6 | aw1-10e | on | FullWake | AC | 98.5 | 99.3 | — |

## Findings

1. **The display state splits the plain baseline cleanly.**
   - Post-I-002 tools (idle 6 or 0):
     - display on: 63.5, 74.9, 74.9, 77.0, 70.4, 78.3, 75.9 (#13-16, #24-26);
     - display off: 92.2, 93.0, 93.8 (#17-19).
   - The pre-I-002 holds (#1-12) are all display-on, 63.7-74.5.
   - So the "75 → 93 new floor" (credited to the gated tools) lines up with display off. The "92 → 76 canary drift"
     (v2 L8) lines up with display on again. Note that no plain-baseline hold ran with the display off before
     04:00Z, so tools and display are confounded for the jump itself. Only the drift back (#17-18 → #25-26, the
     same tools) isolates the display.
2. **Stacked bases show the same step.** aw1-10c is the fix side of #21 (108.6, display off) and the base side of
   #23 (95.3, display on). #24's fix side, 84 with the display on, is a single run. all-wave1 measured 109.2-110.6
   with the display off (#19-21); no display-on hold of all-wave1 exists.
3. **Within-hold A/Bs keep the same state on both sides:** no hold has a display transition inside it. The exception
   is #17, whose gate phase spanned a 27 s system sleep. Cross-hold comparisons between #13-16/#23-27 and #17-22 are
   not valid.
4. **Power source has no visible effect.** #5/#6 (battery throughout) measured 69.0/69.1; their AC neighbours on
   the same tools measured 63.7-74.5. Charge was 54-60 % on battery.
5. **The host record missed a system sleep.** In #17 the Mac slept 04:00:07-04:00:34Z, inside the hold's gate
   phase. verify.json records `sleptSec: 0`, `woke: false` for both runs, because the measured runs started at
   04:00:48Z, after the wake. T8 should record wake type and display state per run, not only sleep inside
   verify's windows.
6. **Times in U1's table.** U1's "04:25Z canary": no hold ran at 04:25Z, because the Mac was asleep
   04:20:48-04:36:15Z. The only nearby canary is #17 (04:00-04:02Z, 92.2). U1's "08:31Z" canary is #25
   (08:27-08:30Z) and its "10:08Z" canary is #26 (09:48-09:53Z, `out/lead/canary-d1c324c.log`).
7. **Machine asleep.** No hold ran between 23:53Z and 04:00Z. The Mac was asleep 00:20-02:31Z, then held in
   DarkWake 02:31-04:00Z with no verify.json written.

## Unknown, not covered

- **Holds with no verify.json:** N11, "part 4" and the N13 probe/storm-catch, mechanism probes (`mech*.mjs`, `d10`,
  `r2*`, `r3`), bench runs, and the aborted A/B dirs. Tag them by their own logged times against the timeline above.
- **Worktrees already removed** before this scan: their `out/` is gone.
- **Thermal state:** not in pmset's log. `pmset -g thermlog` is live-only.
