# Fix: morph-inherit (correction of st6-rb2's nav morph in WebKit)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta-vs-st6rb2.diff` contain excerpts of Fastwork's code: keep them on local
> branches, never push.

**Status:** measured (counts and pixels; no timing, per "Defer timing")
**Kind:** correctness fix of a landed change. On WebKit, st6-rb2 (C) does not run the baseline's motion.
**Owner:** fix-nav-morph, at the lead's request (2026-10-03). Findings: F-183, F-184.
**Base:** C = st6-rb2, JS 7bf7c4657d21 / CSS f523598b2a24. Fixed C: JS 7c61fe7d0662, CSS unchanged.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, in the nav header component (`uN()` root `I`):
- a writer `__mkW` next to the element bindings;
- one call to it in the header's template effect, after the header's own `--morph` style write;
- one line in the panel block `ue`.

Diff against C: `delta-vs-st6rb2.diff` (35 lines). `patch.diff` is against the baseline and so carries all of
st6-rb2.

## What was wrong

scene-scope R4b, landed in st6-rb2, registers `--morph` as non-inheriting:
`@property --morph { syntax: "<number>"; inherits: false }`. The children that read it take it with an explicit
`--morph: inherit`: the nav bar, logo, actions, earn button and morph panel. The header's template effect writes
`--morph` inline on the header every tween frame.

In WebKit those children do not re-resolve when only the header's value changes. They keep the value from the last
time a header class flipped. Status: OBSERVED, in our setup, cause unknown.
- Simulator, iOS 26.5 (Safari 26.5).
- iPhone 15 Pro Max, read by iphone-runner, 2026-10-03, on 55922 (st6-rb2) and 55926 (strip-tc).

| user path (push past the end), m = 1 | baseline | C | fixed C |
|---|---|---|---|
| children's computed `--morph` | 1 | 0 (panel 0.924-0.941) | 1 |
| logo x (CSS px) | 169.3 | 43.3 | 169.3 |
| earn button width / opacity | 0 / 0 | 110.4 / 1 | 0 / 0 |

- The phone read matches C's column: children 0, logo x 43, earn width 110, panel 0.924.
- Visibly on C: the logo stays at the left and "Join waitlist" stays shown. The panel's fade stays at ~0 until the
  `is-expanded` flip (m > 0.92), then pops in.
- Chrome was right all along. Its frozen frames of C match the corrected build (gate b).

Minimal page (`gates/inherit-mini.html`, no Fastwork code; Simulator, `gates/inherit-mini-sim.mjs`). A child with
`--r: inherit` of a registered `inherits: false` property never follows its parent in any of these cases:
- an inline write;
- an inline write plus an ordinary non-inherited inline change;
- a class rule.

Two controls follow the parent:
- the same property registered `inherits: true`, with explicit inherit;
- an unregistered property.

Reference: UNRESOLVED.
- WebKit main says these children should re-resolve. `StyleBuilder.cpp` `applyCustomProperty()` calls
  `setHasExplicitlyInheritedProperties()` for `inherit` of a non-inherited registered property.
  `StyleTreeResolver.cpp` `computeDescendantsToResolve()` returns `ChildrenWithExplicitInherit` on
  `Change::NonInherited`, and `determineResolutionType()` fully resolves such a child.
- So either Safari 26.5 predates that code, or the parent's change is not detected. No bug report was found.
- Decisive check: the minimal page on a WebKit build from main (Safari Technology Preview / MiniBrowser).

## What changed

The header's writer now also writes the same value inline on the five children:
- `B` bar, `re` logo, `ie` actions and `oe` earn button: bound at component setup;
- `__mkP`, the panel root, set when the panel block mounts.

The write is skipped when the value hasn't changed. A newly mounted panel gets the current value at mount. Inline
`--morph` overrides the `--morph: inherit` rule, which stays in place. In Chrome both give the same value.

