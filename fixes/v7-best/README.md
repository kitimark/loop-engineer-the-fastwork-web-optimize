# Fix: v7-best (wave integration: v6 + countdown strips + countdown roll + resting avatar row)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and checked by bytes, function, frozen pixels and work counts; **not timed** (memory
`defer-timing-focus-call-tree.md`); no phone runs here (the lead schedules any phone no-worse check). PROGRESS row
`v7-best` is `best: false` until the lead signs it.
**Integrator:** wave-v7 (wave-integrator), 2026-10-04.
**Build:** `patch.diff` (baseline-relative, 2 files) = JS `8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00`,
CSS `308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d`; baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css` (nothing else).

## Components and order

| # | component | patch (sha256/12) | made on | its own build (JS / CSS) |
|---|---|---|---|---|
| 1 | best-build (v4) | `fixes/best-build/patch.diff` 9bf4c6e41f11 | baseline | 65052c4a3902 / e0f92804c521 |
| 2 | hero R2 delta (makes v6 = B-R2) | `fixes/v7-best/hero-r2-delta.diff` a8daa419b791 | best-build | v6 8018ce062d30 / 71b65c667720 |
| 3 | cd-strip strip-tc (PR-008 rev 2, wi-countdown) | `fixes/cd-strip/patch.diff` 4f2ff4eb9afa | st6-rb2 | 6fa0e1e8a221 / 982a747d9263 |
| 4 | cd-roll-ca V9 (PR-017, landed 0eb4a101) | `fixes/cd-roll-ca/patch.diff` d48095cc16ff | cd-strip build | 582d120c9f8f / 982a747d9263 |
| 5 | rest-script v4 (P-094, landed 21c94aaf) | `fixes/rest-script/patch.diff` be2b46a3ceaf | st6-rb2 | 520d5f1139c7 / f523598b2a24 |

- `hero-r2-delta.diff` is the hero-exit-threaded R2 build (`fixes/hero-exit-threaded/patch.diff` 168233b0a4ae,
  924be86afac8 / cc74cd980e72) minus the morph-inherit build (7c61fe7d0662 / f523598b2a24), i.e. the hero fix alone. On
  best-build it gives exactly v6-best-br2 (PROGRESS `v6-best-br2`, 8018ce062d30 / 71b65c667720).
- **cd-roll-ca does not contain cd-strip:** its patch is made on the cd-strip build (it is a delta), so both apply,
  each once. `fixes/rest-script-live/patch.diff` (71b020744858, baseline-relative) builds the same bytes as
  `fixes/rest-script/patch.diff` on st6-rb2 (checked), so only the latter is applied.
- Command: `node tools/fix.mjs combine v7-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca rest-script`.
  **All five applied, no conflicts.** Only line offsets (git apply's exact context): cd-strip CSS +276, rest-script
  JS +338 (its later hunks), all others 0. Nothing needed resolving, mechanical or semantic.
- Closest changed lines between the groups (st6-rb2 lines): hero~countdown 317, hero~rest 445, countdown~rest 846,
  rest~(best minus st6) 182. No two share diff context.

## Identity checks (`node fixes/v7-best/check.mjs`, 30/30 ok, `check.json` there is `fix.mjs check`'s)

Text only, best-build's strict applier (exact context, no fuzz):
- every input rebuilt from its committed patch equals its owner's hashes (st6-rb2, best-build, morph-inherit,
  hero R2, v6, cd-strip, cd-roll-ca, rest-script, rest-script-live, gpu-preview, morph-gpu rev 1);
- all 6 orders of the groups [hero], [strip, roll], [rest] give the same bytes; `fix.mjs combine`'s overlay equals the
  strict build; `patch.diff` on the baseline equals v7;
- by reversal, wherever only one component changed the code, v7 is that component's own build byte for byte:
  v7 − rest − roll − strip = v6 (B-R2); v7 − hero − rest − (best − st6) = cd-roll-ca V9; … − roll = cd-strip build;
  v7 − hero − roll − strip − (best − st6) = rest-script v4 build; v7 − hero − roll − strip = P-094's best+rest arm
  (e9b94ba7c560 / e0f92804c521); v7 − rest = gpu-preview − morph-gpu (the same countdown and hero bytes the preview
  carried); v7 − all four = best-build;
- `node --check` on the v7 JS.

## Function: `fix.mjs check` (v7 vs v6, headless Chrome, both viewports)

`node tools/fix.mjs check v7-best --on v7-v6base --viewport both --save` (helper overlay `v7-v6base` = best-build +
hero delta, hashes equal v6). **CHECK OK.** Served overlay hashes verified (8c90da217745 / 308f0da70c3a).

| viewport | new errors | new 404s | morph reached | elements v6 -> v7 | screenshot diff % top / middle / bottom |
|---|---|---|---|---|---|
| mobile 430x932 | 0 | 0 | yes | 1532 -> 1580 | 0.12 / 0 / 0.42 |
| desktop 1440x900 | 0 | 0 | yes | 1375 -> 1424 | 0.05 / 0 / 0 |

+48/49 elements are the countdown cells and strips (`span.cdwrap`, `span.cell`, `span.strip`). The diffs are
check's unfrozen shots (countdown, rotators, orbit phase); the frozen pixel check below is the real comparison.

## Pixels at rest, frozen (illusion rule, PR-010 tolerance report)

`gates/px-chrome.mjs` (Chrome) and `gates/px-sim.mjs` (WebKit Simulator). Arms are read-only snapshot copies built
by `gates/snap.mjs` from the committed patches (refused on any hash mismatch). Load order A, V, A2, V2; each load has
its own server (port 0, `--no-cache`, its own origin) and an isolated browser context, and the served JS/CSS are
hash-checked before the load (I-131: a stale cached file would make the load VOID; none was). `Date.now` frozen at
one value in every arm, then per stop: scroll, 1.6 s, running non-transition animations paused at 4000 ms and SMIL at
4 s, screenshot, hit grid. Timer-driven loops (word rotators, the avatar rotator, pain notes) are not frozen: their
phase is the A/A noise.

Scores per stop: **A~V beyond the A/A mask** (pixels > 8 levels apart where A~A2 is <= 8); and **consistent**: over 8
in all four cross pairs (A~V, A~V2, A2~V, A2~V2) while neither A/A pair is over 8 there, i.e. a difference of the
build, not of one load's timer phase. Five numbers: CSS px², % of frame, max level, flat share (3x3 range <= 2),
where.

**Chrome mobile 430x932 DPR 3, v6 (A) vs v7 (V)** (`px-mobile-…09-37-32`, rescored):

| y | A~V beyond A/A (CSS px²) | consistent: CSS px² / % / max / flat | where | A/A over 8 %, A / V |
|---|---|---|---|---|
| 0 | 15 | 0 | | 0.04 / 0.03 |
| 300 | 3 | 2 / 0.0004 / 33 / 0 (edge) | hero heading | 0.77 / 0.77 |
| 548 | 0 | 0 | | 0.29 / 0 |
| 1422 | 11 | 11 / 0.0027 / 38 / 0 (edge) | profile-showcase meta text | 0.76 / 0 |
| 1913 | 1648 | **56 / 0.014 / 232 / 0.04 (edge, moving)** | `#people` avatar row | 0 / 0.73 |
| 2403-5346 (8 stops) | 0-150 | 0 | | |

