# Fix: v9-best (wave integration: v8 + six fixes, each added as it passes)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** **v9-final built and pinned: 647c9ef2b1e2 / e1359ab9994a** (v8 + menu swipe rev 7c + double-drive + PR-021
Join button rev 3 + nav-hit-cache U1 + glue; **scroll-cb and the close rule are out of v9**, lead rulings 2026-10-05.
scroll-cb: dropped after the gM split, a ruling, not a proven cause (the short first fling is load-dependent and also
seen without scroll-cb, Simulator, OBSERVED). close: with it, Chrome restyles at rest (census mainFrames/s 60 at the top,
22-34 at 2796; without it 39.3 / 2.2 like v8; OBSERVED, cause unknown). Both rejoin together as one v9.1 follow-up check;
"v9-final build (without scroll-cb and the close rule)" below). Phone ticket P-122 (v8 vs v9-final, G driver, flicker gate, fling parity) is registered before any
P-122 data and waits for mgmt-ops-10's delta check and the lead's sign. Earlier: P-120 (step 4) CLOSED INSUFFICIENT;
**v9 ships with rev 7c** (user's PR-023 decision, 2026-10-05 04:45Z: rev 7d is rebuilt on v9-final after v9 lands; lead
ruling, user T-159 #32). Known limit: incident I-179 (rev 7c glides back open after a swipe released just past closed, 2
of 42 swipes), a report case in P-122. Not timed (memory `defer-timing-focus-call-tree.md`). The phone no-worse check
follows the less-work rule (memory `less-work-landing-rule.md`).
**Integrator:** int-v8 (wave-integrator), from 2026-10-05. Board row `v9-best`, lead priority #1 (from 2026-10-05 ~04:50Z), user T-159 #9.
**Build:** `patch.diff` is baseline-relative over 2 files: v9-final, JS `647c9ef2b1e2…`, CSS `e1359ab9994a…` (patch.diff
4196eaa61d96). Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## Components (each a delta on v8 3e3e94cb6e9f / f836404b3728)