Why inline writes rather than dropping `inherits: false` (the lead's preference):
- R4b's point was that a `--morph` write restyles only the header and the elements that use it, not the whole nav
  subtree with the 3 image columns. Inline writes keep exactly that set.
- Making `--morph` inherit again would bring the subtree restyle back. The minimal page shows `inherits: true` plus
  explicit inherit would also fix WebKit, but I did not measure its restyle cost.

## Gates (2026-10-03; Simulator and Chrome shared slots; counts and pixels only)

(a) WebKit (Simulator).
- User path (`gates/inherit-scroll-sim.mjs B,C,M`, `out/f3r/inherit-scroll-2026-10-03T13-55-05-096Z`):
  - fixed C = baseline at rest, open + 2 s (m = 1) and closed + 2 s, for every child's `--morph`, x and opacity, and
    the earn box. Table above.
  - At open + 0.25 s every child equals the header's live value (0.742). The baseline does the same. The m values
    differ because that sample is not frozen.
- Frozen frames: `gates/reveal-sim-frames.mjs B,M,B2`, `out/f3r/simframes-2026-10-03T13-56-07-077Z`. The builds are the
  baseline + hook (bhook a0945967a4fb), and fixed C + hook (mhook d9898e0a2e15), at m 0 / 0.1 / 0.25 / 0.5 / 0.75 / 0.9
  / 1 / 0.
  - The children's state (`--morph`, x, opacity) is identical to the baseline at every m.
  - Pixels are within max channel delta 2 of the baseline, except:
    - m 0.1: max 52, the same as the baseline A/A;
    - m 0.9 and m 1: max 11 / 6, 52 / 0 px over 8, inside the panel's countdown cells (y 425-484). Likely
      anti-aliasing of the panel clock under the panel's scale, and likely a C-vs-baseline difference rather than
      part of this fix. That attribution rests on Chrome only (fixed C vs C is 0 px there); there is no WebKit C-vs-M
      frame at these m with live children to compare, so on WebKit it is OBSERVED, cause unknown.
- Mid-tween time series (after landing, review point: at open + 0.25 s earn opacity 1 in B vs 0.786 in M):
  `gates/tween-series-sim.mjs B,M,C,B2,M2`, `out/morph-inherit/series-2026-10-03T14-20-45-448Z` (fix-nav-morph-main
  checkout), read with `gates/tween-series-read.mjs`. Per rAF frame from the wheel dispatch: header m, each child's
  computed `--morph`, x, width, opacity.
  - Everything `--morph` maps directly matches B at the same m: the children's `--morph` (0 difference), logo x
    (≤ 0.25 px on open), panel opacity (≤ 0.07, at the first tween frame).
  - The earn button differs in time. Its opacity and max-width / padding are CSS transitions (opacity 0.32 s after a
    0.12 s delay, max-width 0.68 s) toward targets that reach 0 once m ≥ 0.2 (`--earn-out` = m / 0.2), so the fade is
    anchored to the frame where m first reaches 0.2, not to m.

    | open tween | B | B2 | M | M2 | C (stale kids) |
    |---|---|---|---|---|---|
    | first frame with m ≥ 0.2, ms after dispatch | 117 | 123 | 70 | 67 | 68 |
    | m on the frame before it | 0.018 | 0.048 | 0.073 | 0.077 | 0.077 |
    | first earn opacity < 0.99, ms after that frame | ≤ 249 (no sample 231-366) | 151 | 144 | 140 | never |
    | earn width < 78 px, ms after that frame | 249 | 277 | 216 | 222 | never |

    In the Simulator the baseline's second tween frame comes ~110 ms after the first, C's and M's ~50 ms after
    (st6-rb2, not this fix; Simulator ms are not judged, F-084). So M's earn fade starts ~50 ms earlier and is
    further along at a given time or m (opacity 0.79-0.81 at m 0.75 vs B2 0.97 at m 0.78; at most 0.25 apart at the
    same time). Measured from the anchoring frame, the opacity fade starts after the same 140-151 ms in B2, M and M2;
    width is 40-60 ms earlier in M (the first frame's smaller m in B retargets the max-width transition from a
    different point). OBSERVED, Simulator, in our setup; the phone check (P-085) decides whether it shows on the device.

(b) Chrome (headless 430x932 DPR 3), `gates/reveal-frames.mjs --builds C,M,C2`,
`out/f3r/frames-2026-10-03T14-00-03-524Z`:
- fixed C vs C is 0 px at m 0.1, 0.75, 0.9 and 1, and max 1 at 0.25 and 0.5. The A/A is max 1 there too.
- At m 0, 0.002 and the final 0, the only changes are in one band, y 225.7-228 (x 103-161 and 293-326): page
  content, the hero's connector lines between the avatars and the shield, not the nav. Per frame (px over 8 / max
  channel delta, `gates/reveal-diff.py <dir> --ref C`):

  | frame | M vs C | A/A (C2 vs C) |
  |---|---|---|
  | k0, m 0 | 549 / 36 | 0 / 1 |
  | k1, m 0.002 | 994 / 47 | 1021 / 141 |
  | k8, final m 0 | 1021 / 94 | 0 / 2 |

  So on k0 and k8 M differs from C there while the A/A does not; only k1 shows an A/A of the same size. The crops show
  the lines' gradient at a different phase, so this is likely animation-phase noise in that band (OBSERVED, cause
  unknown; the fix writes only the nav children's inline `--morph`, and nothing in the nav differs).