**Control for the avatar row, best + rest-script (P, e9b94ba7c560 / e0f92804c521) vs v7** (`px-mobile-…09-47-11`):
consistent 0 at y 1913 (and 0 at 12 of 13 stops; y 3875 below). So at the avatar row v7 is exactly what
rest-script v4 alone does; the v6 -> v7 difference there is rest-script's own change, not an interaction. It is the
avatar **rotator's phase** at capture, not a static look: every rest-script build's two loads differ there (P/P2 and
V/V2 both 0.64 % over 8), while v6's two loads were identical (its rotator stood still under the frozen clock).
rest-script v4's own static checks were Chrome T0 and Simulator T2 (5131 px, max 49, the 4th avatar; user accepted
PR-014 "keep"). OBSERVED, our setup.

y 3875 (`section.commission .referral-card`, 150 CSS px², max 37): a per-load state, seen on both sides of v7's own
A/A in the first run (V ≠ V2 there) and as P ≠ V in the second; v6~v7 consistent 0. Within T2 (0.037 %, max 37).

**Chrome desktop 1440x900 DPR 1, v6 vs v7** (`px-desktop-…10-10-01`):

| y | A~V beyond A/A (CSS px²) | consistent | where |
|---|---|---|---|
| 0, 300, 548 | 1 / 148 / 5880 (one load: A2~V2 0 / 0 / 21) | 0 | hero heading (script accent drawing phase) |
| 1739-3416, 5093-8448 | 0-817 | 0 | |
| 4255 | 4500 (A2~V2 19882) | 123 / 0.0095 % / 237 / 0.94 | `section.pain .pain-note`: pain notes are timer loops (A/A over 8: 2.9 % and 2.6 %); no v7 component touches the pain section |

