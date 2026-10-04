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
  Look checks on `out/v9/snap-de237379b556`: running.
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

## Phone no-worse ticket (DRAFT, less-work rule; not registered, no id yet)

Draft for the lead and mgmt-devices so the phone has a job ready. It is registered only after the lead's pre-data
read, once the set is stable. The hashes below are step 4: rev 7c + double-drive + scroll-cb (carry) + PR-021 rev 3
(JS de237379b556 / CSS e1359ab9994a); they change whenever a component is added (nav-hit-cache, toolbar-resize,
morph-close-peak), so the ticket is registered on the final set. Profile (user T-162 #3, mgmt-devices): xcode-serious.
Open for the lead's sign: mgmt-devices asked (2026-10-04 ~22:55Z, phone free) to run the block on step 4 now rather than
wait. If so, step 4's arms are the ticket's, and a component added later gets its own no-worse question on v9-final vs
step 4 (a later ticket); the scripts re-pin in one commit before any data either way.

```
PHONE TICKET P-<lead> v9-best · less-work no-worse check (v8 C vs v9 V; the legs the two parts touch)
  · runner iphone-runner · verdict owner int-v8 · registered before any phone data; no counted run before the lead's
  pre-data read
build: V = v9 = fixes/v9-best/patch.diff (v8 + PR-018 rev 7c + double-drive + scroll-cb + PR-021 rev 3; step 4,
  provisional until the set is final), served JS de237379b556 (full sha256 in out/v9/snap-de237379b556/HASHES.txt),
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
  xcode-serious, but it is a different question on other arms, so its numbers are not pooled with v9’s either. A decisive check (does induced Serious slow the chip like real heat?) runs first and
  belongs to iphone-runner; if induced slows nothing, one real-heat confirmation block for the final best build is added later.
sentinels under xcode-serious: a failing control run (bottom >= 58 fps and scroll >= 44 fps for S/W; held m=1 p95 <= 18 ms for M)
  voids every run since the last passing one, then the block is rerun; no cooling wait (the old "cool to the last passing
  sentinel minus 0.5 C" rule is a real-heat rule; the no-cooling clause comes from mgmt-devices’ request to int-v8,
  not from 8e4eacbb: under xcode-serious the gate replaces cooling; CLAUDE.md "Phone blocks" still words cooling for real heat, the lead owns that text). Gate exits in hold.sh: 2 = condition dropped or off (report to
  iphone-runner and mgmt-devices), 3 = ceiling, 7 = real heat instead of the Xcode condition; each follows P-116 hold.sh's
  failure path. Wording checked by mgmt-ops-10 (consistent with 8e4eacbb and ops-handover "Phone ticket profile").
  The profile line is stated before data, in the same commit as the arm pins.
ports, start method, sleep check: as P-111/P-117 (serve.mjs --port 0 --latency 150 --vendors=local, plain http;
  served-hash check before every item, exit 4 on a wrong one; pmcheck.mjs). A hold counts only if both gate reads PASS;
  else VOID, re-run once with the same items. Ports go to the runner by message.
holds (each <= 10 min, inside the runner's exclusive no-timing chrome-measure hold):
  M leg  H1: wC wV mC1 mV2 mV3 mC4 · H2: mC5 mV6 mV7 mC8
  G leg  H3: sCo wgMC wgMV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc · H4: sCo wgEC wgEV gEC1 gEV1 gEV2 gEC2 gEC3 gEV3 sCc
  (P-118's G-hold layout: sentinels apart per hold, one uncounted G warm-up per arm port)
  then iphone.mjs park; int-v8 stops the servers.
M leg (driver M, P-098's, as P-111): hold 2000 ms, cycles 3 (6 tweens at max scrollY), C V V C C V V C, n = 4 per arm;
  every counted C M run is a validity sentinel (held m=1 p95 <= 18 ms; a sentinel check, not a heat pre-warm). wC/wV: one uncounted warm-up per arm port.
G leg (driver G, P-105's scripts byte for byte): M flick-middle-v1.json 0f97205f1d42, E flick-end-v1.json
  93a1cf7bb091; 3 runs per arm C V V C C V; sCo / sCc S runs on C open and close each G hold (validity sentinels, uncounted).
scripts (committed before data): fixes/v9-best/phone/serve.sh fc643888a9bc (copies out/v9/snap-de237379b556 to
  out/pv9/snap, read-only, pin-checked), hold.sh ff6e9250d637 (P-118's hold.sh with this ticket's legs; refuses without
  TICKET=P-<id>, so nothing runs before registration), score.mjs 963f476c877a, selftest.mjs f3a2247ac577.
scorer: P-111's fixes/v8-best/phone/score.mjs (26d944bf93e2) imported unchanged (sha refused if changed), its EXPECT
  re-pinned in place to C = v8, V = v9 (P-117's pattern); sCo/sCc scored as P-111's sC, warm-ups skipped; the block
  verdict gates only Mmoving, Mtweens, GM, GE. Self-test: SELFTEST OK 15 checks (P-111's own records re-scored with
  P-111's pins give exactly P-111's Mmoving, Mtweens, GM, GE gates and run voids; under the v9 pins the same records
  are void as "served not arm"; item mapping).
  Gates: Mmoving (> 50 WORSE when d > +1, > 34 when d > +2), Mtweens (O1.f1-f3, close.f1/f3 WORSE when d > +2 ms),
  GM and GE (> 50 WORSE when d > +2; any NEW 250 px cluster fails). Twins > 46 / > 54 reported; threshold-sensitive
  when a twin's verdict differs. Fewer than 3 valid runs per arm (per part): insufficient.
verdict: WORSE if any gate is WORSE or has a NEW cluster; else insufficient if any is; else no-worse (P-114's order).
  WORSE -> int-v8 splits by the reversal builds (v9 - rev 7c, v9 - double-drive) and reports to the lead.
minutes: ~45 (4 holds + gates, no pre-warm).
```