- Counts: same as C, see (c).

(c) Restyle and layout counts during the tween, C vs fixed C.

| Chrome, `restyle-chrome.mjs`, M driver 2 cycles, per run | C (2 runs) | fixed C (2 runs) |
|---|---|---|
| style recalcs (UpdateLayoutTree) | 648, 652 | 648, 645 |
| elements restyled (sum of elementCount) | 6348, 6329 | 5929, 6056 |
| layouts | 384, 380 | 383, 381 |

| WebKit (Simulator), `gates/tween-paint-sim.mjs C,M`, per tween frame, 2 cycles | C | fixed C |
|---|---|---|
| style recalcs, open / close | 3.0-3.1 / 3.0 | 3.0-3.1 / 3.0-3.1 |
| layouts, open / close | 2.0 / 2.0 | 3.0-3.1 / 2.6-2.7 |
| paints, open / close | 15.5-15.8 / 13.4-13.5 | 16.5-16.6 / 13.7-13.9 |
| holds m0 / m1 (paints) | 4.3 / 4.5 | 4.7 / 4.5 |

Data: `out/morph-inherit/restyle-chrome-2026-10-03T13-58-59-959Z.json`, `out/f3a/tween-paint-2026-10-03T14-01-10-919Z.json`.

What the fix costs:
- No extra style recalc passes on either engine. Chrome restyles the same number of elements or slightly fewer.
- In WebKit the corrected morph does about +1 layout and +1 paint per open-tween frame (+0.6 / +0.3 on close). Likely
  the motion C had skipped: the logo's `left` moves and the earn button's max-width / padding transition runs. That
  the baseline does the same work is unmeasured: tween-paint-sim had no baseline arm.
- Simulator frames over 34 ms rose from 5/5 to 9/8 per open tween. Simulator ms are not judged (F-084), but on the
  phone this suggests C's morph timing was measured on a lighter morph than the baseline's (see "Consequences").

## Consequences

- Every WebKit number for C's morph counted a morph with stale children (lead's marking, mgmt-ops-10 told
  2026-10-03): P-079's morph attribution, F3 step 1's Simulator tween counts, and the morph parts of any C-stack phone
  run.
- The countdown and hero regions are not affected.
- Builds that stack on st6-rb2 (cd-strip, cd-roll-ca, countdown-faces, platform-idle, hero-exit-threaded) carry the
  same defect in the morph region until this lands under them.

## P-085: phone no-worse check against the baseline (registration; written before any P-085 phone data)

A short no-worse check with a DOM read first, not a gain block. The prediction id is from mgmt-ops-10; the ops second
read comes before any data. Queued after C-033 and P-081.
- **Question (one).** On the iPhone at real thermal Serious, under the morph driver M at the page end, does the fixed
  build (M) show the baseline's nav children (DOM read, earn fade timing) without more long frames than the baseline (B)?
- **Builds** (immutable snapshot copies from `node fixes/morph-inherit/build.mjs`, re-checked by sha256 before the
  block; served `nodes/2.DyWL8TcE.js` / `assets/2.gBuqKVzi.css`):
  - M: `out/snapshots/mi-7c61fe7d0662`, `7c61fe7d0662` / `f523598b2a24` (on main as 0ad5407).
  - The one control, B: `out/snapshots/bdrive-afd388b8945a`, `afd388b8945a` / `27776f3d4138`. The plain baseline
    plus the phone driver `window.__fwMorphDrive`, which the baseline lacks. The driver text is copied byte for byte
    from mi, with st6-rb2's two helpers replaced by the baseline's own expressions: `__pinMax()` by the page's max
    scrollY and `__pinY()` by `window.scrollY`, as in the baseline's wheel handler. It runs only when called. The CSS
    is the baseline's.
  - Same base: site-pretty, the snapshot pinned by `baseline.json`.
  - Checkout: main with this ticket's commit (main's tools; my old branch's `tools/` are behind main). Who runs it is
    the lead's call: the isolation guard pins fix-nav-morph to its old worktree.