**WebKit Simulator 430x775 DPR 3, v6 (A) vs v7 (V)** (`gates/px-sim.mjs`, three shared holds: `px-sim-…11-35-54`
y 0-2796, `…11-38-42` y 3384-5260, control `…11-40-10`). Same scoring. Every v6 first load (A) differed from its
second load (A2) by 5.2-6.4 % over 8 at every stop, all in two device-row bands (0-176, the status-bar area, and
794-910): a first-load artefact of the session, not page content (V/V was 0.05-0.70 %). So the A/A mask is wide in
those rows; the A2~V2 column (second loads only) is the cleaner read there.

| y | A~V beyond A/A (CSS px²) | consistent: CSS px² / % / max / flat | A2~V2 beyond A/A | where | A/A over 8 %, A / V |
|---|---|---|---|---|---|
| 0, 300, 548 | 0 | 0 | 0 | | 6.2-6.4 / 0.06 |
| 1400 | 574 | **199 / 0.050 / 248 / 0.25** | 532 (max 254) | `#people .start-selling-future-card` (the avatar row) | 5.9 / 0.70 |
| 1913 | 55 | 0 (max 47) | 56 (max 49) | `#people` community pill | 6.0 / 0.08 |
| 2796 | 50 | 0 | 0 | | 5.2 / 0.06 |
| 3384, 3875 | 0 | 0 | 21 / 4 | | 5.3 / 0.28, 0.05 |
| 4365 | 21 | **16 / 0.004 / 197 / 0 (edge)** | 67 | `section#platform` ask-service body (9 CSS px², max 197) and row copy (7, max 11); A2~V2 adds the "earn" row title (57) | 5.3 / 0.05 |
| 4856, 5260 | 0 | 0 | 0 | | 5.3 / 0.05 |

**Control, best + rest-script (P) vs v7, Simulator** (`…11-40-10`): y 1400 consistent 6 CSS px² (max 184), y 1913
consistent 0. So the Simulator's y 1400 difference is rest-script v4's own (P is v7 there), as Chrome's y 1913: the
same avatar row (Simulator y and Chrome y differ by viewport height), the avatar rotator's phase; v7's own two loads
differ there too (V/V 0.70 %). rest-script v4's own Simulator check was T2, user-accepted (PR-014 "keep").