| # | component | state | delta (sha256/12) | owner's build v8 + delta (JS / CSS) |
|---|---|---|---|---|
| 1 | PR-018 menu swipe rev 7c (morph-scroll; user accepted 20:12:50Z; landed 42250648) | **in** | `fixes/morph-scroll/delta.diff` 81ac7e1ee500 | 428961bda278 / 659b02f7169d |
| 2 | double-drive (future + commission cards, T-157; commit 96293d29) | **in**, final (owner's desktop rest-offset probe: no change; y 6500 settle check: card state at rest identical to v8; phone P-118 NO-WORSE under xcode-serious, 3/3 holds valid: S median V-C -1 at >50 and >34, GM flick-middle 0 at >50) | `fixes/double-drive/delta.diff` baae6114cd65 | 3076c5a8c9a3 / 2f7197880ffd |
| 3 | scroll-cb alone (split check ebee20a5: v8 + scroll-cb = v8 in Simulator nav parity) | **out of v9** (lead ruling 2026-10-05, after the gM split: step 4 minus scroll-cb flings like v8, with it the first page-up fling in the middle stops 500-950 px short, Simulator, OBSERVED; `build.mjs` DROPPED; rejoins as a v9.1 step after its owner's mechanism and the same parity check). Was in step 4 via the carry (reviewed OK by fix-scroll-cb and fix-double-drive) | `fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff` 3abcd7008e61; carry `scroll-cb-on-v8dd.diff` 7b4a7ee04d85 | 4c48e372ecdd / f836404b3728; v8 + dd + carry bf40f48acd24 / 2f7197880ffd |
| 5 | nav-hit-cache U1 + glue (fix-nav-morph) | **in** v9-final (`build.mjs` keys nav, glue; order ms7c, nav, glue by `after`) | `fixes/nav-hit-cache/patch-on-v8-u1.diff` 929268181c61; `glue-ms7c.diff` 5d63660a9e62 | no owner pin on v8 (v8 + U1 = 58f8618fce56); the owner's joined build (arm A on step 4) applied while scroll-cb was in |
| - | nav-hit-cache (history) | arm A delivered 2026-10-05 ~04:50Z (fix-nav-morph): step 4 + `fixes/nav-hit-cache/patch-on-v9s4.diff` 9814fdad848e (= U1 929268181c61 + glue-ms7c 5d63660a9e62, strict apply) = c3d36476c3ce / e1359ab9994a, parity PASS 5/5 on this step 4 (13d29af1, ops AGREE 820dfe22); enters as step 5 with its own no-worse ticket vs step 4 (flicker gate 814cebd0), not in P-122. Earlier note: out (when it comes in: its delta plus a glue component for rev 7c's on-dark microtask, fix-nav-morph's glue-ms7c.diff 5d63660a9e62; option (a), agreed 2026-10-05; the delta is the 1-context-line form patch-on-v8-u1.diff 7b5f3947b465, the same changes, because rev 7c's 3-line context meets nav's inserted lines, so the order is fixed: 7c, then nav, then glue; on step 3: nav cf3425e169f0, + glue c211d557e357, per fix-nav-morph): the split puts the Simulator nav-pill lag on it; waits for fix-scroll-cb's task-mode check and fix-nav-morph's real-gesture case | | |
| 4 | PR-021 Join button rev 3 (fix-nav-earn, cb3c052c) | **in** (user accepted rev 3, final). Pre-check: its delta applies to v9 step 3 with line offsets only (JS 6, CSS 5 hunks offset; v9 + rev 3 = de237379b556 / e1359ab9994a) | `fixes/nav-earn/delta.diff` f214ed00081f | 8df0a9eb3ec7 / 29bade2fe964 |
| - | toolbar-resize (P-115) | not in v9 (not delivered for v9-final) | | |
| 6 | morph-close-peak close rule, the menu-close repaint (fix-morph-gpu; landed 48918dd7) | **out of v9** (lead ruling 2026-10-05 ~06:10Z: steady extra style recalc at rest, census mainFrames/s rest-0 / rest-2796 60 / 22-34 with it, 39.3 / 2.2 without, OBSERVED, cause unknown; `build.mjs` DROPPED; rejoins in v9.1 with scroll-cb once fix-morph-gpu fixes or explains it). Was in the first v9-final 647c9ef2b1e2 / bdecf48c5b32 | `fixes/morph-gpu/close/delta.diff` 60eba2d73b68 | 3e3e94cb6e9f / f673c6cbc770 |

Build: `node fixes/v9-best/build.mjs [--dry] [--only a,b]`. To add a fix, add one line to `COMPONENTS` with the owner's delta on v8 and the hashes of its own build, run the script, then pin `V9_EXPECT`.

It writes:
- `fixes/v9-best/overlay/` (gitignored);
- `patch.diff`;
- `out/v9/snap-<js12>[-<css12>]/{A,V}` (the CSS suffix when a `snap-<js12>` with other content exists), read-only, with A = v8 and V = v9, plus `HASHES.txt` (full sha256);
- `out/v9/build.json`.

## Identity checks (`build.mjs`, best-build's strict applier: exact context, no fuzz)

Step 1: 7 of 7 checks ok.
- v8 rebuilt from `fixes/v8-best/patch.diff` is 3e3e94cb6e9f / f836404b3728.
- Rev 7c's delta file is 81ac7e1ee500. v8 plus that delta gives the owner's build, 428961bda278 / 659b02f7169d, with no offsets.
- The owner's baseline-relative `fixes/morph-scroll/patch.diff` (585f959145b3) gives the same bytes.
- `node --check` passes on v9's JS.
- `patch.diff` (41393d15a50c) applied to the baseline reproduces v9.
- The snapshot matches `HASHES.txt`.

With two or more components, the script also checks:
- every order gives the same bytes;
- by reversal, v9 minus each component equals v8 plus the others.

## Function and look checks (v9 vs v8)

- `fix.mjs check v9-best --on v9-v8base --viewport both --save`: queued in the shared lane. `v9-v8base` is
  `fix.mjs apply v9-v8base --from v8-best`, i.e. v8's overlay.
- **Step 1 (rev 7c only), 2026-10-04 21:12Z: CHECK OK** (`out/v9/check-s1.json`).

  | viewport | errors | 4xx | morph reached | elements v8 → v9 | maxY v8 → v9 | screenshot diff % (top / middle / bottom) |
  |---|---|---|---|---|---|---|
  | mobile 430 (touch) | 0 | 0 | yes / yes | 1580 → 1581 | 5345 → 6277 | 0.16 / 46.6 / 71.49 |
  | desktop | 0 | 0 | yes / yes | 1424 → 1423 | 8448 → 8448 | 0.18 / 0 / 0.01 |

  - The mobile middle and bottom diffs are expected. Rev 7c adds one screen of scroll on touch pages (`div.fw-ms-end`, 100lvh, aria-hidden, inserted after #platform; morph-scroll README "Components"). That is the one extra element and the +932 px of maxY. The check shoots "middle" and "bottom" relative to maxY, so the two builds are shot at different scroll positions, and the shots compare different parts of the page.
  - The same-position comparison is the frozen-pixel gate below.
  - Desktop (no touch) differs only by countdown/orbit phase. Its 1424 → 1423 is the per-load accent state that v8's own check showed (v8 README "Element count").
- **Step 2 (rev 7c + double-drive), 2026-10-04 21:20Z: CHECK OK** (`out/v9/check-s2.json`; served overlay JS
  ab6f1062aaeb… / CSS 40037dc99f11…).

  | viewport | errors | 4xx | morph reached | elements v8 → v9 | screenshot diff % (top / middle / bottom) |
  |---|---|---|---|---|---|
  | mobile 430 (touch) | 0 | 0 | yes / yes | 1580 → 1581 | 0.15 / 46.6 / 71.51 |
  | desktop | 0 | 0 | yes / yes | 1423 → 1423 | 0.11 / 0 / 0 |

  The same picture as step 1: the added element is rev 7c's `div.fw-ms-end` (plus its `html.fw-ms` class and the
  accent's per-load state), and the mobile middle/bottom shots sit at different page positions. Double-drive adds no
  error, 404 or element. Its look checks were stopped for step 3's (the same checks on `out/v9/snap-25dc3025f1a0`, queued).
- **Step 4 (+ PR-021 rev 3), built 2026-10-04 ~21:55Z:** v9 = de237379b556 / e1359ab9994a (patch.diff 883b6f86b90f),
  12 legal orders the same bytes, v9 minus each of the 4 components = v8 + the others (v9 - earn = step 3), node --check ok.
  **Function check 2026-10-04 22:30Z: CHECK OK** (`out/v9/check-s4.json`; served overlay JS de237379b556… / CSS
  e1359ab9994a…):

  | viewport | errors | 4xx | morph reached | elements v8 → v9 | screenshot diff % (top / middle / bottom) |
  |---|---|---|---|---|---|
  | mobile 430 (touch) | 0 | 0 | yes / yes | 1581 → 1581 | 0.17 / 46.61 / 71.53 |
  | desktop | 0 | 0 | yes / yes | 1423 → 1423 | 0.12 / 0 / 0 |

  The same picture as step 2 (v8's count is the per-load accent state, 1580 or 1581; the exact count is dom-count's).
  **Look checks on `out/v9/snap-de237379b556`, 2026-10-04 22:30-23:17Z (`out/v9/looks-s4.log`), all EXIT 0:**
  - `px-chrome.mjs`, all within PR-010's 0.5 %. Mobile: two diffs repeat. One is the top-nav language switch, 41 css px²
    (0.0102 %, max 212), from PR-021. The other is the commission referral card at y 3875, 150 css px² (0.037 %, max 37),
    from double-drive. Everything else is about 0. Desktop: the language switch, 72-83 css px² (PR-021). The hero heading
    at y 548 differs by 2140 px² (0.165 %, max 107); the V/V noise is 0.68 %. The people image at y 4255 differs by
    2654 px²; the A/A noise is 3 %.
  - `dom-count.mjs` (A = v8, V = v9; A2/V2 repeat both, the same counts). Mobile: 1578 → 1579 after the walk. The +1 is
    rev 7c's `div.fw-ms-end` with `html.fw-ms`. PR-021's earn box adds a span and one script element drops. Desktop:
    1409 → 1409, with the same span added and script dropped. No other token differs.
  - `census-run.mjs A,V` (Chrome work counts per second, no timing; docHeight 6278 → 7210 = rev 7c's 100lvh spacer):

    | window | mainFrames A → V | elementsRestyled | layout | paint | rafFire |
    |---|---|---|---|---|---|
    | rest-0 | 39.3 → 39.2 | 299.5 → 240.9 | 1.2 → 1.0 | 71.2 → 73.0 | 1.2 → 1.0 |
    | rest-1400 | 43.2 → 42.3 | 537 → 528.5 | 2.0 → 2.3 | 79 → 79.5 | 1.3 → 1.3 |
    | rest-2796 | 3 → 2 | 24 → 16 | 0 → 0 | 0 → 0 | 0 → 0 |
    | rest-3800 | 27.3 → 26.3 | 233.7 → 226.4 | 14.5 → 14.3 | 37 → 37 | 17.7 → 17.7 |
    | rest-end (A y 5346, V y 6278) | 0 → 28 | 0 → 317.9 | 0 → 0 | 0 → 124.9 | 0 → 27 |
    | scroll top → end (A 8.9 s, V 10.5 s) | 126.1 → 129 | 2194 → 2084 | 21.6 → 24.9 | 197.7 → 237.3 | 305.1 → 186.8 |

    rest-end does not compare across arms. A rests at v8's page end, where the morph has not run. V rests one screen
    lower, at the end of rev 7c's spacer, where the morph is complete (m = 1) and the countdown is in view. There V runs
    the countdown roll's original rAF spring at about 27 calls/s, plus its 1/s tick. The spring is at V JS line 4408,
    on cd-roll's "no strip yet or no path" fallback. At the page top the roll uses its strip path at about 1 rAF/s.
    OBSERVED in our setup. This matches the open "panel clock roll" item (#1, less-work) on fix-cd-roll-ca's resume
    list in ops-handover. The fallback code is the same in v8 (A JS line 4308). The census never rests on v8's morphed
    panel, so this window cannot show whether v9 adds work there. The rest windows that compare (0, 1400, 2796, 3800) are equal or lower.
    The scroll window is longer in V (the spacer), so its per-second counts are not a like-for-like comparison.
- **Step 3 (+ scroll-cb), built 2026-10-04 ~21:45Z** (v9 = 25dc3025f1a0 / 40037dc99f11, patch.diff d31272fd8831). Its commission-job hunks (v8 JS 3289-3337) overlap
  double-drive's: both declare after `_ch`, and double-drive rewrote the rAF line scroll-cb uses as context. `build.mjs`
  now takes a `carry` (the component re-based on v8 + the component it overlaps, used whenever that one is in the set
  and only after it). It checks the carry's sha, v8 + dd + carry = bf40f48acd24 / 2f7197880ffd, and that the carry changes
  exactly scroll-cb's own lines (multiset of +/- lines, 0 differences). Dry run: v9 = 25dc3025f1a0 / 40037dc99f11, every
  legal order the same bytes (build: the same), and v9 minus each component = v8 + the others (dd's reversal goes through scroll-cb's carry
  and back). Semantics (int-v8's reading; both owners confirmed, fix-scroll-cb reproduced the bytes): scroll-cb's gate acts only on the compact path,
  where double-drive snaps its weight (`_cw = _wt`), and off compact the gate is off, so neither changes the other's
  frames.
  **Simulator count check (fix-scroll-cb, d8660568, score.json 73976d346b15): PASS.** Step 2 (ab6f1062aaeb) vs step 3
  (25dc3025f1a0), loads C1 V1 V2 C2, rAF driver, scored with P-108: per step side rAF 2.097 → 0.451, side rects
  3.186 → 1.086, layouts 3.858 → 3.865, renderingFrames 0.924 → 0.915; all 5 guards pass (largest: layouts +0.008,
  tolerance 0.059); parity C2 vs C1 0 diffs, V1 and V2 vs C1 0 diffs each (geometry 0, deferral sizes equal).
- Look checks use `fixes/v9-best/gates/`, copies of v8's gates with A = v8 and V = v9 (`V9_SNAP=out/v9/snap-<js12>`):
  - `px-chrome.mjs` at phone width and desktop;
  - `dom-count.mjs`;
  - `census-run.mjs` work counts;
  - `px-sim.mjs` and `sim-ipad.mjs` in the Simulator.
- Expected from step 1: rev 7c changes motion only. It keeps rev 2's still frames, which are T3 on `#platform` in Safari (see the morph-scroll README, "Pixel tiers"). Frozen frames at rest should match v8 within T2 in Chrome.

## Phone no-worse ticket P-120 (less-work rule; id from mgmt-ops-10; registered before any phone data)

**CLOSED INSUFFICIENT (lead ruling 2026-10-05 ~00:20Z; ops-handover 06f33a91).** Every gate is unscorable:
- **GM** is not comparable (rev 7c's end screen, "G leg" below).
- **M and GE** were not run, because the rev 7d rebuild supersedes the rev 7c V arm.

What each hold left:

| hold | result |
|---|---|
| H1 | V morph runs void; C runs only sentinels |
| H3a | void (WDA down) |
| H3a2 | a valid record, not evidence |
| H3b, H4, H2' | not run |

The pre-look predictions are scored against these arms: the overall result is "insufficient", the 0.10 branch. A2's
post-look values are not scored. The A2 procedure and scripts (3da81de9, plus the stale-run-file fix 60a271d7) carry
over by pin to **P-122** (v9 step 4 rebuilt with rev 7d, vs v8), whose G legs use P-121's path-matched driver.

Lesson (ops, in the P-120 row): in the pre-data read, a Simulator dry run per driver checks that V reaches the same
start state and gesture path as C. Pinned scripts alone caught neither the open start nor the end-screen path.

Lead ruling (2026-10-04 ~23:15Z): the block registers on v9 step 4 now (rev 7c + double-drive + scroll-cb via its carry
+ PR-021 rev 3; JS de237379b556 / CSS e1359ab9994a). nav-hit-cache, toolbar-resize and morph-close-peak do not enter
P-120: each is admitted later by its own no-worse ticket, v9-final vs step 4 (nav-hit-cache's with a nav flicker gate
drafted by fix-nav-morph; that ticket supersedes P-117). Profile (user T-162 #3): xcode-serious. Pre-data read:
mgmt-ops-10, PASS WITH GAPS G1-G7 on 5bd7eb4d (9b272dd5); all seven are closed in this registering commit (see
"Gaps closed" after the ticket).

```
PHONE TICKET P-120 v9-best · less-work no-worse check (v8 C vs v9 V; the legs the two parts touch)
  · runner iphone-runner · verdict owner int-v8 · registered before any phone data; no counted run before the lead's
  pre-data read
build: V = v9 step 4 = fixes/v9-best/patch.diff (v8 + PR-018 rev 7c + double-drive + scroll-cb + PR-021 rev 3; the
  lead's ruling: these arms, later components get their own tickets vs step 4), served JS de237379b556 (full sha256 in out/v9/snap-de237379b556/HASHES.txt),
  CSS e1359ab9994a
control: C = v8 = fixes/v8-best/patch.diff, JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16,
  CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43. Mirror snapshot b1789284481295-4ad4a84a.
copies: out/v9/snap-de237379b556/{A = C, V} in int-v8's worktree (fixes/v9-best/build.mjs, strict applier, order and
  reversal identities), read-only, HASHES.txt (full sha256 as above). B = plain baseline 4606120cf392 / 27776f3d4138.
question: under the xcode-serious profile, does v9 add slow frames over v8 (a) in the menu morph's open/close at the page end
  (rev 7c changes how a swipe commits the morph), (b) in fast flicks through the middle of the page (people, pain,
  commission: double-drive's commission card), (c) in fast flicks into the page end (start-selling: double-drive's
  future card, and rev 7c's swipe rule)? No-worse only. Landing basis: identity checks, function check, frozen
  pixels and work counts in this README; rev 7c's user finger A/B (C-052) is its own landing basis.
profile: xcode-serious = Xcode Device Conditions Serious, Is Induced = Yes. No heat pre-warm. Gate once at the start and
  once at the end of every hold with thermal-gate.mjs --accept-induced (mgmt-devices, 8e4eacbb); keep the one uncounted
  load warm-up per arm port (A3/U5); ceiling 44 C battery or Critical (gate exit 3 ends the hold). xcode-serious blocks never pool with real-heat blocks. P-118 (double-drive alone) also ran
  xcode-serious, but it is a different question on other arms, so its numbers are not pooled with v9’s either.
  Decisive check (iphone-runner, P-118, 22:02-22:09Z, out/p118/decisive/ in its worktree; F-251, research/phone-thermal-gate
  README, OBSERVED, n = 3 per arm): the induced condition did not slow a CPU loop, and a sustained GPU animation ran at the
  speed the condition-off run reached only once it had heated into real Serious (~25-35 % slower than a cool phone). So
  induced Serious does slow the GPU path; no new decisive check is owed for P-120. The real-heat run once for the final
  build (memory phone-checks-start-warm) stays the plan's, not this ticket's.
sentinels under xcode-serious: a failing control run (bottom >= 58 fps and scroll >= 44 fps for S/W; held m=1 p95 <= 18 ms for M)
  voids every run since the last passing one, then the block is rerun; no cooling wait (the old "cool to the last passing
  sentinel minus 0.5 C" rule is a real-heat rule; the no-cooling clause comes from mgmt-devices’ request to int-v8,
  not from 8e4eacbb: under xcode-serious the gate replaces cooling). Gate exits in hold.sh: 2 = condition dropped or off (report to
  iphone-runner and mgmt-devices), 3 = ceiling, 7 = real heat instead of the Xcode condition; each follows P-116 hold.sh's
  failure path. Wording checked by mgmt-ops-10 (consistent with 8e4eacbb and ops-handover "Phone ticket profile").
  The profile line is stated before data, in the same commit as the arm pins.
ports, start method, sleep check: as P-111/P-117 (serve.mjs --port 0 --latency 150 --vendors=local, plain http;
  served-hash check before every item, exit 4 on a wrong one; pmcheck.mjs). A hold counts only if both gate reads PASS;
  else VOID, re-run once with the same items. Ports go to the runner by message. int-v8 starts the servers only after the
  runner reports the user's "done" on mgmt-devices' reconnect step (T-168), and keeps the same server processes and ports
  for all four holds.
checkout: hold.sh runs from int-v8's worktree (.claude/worktrees/agent-a068af37646232e05): the runner calls it by its
  path there (it cds there, reads out/pv9/snap/serve-*.json, runs serve.sh check there). Each hold starts with one PIN line:
  ticket, profile, checkout, HEAD, sha256/12 of hold.sh, serve.sh, score.mjs, P-111's score.mjs, thermal-gate.mjs,
  verdict.mjs, pmcheck.mjs, both flick scripts and out/pv9/snap/HASHES.txt. Expected: score.mjs 963f476c877a, serve.sh
  fc643888a9bc, P-111 scorer 26d944bf93e2, thermal-gate ecb403b3ad25, verdict 8edb2fc77795, pmcheck d36bd7437b7c, flicks
  0f97205f1d42 / 93a1cf7bb091, HASHES.txt 46c5a6e38b7a; hold.sh = the blob of this registering commit (named in the
  sign request). A PIN line with any other value voids that hold.
holds (each <= 10 min, inside the runner's exclusive no-timing chrome-measure hold):
  M leg  H1: wC wV mC1 mV2 mV3 mC4 · H2: mC5 mV6 mV7 mC8 (no warm-ups: H1's server processes and ports serve H2, the
         P-118 precedent; if the servers were restarted between H1 and H2, H2 starts with wC wV)
  G leg  H3: sCo wgMC wgMV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc · H4: sCo wgEC wgEV gEC1 gEV1 gEV2 gEC2 gEC3 gEV3 sCc
  (P-118's G-hold layout: sentinels apart per hold, one uncounted G warm-up per arm port). Hold length: P-118's H3 (10
  items, part M) took 552 of 600 s. Before H3 and H4 the runner reads `iphone.mjs gesture --dry-run`'s GESTURE_BUDGET_S
  for the part's script (I-112); if 10 items plus two gates do not fit 600 s, the hold is split in this pre-stated way:
  H3a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H3b sCo gMC2 gMC3 gMV3 sCc (H4a / H4b the same for E), same servers, same order.
  then iphone.mjs park; int-v8 stops the servers.
M leg (driver M, P-098's, as P-111): hold 2000 ms, cycles 3 (6 tweens at max scrollY), C V V C C V V C, n = 4 per arm;
  every counted C M run is a validity sentinel (held m=1 p95 <= 18 ms; a sentinel check, not a heat pre-warm). wC/wV: one uncounted warm-up per arm port.
G leg (driver G, P-105's scripts byte for byte): M flick-middle-v1.json 0f97205f1d42, E flick-end-v1.json
  93a1cf7bb091; 3 runs per arm C V V C C V; sCo / sCc S runs on C open and close each G hold (validity sentinels, uncounted).
scripts (committed before data): fixes/v9-best/phone/serve.sh fc643888a9bc (copies out/v9/snap-de237379b556 to
  out/pv9/snap, read-only, pin-checked), hold.sh (P-118's hold.sh with this ticket's legs and the PIN line; refuses
  without TICKET=P-120; its sha is this registering commit's blob), score.mjs 963f476c877a, selftest.mjs f3a2247ac577.
scorer: P-111's fixes/v8-best/phone/score.mjs (26d944bf93e2) imported unchanged (sha refused if changed), its EXPECT
  re-pinned in place to C = v8, V = v9 (P-117's pattern); sCo/sCc scored as P-111's sC, warm-ups skipped; the block
  verdict gates only Mmoving, Mtweens, GM, GE. Self-test: SELFTEST OK 15 checks (P-111's own records re-scored with
  P-111's pins give exactly P-111's Mmoving, Mtweens, GM, GE gates and run voids; under the v9 pins the same records
  are void as "served not arm"; item mapping).
  Gates: Mmoving (> 50 WORSE when d > +1, > 34 when d > +2), Mtweens (O1.f1-f3, close.f1/f3 WORSE when d > +2 ms),
  GM and GE (> 50 WORSE when d > +2; any NEW 250 px cluster fails). Twins > 46 / > 54 reported; threshold-sensitive
  when a twin's verdict differs. Fewer than 3 valid runs per arm (per part): insufficient. With n = 3 per arm per G part,
  one void G run makes GM or GE insufficient; the VOID rule (re-run the hold once with the same items) covers it.
verdict: WORSE if any gate is WORSE or has a NEW cluster; else insufficient if any is; else no-worse (P-114's order).
  WORSE -> int-v8 splits by the reversal builds (v9 minus each of rev 7c, double-drive, scroll-cb, PR-021; build.mjs
  checks each) and reports to the lead.
predictions (int-v8, before data; mgmt-ops-10 fills the PREDICTIONS row from these):
  Mmoving no-worse 0.85 (rev 7c changes swipe commits, not the driver's direct morph; PR-021 halves the close's layouts in
    Chrome, 0.31 -> 0.16 per frame); Mtweens no-worse 0.75 (P-111's close keys were the WORSE gate for v8 vs v7, so the
    +2 ms close keys are the likeliest to tip either way); GM no-worse 0.85 (P-118: double-drive alone 0 at > 50 in GM);
    GE no-worse 0.80 (double-drive's future card and rev 7c's end spacer are both in part E's window); every sentinel
    passes on the first try 0.75; overall no-worse 0.60, insufficient 0.10, WORSE 0.30.
minutes: ~35-40 (H1 ~5, H2 ~4, H3 ~9, H4 ~9, gates, no pre-warm; mgmt-devices' plan).
```

Gaps closed (mgmt-ops-10's pre-data read of 5bd7eb4d, 9b272dd5): G1 PIN line at each hold start and the checkout named
(hold.sh, "checkout:" above); G2 the stale CLAUDE.md clause dropped and the decisive check cited (F-251), none new owed;
G3 H2 without warm-ups stated with its condition (same server processes and ports); G4 header P-120 and the lead's
ruling in place of "provisional / final set"; G5 the one-void-G-run note under the gates; G6 predictions per gate,
sentinels and overall; G7 the GESTURE_BUDGET_S check before H3/H4 and the pre-stated split.

### Amendment A2: the M leg re-driven from m = 0 (written AFTER H1's data was seen; lead ruling, option B)

**Disclosure.** This amendment was written after H1 ran (2026-10-04 23:29-23:34Z, exit 0, Serious and induced at
start and end, battery 31.6 → 32.6 C). int-v8 and mgmt-ops-10 both looked at H1's M data before writing it. An earlier
draft (A1) proposed dropping the M gates after that look. The lead rejected it as choosing the test after seeing the
data. A2 keeps P-111's M gates unchanged and changes only how the driver's start state is set, the same way in both arms.

**What H1 showed (H1's M leg is VOID; nothing below is counted).** mV2 and mV3 void with "5 tween starts in the probe
frames, expected 6 | driver tweens C1,O1,C2,O2,C3, expected O1,C1,O2,C2,O3,C3". The cause is a procedure mismatch.
P-098's driver (`window.__fwMorphDrive`, debug code inside the page JS) first scrolls to `__pinMax()`. On v8 the
panel is closed there (m = 0 at 5260). On v9, rev 7c makes the page end the open end: its scroll handler (`__msTick`)
has opened the panel (m = 1 at 6075, after the 100lvh spacer). So V's first tween was a close. mC1 and mC4 are valid
runs (held m=1 p95 17), but they count only as sentinels. Their tween and moving data are not reused in H2'.
Flagged figures (not counted, OBSERVED, from 2 void V runs). Sent to the rev 7c owner (fix-hero-exit-threaded) and to
fix-morph-gpu before step 5:

| H1, flagged, not counted | C = v8 (mC1, mC4) | V = v9 step 4 (mV2, mV3) |
|---|---|---|
| close first-frame dt, median (type-matched) | 28.5 ms (31 30 28 27 28 29) | 38.5-40 ms (39 36 41 38; 38.5 without V's first, scroll-opened close) |
| open first-frame dt, median | 35.5 ms | 37 ms (about +1.5) |
| moving frames > 34 / > 50 ms | 2 / 0, 2 / 0 | 6 / 1, 6 / 0 |

The close gap (about +10 ms) is above Mtweens' +2 ms limit. If H2' shows it again, P-120 is WORSE on Mtweens. Cause
UNRESOLVED. The rev 7c owner's suspects, both unchecked: a second morph writer per close frame (`__msTick` beside the
driver's tween), or the extra 100lvh of layout height. A Chrome call tree of one close frame per arm would separate
them (after P-120, not part of it).

**The precondition: one uncounted close in both arms.** The lead allowed either a spacer-start start or one uncounted
close first, whichever needs no per-arm procedure difference. A spacer-start start is impossible without changing the
arm bytes. The driver re-scrolls to `__pinMax()` itself, and it lives in the page JS, so editing it would change the
served C/V bytes (S3, and H3/H4 would be superseded). A probe-side driver would be a tools change. So A2 uses the
uncounted close, with no change to the arms or the tools. **This cut is how the lead's ruling "both arms drive from
m = 0" is implemented** (wording agreed by the lead): each record is cut at the first m = 0 after the first close, by
the same rule in both arms, so every counted tween sequence starts from m = 0.
- **Holds.** Both arms run the identical call: hold.sh item `n<arm><n>`, `iphone.mjs run --driver morph --cycles 4`
  (hold 2000 ms, as before). Each tween sequence then starts like this:
  - C: O C, then O C O C O C (8 tweens).
  - V: C (from rev 7c's open start), then O C O C O C (7 tweens).
- **Scoring.** score.mjs `trimM` applies one rule to every n record: drop everything up to the first frame at m = 0
  after the first close. It cuts the driver's rows, the probe frames (the drive mark now starts at the cut) and the
  probe's tween list alike. It then hands P-111's `scoreM` the counted window: O1 C1 O2 C2 O3 C3 from m = 0, with
  P-111's EXPECT (6 tweens) and gates unchanged.
- **Void rules.** A record that does not fit is void ("run error: A2 ..."):
  - cycles not 4;
  - no close back to m = 0;
  - more than one open before the first close;
  - driver and probe cuts more than 50 ms apart;
  - dropped probe tweens not equal to dropped driver tweens;
  - no data: zero moving frames after the cut (also when the item exited 0).
- **Sentinel.** The C sentinel stays the tool's own (held m=1 p95 <= 18 ms over the run).
- **Not pooled.** H1's `m` items are refused: hold.sh ends such a hold VOID before its gate, and score.mjs refuses a
  block that mixes `m` and `n` items. H1's C tween data is not reused.

**Exit-code rule (lead, after H3a).** H3a (23:40Z) printed VALID although WDA was down and every gesture exited 1. From
the A2 pins on, hold.sh does three things:
- It runs `iphone.mjs wda check` before the gate of any hold with a G item (I-112). Non-zero means HOLD VOID, no run.
- It prints `ITEM <I> VOID` for any item that exits non-zero or writes no run file.
- It ends the hold `HOLD <H> VOID counted item(s) failed: ...` (exit 6) when a counted item (n.., g..) failed. It does
  this after the end gate and the sleep check, so the log is complete.

An item that exits 0 but leaves no data is void in the scorer too:
- a missing or empty record (P-111's "no run record" / "no record");
- an n record with zero moving frames after the cut;
- a G record with zero moving frames (scrollY changes) in its part window. score.mjs `gNoData` reports this through
  run.errors, so P-111's scoreG voids it.

**G leg: stopped after H3a2 (lead rulings, 2026-10-05 ~00:00Z).**
- **H3a is VOID:** WDA was down and every gesture exited 1.
- **H3a2** (re-run, 23:49-23:56Z, gates PASS 34.7 → 35.8 C, every item exit 0, PIN head 63904a76) is VALID as a
  record, but its GM numbers are not evidence. On v9, part M's flings take a different path. The settled y after each
  fling of flick-middle-v1 (OBSERVED, from the records' `untils`):
  - C (v8) gMC1: 1995, 5220, 1738, 5220, 1702, 5184, 1649. Settles take ~3.2 s.
  - V (v9) gMV1: 2011, 6035, 5240, 6035, 5240, 6035, 5241. Settles take ~0.5 s. gMV2 is the same.
  - P-111's two arms (v8 vs v7) both moved like C, with ~26-27 s part-M windows.

  After the first fling, every fast down-fling from v9's page end (6035, rev 7c's open end) stops at the closed rest
  (~5240), one screen up. So V never re-crosses the middle (people, pain, commission). The windows differ too:

  | H3a2 part M (not evidence) | window | moving frames | > 50 / > 34 ms |
  |---|---|---|---|
  | gMC1 (C) | 27.0 s | 957 | 0 / 2 |
  | gMV1 (V) | 13.2 s | 225 | 0 / 4 |
  | gMV2 (V) | 13.3 s | 222 | 0 / 3 |

  **GM is INSUFFICIENT (not comparable) for P-120**, not no-worse. The registered absolute counts would compare a long
  mid-page path with a short end-screen path, which favours V. No rate gate is swapped in after this look.
- **H3b and H4 are not run.** GE is not run under P-120. Part E (flick-end-v1) flings out of the page end with the
  same down-fling (560 px / 140 ms) that stopped at ~5240 in part M, so it is affected the same way. This is an
  inference from H3a2's part-M records; no part-E run was spent on it.
- **P-121.** A path-matched G driver is registered as its own ticket, with this look disclosed. It will have identical
  scripts for both arms, a path-coverage gate that VOIDs end-screen runs, and window length and moving frames reported.
  It is not an amendment to P-120.
- **The cause (rev 7c owner's code read, OBSERVED + code; lead ruling 2026-10-05).** On v9, a fast fling away from
  the page end stops after one screen, so leaving the end takes two flings. This is rev 7c's touchend finger rule:
  from the open end, any close-direction release fires a smooth scrollTo to the closed rest, at any speed. That cancels
  iOS momentum. It is not a snap. It is a regression from rev 7b, which was never tested for flinging away.
  - rev 7d will release fast flings (> 5 px/ms). It goes to the Simulator, then G, then the user's finger A/B.
  - v9 step 4 is rebuilt with rev 7d after it lands. That supersedes this V arm (S3).
  - So H2' is **not** run on the rev 7c arm. The next phone segment runs against the rev 7d build, with re-registered
    arms.
  - A code read of step 4 found that nothing outside rev 7c's own morph-scroll block (JS 14180-14520) reads the
    `__ms*` state or relies on the scrollTo to the closed rest. double-drive, scroll-cb-phone, hero-exit and
    nav-hit-test are driven by scroll position or by the touch flag alone.
  - The A2 cut is still needed on rev 7d unless `__msTick` changes. A drive reaches `__pinMax` with the morph open
    through the scroll callback's `__msTick`, not through touchend.
- **P-120's overall verdict** on the rev 7c arm can now only be WORSE (from Mmoving or Mtweens) or insufficient. The
  no-worse line for the best-build switch also needs P-121.

**Real-driver check before H5 (the lead's re-sign precondition).** One real cycles-4 pass per arm on the Simulator (WebKit),
run with the committed A2 scorer:
- How: int-v8's own normal chrome-measure hold, `sim.mjs session` (not functional: `run` is refused there), then
  `sim.mjs run --driver morph --cycles 4 --arm C|V` on the P-120 servers' C/V ports. It runs right after this commit
  (the G leg is stopped, so no H4 window is needed).
- Reported: the cut lands on m = 0; the driver and probe cuts are <= 50 ms apart; 6 counted tweens O1..C3 per arm.
- No timing number is used. Simulator numbers never pool.
- The records stay gitignored (out/pv9/sim/).

**H2' (replaces H2; runs only after the Simulator check, mgmt-ops-10's re-check and the lead's re-sign; not on the
rev 7c arm: the rev 7d rebuild re-registers the arms first, see "G leg" above).**
- Holds: H5 `wC wV nC1 nV2 nV3 nC4` · H6 `wC wV nC5 nV6 nV7 nC8`. Fresh C V V C C V V C, n = 4 per arm, warm-ups in
  both holds. If a hold does not fit 600 s: H5a `wC wV nC1 nV2` · H5b `wC wV nV3 nC4` (H6 the same way).
- Same servers and ports as H1/H3a2, the same served-hash check before every item. The PIN line is checked against
  the new pins below; everything else is unchanged.
- M gates (P-111's, unchanged): Mmoving > 50 WORSE when d > +1, > 34 when d > +2. Mtweens O1.f1-f3, close.f1/f3 WORSE
  when d > +2 ms. Needs >= 3 valid runs per arm.

**Stop rule (lead).** If more than 1 of 4 n runs per arm void for "more than one open before the first close" or
"cuts more than 50 ms apart", int-v8 stops and reports to the lead. No re-run around it.

**Self-test** (selftest.mjs, SELFTEST OK 65 checks). The 15 P-111 checks are unchanged. The A2 checks, on H1's records:
- (5) The open-start replay: mV2 and mV3 fail P-111's EXPECT as `m` items, and are void as `n` items (cycles 3).
- (6) Synthetic cycles-4 replays from H1's real rows, for the self-test only and never scored. Each run's last
  open..end segment is appended once:
  - V (open start, 7 tweens) and C (8 tweens) both cut to exactly O1..C3 from m = 0, with no void.
  - V's counted O1 / C1 equal its original O1 / C2; C's equal its original O2 / C2.
  - The drive mark starts at the cut.
  - The driver and probe cuts land on the same frame.
  - Untrimmed, the same records void (mutation check by hand).
- (7) The three void rules.
- (8) A block mixing m and n items is refused.
- (9) The hold.sh text: n items get `--cycles 4`, m items are refused, and wda check runs before a G hold.
- (10) VALID is refused on a failed item: a non-zero exit or a missing run file marks the item void, a failed counted
  item voids the hold, and that check comes before the VALID line. In the scorer these are void: an n item with no
  record or an empty one, an n item with zero moving frames after the cut, and a G record with zero moving frames (a
  real P-111 G record is not).

**Pins (A2).** hold.sh, score.mjs and selftest.mjs are the blobs of the amendment commit; their sha256/12 is in the
re-sign request. serve.sh, P-111's scorer, thermal-gate, verdict, pmcheck, the flick scripts and HASHES.txt are
unchanged. A PIN line with any other value voids that hold. H1, H3a and H3a2 ran on the original pins (head 63904a76).

**Predictions.** The pre-look values, registered in the ticket above before any data, stand as registered and are
scored. A2 adds post-H1-look values beside them, not blind (written after the flagged close gap):

| | pre-look (registered) | post-H1-look (A2) |
|---|---|---|
| Mmoving no-worse | 0.85 | 0.65 |
| Mtweens no-worse | 0.75 | 0.30 |
| GM / GE no-worse | 0.85 / 0.80 | moot: GM insufficient (not comparable), GE not run |
| overall no-worse / insufficient / WORSE | 0.60 / 0.10 / 0.30 | 0.25 / 0.10 / 0.65 (written before the G ruling; P-120 can now only be insufficient or WORSE) |

If WORSE: the ticket's split by reversal builds, rev 7c first.

## P-121: path-matched G driver (DRAFT for the pre-data read; written AFTER H3a2's G records were seen)

**Disclosure.** P-121 was written after H3a2 (P-120's G hold, 2026-10-04 23:49-23:56Z) was seen. Those records showed
that flick-middle-v1 takes different paths on the two arms. Settled y after each fling (OBSERVED, from the records'
`untils`):
- C gMC1: 1995, 5220, 1738, 5220, 1702, 5184, 1649.
- V gMV1: 2011, 6035, 5240, 6035, 5240, 6035, 5241 (gMV2 the same).

| H3a2 run | part-M window | moving frames | traversals of [2200, 3800] |
|---|---|---|---|
| C gMC1 | 27.0 s | 957 | 6 |
| V gMV1 / gMV2 | 13.2 / 13.3 s | 225 / 222 | 1 / 1 |

P-111's 12 G records (v8 vs v7) all cover their paths: part M has 6 traversals in 25.0-27.6 s with 766-903 moving
frames, and part E has 3 traversals in 16.2-17.5 s. The lead ruled P-121 a new ticket, not an amendment to P-120
(P-120 closed INSUFFICIENT). P-122 (v9 step 4 rebuilt with rev 7d, vs v8) uses it for its G legs.

**Fling speed (OBSERVED, F-258; replay only, no new run).** The page's own `__msFv` (rev 7c/7d JS
14290-14300) was replayed on the G records' touch logs. v1's "fling" stroke (560 px / 140 ms, nominal lift-off
6.6 px/ms) lifts off at 3.0-7.4 px/ms (close direction −3.2 to −6.3). This straddles rev 7d's first rule
(Fv ≤ −5). rev 7d's rule is now Fv ≤ −5 OR finger travel ≥ 300 px since touchstart (fix-hero-exit-threaded, from
this replay; not final). All P-121 thresholds come from rev 7d's final rule, registered with P-122.

**Scripts** (`phone/p121/`). The parameters are placeholders until the calibration picks and pins them:
- `flick-middle-v2.json` (part M, items gM): flick-middle-v1's structure with weaker flings, calibrated to travel
  about 2000-2500 px. Each fling swings over the middle (about 1900 to 4200), so it reaches neither v8's end (5220)
  nor v9's end screen. Even on rev 7d, v1's up-fling would reach V's open end (6035) but v8's 5220.
- `flick-end-v2.json` (part E), variant `speed`:
  - **fast** (items gEf): long out-flings (560 px of finger travel, the fastest lift-off the compiler allows) that
    rev 7d's rule releases.
  - **slow** (items gEs): short out-flings (under 300 px of travel, Fv well inside the threshold) that rev 7d catches
    at the closed rest, like the user's own closes (74-255 px).
  - Into-flings run until `atEnd`, so each arm starts at its own end.

**Gates per run** (`phone/p121/gate.mjs`). A failing run is VOID and not scored. Next to the gate counts, every
result reports: window length, moving frames, max y, maxScroll, fling settle ys, and each flick's Fv and travel.
- **gM:** at least 5 traversals of [2200, 3800], and max y < 5000 in both arms. A run that reaches either end is VOID.
- **gEf:** for each out-fling (marks out1, out2):
  - the out stroke must meet the release rule (Fv ≤ −fv OR travel ≥ travel), else VOID "not released by the rule";
  - the fling must leave the end: maxScroll − min y until the next mark ≥ 1600 px, else VOID "path not covered";
  - a stroke within 0.5 px/ms or 20 px of either line is flagged near-line.
  - gEf is gated no-worse like P-111's GE: dt > 50, median difference ≤ 2, with the twins.
- **gEs:** each out stroke must meet neither condition, with those margins, else VOID "too fast for the slow item".
  - On V an absolute ceiling applies: dt > 50 = 0 in the part window. The ±4 ms twins (> 46, > 54) are reported, and
    frames in (46, 54] are flagged. A hitch inside V's own smooth scrollTo to the closed rest is user-visible.
  - Otherwise gEs is report-only (per arm: counts, window, moving frames, settle y, Fv, travel). The paths differ by
    design: V catches, C travels on.

**Self-test** (`phone/p121/selftest-g.mjs`, SELFTEST-G OK 36):
1. The Fv replay matches the page's formula on hand-made touches.
2. H3a2's V gMV1/gMV2 VOID on traversals (1) and max y (6035). H3a2's C gMC1 and P-111's six part-M records cover
   the band (≥ 5 traversals) but VOID on max y ≥ 5000 (v1 reaches v8's end, which is why v2 exists). A synthetic
   mid-page copy passes.
3. P-111's six part-E records pass gEf (released by travel 560, leave the end by 3342-3672 px). A synthetic caught
   copy VOIDs, and so does a rule they don't meet.
4. The same records VOID as gEs ("too fast"); a synthetic short stroke passes. A near-line stroke (Fv −5.37) is flagged.

**Calibration** (lead OK; mechanism only, uncounted, disclosed; baseline B only, never an arm):
- **(a) Simulator.** A sweep in int-v8's own normal hold (`sim.mjs gesture` is refused in functional sessions): the
  middle travel versus flingPx/flingMs, plus the gEf/gEs out-strokes' Fv and travel.
- **(b) Phone.** One uncounted calibration hold (slot via mgmt-devices, no-timing, the thermal gate at its start).
  The Simulator samples touches every 17 ms against the phone's 9 ms, so Fv does not transfer.
- The chosen parameters are pinned in this README and the scripts before any P-122 hold.

**Items, order, pre-data read.**
- Fresh C V V C holds: gM ×6, gEf ×6, gEs ×4. H3a2 is disclosed as seen above.
- Per F-256 (LEAD.md "Slot tickets"), P-122's pre-data read includes a Simulator dry run per arm, on the rev 7d
  arm once it exists, showing the same start state and gesture path for M (cycles 4) and G (v2 scripts).

**Pre-data read (mgmt-ops-10, 2026-10-05): passes with conditions C1-C6.** Answers written before any calibration
or arm data:
- **C1, pinning commit.** One commit before any P-122 hold sets flingPx/flingMs, outFast/outSlow and `RULE` (fv,
  travel, margins) to rev 7d's final rule. It lists the calibration records (the Simulator sweep and the phone hold,
  baseline B only) with their sha256. ops re-reads that commit (blobs on disk, selftest-g, and no arm data older
  than the commit) for the final PASS.
- **C2, gEf cluster rule: option (b).** gEf's path is the 1600 px next to each arm's own end (V about 6075 to 4475,
  C about 5260 to 3660). P-111's NEW-cluster rule binned absolute scrollY. With that rule every V cluster above 5260
  (the spacer and end screen) would be NEW, because C has no frames there. So gEf bins clusters by distance from each
  arm's own end, d = maxScroll − y, with P-111's fixed 250 px bins, its ≥ 2-valid-runs cluster test and its neighbouring-bin clearance applied to d. Clusters binned by absolute y are reported
  next to them, as information only. Every result reports each arm's y-range (min y, max y, maxScroll) per run.
- **C3, gEs (n = 2 per arm).**
  - A void V or C run gets one re-run, at the end of the same block in its slot's place. A second void in an arm
    makes gEs INSUFFICIENT (reported; it does not by itself fail P-122's other legs).
  - V's ceiling (dt > 50 = 0, twins > 46 / > 54 reported, (46, 54] flagged) counts the whole part window, from the
    into1 mark to the end mark. That window includes both out-strokes, the catches and their scrollTo to the closed
    rest. The out1→into2 and out2→end sub-windows are reported separately.
- **C4, F-256 dry run.** The Simulator dry run per arm on the rev 7d build must show, on both arms: gM ≥ 5 traversals
  with max y < 5000, gEf released with fromEnd ≥ 1600 for out1 and out2, and gEs out strokes not released. A failing
  arm stops P-122 until the scripts are re-calibrated, with a new pin and a new pre-data read.
- **C5, predictions for P-121's own outcome** (written before the calibration):
  - P(the calibration finds parameters that pass gM on B): **0.80**. v1's 560 px fling already gives 6 traversals;
    the risk is a weaker fling that no longer clears 3800 from the lower turn.
  - P(the F-256 dry run passes every path gate on both arms first try): **0.45**. The risks are Simulator touch
    sampling (17 ms) moving gEf/gEs strokes across the line, and V's end screen changing where the into-flings stop.
  - The no-worse predictions for gM, gEf and gEs go in P-122's row.
- **C6, nav-hit-cache in the P-122 plan (lead's ruling).** Byte-diff the rev 7d rebuild against v9 step 4 first.
  If only rev 7d's touchend lines changed, task-mode parity carries over, with a diff note from fix-nav-morph.
  Otherwise fix-nav-morph re-runs parity part 1 (mobile and desktop) on the new V/VA pins. nav-hit-cache's
  patch-on-v9s4.diff (13d29af1) must apply cleanly to the rebuild either way.

**A2 Simulator check (cycles 4, mechanism only; head c57d6a7d, score.mjs fd9ecebcf4d0; records out/pv9/sim/a2-nC.json
674ee127df1a, a2-nV.json 3954a5579963).** PASS on both arms: the cut is at m 0.001 on driver and probe, the two cuts
are 0 ms apart, and 6 tweens follow the cut (0→1, 1→0, three times; O1..C3); trimM does not void. The lead re-signed
A2 on it (main e87cb802). Carried into P-122's pre-data read:
- **Known difference, not a void.** C and V start in different states: C has 1 open before the first close (8 tweens
  before the cut), V has 0 (7 tweens). The cut at the first m = 0 after the first close absorbs it: trimM's
  driver/probe open-count check matched on both arms.
- **Disclosure.** The first scoring run showed check 3 failing. The cause was the scratch check script, not the data:
  it read `tween.to`, which records do not carry (a tween has only `from`; the target is 1 − from). After the fix,
  check 3 passes on both arms. score.mjs's trimM reads `from` only and is unaffected.
- **Build served.** This check served V = v9 step 4 (JS de237379b556), not the rev 7d rebuild. P-122's F-256 dry run
  repeats it on the rev 7d build (mgmt-ops-10 re-check, 2026-10-05). rev 7d's own phone G count check is P-124.

**P-121 calibration and pin (C1).** Baseline B only, never an arm; mechanism only, uncounted, disclosed. Every
record lives under the gitignored out/p121/ and is listed by its sha256/12.

(a) Simulator: 2 shared simulator slots, 00:45-00:56Z, `sim.mjs gesture --count-only` (I-184), so no frame log.
Traversals and max y below come from the settle ys and stroke start ys. The Simulator samples touches every 17 ms, so
its Fv does not transfer to the phone.

| item | settle ys | traversals | max y | gate | record |
|---|---|---|---|---|---|
| m300 | 2037 / 4258 / 2108 / 4299 / 2109 / 4130 / 1923 | 6 | 4299 | gM pass | sim/m300 8f79bb694d08 |
| m380 | 2040 / 4812 / 2040 / 4829 / 2058 / 4829 / 2269 | 5 | 4829 | gM pass, marginal | sim/m380 b481c230cad8 |
| m460 | reaches 5220 twice | 6 | 5220 | gM VOID (end reached) | sim/m460 cdf3989912e9 |
| efast | out1 Fv −7.2 / 560 px, settle 2364; out2 Fv −13.19 / 560 px, settle 964 | | | gEf pass | sim/efast 59cb106adf96 |
| eslow | out Fv −1.29 / −1.55, 180 px | | | gEs pass | sim/eslow a9ba6c78d2a7 |

(b) Phone: one no-timing hold, 01:03:45-01:08:41Z, 296 s, exit 0, head e87cb802, profile xcode-serious.
- Thermal: the start gate passed (Serious, induced, battery 29.4 °C). At the end it was still Serious, induced,
  32.6 °C, profileDrift false. Slot from mgmt-devices; the lead put it ahead of P-124.
- Records are full G records, read with gate.mjs. The hold's end stamp (meta.profile.end) rewrote each record after
  its run line printed a hash, so the hashes here are taken after the hold.

| item | settle ys | traversals | max y | gate | record |
|---|---|---|---|---|---|
| m260 | 2005 / 3909 / 2241 / 3757 / 2203 / 3728 / 2115 | 2 | 3909 | gM VOID (< 5) | phone/m260 534021e0d23c |
| m300 | 2005 / 3917 / 2022 / 3891 / 2075 / 3944 / 2074 | 6 | 3944 | gM pass, marginal (high turns only 91-144 px above 3800) | phone/m300 4ca596f3b76e |
| **m340** | 2000 / 4165 / 2095 / 4200 / 2095 / 4200 / 2096 | 6 | 4200 | **gM pass**: high turns +365-400 over 3800, low turns 104-105 under 2200, max 800 under 5000 | phone/m340 62e06d7315bb |
| efast | out1 Fv −6.83 / 560 px, out2 −7.11 / 560 px; released by fv and travel; fromEnd 4487 / 4509; not near-line | | | **gEf pass** | phone/efast c2a8cd30df7f |
| eslow | out1 Fv −2.23 / 180 px, out2 −2.10 / 180 px; not released; outside the margins | | | **gEs pass** | phone/eslow ad0cd8beaf9b |

Phone flings travel less than the Simulator's (m300: about 1850 px on the phone against about 2000 on the
Simulator).

**Pinned:**
- flick-middle-v2: flingPx **340**, flingMs 140. On the phone it is the only length tried with margin on both sides of
  the band.
- flick-end-v2: unchanged. Fast out-strokes 560 px / 130 ms, slow out-strokes 180 px / 120 ms, into-flings
  560 px / 140 ms, gap 350 ms.
- gate.mjs: unchanged (RULE fv 5, travel 300, margins 0.5 px/ms and 20 px; LEAVE_E 1600).

RULE equals the rev 7d candidate's rule: snapshot ms-29c0d537e0c9, release at Fv ≤ −5 px/ms OR travel ≥ 300 px
(fix-hero-exit-threaded, Simulator s1/s2). If rev 7d lands with different values, RULE and this pin are redone in a
new commit, followed by a new read, before any P-122 hold. No arm data exists at this commit.

**Follow-up notes to P-121 (mgmt-ops-10's final read, PASS, 7d264c29; written in this later commit, 8f8f78da is not
rewritten):**
- **N1.** The first Simulator sweep slot (00:36Z) ended with exit code 124: `lock.mjs run --max-seconds 300` killed the
  session at its cap after m380, efast and eslow had been saved; the loop went on in slot 2 (m300, m460). Like every
  calibration record, the slot-1 records (sim/m380, sim/efast, sim/eslow) are uncounted information.
- **N2.** P-122's holds check the compiled programs, not only the script files: before the gate, `hold122.sh` compiles
  each G part in the hold (`iphone.mjs gesture --dry-run`) and VOIDs the hold (exit 4) unless GESTURE_HASH/12 equals the
  pin: middle (flingPx 340) 607b59612abb, end fast 21aaafd3a9fd, end slow 7312cdcd2574 (and P-122's return script, below).

## P-122: v9 step 4 as built (rev 7c) vs v8, phone no-worse check (FIRST DRAFT, SUPERSEDED: never signed, no P-122 data; retargeted to v9-final in "P-122 (v9-final)" below)

**Why on rev 7c.** The user's PR-023 decision (2026-10-05 04:45Z) keeps rev 7c in v9; rev 7d is rebuilt on v9-final
after v9 lands. The lead's ruling (user T-159 #32): v9 no longer waits on PR-023, P-122 registers on step 4 as built.
So P-122's arms are P-120's arms (same snapshot copies, servers and served-hash check), and C6 (the rev 7d byte-diff
and nav parity note) falls away: nav-hit-cache's parity was measured on this exact step 4 (13d29af1).

**What rev 7c changes for P-121's gates (known before any P-122 data; disclosed).** Rev 7c's touchend rule catches
every close-direction release from the open end at the closed rest (H3a2, F-258; the cause section under P-120). So on
V a fast out-fling never leaves the end: P-121's gEf ("released by the rule, leaves the end by >= 1600 px") cannot pass
on V by design. C4 as written ("gEf released with fromEnd >= 1600 on both arms") was written for the rev 7d arm. P-122
therefore gates part E by V's own catch path (option (a) below, int-v8's proposal; the lead picks at the sign):
- **(a) proposed.** gX (P-121's fast items) and gS (slow items) run on both arms. C keeps P-121's path gates and is the
  reference (reported, not gated: the paths differ by design, catch vs travel on). V's out strokes must still be the
  scripted strokes (fast: the rule's stroke criteria; slow: neither, with the margins); V's catch is reported
  ("caught" = fromEnd < 1600), never a void. Gate: the V ceiling, ops' C3 rule for gEs, on both E parts.
- (b) gEf as registered: INSUFFICIENT on rev 7c; part E answered only on the rev 7d build later.
- (c) part E dropped from P-122.

```
PHONE TICKET P-122 v9-best · less-work no-worse check, v8 C vs v9 step 4 V (rev 7c), P-121's path-matched G driver
  · runner iphone-runner · verdict owner int-v8 · registered before any P-122 data; no counted run before the lead's
  sign and mgmt-ops-10's pre-data read
build: V = v9 step 4 = fixes/v9-best/patch.diff 883b6f86b90f (v8 + PR-018 rev 7c + double-drive + scroll-cb + PR-021 rev 3),
  JS de237379b556dc898bcabb49f7940c7d5b58c6f920d9089f0c1752bf5c08cd5d, CSS e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
control: C = v8 = fixes/v8-best/patch.diff, JS 3e3e94cb6e9f…, CSS f836404b3728… (full sha256 in P-120's ticket).
  Mirror snapshot b1789284481295-4ad4a84a. B = plain baseline (the gate's timer page).
copies and servers: P-120's, unchanged: out/pv9/snap/{C,V} (read-only, HASHES.txt 46c5a6e38b7a), serve.sh fc643888a9bc
  (plain http, --port 0, --latency 150, --vendors=local), served-hash check before every item (exit 4 on a wrong one).
question: under xcode-serious, does v9 step 4 add slow frames over v8 (a) in the menu morph's open/close at the page end
  (M leg, A2), (b) in flicks through the middle of the page (gM), (c) in flicks into the page end and out again (gX, gS:
  on V the out-flings are caught at the closed rest by rev 7c; the catch path itself must stay clean)? Plus one report
  case for rev 7c's known limit I-179 (gR). No-worse only; landing basis as P-120 (less-work rule).
profile: xcode-serious, as P-120 (Xcode Device Conditions Serious, induced; thermal-gate.mjs --accept-induced at the
  start and end of every hold; no pre-warm, no cooling wait; ceiling 44 C or Critical; gate exits 2/3/7 void the hold).
sentinels: every counted C M run (held m=1 p95 <= 18 ms) and sCo/sCc (S on C: bottom >= 58 fps, scroll >= 44 fps); a
  failing sentinel voids every run since the last passing one; the hold is re-run once with the same items.
checkout: int-v8's worktree; hold122.sh prints one PIN line per hold (ticket, profile, checkout, HEAD, sha256/12 of
  hold122.sh, p122/score.mjs, serve.sh, P-120's score.mjs fd9ecebcf4d0, P-111's score.mjs 26d944bf93e2, gate.mjs
  1a1d716698f0, thermal-gate ecb403b3ad25, verdict 8edb2fc77795, pmcheck d36bd7437b7c, flick-middle-v2 ca38f3627f78,
  flick-end-v2 4eb4bbc62b43, flick-return-v1 (pinned below), HASHES.txt 46c5a6e38b7a) and one PROG line per G part
  (N2: compiled program GESTURE_HASH/12 M 607b59612abb, X 21aaafd3a9fd, S 7312cdcd2574, R pinned below). Any other
  value voids that hold. hold122.sh, score.mjs and selftest122.mjs = the blobs of the registering commit.
holds (each <= 10 min, inside the runner's exclusive no-timing chrome-measure hold; GESTURE_BUDGET_S 150 per G run):
  M leg   H1 wC wV nC1 nV2 nV3 nC4 · H2 wC wV nC5 nV6 nV7 nC8   (A2: --cycles 4, the cut at the first m = 0 after the
          first close; if a hold does not fit 600 s: H1a wC wV nC1 nV2 · H1b wC wV nV3 nC4, H2 the same way)
  part M  H3a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H3b sCo gMC2 gMC3 gMV3 sCc
  part X  H4a sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · H4b sCo gXC2 gXC3 gXV3 sCc
  part S  H5 sCo wgSC wgSV gSC1 gSV1 gSV2 gSC2 sCc   (C3: a void run gets one re-run at the block end in its place)
  part R  H6 sCo wgRV gRV1 gRV2 gRV3 sCc             (V only: v8 has no extra screen; report)
  then iphone.mjs park; int-v8 stops the servers after the last hold.
scorer: fixes/v9-best/phone/p122/score.mjs (imports P-120's score.mjs and P-121's gate.mjs, both pinned; P-111's
  scoreM/scoreG/gate/clusters/applySentinel unchanged). Path gates per run (a failing run is VOID, never scored):
  gM gateM (>= 5 traversals of [2200, 3800], max y < 5000); gX C gateE fast (released stroke, leaves the end >= 1600 px),
  V the same stroke criteria only (caught reported); gS gateE slow (both arms); gR >= 1 ret stroke lifts with p in
  (-0.20, -0.05]. Gates: Mmoving (> 50 WORSE d > +1, > 34 d > +2), Mtweens (O1.f1-f3, close.f1/f3 WORSE d > +2 ms), GM
  (> 50 WORSE d > +2, any NEW 250 px cluster), EX and ES (V ceiling: 0 frames > 50 ms in the part window into1..end over
  all valid V runs; twins > 46 / > 54, threshold-sensitive when one differs; (46, 54] flagged; sub-windows out1..into2,
  out2..end reported; min valid V runs 3 for EX, 2 for ES). R report only: per ret stroke p at lift, lowest p, returned
  to the open end with no finger down and the delay (finger-returns.mjs's rule: left below p -0.15, back at p >= 0.98).
  Fewer valid runs than the minimum: insufficient. Self-test: selftest122.mjs (SELFTEST-122 OK, count in the sign request).
verdict: WORSE if any gate is WORSE or has a NEW cluster; else insufficient if any is; else no-worse. WORSE -> int-v8
  splits by the reversal builds (v9 minus each of rev 7c, double-drive, scroll-cb, PR-021) and reports to the lead.
F-260 (report only, every run): the Analytics 90 % depth line y90 = 0.9 docH - vh, the time the run first reaches it,
  and whether that is inside the scored window. Known vendor difference: v9's 100lvh runway moves the line (Chrome
  430x932: v8 y 4718, v9 y 5557, inside the first open; gtag's scroll task 65-67 ms at 6x, OBSERVED in Chrome; whether
  Safari fires it there is not checked). M leg: the A2 cut excludes the first open. gX/gS/gR: into1 crosses y90 inside
  the window on both arms (each run reloads). A > 50 ms V frame at the first into1 crossing is reported next to the gate.
predictions (int-v8, before data):
  Mmoving no-worse 0.65 and Mtweens no-worse 0.30 (A2's post-H1-look values, the same arms; H1's flagged close gap
    about +10 ms); GM no-worse 0.80 (double-drive alone 0 at > 50 in P-118's GM; the middle path is the same on both
    arms); EX passes the V ceiling 0.55 and ES 0.60 (the catch path is short and stays near the end, but into1 crosses
    the first open and F-260's line inside the window); R: at least one return to open among V's in-range ret strokes
    0.55; every sentinel passes first try 0.75; overall no-worse 0.15, insufficient 0.15, WORSE 0.70.
minutes: ~70 (H1 ~5, H2 ~5, H3a/b ~8+6, H4a/b ~8+6, H5 ~8, H6 ~6, gates; no pre-warm).
```

## v9-final build (without scroll-cb and the close rule; lead rulings 2026-10-05 ~05:35Z and ~06:10Z)

`build.mjs` mechanisms added for steps 5 and 6, both covered by the script's checks:
- `after`: an order constraint. Rev 7c's 3-line context meets nav's inserted lines, so nav comes after 7c and the glue
  after both. Illegal orders are skipped, and v9 minus X also takes out every component that comes after X.
- `JOINS`: the owners' joined builds, checked whenever all their keys are in the set.
- `DROPPED`: components kept in the file with their pins but not built (scroll-cb, the close rule).
- Snapshot name: `out/v9/snap-<js12>` is reused only when its HASHES.txt lists exactly the build; otherwise the snapshot is
  `snap-<js12>-<css12>`. The build without close has the same JS as the one with it.

**First v9-final (superseded, never phone-checked):** ms7c + dd + scb (carry over dd) + earn + nav + glue + close =
c3d36476c3ce / bdecf48c5b32 (patch.diff 00431ca662cb), 05:18Z. All 420 legal orders gave the same bytes, the three joins
matched (step 4 de237379b556 / e1359ab9994a; fix-nav-morph's arm A c3d36476c3ce / e1359ab9994a; fix-morph-gpu's arm A
de237379b556 / bdecf48c5b32), CHECK OK (`out/v9/check-final.json`).

**The gM split (Simulator, COUNTS ONLY, `sim.mjs gesture --count-only`, flick-middle-v2 flingPx 300, one run per build;
out/p122/split; OBSERVED, host load1 up to 176):** the Simulator dry run (P-122 below) showed V's first page-up fling in
the middle 500-950 px short of C's. Each build is step 4 minus one component (`--only` builds):

| build | settled y after each stroke | first page-up fling |
|---|---|---|
| C v8 | 2040 / 4245 / 2041 / 4232 / 2089 / 4280 | 2204 |
| step 4 (ms7c+dd+scb+earn) | 2040 / 4230 / 2564 / 4756 / 2661 / 4827 | 1666 |
| first v9-final (step 4 + nav + glue + close) | 2037 / 4227 / 2972 / 5163 / 2973 / 5168 | 1255 |
| step 4 minus ms7c (0694064c48f8) | 2035 / 4226 / 2971 / 2971 / 758 / 2364 | 1255 |
| step 4 minus dd (7b16e61bb6cc) | 2040 / 4230 / 3062 / 5220 / 3030 / 5220 | 1168 |
| step 4 minus scroll-cb (366636504b84) | 2040 / 4258 / 2068 / 4260 / 2237 / 4310 | 2190 |
| step 4 minus earn (= step 3) | not run (cancelled while still queued; the lead: don't wait for it) | - |

In this one-run-per-build split only the build without scroll-cb gave C's first page-up fling, and the lead dropped
scroll-cb on that basis. **Correction (fix-scroll-cb, 05:47-06:06Z, the same gM path, 4 shared slots, rotated arms;
Simulator, OBSERVED):** the short first fling also happens without scroll-cb. First page-up fling in px:

| build | runs |
|---|---|
| v8 | 2035, 2190 |
| step 4 (with scb) | 2191 |
| step 4 minus scb | 2071 |
| first v9-final (with scb) | 1777, 2191, 2200 |
| v9-final with close, minus scb | 1777, 1256, 2191 |

- A short run launches slower and decelerates smoothly; nothing cuts it off.
- Each short run has a 69-123 ms main-thread frame near liftoff, a 50 ms hole in the touchmoves and a toolbar resize in
  the same window, with or without scb. Every touch was non-cancelable.
- No scb code writes scroll position, overflow or scroll-behavior.
- Whether WebKit launches a slower fling when the main thread is busy is UNRESOLVED (no WebKit source checked).
- The split's short runs also ran at higher host load (load1 106-167) than its build without scb (49-74).

So the **scroll-cb drop is a lead ruling, not a proven cause**. The first-fling shortfall depends on load and on the
main thread, and it is seen without scroll-cb (Simulator, OBSERVED). The phone parity rule below counts a gap only when
the median is over 300 px AND at least 2 of 3 pairs are, which guards against a one-off short fling. **Lead ruling
(~06:15Z):** scroll-cb stays out of v9 and comes back in v9.1 together with the close rule, so that is one follow-up
check, not two re-pins.

**Second v9-final (with the close rule; superseded, never phone-checked):** ms7c + dd + earn + nav + glue + close =
647c9ef2b1e2 / bdecf48c5b32 (patch.diff 3e154c4f44e0), 05:38Z (`out/v9/build-noscb.log`; 120 legal orders, join step 4
minus scb matches, reversals ok).
- CHECK OK (`out/v9/check-final2.json`; mobile 1580 → 1581 elements, desktop 1423 → 1423, 0 errors, 0 4xx, morph
  reached).
- px-chrome: consistent within 0.31 %.
- dom-count: the same counts as step 4.
- Simulator confirm, n = 2 each, host load1 up to 34: first page-up fling C 2190 / 2190, V 2190 / 2191 (pass).
- **The census showed extra style work at rest** (`out/v9/looks-final2.log`), so the lead dropped the close rule.

**Rest-work split (Chrome, counts only; census = research/design-engineering/frame-audit/census.mjs via
`gates/census-run.mjs`, headless 430x932 DPR 3, no throttle, 6 s rest windows, one load per row; OBSERVED, cause
unknown; `out/v9/rest-split.log`, arms in `out/v9/snap-rev/{A,V,N,K}`):**

| build | close rule | rest-0 mainFrames/s | rest-2796 mainFrames/s |
|---|---|---|---|
| v8 (3 loads) | no | 38.5 / 39.3 / 38.5 | 2.2 / 3 / 2.2 |
| step 4 de237379b556 / e1359ab9994a | no | 39.2 | 2 |
| **v9-final minus close, 647c9ef2b1e2 / e1359ab9994a (= v9-final below)** | no | **39.3** | **2.2** |
| first v9-final (with scb) | yes | 60 | 31.6 |
| second v9-final 647c9ef2b1e2 / bdecf48c5b32 (2 loads) | yes | 60 / 60 | 33.6 / 22.5 |
| v9-final with close, minus nav + glue, 366636504b84 / bdecf48c5b32 | yes | 60.1 | 27 |

- With the close rule (`.start-selling-top-nav:not(.is-morphing) .start-selling-morph-panel { visibility: hidden }`),
  Chrome restyles about every frame at the top and about 30 times a second at 2796.
- The extra work is styleRecalc only: no layout, paint or rAF at rest-2796. elementsRestyled is 180-270/s vs 17.
- `document.getAnimations()` at rest (`out/v9/anim-2026-10-05T06-02-01-823Z.json`) lists the same running animations
  with and without the rule, so no new animation explains it.
- Sent to fix-morph-gpu (the owner) and posted as F-268.
- **Lead ruling (~06:10Z): v9-final drops the close rule** ("a steady extra style recalc at rest is a regression we
  won't ship to the phone"). It comes back in v9.1 once fix-morph-gpu fixes or explains it.
- The rest-level evidence for v9-final is the row "v9-final minus close": **39.3 / 2.2**, at v8's level (OBSERVED,
  one load).

**v9-final = 647c9ef2b1e2 / e1359ab9994a** (ms7c + dd + earn + nav + glue; patch.diff 4196eaa61d96, `V9_EXPECT` pinned),
2026-10-05 ~06:15Z (`out/v9/build-noclose.log`):
- all 20 legal orders of the 5 components give the same bytes;
- the join step 4 minus scb (366636504b84 / e1359ab9994a) matches;
- v9 minus each component (with its dependents) = v8 + the rest:
  - minus ms7c (and nav, glue) = 74bd1829d9de / 8a739ffb4d3b;
  - minus dd = 52fecbcfb9ed / 4600f71efb97;
  - minus earn = 6244c07de295 / 40037dc99f11;
  - minus nav (and glue) = 366636504b84 / e1359ab9994a;
  - minus glue = b8f71b099cc5 / e1359ab9994a;
- every delta file and owner pin checks out (nav and glue apply strictly, with no owner pin on v8 of their own);
- node --check passes;
- the snapshot is `out/v9/snap-647c9ef2b1e2-e1359ab9994a`.
- The CSS is step 4's (e1359ab9994a). Neither scroll-cb, nav nor glue changes CSS, so v9's CSS changes are those of rev
  7c, double-drive and the Join button.

Function and look checks on this v9-final (`out/v9/looks-final3.log`, 06:09-06:22Z, shared holds, OBSERVED):
- CHECK OK (`out/check/v9-best/2026-10-05T06-09-33-363Z/`): mobile 1580 → 1581 elements, desktop 1423 → 1423, 0 errors,
  0 4xx, morph reached on both. Screenshot diff mobile 0.14 / 46.61 / 71.51, desktop 0.08 / 0 / 0, the same as step 4
  and the earlier v9 builds (rev 7c's 100lvh spacer moves the mobile middle and bottom shots).
- px-chrome (A/A-gated, two loads per arm): mobile consistent max 0.0927 % (y 548, the hero heading's accent, which
  differs per load); desktop max 0.0064 % (the language switch). Everything else 0.
- dom-count: mobile 1578 (v8) → 1579 after the walk, desktop 1409 → 1409, the same as step 4.
- Census (`gates/census-run.mjs`, one load per arm), mainFrames/s:

  | arm | rest-0 | rest-1400 | rest-2796 | rest-3800 | rest-end |
  |---|---|---|---|---|---|
  | A = v8 | 38.8 | 41.5 | 1.8 | 26.2 | 0.2 (y 5346) |
  | V = v9-final | 40.8 | 42.1 | 1.8 | 26.3 | 29.2 (y 6278) |

  - Rest is at v8's level at the top and at 2796, so the close rule's extra style work is gone (OBSERVED, one load).
  - rest-end is new relative to v8 (lead, 06:4xZ): v8 rests at 0.2 at its page end, every v9 build at 28-60. It blocks
    landing v9 until it is explained or removed. The split below names it.

Page-end rest split (lead, 2026-10-05 06:4xZ; `out/v9/restend2.log`; census rest-end only, counts only, no timing; shared
probe holds 06:50-07:26Z, one load per arm, load1 10-46; the window starts after a 32 s settle at the page end, so ~34 s
after load like the full census's rest-end; snapshot copies `out/v9/snap-restend`, HASHES.txt, served hashes checked;
OBSERVED in our setup):

| arm | rev 7c | page end y | mainFrames/s | styleRecalc/s | paint/s | rAF/s | panel clock spring (JS `i`, rAF) | clock tick (timer) |
|---|---|---|---|---|---|---|---|---|
| A = v8 | out | 5346 | 0 | 0 | 0 | 0 | 0 | 0 |
| M = v9 − rev 7c | out | 5346 | 0.2 | 0.2 | 0.7 | 0 | 0 | 0 |
| S = v8 + rev 7c alone | in | 6278 | 60 | 60 | 252.5 | 30 | 30 | 1 |
| V = v9-final | in | 6278 | 60.1 | 60.1 | 258.9 | 37.1 | 37.1 | 1 |
| D = v9 − double-drive | in | 6278 | 27.2 | 27.2 | 126.9 | 36.8 | 36.8 | 1 |
| E = v9 − earn | in | 6278 | 28.3 | 28.3 | 128.6 | 31.7 | 31.7 | 1 |
| N = v9 − nav, glue | in | 6278 | 60 | 60 | 255.2 | 31.7 | 31.7 | 1 |
| G = v9 − glue | in | 6278 | 27.3 | 27.3 | 121.9 | 29 | 29 | 1 |
| A-open = v8, panel held open by `__fwMorphDrive` | out | 5346 | 60 (driver) | 87.1 | 255 | 91.8 | 31.8 | 1 |

- **Component: rev 7c (PR-018, morph-scroll) exposes it; the work itself is the morph panel's clock.** It comes in
  with rev 7c alone (S) and goes with it (M); no other component changes it. Rev 7c makes the page end the open end
  (m = 1 after its 100lvh spacer), so the panel's countdown (`cD` with `inverse`, `active` = E, `shown` =
  `__cdPanelShown`) is shown at rest there. It then ticks once a second (`e`, the 1 s interval) and rolls its digits on
  the original rAF spring (`i`, cd-roll-ca's "no strip yet or no path" fallback; cd-roll-ca's strip roll is hero-only),
  at 29-37 calls/s.
- **v8 runs the same work whenever its panel is open.** A-open (v8, panel opened and held by the debug driver): the same
  spring at 31.8/s plus the 1/s tick; the driver's own rAF logger (`p`, 60/s) makes its frame count not comparable. v8
  never rests open at its page end, so its rest-end shows nothing.
- **Running animations** (`getAnimations()` at the end, A/V/M/S): the arms with rev 7c add 3 morph `col-track` CSS
  animations (16 s, infinite, transform); otherwise the same 5 platform animations as v8.
- **Two levels in the rev 7c arms (OBSERVED, cause unknown):** 27-28 frames/s (D, E, G; the earlier full census of V:
  29.2) or 60 frames/s (V, N, S) with the same spring and tick counts. The extra ~30 style recalcs/s have no JS callback
  in the page bundle. The same build reads both levels (V: 29.2 earlier, 60.1 here), so this varies per load, not per
  build. Suspect, unchecked: the panel's `col-track` transform animations ticking on the main thread in some loads (not
  composited). Decisive local check: the trace's Animation events (compositeFailed) or the CDP Animation domain in the
  same window.
- **Scoped fix:** P-097 (fix-cd-roll-ca, registered, not started): the panel clock on cd-roll-ca's per-cell Web
  Animations roll, gated to m in {0, 1}; its P1 predicts panel rAF ≤ 10 % of C at the hold. It is cd-roll-ca's code, not
  rev 7c's. A rest gate that stops the panel clock at the open end would change what the user sees (a frozen clock), so
  it would be a proposal, not a fix. The 60 frames/s level needs its own cause first.

Simulator fling-parity confirm on this v9-final (COUNTS ONLY, `sim.mjs gesture --count-only`, flick-middle-v2 with
flingPx 300, the P-122 copies `out/p122/snap` served plain http; C = v8, V = v9-final; first page-up fling = settle 2 -
settle 3, px; load1 from each record's `meta.sim.hostLoad`; OBSERVED):

| run | window | C1 | V1 | C2 | V2 | verdict |
|---|---|---|---|---|---|---|
| shared Simulator slot (`out/p122/conf`) | load1 22-128, memory pressure warn | 2073 (21 → 55) | 1368 (72 → 128) | 1132 (124 → 100) | 1779 (93 → 71) | does not count (lead: rerun alone above load1 ~20) |
| alone, exclusive `--no-timing` hold (`out/p122/conf-alone`) | load1 9-16 | 2190 | 2190 | 2221 | 2157 | **pass** (within 64 px of C) |

- Under load v8 itself came up 1060 px short (C2): the first-fling shortfall depends on load on both arms, so a miss in a
  loaded window says nothing about v9 (OBSERVED, cause unknown; fix-scroll-cb's earlier runs showed the same without
  scroll-cb).
- In the quiet hold all four gM runs crossed the middle 5-6 times, like v8.

## P-122 (v9-final): v8 vs v9-final, phone no-worse check (DRAFT for mgmt-ops-10's delta check and the lead's sign; no P-122 data)

**Retarget (lead, 2026-10-05).** With nav-hit-cache delivered, the phone check runs once, on v9-final, against v8 (the
ship baseline). The first draft above (V = step 4) was never signed and has no data. The lead then dropped scroll-cb
(after the gM split) and the close rule (after the rest-work split), so V is the v9-final above (647c9ef2b1e2 /
e1359ab9994a). It is not the first v9-final (c3d36476c3ce / bdecf48c5b32) or the second (647c9ef2b1e2 / bdecf48c5b32).
No P-122 data exists for any of them. Changes from the first draft:
- **V = v9-final** (647c9ef2b1e2 / e1359ab9994a). It is served from new immutable copies, `out/p122/snap` (HASHES.txt
  375b4561b2fd; the copies of the two earlier builds were moved aside unused), by `p122/serve122.sh` (a copy of P-120's
  serve.sh with only V, the folder and the source changed; served-hash case `V:647c9ef2b1e2:e1359ab9994a`).
- **G parts only, no M leg** (no `__fwMorphDrive`). On v9 the panel is already open at the page end (fix-morph-gpu's
  note), and the lead asked for G gestures. hold122.sh refuses n items (VOID "unknown item"), and the scorer has no
  Mmoving/Mtweens gates. hold122.sh and score.mjs also refuse gRC/wgRC: part R is V only (score.mjs's parse throws on
  them since ops' N2 on 551a80f1, so no part R C record reaches the scorer or its Cref).
- **Flicker gate** (nav-hit-cache: `fixes/nav-hit-cache/flicker-gate.mjs` 3c2bd0cb7f09, logger `flicker-inject.mjs`
  71f7b00ce40b).
  - Every G run in both arms carries the logger, warm-ups too (`--inject`). The compiled programs are unchanged, checked
    by dry-run: GESTURE_HASH M 607b59612abb and R 92bcef2b02df with the inject.
  - Input: the counted G runs of parts M, X and S, **including runs that failed their path gate**. R is V only and
    stays out.
  - **Gate (lead ruling F3): G1, V monotone blinks = 0.** G1 FAIL = WORSE.
  - G2 (V blinks <= C blinks + 1, with the step-back rule), G3 (median flips per kind V <= C + 2) and the gate's own
    overall word (PASS / FAIL / INCONCLUSIVE) are **reported only**. So INCONCLUSIVE never makes the block insufficient.
  - VOID (fewer than 3 valid runs an arm, or script hashes that differ), or no G1 line, makes it insufficient.
  - **Deviation from nav's draft, accepted by the lead:** C = v8 (the ship baseline), not step 4.
- **Fling-distance parity, BEHAVIOUR (lead rulings F2).**
  - Distance: per stroke, from the finger's lift (touchend) to the settle (the first frame after which scrollY stays
    unchanged for 300 ms) or to the next stroke's touchstart, whichever comes first. y comes from the run's own frame log.
  - Compared: part M's first page-up fling after mark mid1 (the fling that came up short in the Simulator), and part X's
    first stroke after mark into1. out1/out2 are not compared: rev 7c's catch shortens V's out-flings by design. M's
    first page-down fling and every other stroke are reported.
  - Runs: every counted G run of the part with a record, path-voided runs included. Pairs by run number (gMC1 with
    gMV1, ...).
  - Counts: |median V - median C| > 300 px **and** at least 2 of the 3 pairs > 300 px in the same direction. A gap in
    which the shorter side ended at its own arm's end (within 10 px of 0 or docH - innerHeight) does not count: v9's
    open end is one screen lower than v8's, so X's into fling can run further on V by design.
  - Fewer than 2 pairs: insufficient, never pass.
  - Verdict word **BEHAVIOUR FAIL**: printed on its own line and in front of the block verdict ("BEHAVIOUR FAIL; frames
    <verdict>"), never masked by the frame gates.
- **gM on V:** if V's path gate fails, part M is reported INSUFFICIENT with the reason (not void, not re-scripted after
  data; lead ruling).
- **Time guard (F5, lead ruling; resized after mgmt-ops-10's N1 on 551a80f1):** each item runs inside the runner's
  600 s chrome-measure hold, and gesture-run refuses a G run with less than GESTURE_BUDGET_S (150 s) left in that hold.
  So no G item (wg* or g*) starts when the hold's elapsed time + 180 s (150 s + 30 s for the time before T0, the
  served-hash check and the open) > 600 s, i.e. after 420 s. A late item skips the rest of the hold, parks Safari and
  exits 7 (HOLD VOID "time"); the hold is then re-run whole. The end gate may then run the hold past 600 s (OVERDUE,
  nothing is killed). The ~10 min estimates for H3a/H4a put their last G item at about 375-400 s, so the guard should
  not fire in a normal hold, **but the margin is thin** (20-45 s); H5 is split in two so it stays well inside.

**Dry run (F-256; Simulator, COUNTS ONLY, `sim.mjs gesture --count-only`, uncounted; out/p122/sim, out/p122/split).**
Settled y after each stroke (OBSERVED, Simulator, host load1 up to 176; cause unknown). These runs are on step 4 and on
the first v9-final, both with scroll-cb:

| item | arm | settles | gM |
|---|---|---|---|
| m (flingPx 340) | C v8 | 2040 / 4389 / 2015 / 4494 / 2015 / 4494 / 2092 | pass (6 traversals, max 4494) |
| m (340) | V step 4 | 1999 / 4505 / **2698** / 5177 / 2737 / 5220 / 2743 | fail (1 traversal, max 5220) |
| m300 | C v8 | 2040 / 4245 / 2041 / 4232 / 2089 / 4280 / 2686 | pass (5, max 4280) |
| m300 | V step 4 | 2040 / 4230 / **2564** / 4756 / 2661 / 4827 / 2752 | fail (1, max 4827) |
| m300 | V first v9-final | 2037 / 4227 / **2972** / 5163 / 2973 / 5168 / 2977 | fail (1, max 5168) |

- On those V builds the **first page-up fling** from about 4200-4500 travelled 500-950 px less than on C. The page-down
  flings matched, and V's later page-up flings were within about 40 px of C's. The split above first put it on
  scroll-cb, but fix-scroll-cb's runs show it without scroll-cb too: load and main-thread dependent, cause unknown
  (OBSERVED, Simulator).
- **The scroll-cb drop is a lead ruling, not a proven cause.** The first-fling shortfall is load-dependent and is seen
  without scroll-cb (Simulator, OBSERVED). The parity rule below (median > 300 px AND at least 2 of 3 pairs) guards
  against a one-off short fling.
- Confirm on this V (in "v9-final build" above): alone at load1 9-16 the first page-up fling is C 2190 / 2221, V 2190 /
  2157 (pass); in a shared window at load1 22-128 both arms fell short, v8 too (C 2073 / 1132, V 1368 / 1779). The
  phone runs record load1 per run, so a miss can be read against its load.
- Rev 7c's touchend rule does not act there by its code (e = -1.2 at y 4227; its branches need e > -0.1).
- Part E (gX/gS) and gR, on step 4:
  - V-ef: out1 from the open end (6035) settled back at 6035 (a return to open, not a catch); out2 was caught at 5260.
  - V-es: both caught (5220 / 5221).
  - C-ef left the end (2883, 928); C-es travelled on (4416).
  - V-r100: each ret stroke lifted at p ≈ -0.12 and glided away to p ≈ -1.1 (4345 / 4346 / 4602), 0 of 3 returns to
    open in the Simulator.
  - C-r100: the catch stroke on v8 travels on (3752), as expected.

```
PHONE TICKET P-122 v9-best · less-work no-worse check, v8 C vs v9-final V (without scroll-cb and the close rule), P-121's path-matched G
  driver + nav's flicker gate (G1) + the fling-distance parity check · runner iphone-runner · verdict owner int-v8 ·
  registered before any P-122 data; no counted run before the lead's sign and mgmt-ops-10's delta check
build: V = v9-final = fixes/v9-best/patch.diff 4196eaa61d96 (v8 + PR-018 rev 7c + double-drive + PR-021 rev 3 +
  nav-hit-cache U1 + glue; scroll-cb and the close rule dropped by the lead, both back in v9.1; build.mjs V9_EXPECT),
  JS 647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2, CSS e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
control: C = v8 = fixes/v8-best/patch.diff, JS 3e3e94cb6e9f…, CSS f836404b3728… (full sha256 in P-120's ticket).
  Mirror snapshot b1789284481295-4ad4a84a. B = plain baseline (the gate's timer page).
copies and servers: out/p122/snap/{C,V} (read-only, HASHES.txt 375b4561b2fd), p122/serve122.sh 0198b72d3ad9 (plain
  http, --port 0, --latency 150, --vendors=local); served-hash check before every item (exit 4 on a wrong one).
question: under xcode-serious, does v9-final add slow frames over v8 (a) in flicks through the middle (gM), (b) in flicks
  into the page end and out again (gX, gS: on V the out-flings are caught at the closed rest by rev 7c; the catch path
  must stay clean), (c) nav/.pain class flicker (flicker gate G1); and (d) does it change how far a fling travels
  (parity, BEHAVIOUR)? Plus one report case for rev 7c's known limit I-179 (gR). No-worse only; landing basis: the
  less-work rule.
profile: xcode-serious (Xcode Device Conditions Serious, induced; thermal-gate.mjs --accept-induced at the start and end
  of every hold; no pre-warm, no cooling wait; ceiling 44 C or Critical; gate exits 2/3/7 void the hold).
sentinels: sCo/sCc in every hold (S on C: bottom >= 58 fps, scroll >= 44 fps); a failing sentinel voids every run since
  the last passing one; the hold is re-run once with the same items.
checkout: int-v8's worktree; hold122.sh prints one PIN line per hold (ticket, profile, checkout, HEAD, sha256/12 of
  hold122.sh, p122/score.mjs, serve122.sh 0198b72d3ad9, flicker-inject.mjs 71f7b00ce40b, flicker-gate.mjs 3c2bd0cb7f09,
  P-120's score.mjs fd9ecebcf4d0, P-111's score.mjs 26d944bf93e2, gate.mjs 1a1d716698f0, thermal-gate ecb403b3ad25,
  verdict 8edb2fc77795, pmcheck d36bd7437b7c, flick-middle-v2 ca38f3627f78, flick-end-v2 4eb4bbc62b43, flick-return-v1
  2ddbab3c23a1, out/p122/snap/HASHES.txt 375b4561b2fd) and one PROG line per G part (N2: GESTURE_HASH/12 M 607b59612abb,
  X 21aaafd3a9fd, S 7312cdcd2574, R 92bcef2b02df; selftest122 checks PROG_R's value). Any other value voids that hold.
  hold122.sh, score.mjs and selftest122.mjs = the blobs of the registering commit.
holds (each inside the runner's exclusive no-timing chrome-measure hold, max 600 s; GESTURE_BUDGET_S 150 per G run;
  every G item with --inject flicker-inject.mjs; time guard: no G item starts after elapsed 420 s, else VOID "time",
  exit 7, re-run whole):
  part M  H3a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H3b sCo gMC2 gMC3 gMV3 sCc
  part X  H4a sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · H4b sCo gXC2 gXC3 gXV3 sCc
  part S  H5a sCo wgSC wgSV gSC1 gSV1 sCc · H5b sCo gSV2 gSC2 [re-run] sCc   (C3: a void run gets one re-run at the
          block end in its place, in H5b)
  part R  H6 sCo wgRV gRV1 gRV2 gRV3 sCc              (V only: v8 has no extra screen; report)
  usage per hold (the I-168 wrapper with the block mark):
    TICKET=P-122 node tools/lock.mjs run iphone --owner iphone-runner --block P-122 --max-seconds 900 -- \
      node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "v9 P-122 <H>" \
      -- caffeinate -i -s sh fixes/v9-best/phone/p122/hold122.sh <H> <items>
  then iphone.mjs park; int-v8 stops the servers after the last hold.
scorer: fixes/v9-best/phone/p122/score.mjs (imports P-120's score.mjs and P-121's gate.mjs, pinned; runs flicker-gate.mjs
  as a child, pinned). Path gates per run (a failing run is VOID for the frame gates, never scored there): gM gateM
  (>= 5 traversals of [2200, 3800], max y < 5000); gX C gateE fast (released stroke, leaves the end >= 1600 px), V the
  same stroke criteria only (caught reported); gS gateE slow (both arms); gR >= 1 ret stroke lifts with p in
  (-0.20, -0.05].
  Gates: GM (> 50 WORSE d > +2, any NEW 250 px cluster; fewer than 3 valid V runs: INSUFFICIENT with the path reason),
  EX and ES (V ceiling: 0 frames > 50 ms in into1..end over all valid V runs; twins > 46 / > 54, threshold-sensitive
  when one differs; (46, 54] flagged; sub-windows out1..into2, out2..end reported; min valid V runs 3 for EX, 2 for ES),
  FLICKER (G1 only, above). BEHAVIOUR: the parity above (M's first page-up fling, X's first into1 stroke; median > 300
  px AND >= 2 of 3 pairs; path-voided runs included). R report only: per ret stroke p at lift, lowest p, returned to
  the open end with no finger down and the delay (finger-returns.mjs's rule).
  Self-test: selftest122.mjs (SELFTEST-122 OK 55: parity cases incl. 2 of 3 pairs, 1 of 3, clipped end, next stroke,
  < 2 pairs; flicker G1-only cases; the late() boundary at 420 / 421 s; part R C items refused by score.mjs; PROG_R).
verdict: BEHAVIOUR FAIL (own line, leads the block verdict) if the parity counts; frames: WORSE if any gate is WORSE or
  has a NEW cluster; else insufficient if any is; else no-worse. BEHAVIOUR FAIL or WORSE -> int-v8 splits by the
  reversal builds and reports to the lead and the owners.
F-260 (report only, every run): y90 = 0.9 docH - vh, the time the run first reaches it, and whether that is inside the
  scored window (gX/gS/gR: into1 crosses it inside the window on both arms).
predictions (int-v8, before phone data, after the split and the Simulator confirm on this V):
  - BEHAVIOUR (parity): pass 0.75, BEHAVIOUR FAIL 0.15, insufficient 0.10. The quiet Simulator confirm matched C within
    64 px, but the shortfall is load-dependent on both arms, and the phone's flings and the finger-lift rule are untested.
  - GM: no-worse 0.60, insufficient (V's path gate fails, too few valid V runs) 0.25, WORSE 0.15.
  - EX: no-worse 0.60, WORSE (a > 50 ms frame on the catch path into1..end) 0.20, insufficient 0.20.
  - ES: no-worse 0.70, WORSE 0.15, insufficient 0.15.
  - FLICKER G1 (V monotone blinks 0): pass 0.85, FAIL 0.10, insufficient 0.05.
  - R (report only): each ret stroke lifts at p near -0.12; at most 1 of 3 returns to open (rev 7c's I-179 limit). 0.6.
  - Sentinels: every hold passes on the first try 0.70; at least one hold re-run 0.30.
  - Overall: no-worse 0.45, insufficient 0.30, WORSE or BEHAVIOUR FAIL 0.25.
minutes: ~60 (7 holds: H3a ~10, H3b ~7, H4a ~10, H4b ~7, H5a ~8, H5b ~7, H6 ~8; gates included; no pre-warm; the
  runner's gaps between holds extra).
open items:
  - page-end rest work (OBSERVED, Chrome census, counts only; "Page-end rest split" above): resting at v9's page end
    runs 27-60 main frames/s vs v8's 0-0.2 at its page end. Rev 7c brings it (S in, M out) by making the page end the
    open end; the work is the morph panel's clock (1/s tick + the original rAF digit spring, 29-37/s), the same work v8
    runs whenever its panel is open (A-open 31.8/s). The 60 level (3 of 7 rev 7c loads) is unexplained. It does not block
    this behaviour check; it blocks landing v9 until it is explained or removed (lead). Scoped fix candidate: P-097.
```

### Post-data scorer rev, P-122 (lead ruling 2026-10-05 ~08:20Z, option (a); written after H3a-H4b were scored and after H6 ended)

Disclosed: this rev was written after phone data was seen. It fixes a design bug in the scorer, not the data. PIN HEAD
stayed aaa18038 for every hold (H3a-H6): the rev touched score.mjs on disk only after H6 had ended (08:41Z).

- **The bug.** score.mjs ran nav-hit-cache's flicker gate once, on the counted G runs of parts M, X and S together. The
  gate VOIDs a call whose runs carry more than one gesture script hash (`fixes/nav-hit-cache/flicker-gate.mjs` line
  103: ``if (scripts.size > 1) voidWhy.push(`gesture script hashes differ: ...`)``). Parts M, X and S run three
  different scripts by design (GESTURE_HASH M 607b59612abb, X 21aaafd3a9fd, S 7312cdcd2574), so the combined call
  could never pass: FLICKER was "insufficient (flicker gate VOID)" on any full block, whatever the blinks. The
  self-test had no mixed-script case, so the pre-data read could not see it.
- **Data seen before the rev** (interim, pinned scorer 357ee5bbcac7, out/p122/interim-M.txt and interim-MX.txt):
  - GM no-worse (Δgt50 0, Δgt46 −2); EX no-worse, threshold-sensitive (V gt50 0, gt46 1: one 48 ms frame).
  - Parity M pass (median C 1836, V 1783, gap −53); parity X pass via the clipped-end rule (C 1187, V 2058; pairs
    775 / 871 / 987; every run clipped).
  - FLICKER on M + X: VOID ("gesture script hashes differ: 607b5961…, 21aaafd3…"); its G1 line read "V monotone blinks
    0 (C 1): pass". Part M alone: G1 / G2 / G3 pass, K=8 PASS (threshold-sensitive: twin K=16 FAIL).
- **The rev: G1 only, per part.** flicker-gate.mjs runs once per part (M, X, S; R stays out, it is V only) and is
  unchanged (pin 3c2bd0cb7f09). FLICKER passes only when every part's call passes: any part WORSE (G1: V monotone
  blinks > 0) → WORSE; else any part insufficient → insufficient; else no-worse. A part VOIDs only on mixed scripts
  within the part (or no G1 line, an unknown exit, no runs); the "≥ 3 valid runs per arm" rule applies to the total
  valid G runs per arm over M, X and S together (see the lead's correction below). G2, G3 and the K twins stay
  informational. Outputs: one `<json>-flicker-<P>.json` per part, one `FLICKER <P>:` line each.
- **Lead correction (08:55Z, made before the full score and before ops' re-pin).** The 08:20Z wording "per-part VOID
  keeps its own rules (fewer than 3 valid runs per arm, ...)" would VOID part S, which has 2 G runs per arm by design
  (gSC1, gSC2 / gSV1, gSV2), and FLICKER could never pass; the card's one call needed ≥ 3 per arm over all G runs
  (8 per arm). Corrected: a part VOIDs only on mixed scripts within the part; ≥ 3 valid runs per arm counts over M, X
  and S together; G1 must be 0 in every part (= 0 in total). flicker-gate.mjs still VOIDs a 2-run call by its own
  count rule, so score.mjs reads such a call (its only VOID reason "valid runs C n, V m (need >= 3 each)") on its G1
  line, and pools the valid counts from the gate's per-run lines. Checked against the real gate's output on part M
  records already seen (gMC1, gMC2 / gMV1, gMV2: exit 4, count reason only, read as valid C 2 V 2, G1 0 → no-worse).
  First commit of the rev: fbf85434 (score.mjs 7909c0b44951, never pinned or used to score).
- **Equivalence.** G1 is "V monotone blinks = 0", a sum of non-negative per-run counts. A sum of non-negative counts
  is 0 exactly when the sum within every part is 0, so "0 summed over all parts" and "0 in every part" decide the
  same thing; with the run count pooled as on the card, the rev asks the registered G1 question under the registered
  count rule and only removes the VOID the mixed scripts forced.
- **Self-test.** selftest122.mjs: SELFTEST-122 OK 64 (was 55). New cases, with a stand-in gate that prints the real
  gate's lines and VOIDs as it does (< 3 valid runs an arm; mixed scripts, line 103): (1) mixed scripts across M, X
  and S with V monotone 0: the one combined call VOIDs, the per-part gate passes; (2) one V monotone blink in part X
  only → FLICKER WORSE (M and S pass); (3) mixed scripts within one part, or a part with no runs → insufficient;
  (4) WORSE wins over insufficient; (5) a part-X G1 FAIL makes the block WORSE; (6) part S at 2 runs per arm, as held
  (8 per arm in total) → no-worse; (7) a V monotone blink in that 2-run part S → WORSE; (8) the pooled count: 1 run per
  part per arm passes (3 each), 2 valid V runs in total → insufficient; (9) mixed scripts within a 2-run part still
  VOID it. The flickerFiles case now expects the per-part grouping.
- **Hashes.** p122/score.mjs 357ee5bbcac7 → d1dddb910cd9; selftest122.mjs 2da28f207b7c → df0b4fed66e5;
  flicker-gate.mjs 3c2bd0cb7f09 (unchanged). mgmt-ops-10 reads the rev and re-pins score.mjs before the full score.

### ES re-run H5c and its grid twin, P-122 (lead ruling 2026-10-05 09:03Z; written BEFORE H5c ran)

Data seen before this ruling: the full score on scorer d1dddb910cd9 (out/p122/score-full.txt): GM no-worse, EX no-worse
(threshold-sensitive), FLICKER no-worse (M, X, S), parity pass, ES "insufficient (V 1, need 2)": gSV1 (H5a) is
path-VOID ("out1: out stroke too fast for the slow item (Fv -7.72, travel 180)"; its frames gt50 0, gt34 0).

- **Process gap.** C3 ("a void run gets one re-run at the block end, in H5b") was missed: the runner judges a hold
  VALID from the hold's own checks (PIN, gates, item exits, sentinels) before the scorer's path gate runs, so gSV1's
  path VOID was only seen at the full score. A pre-scorer path check inside the hold is a later toolsmith item.
- **H5c:** `sCo gSC3 gSV3 sCc` in one hold, run by iphone-runner. gSV3 is C3's missed re-run of gSV1; gSC3 is a
  grid-matched control in the same hold. PIN HEAD for H5c is int-v8's branch head (145fb289 or later): hold122.sh,
  serve122.sh, the snapshot copies and every file the PIN line hashes other than p122/score.mjs are unchanged since
  aaa18038; only the scorer moved (the post-data rev above).
- **ES main verdict (as the card):** V ceiling over the valid V runs {gSV2, gSV3}; gSV1 stays void. The card's C side
  is {gSC1, gSC2} (ES is a V ceiling: C does not enter its verdict; C is reported under Cref).
- **ES grid twin (30 ms only):** C {gSC2, gSC3} vs V {gSV2, gSV3}. Since ES judges V only, the twin's V set equals
  the main's, so the two can differ only if a rule beyond the V ceiling is applied; stated here so the reading is fixed.
- **Reading:** main and twin agree → that is ES's verdict; they differ → ES "grid-sensitive", read as insufficient.
- **gSC3 counts in nothing else:** not FLICKER, not parity, not the main ES. The block score is run without gSC3; gSC3
  is reported in a second, report-only score that includes it.
- **Grid per S run** (Safari timer at the hold's gates, out/thermal-gate/gates.jsonl): gSC1 8 ms, gSV1 8 ms (void),
  gSV2 30 ms, gSC2 30 ms (H5b); gSC3 and gSV3 (H5c) as their gate reads (recorded with the result).