- **Servers and ports**, one per arm: `node tools/serve.mjs --root site-pretty --overlay out/snapshots/<snapshot>
  --port 0 --https --vendors=local --latency 150 --no-cache --state out/morph-inherit/p085/serve-<arm>.json`.
  - The phone loads the plain http twin (I-003). Ports go in the block log, never 5173; no LAN address in any
    committed file.
- **Driver M.** `iphone.mjs run --driver morph --probe std` with the defaults hold 2000 ms and cycles 3. That is 6
  tweens per run through `E(1)` / `E(0)`, the same path a push past the end takes, at the page's max scrollY.
- **Condition** (user T-039 B, `memory/phone-checks-start-warm.md`), as P-081:
  - Real thermal Serious. Every hold runs the gate pair `research/phone-thermal-gate/thermal-gate.mjs` (sha256
    `4604218c4041`, `--expect serious --max-c 44 --url http://lan:<twin B>/`) at its start and end. A hold counts only
    when both reads say Serious with Is Induced = No; otherwise it is re-run.
  - Stop at 44 °C battery or Critical, and cool before the next hold.
  - Every gate failure goes to the lead. Two strikes (two gate-failed holds, not necessarily in a row) → roll back to
    A, reported in T-039 (the lead's switch, recorded in the block log).
  - One start method: pre-warm on B's port (the baseline page; the driver is idle) the same way before every hold.
  - Logged per run: battery °C, charging state, the timer-grid median.
  - A Low Power Mode run or read is dropped and re-run.
  - The phone parts run inside the runner's own `lock.mjs run chrome-measure --no-timing --max-seconds 600` hold, with the
    `iphone` lease (I-056).
- **Block**, three holds:
  - H1: gate, start sentinel, phone read, warm-ups, gate.
  - H2: gate, counted 1-4, gate.
  - H3: gate, counted 5-8, end sentinel, gate. Then park Safari.
  - `iphone.mjs open <twin URL>` before every run, since each run parks Safari.
- **1. Phone read first** (`p085/phone-read.mjs`, sha256 `f7ae2c55677b`; uncounted, no frame verdict):
  - Command: `--owner fix-nav-morph --arm B=http://lan:<twin B>/ --arm M=http://lan:<twin M>/ --arm M=... --arm B=...
    --reads 2`. That is loads B M M B, with 2 open/close reads per load, so 4 reads per arm.
  - Per read:
    - 3 wheel events (deltaY ±120) on window at the page bottom, the user path.
    - Recorded on rAF for 1600 ms: the header's m, and each child's computed `--morph`, x, width and opacity.
    - The earn button's running CSS transitions, from `getAnimations()`.
    - One more read 2000 ms after each dispatch: the held state.
  - **DOM read**, judged before anything else:
    - In both arms, every child's computed `--morph` is 1 at open + 2 s and 0 at close + 2 s (|d| ≤ 0.001).
    - M equals B: logo and actions x, and earn width, within 0.5 px; logo, earn and panel opacity within 0.01.
    - Every M read is compared with every B read.
  - **Earn fade start relative to the m ≥ 0.2 frame, B vs M** (the lead's extra read). Tolerance: 2 frames at 60 Hz =
    33.3 ms.
    - tA = the first rAF sample with m ≥ 0.2.
    - *start*, which decides: the running opacity transition's `startTime` + delay − tA, per arm the median of the
      reads, d = M − B. `within` when |d| ≤ 33.3 ms.
    - *visible*, which decides only when `beyond`: the first sample with earn opacity < 0.99, minus tA. The interval
      starts at the sample before it. `within` or `beyond` only when the whole interval of d is on one side of the
      tolerance; otherwise `undecided` (a sampling gap).
    - **EARN `beyond`** (start or visible beyond) goes to the user as a pixel/timing proposal, through the lead. It is
      never a silent pass.
    - Width is descriptive: the first earn width < 78 px, and the max-width transition's start.
  - Void read (the harness checks itself; P-084 lesson):
    - the served hashes are not the arm's build;
    - there is no header or earn button;
    - fewer than 20 open samples;
    - the open tween does not start at m ≤ 0.001 or never reaches m ≥ 0.999;
    - the close never returns to m ≤ 0.001;
    - the median sample gap is > 25 ms;
    - B's children are not at the target.
  - A void load gets one re-load. Fewer than 2 valid reads in an arm means NO DATA for that check.
  - Pre-registration check on the Simulator, not a claim (functional session,
    `out/morph-inherit/p085/read-2026-10-03T14-45-29-346Z.json`, B M M B, 4 reads per arm):
    - DOM PASS.
    - start: B 120, M 120 ms after tA (transition `startTime` = tA in every read), so d = 0, `within`.
    - visible: d point −11.5, interval −63..+120.5, `undecided`: B's frame after tA is 140-190 ms in the Simulator.
    - The `--drive-check` dry run showed bdrive's driver running (moving, atOne and atZero summaries returned).
    - Simulator ms are never judged (F-084).
- **2. Warm-ups:** one uncounted load per arm port: `iphone.mjs run --driver morph --arm B|M --warmup`.
- **3. Counted runs:**
  - n = 4 per arm, in the order B M M B B M M B: `iphone.mjs run --driver morph --probe std --owner fix-nav-morph
    --block P085 --arm B|M --pos <1-8> --build bdrive-afd388b8945a|mi-7c61fe7d0662 --label p085-<arm>-<pos>`.
  - The arm letters are B / M, not C, so no run is judged as the M heat sentinel. That criterion, held m=1 p95
    ≤ 18 ms, was never validated on the baseline page, whose held m = 1 has the panel countdown running.
- **Sentinel** (as P-081): an uncounted control run `iphone.mjs run --driver scroll --probe std --arm C --heat-sentinel`
  on B's port, bottom ≥ 58 fps and scroll ≥ 44 fps, at the block start (H1) and the block end (H3).
  - A failing start sentinel: no counted run starts; cool, restart the block.
  - A failing end sentinel voids every counted run; cool, re-run the counted part once.
  - Risk: the baseline page has never been sentinel-checked at Serious. Two failing start sentinels go to the lead
    as a condition blocker (switch to A).
- **Void run** (frames-p085.mjs's rules, plus LPM): a driver error, not driver M, Low Power Mode, served js/css not
  the arm's build, no drive mark, no m seen by the probe, a tween-start count ≠ 6. One in-place re-run; a second void
  at one position voids the block.
  - **Files from a hold that failed either gate read are never passed to the scorers** (the block log lists them as
    excluded).
- **Scorers**, committed before data; every valid counted run is passed in block order:
  - `p085/phone-read.mjs` sha256 `f7ae2c55677b`: the DOM and EARN verdicts. Re-score with `--analyse <read.json>`.
  - `p085/frames-p085.mjs` sha256 `385eb00f1564`: frame gaps per run from the std probe's rAF rows inside the drive
    mark.
    - Scopes: 'moving' is scored: a frame whose m differs from the previous or next frame's m. 'drive' and 'held1'
      are reported.
    - Thresholds: dt > 50 and > 34, the ±4 ms twins (>46/>54, >30/>38), and near-band frames flagged.
    - Per-arm medians, M − B. '>50' is no-worse at ≤ +1, '>34' at ≤ +2 (the less-work phone bound, as P-078 /
      P-081). A threshold is threshold-sensitive when a twin's verdict differs.
    - Pre-registration check only: on synthetic files with known counts it gave the expected deltas, the
      threshold-sensitive flag and the served-hash void.
    - There is no earlier driver-M phone run to re-score.
- **Predictions**, as falsifiers, with P(hit) before data.
  - The points for f50 and f34 come from the baseline's morph on the phone: moving p50 29-40 ms with driver M, cool,
    in the de-morph post-mortem.
  - The Simulator dry run is consistent with them: B moving p50 123-142 ms vs M 36 ms. That is Simulator ms, not
    judged.

  | # | prediction | point | interval (falsified outside) | P(hit) |
  |---|---|---|---|---|
  | dom | DOM read PASS (M's children at the target and equal to B, every valid read) | PASS | FAIL falsifies | 0.9 |
  | earn-start | earn opacity transition start + delay − tA, M − B | 0 ms (120 vs 120) | \|d\| ≤ 33.3 ms | 0.9 |
  | earn-vis | visible earn fade onset − tA, M − B | ~0 | not `beyond` | 0.75 |
  | f50 | moving dt > 50, M − B | −2 | ≤ +1 (WORSE at ≥ +2); twins >46/>54 the same bound | 0.8 |
  | f34 | moving dt > 34, M − B | −10 | ≤ +2 (WORSE at ≥ +3); twins >30/>38 the same bound | 0.8 |
  | sent | start and end sentinels pass on the baseline page at Serious | pass | a fail costs a cool and a restart | 0.7 |

- **Decisions** (if X then Y):
  - **DOM FAIL:** stop before any counted run. The fix does not work on the device. The failing rows go to the lead,
    then back to the fix (it is landed).
  - **DOM PASS, EARN within (start `within` and visible not `beyond`; `undecided` allowed), f50 and f34 no-worse:**
    morph-inherit passes its phone no-worse check. Reported to the
    lead; F3 continues on main + morph-inherit. No further block for this question.
  - **EARN beyond:** a user proposal (pixel/timing). It shows B's and M's fade onset and anchor per read, and says
    whether the start or the visible form is beyond. The frame verdict is still reported. Landing stays as it is
    until the user decides.
  - **EARN NO DATA** (no transition data, or fewer than 2 valid reads in an arm): to the lead, with no EARN verdict.
    One re-read only after the cause is named.
  - **f50 or f34 WORSE (moving scope):** to the lead, with the slow moving frames per run (dt and m). The lead
    decides: keep the fix (correctness), or my `inherits: true` variant as a candidate (README "What changed").
  - **Threshold-sensitive f50 or f34:** to the lead, with no frame verdict.
  - **Drive-scope WORSE with moving no-worse:** reported (frames outside the tweens), with no verdict on the fix.
  - **Block void:** no claim. Cool and re-run once; a second void goes to the lead.
- **Expected minutes:** about 30 (range 25-45).
  - Pre-warm to Serious: about 10.
  - H1: about 8 (the read takes about 2, the sentinel 1.5).
  - H2: about 6 (4 runs at about 1.2 min).
  - H3: about 8.
  - About 1.5 min of gate reads per hold.

## Tools (this directory; self-contained)

Run `node fixes/morph-inherit/build.mjs` first. It makes every snapshot the gates read (out/snapshots/: mi, c, mhook,
chook, bhook, bdrive) from the baseline plus `patch.diff` (or the overlay when present) and `delta-vs-st6rb2.diff`, and
refuses any build whose hashes differ from the ones measured. Each gate script's header has its run command.

- `build.mjs`: the snapshot copies.
- `restyle-chrome.mjs`: gate (c), Chrome counts.
- `gates/inherit-probe-sim.mjs`: driver reads, C / M.
- `gates/inherit-scroll-sim.mjs`: gate (a), user path, B / C / M.
- `gates/inherit-mini.html` / `.js`, `gates/inherit-mini-sim.mjs`: minimal page.
- `gates/reveal-sim-frames.mjs` (gate a) / `gates/reveal-frames.mjs` (gate b) / `gates/reveal-diff.py --ref`: frozen
  frames.
- `gates/tween-paint-sim.mjs` C / M, `gates/tween-paint-read.mjs`: gate (c), WebKit counts.
- `gates/tween-series-sim.mjs` B / M / C, `gates/tween-series-read.mjs`: per-frame child state through an open and
  close tween (user path).
- `p085/phone-read.mjs`, `p085/frames-p085.mjs`: P-085's phone read and frame scorer. bdrive (build.mjs) is its
  control.

Provenance: the data above were taken with the same scripts in `fixes/nav-morph/` (fix-nav-morph's F3 branch, commit
28c36e2), which also carried F3 #4 prototype arms; the copies here drop those arms and write to `out/morph-inherit/`.
The out/f3r and out/f3a data dirs, and the C snapshot dirs those runs read (f3a-st6rb2 / st6-rb2-7bf7c4657d21,
f3r-chook-f6f254402209), are byte-identical to `build.mjs`'s c-7bf7c4657d21 and chook-f6f254402209 (checked with
cmp, 2026-10-03).