y 4365: no v7 component touches `section#platform` (its edits in the patch are best-build's, also in v6). Its max
level 197 on an edge is above the T2 edge level (128), over 16 CSS px² (0.004 %); the A2~V2 pair shows a different
text row there instead, so it reads as a per-load text state, like Chrome's y 3875. Cause not established, OBSERVED,
our setup; flagged for the lead.

**Verdict (pixels):** every stop is T0, or within T2, in Chrome (mobile, desktop) and in the Simulator, except:
(1) the avatar row (Chrome y 1913, Simulator y 1400), which the P control shows is rest-script v4's own accepted
change (PR-014), not an interaction; (2) two small per-load clusters in sections v7 does not touch (Simulator y 4365,
16 CSS px², edge max 197; Chrome desktop pain notes, timer loops). No difference traces to cd-strip or cd-roll-ca.

## Work counts (cost card, Chrome, no timing)

de-frame-audit `census.mjs` (430x932 DPR 3 mobile, headless, no throttle; per second) through `gates/census-run.mjs`
(served hashes checked, each arm on its own https server, a fresh Chrome profile per load). Two loads per build in two
holds (A,V then V,A); the two numbers per cell are load 1 / load 2.

| window | count | v6 (A) | v7 (V) | read |
|---|---|---|---|---|
| rest y 0 | main frames | 49.0 / 49.0 | 40.5 / 42.3 | -7.6 |
| rest y 0 | rAF fires | 32.6 / 27.5 | 1.0 / 1.2 | the countdown's rAF spring is gone (cd-roll-ca) |
| rest y 0 | elements restyled | 429 / 412 | 333 / 398 | lower or equal |
| rest y 0 | paint | 142 / 147 | 146 / 146 | same |
| rest y 1400 | main frames / rAF | 50.3 / 49.0, 32.7 / 27.0 | 41.8 / 42.6, 1.0 / 1.2 | as at y 0 |
| rest y 2796 | main frames | 8.2 / 8.7 | 4.2 / 4.2 | -4.3 (rest-script: the avatar row at rest) |
| rest y 2796 | elements restyled / paint / layout | 123 / 103, 8.7 / 8.7, 1 / 1 | 63 / 57, 2.0 / 1.5, 0 / 0 | about half |
| rest y 3800 | main frames / rAF | 29.3 / 30.0, 20.3 / 20.3 | 27.2 / 26.7, 17.8 / 17.7 | -2.7 / -2.6 |
| rest end (y 5346) | main frames / paint | 2.2 / 4.2, 8.8 / 18.2 | 4.2 / 2.2, 17.0 / 8.7 | two states per load, the same set on both sides: no change |
| scroll top -> end | main frames | 126.1 / 126.0 | 126.1 / 126.2 | 0 |
| scroll top -> end | style recalcs | 80.5 / 77.5 | 71.8 / 72.0 | -7 |
| scroll top -> end | elements restyled | 2163 / 2137 | 2180 / 2216 | +48 (A/A 26 and 36): a small cost, the rolling countdown cells |
| scroll top -> end | paint | 248 / 216 | 220 / 220 | within v6's spread |
| scroll top -> end | layout / rAF | 21.9 / 21.8, 313 / 313 | 21.6 / 21.8, 305 / 305 | 0 / -8 |

Script calls at rest y 0 (`callsPerSec`): v6 runs `4043:50 i /raf` 32.6 per s (the countdown spring); v7 has none and
instead 1 `onfinish` per s (cd-roll-ca's per-second roll) and 1 rAF per s. Other timers are the same in both.
OBSERVED, one load per build per hold, headless Chrome, our setup. The gpu-preview counts (v5, which carried the
same countdown and hero bytes, plus morph-gpu rev 1) agree on rest y 0: 41.2 main frames, 1.2 rAF.

## Not done here, and caveats

- No timing and no phone runs (the lead's call; the less-work landing rule needs a short phone no-worse check).
- `__fwMorphDrive` (best-build's morph driver hook) still ships, as in v4-v6.
- The end-of-page menu animation on the graphics chip (morph-gpu) is **not** in this build. Lead ruling T-030 #32
  made rev 2 conditional on P-098 and P-099; rev 2 A failed P-098 (first open frame +6.5 ms vs best-build, as rev 1),
  so it stays out (lead, T-111). For the record, a text-only dry stack had shown rev 2 A
  (`fixes/morph-gpu/rev2/delta.diff` at 62b44610, c83d382800d7, plus its build.mjs `__rvPP` -> off flip; on
  best-build = its measured arm ef9d1c9d5fca / f7071e9138ac) applies to v7 with offsets only (JS +495, CSS +173).
- Gates in `gates/` read `out/v7-best/snap` (gitignored); rebuild it with `node fixes/v7-best/gates/snap.mjs`.

## Reproduce

```sh
node tools/fix.mjs combine v7-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca rest-script
node fixes/v7-best/check.mjs --json out/v7-best/check.json
node tools/fix.mjs apply v7-v6base --from best-build,fixes/v7-best/hero-r2-delta.diff
node tools/lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner <you> -- \
  node tools/fix.mjs check v7-best --on v7-v6base --viewport both --save
node fixes/v7-best/gates/snap.mjs
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v7-best/gates/px-chrome.mjs mobile
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v7-best/gates/px-chrome.mjs mobile A=P,V=V
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v7-best/gates/px-chrome.mjs desktop
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v7-best/gates/census-run.mjs A,V
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <you> -- \
  node tools/sim.mjs session --functional --owner <you> -- node fixes/v7-best/gates/px-sim.mjs
```

## P-105 phone no-worse ticket (less-work rule), before any phone data

```
PHONE TICKET P-105 v7-best · less-work no-worse check on the phone (mgmt-ops-10's P-105 terms, 2026-10-04; lead's phone
  order: after the toolbar-resize ablation, iphone-runner's baseline flick block, fix-cd-roll-ca's P-102 quartet and P-100)
  · runner iphone-runner · registered before any phone data; no counted run before mgmt-ops-10's pre-data read
build: V = v7 = fixes/v7-best/patch.diff (c3dc73b1), served JS 8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00,
  CSS 308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d. Built with `node tools/fix.mjs apply p105-v7 --from
  v7-best`; read-only copy out/p105/snap/V (HASHES.txt).
control: C = v6 = best-build + fixes/v7-best/hero-r2-delta.diff (c3dc73b1), JS 8018ce062d30, CSS 71b65c667720
  (`fix.mjs apply p105-v6 --from best-build,fixes/v7-best/hero-r2-delta.diff`; copy out/p105/snap/C). v7 is v6 plus
  cd-strip, cd-roll-ca and rest-script v4, so C is the build every v7 cost count was measured against. Mirror snapshot
  b1789284481295-4ad4a84a.
question: at real thermal Serious, does v7 add slow frames anywhere on the page compared with v6? No-worse only. The
  landing basis is the cost card above (rest y 0: the countdown spring's 32.6 rAF/s gone; layouts and paints SAVE or
  SAME). Prior data not used: the T-113 v7 G runs had no v6 runs beside them, so they cannot be the §5.4 G leg.
ports: `sh fixes/v7-best/phone/serve.sh` (sha256 83ee15958f00): three serve.mjs --root site-pretty [--overlay <copy>]
  --port 0 (OS-assigned, I-131) --latency 150 --vendors=local, plain http (I-003). B = plain baseline (no overlay): the
  pre-warm and gate-timer page, no counted run on it. It checks the copies against HASHES.txt and the served JS/CSS of all
  three ports (expected B 4606120cf392/27776f3d4138, C 8018ce062d30/71b65c667720, V 8c90da217745/308f0da70c3a; exit 4
  on a wrong one). Tried before this ticket: all three ok, then stopped. Phone URLs go to the runner's terminal only.
thermal gate (memory "phone checks start warm"): `node research/phone-thermal-gate/thermal-gate.mjs --owner iphone-runner
  --expect serious --max-c 44 --url <B>` (sha256 4604218c4041) at the start and end of every hold. A hold counts only if
  both reads PASS; otherwise it is VOID and re-run once with the same items. Ceiling 44 °C or Critical: stop and cool.
  Gate failures go to the lead. Low Power Mode runs are dropped.
start method (one for every hold): pre-warm on B. One uncounted S run on B, then the start gate; while it says too cool
  (exit 2), another S run on B and another read, at most 4 pre-warm runs; any other failure, or still too cool, ends the
  hold with no counted run.
holds: `caffeinate -i -s sh fixes/v7-best/phone/hold.sh Hn <items>` (hold.sh sha256 b277523cc943) under the iphone lease
  held by iphone-runner, beside any shared group (lead ruling 2026-10-04 13:0xZ: robot runs need no quiet-Mac hold; each
  record keeps the Mac state). Before every item: serve.sh check (a wrong hash ends the hold VOID) and a lease renew.
  Then the end gate and the I-098 sleep check (`fixes/rest-script/tools/pmcheck.mjs`, sha256 d36bd7437b7c). Last line
  "HOLD Hn VALID" or "HOLD Hn VOID <why>". If another agent's normal chrome-measure hold makes iphone.mjs refuse (WAIT),
  that item has no record and is void; it is re-run, not waited around.
  S leg   H1: wC wV C1 V2 V3 C4 · H2: C5 V6 V7 C8
  G leg   H3: sC gFC1 gFV1 gFV2 gFC2 gFC3 gFV3 sC · H4: the same for H · H5: for M · H6: for E
  then `iphone.mjs park` and `serve.sh stop`. Cooling between holds: `wait.mjs phone-temp --below auto` (<= 10 min) only
  when the end gate said ceiling; otherwise back to back (the start gate decides).
S leg (driver S, Timeline off): `iphone.mjs run --driver scroll --probe std --block P-105 --arm C|V --run <n>`; warm-ups
  with --warmup, one per arm port (A3/U5); counted C V V C C V V C (n = 4 per arm). Every counted C run is the heat
  sentinel (bottom >= 58 fps and scroll >= 44 fps, meta.sentinel).
G leg (driver G, protocol v2 §5.4 whole-page fast flicks, Timeline off): `iphone.mjs gesture <script>`, each run reloads
  the page itself. Scripts (sha256 / GESTURE_HASH, GESTURE_BUDGET_S 150 each):
  - F fresh load: g/flick-fresh-v1.json  076bd7d046b6 / b6a4a96d189b (window fresh-flick -> end)
  - H hero:       g/flick-hero-v1.json   6ae05e12ace9 / 53a8e657fa28 (window down1 -> end)
  - M middle:     g/flick-middle-v1.json 0f97205f1d42 / 34e82a3dddcb (new: still strokes to y >= 1900, then 3 fast
                  down/up fling pairs over about y 1900-3800; window mid1 -> end)
  - E end:        g/flick-end-v1.json    93a1cf7bb091 / 47c5a1b000fb (window into1 -> end)
  F/H/E are the T-113 scripts (E's arrival test `until y >= 5100`). Per part 3 runs per arm in C V V C C V order; the sC
  S run on C opens and closes each G hold as its heat sentinel (uncounted itself).
scorer: `node fixes/v7-best/phone/score.mjs <item>:<file> ... [--json out]` (sha256 b9a29ffcc7bb), in block order over
  the VALID holds; self-test `node fixes/v7-best/phone/selftest.mjs` (sha256 100f55fd2dec, 17 checks OK on synthetic
  records). Frame counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
  - S window: [marks.idle, marks.bottom) (idle at the top + the scroll down). G window: the part's start mark -> end,
    moving frames only (scrollY changed).
  - Gate per leg and G part: d = median(V) - median(C) of the > 50 count. WORSE when d > +2; "threshold-sensitive" when a
    twin's verdict differs. > 34 reported, not gated. Fewer than 3 valid runs in an arm: insufficient (one re-run hold).
  - New cluster (§5.4, lead ruling 12:5xZ), per G part: fixed 250 px bins of scrollY (§3.4). A V cluster is a bin with a
    moving frame > 50 ms in >= 2 valid V runs; it is NEW when no valid C run has one there or in a neighbouring bin.
    Any new cluster fails, even inside +2. Scored with > 46 and > 54 too (clusterThresholdSensitive).
  - Descriptive: every slow G frame (> 34) with its y, innerHeight and whether the toolbar height stepped within one frame.
void (dropped and listed):
  - S: run error; served JS/CSS not the arm's (meta.served); Low Power Mode; no idle/bottom marks; no record.
  - G: no record; run.aborted; any run.errors entry; missing start or end mark; median moving dt > 25 ms (30 Hz, LPM
    suspect); the hold's served check before the item not all ok.
  - Heat: a counted C S run or an sC run whose sentinel is not pass voids itself and every run (S or G, either arm) since
    the last passing sentinel. A VOID hold (gate, sleep, served hash) voids all its runs.
  - An I-127/I-141 inspector drop shows as no record or an aborted run: void, re-run in the same order.
  Re-runs: at most one extra hold per leg (S: C V V C; G: the part's hold again). Then report as it stands.
verdict: no-worse when every gate (S, GF, GH, GM, GE) is no-worse; WORSE when any is WORSE or has a NEW CLUSTER;
  insufficient otherwise. The report gives per-part medians, d, the twins and the cluster lists.
predictions (before data):
  - S leg > 50 no-worse: P 0.85 (v7 only removes main-thread work at rest and in the countdown; S hit few slow frames in
    v6 already).
  - G parts no-worse on > 50: F 0.8, H 0.8, M 0.8, E 0.75 (the hero and toolbar-step frames seen in T-113 are in both
    builds; E has the end-of-page menu, not changed by v7, and the noisiest flicks).
  - No new cluster in any part: P 0.65 (4 parts, 3 runs per arm, the >= 2-of-3 rule against flick noise).
  - All sentinels pass on the first try: P 0.7. Overall no-worse (all of the above): P 0.5.

## P-105 result: v7 vs v6 on the phone (iphone-runner, 2026-10-04)

**Verdict: WORSE (threshold-sensitive), on the hero flicks (GH) only.** S, GF, GM and GE are no-worse; no new cluster
in any part. Scorer `fixes/v7-best/phone/score.mjs` sha256 b9a29ffcc7bb (frozen, unchanged), over every VALID hold in
block order. v8 has since landed (743295de), so this result is a record for v7, not a landing gate.

| gate | C runs | V runs | d >50 | twins >46 / >54 | d >34 | new cluster | verdict |
|---|---|---|---|---|---|---|---|
| S | 4 | 4 | -1 | +0.5 / -0.5 | +3.5 | n/a | no-worse |
| GF fresh load | 3 | 3 | 0 | -1 / -1 | -1 | none | no-worse |
| GH hero | 3 | 3 | **+3** | +3 / +1 | +1 | none | **WORSE (threshold-sensitive)** |
| GM middle | 3 | 3 | 0 | +1 / 0 | +1 | none (>46 twin: 3250-3499) | no-worse; cluster threshold-sensitive |
| GE end | 3 | 3 | 0 | 0 / 0 | 0 | none (>46 twin: 4750-4999) | no-worse; cluster threshold-sensitive |

GH per run (>50): C 7, 7, 8; V 10, 9, 10. Moving frames C 511, 517, 623; V 611, 540, 616. Per 100 moving frames: >50
C 1.35, V 1.64; >34 C 4.06, V 3.76. The S leg's +3.5 on >34 (reported, not gated) is not repeated in the flicks: G >34
deltas are -1, +1, +1, 0, and per moving frame V is lower on GF and GH.

Extra reads asked by the lead (no new rule; the frozen scorer's own functions):
- Warm-up sensitivity (the G holds give the V port no uncounted warm-up, see below): without each G hold's first V item
  GH d >50 is +2.5 (twins +3 / +1), still WORSE; GF -0.5, GM 0, GE +0.5. Not warm-up-sensitive.
- N3 (max scrollY per arm): GH C 3376-3620, V 3482-3559; F/M/E within 30 px. Same page geometry; bins compare as is.

Block record:

| hold | items | pre-warm | start / end gate | note |
|---|---|---|---|---|
| H1 | wC wV C1 V2 V3 C4 | 1 | Serious / end gate xctrace killed at 90 s | VOID (I-154); files not used |
| H1r | wC wV C1 V2 V3 C4 | 1 | Serious 38.5 / 38.4 | VALID; beside the shared group |
| H2 | C5 V6 V7 C8 | 1 | Serious 41.0 / 40.2 | VALID; beside the shared group |
| H3 (1st) | F part | 4 | Fair 37.4-37.6 | VOID at the opening gate, no counted run (lead: no re-run used) |
| H3 | sC + F part + sC | 1 | Serious 38.5 / 38.9 | VALID; 2 uncounted G flicks on B before; exclusive no-timing hold |
| H4 | sC + H part + sC | 1 | Serious 38.9 / 39.1 | VALID; exclusive no-timing hold |
| H5 | sC + M part + sC | 1, blocked | Serious 39.1 / 39.7 | VALID; 3 uncounted G flicks on B in the queue gap, the 3rd overlapped the hold start and blanked Safari, so the hold's pre-warm S run got no data (lead ruling: H5 stands) |
| H6 | sC + E part + sC | 1 | Serious 38.1 / 39.3 | VALID; 6 uncounted G flicks on B before; exclusive no-timing hold |

- Every counted run exited 0; every sentinel passed; pmcheck OK in every hold; served hashes checked before every item.
- Ticket gaps, recorded: (1) hold.sh labels both sC runs `p105-sC-<H>`, so the closing one overwrote the opening one's
  files; from H3 on the opening sC was copied aside (`p105-sC-<H>-open.json`) and scored in place. No verdict effect.
  (2) The G holds have no uncounted warm-up on the V port (A3/U5 not met for V): gFV1, gHV1, gMV1 and gEV1 are flagged
  "no port warm-up"; the sensitivity read above covers them. (3) H3-H6 ran inside exclusive no-timing holds (lead,
  mid-block, for a quiet Mac); H1r and H2 ran beside the shared group.
- Outputs (gitignored): `out/p105/runs/` (hold logs, run records, check logs), `out/p105/score-all.json`, warm-up logs
  in `out/p105/warm*`.
