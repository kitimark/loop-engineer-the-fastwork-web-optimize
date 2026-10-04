# Fix: v9-best (wave integration: v8 + six fixes, each added as it passes)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** step 1 built (v8 + menu swipe rev 7c). Bytes are checked. Function and look checks are queued. Not timed (memory `defer-timing-focus-call-tree.md`). The phone no-worse check follows the less-work rule (memory `less-work-landing-rule.md`) once the set is complete.
**Integrator:** int-v8 (wave-integrator), from 2026-10-05. Board row `v9-best`, lead priority #2, user T-159 #9.
**Build:** `patch.diff` is baseline-relative over 2 files: JS `428961bda278…`, CSS `659b02f7169d…`. Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## Components (each a delta on v8 3e3e94cb6e9f / f836404b3728)

| # | component | state | delta (sha256/12) | owner's build v8 + delta (JS / CSS) |
|---|---|---|---|---|
| 1 | PR-018 menu swipe rev 7c (morph-scroll; user accepted 20:12:50Z; landed 42250648) | **in** | `fixes/morph-scroll/delta.diff` 81ac7e1ee500 | 428961bda278 / 659b02f7169d |
| 2 | nav-hit-cache + scroll-cb | waits: fix-scroll-cb's split check (P-117 on hold: V failed the Simulator nav parity check) | | |
| 3 | double-drive (future + commission cards, T-157) | waits: fix-double-drive's checks | | |
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
