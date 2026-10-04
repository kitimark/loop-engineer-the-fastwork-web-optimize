# Fix: v9-best (wave integration: v8 + six fixes, each added as it passes)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** step 2 built and function-checked (v8 + menu swipe rev 7c + double-drive; CHECK OK); its look checks are
running. Double-drive is provisional: its owner is probing a ~5 px rest offset of the commission card on desktop
(2026-10-05), and a new delta would change v9. Step 3 (+ scroll-cb alone, lead's order after the split check ebee20a5)
needs a carry over double-drive and waits for both owners' review. Not timed (memory `defer-timing-focus-call-tree.md`).
The phone no-worse check follows the less-work rule (memory `less-work-landing-rule.md`).
**Integrator:** int-v8 (wave-integrator), from 2026-10-05. Board row `v9-best`, lead priority #2, user T-159 #9.
**Build:** `patch.diff` is baseline-relative over 2 files: step 2, JS `ab6f1062aaeb…`, CSS `40037dc99f11…` (patch.diff
e7f7397aeebc). Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## Components (each a delta on v8 3e3e94cb6e9f / f836404b3728)

| # | component | state | delta (sha256/12) | owner's build v8 + delta (JS / CSS) |
|---|---|---|---|---|
| 1 | PR-018 menu swipe rev 7c (morph-scroll; user accepted 20:12:50Z; landed 42250648) | **in** | `fixes/morph-scroll/delta.diff` 81ac7e1ee500 | 428961bda278 / 659b02f7169d |
| 2 | double-drive (future + commission cards, T-157; commit 96293d29) | **in, provisional** (owner's desktop rest-offset probe) | `fixes/double-drive/delta.diff` baae6114cd65 | 3076c5a8c9a3 / 2f7197880ffd |
| 3 | scroll-cb alone (split check ebee20a5: v8 + scroll-cb = v8 in Simulator nav parity) | **candidate**: carry over double-drive, owners' review | `fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff` 3abcd7008e61; carry `scroll-cb-on-v8dd.diff` 7b4a7ee04d85 | 4c48e372ecdd / f836404b3728; v8 + dd + carry bf40f48acd24 / 2f7197880ffd |
| - | nav-hit-cache | out: the split puts the Simulator nav-pill lag on it; waits for fix-scroll-cb's task-mode check and fix-nav-morph's real-gesture case | | |
| 4 | PR-021 Join button rev 3 | waits: the user's accept | | |
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
  error, 404 or element. Look checks on `out/v9/snap-ab6f1062aaeb`: running.
- **Step 3 candidate (+ scroll-cb):** not built into the overlay yet. Its commission-job hunks (v8 JS 3289-3337) overlap
  double-drive's: both declare after `_ch`, and double-drive rewrote the rAF line scroll-cb uses as context. `build.mjs`
  now takes a `carry` (the component re-based on v8 + the component it overlaps, used whenever that one is in the set
  and only after it). It checks the carry's sha, v8 + dd + carry = bf40f48acd24 / 2f7197880ffd, and that the carry changes
  exactly scroll-cb's own lines (multiset of +/- lines, 0 differences). Dry run: v9 = 25dc3025f1a0 / 40037dc99f11, every
  legal order the same bytes, and v9 minus each component = v8 + the others (dd's reversal goes through scroll-cb's carry
  and back). Semantics (int-v8's reading, for the owners to confirm): scroll-cb's gate acts only on the compact path,
  where double-drive snaps its weight (`_cw = _wt`), and off compact the gate is off, so neither changes the other's
  frames.
- Look checks use `fixes/v9-best/gates/`, copies of v8's gates with A = v8 and V = v9 (`V9_SNAP=out/v9/snap-<js12>`):
  - `px-chrome.mjs` at phone width and desktop;
  - `dom-count.mjs`;
  - `census-run.mjs` work counts;
  - `px-sim.mjs` and `sim-ipad.mjs` in the Simulator.
- Expected from step 1: rev 7c changes motion only. It keeps rev 2's still frames, which are T3 on `#platform` in Safari (see the morph-scroll README, "Pixel tiers"). Frozen frames at rest should match v8 within T2 in Chrome.

## Phone no-worse ticket (DRAFT, less-work rule; not registered, no id yet)

Draft for the lead and mgmt-devices so the phone has a job ready. It is registered only after the lead's pre-data
read, once the set is stable. The hashes below are step 2: rev 7c + double-drive, with double-drive's last two checks
(Simulator pixels set 2, desktop commission recheck) still pending.

```
PHONE TICKET P-<lead> v9-best · less-work no-worse check (v8 C vs v9 V; the legs the two parts touch)
  · runner iphone-runner · verdict owner int-v8 · registered before any phone data; no counted run before the lead's
  pre-data read
build: V = v9 = fixes/v9-best/patch.diff (v8 + PR-018 rev 7c + double-drive), served
  JS ab6f1062aaeb03b4f3b71056e9c0bf17379b1bd7568fc9e26b73eb2d7bc44964,
  CSS 40037dc99f115b89b63114f6a95ea8401a7f938f6e4307057dfd52dcf8ab0b79
control: C = v8 = fixes/v8-best/patch.diff, JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16,
  CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43. Mirror snapshot b1789284481295-4ad4a84a.
copies: out/v9/snap-ab6f1062aaeb/{A = C, V} in int-v8's worktree (fixes/v9-best/build.mjs, strict applier, order and
  reversal identities), read-only, HASHES.txt (full sha256 as above). B = plain baseline 4606120cf392 / 27776f3d4138.
question: at real thermal Serious, does v9 add slow frames over v8 (a) in the menu morph's open/close at the page end
  (rev 7c changes how a swipe commits the morph), (b) in fast flicks through the middle of the page (people, pain,
  commission: double-drive's commission card), (c) in fast flicks into the page end (start-selling: double-drive's
  future card, and rev 7c's swipe rule)? No-worse only. Landing basis: identity checks, function check, frozen
  pixels and work counts in this README; rev 7c's user finger A/B (C-052) is its own landing basis.
ports, thermal gate, start method, sleep check: as P-111/P-117 (serve.mjs --port 0 --latency 150 --vendors=local,
  plain http; served-hash check before every item, exit 4 on a wrong one; thermal-gate.mjs --expect serious --max-c 44
  at the start and end of every hold; pre-warm on B with S runs, at most 4; pmcheck.mjs). A hold counts only if both
  reads PASS; else VOID, re-run once with the same items. Ports go to the runner by message.
holds (each <= 10 min, inside the runner's exclusive no-timing chrome-measure hold):
  M leg  H1: wC wV mC1 mV2 mV3 mC4 · H2: mC5 mV6 mV7 mC8
  G leg  H3: sC gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sC · H4: the same for E (gEC/gEV)
  then iphone.mjs park; int-v8 stops the servers.
M leg (driver M, P-098's, as P-111): hold 2000 ms, cycles 3 (6 tweens at max scrollY), C V V C C V V C, n = 4 per arm;
  every counted C M run is a heat sentinel (held m=1 p95 <= 18 ms). wC/wV: one uncounted warm-up per arm port.
G leg (driver G, P-105's scripts byte for byte): M flick-middle-v1.json 0f97205f1d42, E flick-end-v1.json
  93a1cf7bb091; 3 runs per arm C V V C C V; sC S runs on C open and close each G hold (heat sentinels, uncounted).
scorer: P-111's fixes/v8-best/phone/score.mjs imported unchanged (sha refused if changed), arms re-pinned to C = v8,
  V = v9 (P-117's pattern); self-test on P-111's own records must give P-111's Mmoving, Mtweens, GM, GE gates.
  Gates: Mmoving (> 50 WORSE when d > +1, > 34 when d > +2), Mtweens (O1.f1-f3, close.f1/f3 WORSE when d > +2 ms),
  GM and GE (> 50 WORSE when d > +2; any NEW 250 px cluster fails). Twins > 46 / > 54 reported; threshold-sensitive
  when a twin's verdict differs. Fewer than 3 valid runs per arm (per part): insufficient.
verdict: WORSE if any gate is WORSE or has a NEW cluster; else insufficient if any is; else no-worse (P-114's order).
  WORSE -> int-v8 splits by the reversal builds (v9 - rev 7c, v9 - double-drive) and reports to the lead.
minutes: ~50 (4 holds + pre-warm and gates).
```
