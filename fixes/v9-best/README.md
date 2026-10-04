# Fix: v9-best (wave integration: v8 + six fixes, each added as it passes)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** step 4 built (v8 + menu swipe rev 7c + double-drive + scroll-cb via a carry over double-drive + PR-021 Join
button rev 3, user-accepted). Steps 2 and 4 passed the function check; step 3 passed fix-scroll-cb's Simulator count
check; step 4's look checks are running. Double-drive is final and phone-cleared (P-118 NO-WORSE). Phone scripts for
the v9 ticket are in `phone/` (draft, arms = step 4). Not timed (memory
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
