# Fix: v9-best (wave integration: v8 + six fixes, each added as it passes)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** step 4 built (v8 + menu swipe rev 7c + double-drive + scroll-cb via a carry over double-drive + PR-021 Join
button rev 3, user-accepted). Steps 2 and 4 passed the function check; step 3 passed fix-scroll-cb's Simulator count
check; step 4's look checks passed. Double-drive is final and phone-cleared (P-118 NO-WORSE). Phone ticket P-120 (arms =
step 4 with rev 7c) is CLOSED INSUFFICIENT. Step 4 will be rebuilt with morph-scroll rev 7d once it lands, and tested
under P-122 with P-121's G driver. Not timed (memory
`defer-timing-focus-call-tree.md`). The phone no-worse check follows the less-work rule (memory `less-work-landing-rule.md`).
**Integrator:** int-v8 (wave-integrator), from 2026-10-05. Board row `v9-best`, lead priority #2, user T-159 #9.
**Build:** `patch.diff` is baseline-relative over 2 files: step 4, JS `de237379b556…`, CSS `e1359ab9994a…` (patch.diff
883b6f86b90f). Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## Components (each a delta on v8 3e3e94cb6e9f / f836404b3728)

| # | component | state | delta (sha256/12) | owner's build v8 + delta (JS / CSS) |
|---|---|---|---|---|
| 1 | PR-018 menu swipe rev 7c (morph-scroll; user accepted 20:12:50Z; landed 42250648) | **in** | `fixes/morph-scroll/delta.diff` 81ac7e1ee500 | 428961bda278 / 659b02f7169d |
| 2 | double-drive (future + commission cards, T-157; commit 96293d29) | **in**, final (owner's desktop rest-offset probe: no change; y 6500 settle check: card state at rest identical to v8; phone P-118 NO-WORSE under xcode-serious, 3/3 holds valid: S median V-C -1 at >50 and >34, GM flick-middle 0 at >50) | `fixes/double-drive/delta.diff` baae6114cd65 | 3076c5a8c9a3 / 2f7197880ffd |
| 3 | scroll-cb alone (split check ebee20a5: v8 + scroll-cb = v8 in Simulator nav parity) | **in** (carry reviewed OK by fix-scroll-cb and fix-double-drive) | `fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff` 3abcd7008e61; carry `scroll-cb-on-v8dd.diff` 7b4a7ee04d85 | 4c48e372ecdd / f836404b3728; v8 + dd + carry bf40f48acd24 / 2f7197880ffd |
| - | nav-hit-cache | out (when it comes in: its delta plus a glue component for rev 7c's on-dark microtask, fix-nav-morph's glue-ms7c.diff 5d63660a9e62; option (a), agreed 2026-10-05; the delta is the 1-context-line form patch-on-v8-u1.diff 7b5f3947b465, the same changes, because rev 7c's 3-line context meets nav's inserted lines, so the order is fixed: 7c, then nav, then glue; on step 3: nav cf3425e169f0, + glue c211d557e357, per fix-nav-morph): the split puts the Simulator nav-pill lag on it; waits for fix-scroll-cb's task-mode check and fix-nav-morph's real-gesture case | | |
| 4 | PR-021 Join button rev 3 (fix-nav-earn, cb3c052c) | **in** (user accepted rev 3, final). Pre-check: its delta applies to v9 step 3 with line offsets only (JS 6, CSS 5 hunks offset; v9 + rev 3 = de237379b556 / e1359ab9994a) | `fixes/nav-earn/delta.diff` f214ed00081f | 8df0a9eb3ec7 / 29bade2fe964 |
| 5 | toolbar-resize (P-115) | waits: its Simulator check | | |
| 6 | morph-close-peak, the menu-close repaint (fix-morph-gpu) | waits: its owner | | |

Build: `node fixes/v9-best/build.mjs [--dry] [--only a,b]`. To add a fix, add one line to `COMPONENTS` with the owner's delta on v8 and the hashes of its own build, run the script, then pin `V9_EXPECT`.

It writes:
- `fixes/v9-best/overlay/` (gitignored);
- `patch.diff`;
- `out/v9/snap-<js12>/{A,V}`, read-only, with A = v8 and V = v9, plus `HASHES.txt` (full sha256);
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
