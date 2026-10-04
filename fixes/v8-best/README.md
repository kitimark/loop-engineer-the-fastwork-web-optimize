# Fix: v8-best (wave integration: v7 + countdown K + countdown faces + exact accent + morph rev 3 + one glue line)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and checked by bytes (40/40), function, frozen pixels and work counts (sections below); **not timed**
(memory `defer-timing-focus-call-tree.md`). Phone gate (less-work no-worse + whole-page fast-flick G): see "Phone gate".
PROGRESS row `v8-best` is `best: false` until the lead signs it.
**Integrator:** int-v8 (wave-integrator), 2026-10-04 (status board item `v8`, user T-114 #9).
**Build:** `patch.diff` (baseline-relative, 2 files) = JS `3e3e94cb6e9f…`, CSS `f836404b3728…` (the 8 parts alone, without the glue: JS `3b4774f9a6da`) (full hashes in
`results.json`); baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css` (nothing else).

## Components and order

| # | component | patch (sha256/12) | made on | its own build (JS / CSS) |
|---|---|---|---|---|
| 1 | best-build (v4) | `fixes/best-build/patch.diff` 9bf4c6e41f11 | baseline | 65052c4a3902 / e0f92804c521 |
| 2 | hero R2 delta (v6 = B-R2) | `fixes/v7-best/hero-r2-delta.diff` a8daa419b791 | best-build | v6 8018ce062d30 / 71b65c667720 |
| 3 | cd-strip strip-tc (PR-008 rev 2) | `fixes/cd-strip/patch.diff` 4f2ff4eb9afa | st6-rb2 | 6fa0e1e8a221 / 982a747d9263 |
| 4 | **cd-roll-ca K** (PR-017 rev 5 land-k; replaces V9 d48095cc16ff, kept in 1bb87be9) | `fixes/cd-roll-ca/patch.diff` 0ba6f9a0b686 | cd-strip build | b43fe790c20c / 982a747d9263 |
| 5 | **countdown-faces (b)** hide while unseen + stopped 1 s interval | `fixes/v8-best/faces-delta.diff` (moved from `fixes/countdown-faces/patch.diff` 67a9dff1eda5) | v6 + strip + K (owner: mi + strip + V9, 3d70edb5bf31) | owner's V 9c098e608a0f / 982a747d9263 |
| 6 | rest-script v4 (P-094) | `fixes/rest-script/patch.diff` be2b46a3ceaf | st6-rb2 | 520d5f1139c7 / f523598b2a24 |
| 7 | **accent-ca exact** (PR-019 option exact, user-accepted) | `fixes/accent-ca/e1-delta.diff` 7d2156af3df8 (CSS only) | v7-best | accent-ca-v7 8c90da217745 / 7eda63cc7015 (`fixes/accent-ca-v7/patch.diff` 2779e3f31376) |
| 8 | **morph-gpu rev 3** (one CSS line, `.start-selling-platform` opacity `min(var(--morph-fade), 0.9999)`) | `fixes/morph-gpu/rev3/delta.diff` 47518661e2d0 | best-build | fd 65052c4a3902 / e4c80db5e0a8 |
| 9 | **glue** faces x hero R2 (F-235; lead ruling (b), agreed by fix-hero-exit-threaded and de-countdown) | `fixes/v8-best/glue-heup.diff` | v8 parts 1-8 (3b4774f9a6da) | v8 3e3e94cb6e9f / f836404b3728 |

Command (all 9 applied, no conflicts):

```sh
node tools/fix.mjs combine v8-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca \
  fixes/v8-best/faces-delta.diff rest-script fixes/accent-ca/e1-delta.diff fixes/morph-gpu/rev3/delta.diff \
  fixes/v8-best/glue-heup.diff
```

Offsets (git apply's exact context): cd-strip CSS +276, rest-script JS +471 (its later hunks), morph rev 3 CSS +203; all
others 0. v7's combine with the cd-roll-ca slot now K, plus three parts.

### The one textual interaction: countdown-faces and the hero R2 delta

- **countdown-faces on K: unchanged.** The owner's patch (made on mi + strip + V9) applies on mi + strip + K with
  exact context, offsets only (+35, +42). K's change (V9 → K: `__crQ`, `__crPath`, `__crAt`, the `__crPlay`
  keyframes) and faces' change commute: faces build + (V9 → K) = faces on K, and back.
- **countdown-faces on the hero: one context line.** faces' hunk in the hero exit writer `s()` had `o = !1,` as its
  first context line; the hero R2 delta inserts its CSS-mode block (`heCss` … `heOff`) between `o = !1,` and
  `s = () => {`. `faces-delta.diff` is that patch with this one context line dropped (unique placement checked);
  every +/- line is the owner's, hunk for hunk (13 hunks). The hero delta in turn carries faces' first changed `s()`
  line as trailing context, so the hero goes before faces; with that line trimmed the other way round, hero-then-faces
  and faces-then-hero give the same bytes.
- **Behaviour (read from the code, not measured; finding F-235).** faces sets `__cdHeroShown` in `s()` next to
  `--exit-opacity`. In R2's live CSS mode (WebKit touch phones only: `GestureEvent`, coarse pointer, short side
  ≤ 600) `s()` does not run per frame: `heUp()` runs it once before going live (inside the exit range, so `shown` =
  true), and `heRest`/`heSc` park run it again. So while live, the hero clock is never held (C's own behaviour, it
  rolls unseen); it is held again once the page parks. It is never left un-shown on a visible clock, except with stale
  `heTop`/`heEnd` geometry, and then only for the IntersectionObserver's one-frame lag. Net: a little less saving on
  the phone while live, no visual change. Chrome never takes CSS mode, so only the Simulator and phone gates exercise
  this path. Told de-countdown and fix-hero-exit-threaded.
- **The glue line (component 9).** de-countdown found the one gap in that reading: `heEnd` is cached in `heArm` with
  that moment's `innerHeight`, `s()` reads the current one; after an iOS toolbar collapse (about +40 px) a go-live just
  under `heEnd` can compute r = 0, so `shown` = false and stays false while live, and a one-frame jump back into the
  fade range could paint one frame of held digits (code reading only, not observed). Lead ruling (b): `heUp` sets
  `__cdSet(__cdHeroShown, !0)` right after `s()` (`glue-heup.diff`, 1 line changed + 2 comment lines, applied last).
  fix-hero-exit-threaded agreed: with a fresh `heEnd` a go-live always has r > 0, so nothing changes there; with a stale
  one, the cost is at most digit updates under a hidden hero until `heRest` (300 ms after the last scroll) writes the
  real value; no effect on the hero's writes, classes, timers or pixels. `__cdSet` is Svelte's `set` (`z`): `s()`'s
  false and the glue's true in one task leave the state true before any effect flush.

## Identity checks (`node fixes/v8-best/check.mjs`, 40/40 ok)

Text only (40 checks), best-build's strict applier (exact context, no fuzz), plus a context-trimming applier used only for the
hero/faces pair (it never changes a +/- line and requires one unique placement):
- every input rebuilt from its committed patch equals its owner's hashes: st6-rb2, best-build, morph-inherit, hero R2,
  v6, cd-strip, cd-roll-ca V9 (from 1bb87be9) and K, rest-script, v7-best, accent-ca-v7 (and its e1 delta on v7),
  morph-gpu rev 3 (fd), countdown-faces' base C (3d70edb5bf31) and its V (9c098e608a0f);
- the faces rebase checks above;
- all 24 orders of the groups [hero + countdown], [rest], [accent], [morph] give the same bytes, and [strip, K] before
  the hero too; `fix.mjs combine`'s overlay equals the strict build; `patch.diff` on the baseline equals v8;
- the glue: one changed line + two comment lines, JS only; v8 − glue = the pure composition (3b4774f9a6da); the glue
  applied right after faces (before rest, accent, morph) gives the same bytes;
- by reversal, from the pure composition (v8pure = v8 − glue):
  - v8pure − morph − accent − faces = v7 with K, and that − K + V9 = **v7-best** (8c90da217745 / 308f0da70c3a);
  - v8pure − morph − faces − K + V9 = **accent-ca-v7** (8c90da217745 / 7eda63cc7015);
  - v8pure − morph − accent − rest − faces − K − strip = **v6** (B-R2);
  - v8pure − accent − rest − faces − K − strip − hero = **morph-gpu rev 3** fd (65052c4a3902 / e4c80db5e0a8);
  - v8pure − hero − morph − accent − rest − faces − (best − st6) = **cd-roll-ca K** (b43fe790c20c);
  - v8pure − hero − morph − accent − rest − (best − mi) = faces on mi + strip + K = **countdown-faces' build** + (V9 → K);
  - v8pure − hero − morph − accent − faces − K − strip − (best − st6) = **rest-script v4**;
  - v8pure − all = best-build;
- `node --check` on the v8 JS.

## Function: `fix.mjs check` (v8 vs v7, headless Chrome, both viewports; 2026-10-04 15:11Z)

`fixes/v8-best/check.json`; base = `v8-v7base` (v7-best overlay), `--on v8-v7base --viewport both --save`, shared lane.

| viewport | new errors | new 404s | morph reached | elements v7 -> v8 | screenshot diff % top / middle / bottom |
|---|---|---|---|---|---|
| mobile 430 | 0 | 0 | yes / yes | 1580 -> 1580 | 0.08 / 0.01 / 0.46 |
| desktop | 0 | 0 | yes / yes | 1424 -> 1423 | 0.05 / 0 / 0 |

CHECK OK. The live-page diffs are countdown and orbit phase (frozen pixels below decide). Desktop's one element fewer is
followed up in the frozen-pixel and census runs.

<!-- GATES -->
## Gate results (v8 vs v7; arms from `out/v8-best/snap`, A = v7, V = v8; shared lane, no timing)

**Frozen pixels, Chrome** (`gates/px-chrome.mjs`, PR-010 method: loads A V A2 V2, Date.now frozen, animations paused at
4000 ms; "consistent" = over 8 levels in A~V beyond A~A2 and in A2~V2 beyond V~V2).
- Phone width 430x932 DPR 3 (15:14Z), 13 stops 0-5346: consistent at most 12 css px² (y 1913, `#people` image, also in
  A~A2 at 0.75 %) and 11 (y 1422); y 0, 548 and every stop from 2403 down are 0. Within T2.
- Desktop 1440x900 (15:25Z), 13 stops 0-8448: one cluster above T2 on its face, y 300, 9957 css px² (0.77 %, max 110),
  on `em.script-accent`. Cause: the accent's word rotator (setTimeout: idle 1250 ms, draw-out 900, draw-in 900, 7 words)
  is not frozen by pausing animations; both v8 loads froze mid-draw-out (a frozen finished stroke-out is blank), the v7
  loads idle and mid-draw-out of another phase. **Recheck with the rotator aligned** (`PX_ALIGN=1 PX_YS=0,300,548`,
  16:01Z: each stop waits until the accent enters idle showing load A's word, then freezes): **0 css px² at y 0, 300 and
  548 in every pair** (max level ≤ 2). The other desktop cells are within T2: y 0 160 css px² (max 61, the hero button
  edge, gone in the aligned run), y 1739 / 2577 `section.feed` images 0.35 / 0.27 % (max 114-116, flat 0, and V~V2
  differs by 0.58 / 0.45 % there: per-load image state), y 4255 / 5932 / 7609 consistent 0.
- The check's 0.46 % at the phone-width bottom (live shot, not frozen) is the same per-load state as v7-best's own check
  (0.42 % there); the frozen stops at the bottom (4856, 5346) are 0.

**Element count** (`gates/dom-count.mjs`, 16:00Z; 4 loads A V A2 V2; tag.class tokens at load, after a walk to the
bottom, and 3 s later): desktop 1224 → 1409 → 1409 and phone width 1381 → 1578 → 1578 in **all four loads, v7 and v8
equal**. The only tokens that differ between loads are the accent state (`is-idle` / `is-drawing-in|out`) and the
splash classes, and they differ between two loads of the same build too. So the check's desktop 1424 → 1423 is a
per-load state (the moment the check counts), not an element v8 removes.

**Work counts, Chrome desktop** (`gates/census-run.mjs`, both orders A,V and V,A; per 6 s at rest, and one scroll):
| phase | v7 paint (2 runs) | v8 paint (2 runs) | elements restyled v7 / v8 | layout, rAF |
|---|---|---|---|---|
| rest y 0 | 145 / 142 | 74 / 72 | 355 / 323 → 249 / 269 | equal |
| rest y 1400 | 149 / 151 | 79 / 79 | 544 / 522 → 466 / 499 | equal |
| rest y 2796 | 1.5 / 1.5 | 0 / 0 | 56 / 68 → 17 / 17 | equal |
| rest page end | 8.7 / 9 | 0.7 / 0.7 | 26 / 28 → 1.2 / 1.2 | equal |
| scroll top → end | 221 / 243 | 202 / 198 | 2213 / 2214 → 2149 / 2232 | equal |
v8 does less work at rest everywhere (paint about half at the top; nothing at the page end), and no count rises.

**Widths** (de-breakpoints-v7's method, `research/breakpoints/run.sh`, OVL = v8, BOVL = v7, arms B S B2):
- census, 5 configs (c430, c768t, c1440, c932l, rm1440): 0 exceptions, console errors or 404s; equal page heights and
  media-query states; rest paint lower in v8 at every config (430: 672/607 → 416; 768t 632/631 → 376; 1440 643/635 →
  374; 932l 641/623 → 380; rm1440 131/137 → 123); rest layers 151 → 147 at 430, equal elsewhere; scroll layouts,
  recalcs and frames equal (within B~B2).
- pixels, 14 configs x 6 stops = 84 cells, hero title accent masked: 0 errors. 66 cells are 0; the rest are the A/A
  floor (AB = AA with S~B2 0: c430 hero, c768t top, c1024 top/hero, c1440 end, rm1440 commission), one-pixel slivers
  (c600, c768t, c1440 top, ≤ 0.017 %), the commission counter mid-count (c1920, $16 vs $17), a 14x8 px edge next to
  the language button at rm1440 (0.006 %, maxd 107), and one flagged cell, **c1920 people 0.119 %**: the Spotify embed
  (an iframe) renders its text sharper in v8's one load than in both v7 loads; no v8 part touches the embed (per-load
  iframe state).
- **Second 1920 sample** (16:1xZ, `OUTNAME=v8-pix2`): people AB 0 % (the embed difference does not repeat; this time
  B2 differs from both B and S by 0.255 %), hero 0 %, commission 0.001 %; end 0.014 % (a 76x3 px line, maxd 207) in S
  against both v7 loads, the same cell and size that sample 1 showed in B2 against B and S: a per-load state either
  build takes. Widths: **no v8 change beyond per-load states.**

**Pending:** iPad Simulator smoke and Simulator WebKit pixels (after P-112, lead / I-160);
Mac Safari smoke (Safari's remote automation is off: needs the user); P-111 G leg and verdict; P-112 attribution.

## P-111 phone no-worse ticket (less-work rule), before any phone data

Lead's id: P-111 (P-110 is toolbar-resize's). Runner: iphone-runner; verdict owner: int-v8. The scripts in
`fixes/v8-best/phone/` are P-105's (iphone-runner, b9c7d1eb) with the arms changed, the S leg replaced by a W leg and an M
leg added; the G scripts are P-105's files, byte for byte.

```
PHONE TICKET P-111 v8-best · less-work no-worse check on the phone (lead rulings 2026-10-04: v7-best C vs v8 V; accent
  y 0, countdown hero + pastHero rest, morph end-open M; then the whole-page fast-flick G check, T-113 #4)
  · runner iphone-runner (lead: right after its own P-105 H2) · verdict owner int-v8 · registered before any phone data;
  no counted run before the lead's pre-data read
build: V = v8 = fixes/v8-best/patch.diff, served JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16,
  CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43 (9 components, glue included; table above).
control: C = v7 = fixes/v7-best/patch.diff, JS 8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00,
  CSS 308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d. v8 = v7 with V9 -> K, + countdown-faces,
  + accent exact (CSS), + morph rev 3 (one CSS line), + the heUp glue. Mirror snapshot b1789284481295-4ad4a84a.
copies: out/p111/snap/{C,V} in int-v8's worktree (`sh fixes/v8-best/phone/serve.sh snap`, from out/v8-best/snap/{A,V},
  which `node fixes/v8-best/gates/snap.mjs` rebuilds from the committed patches and refuses on any hash difference);
  read-only, HASHES.txt (full sha256 as above).
question: at real thermal Serious, does v8 add slow frames compared with v7 (a) at rest at y 0 (accent, hero clock),
  (b) through the hero, (c) at rest past the hero (countdown-faces holds the hero clock there; v7 rolls it unseen),
  (d) in the morph open/close at the page end, (e) in whole-page fast flicks? No-worse only. Landing basis: the
  identity checks, the frozen pixels and the counts in this README.
ports: `sh fixes/v8-best/phone/serve.sh` (sha256 73c4bf67dba0): three serve.mjs --root site-pretty [--overlay <copy>]
  --port 0 (OS-assigned, I-131) --latency 150 --vendors=local, plain http (I-003). B = plain baseline (no overlay): the
  pre-warm and gate-timer page, no counted run on it. Checks the copies against HASHES.txt and the served JS/CSS of all
  three (B 4606120cf392/27776f3d4138, C 8c90da217745/308f0da70c3a, V 3e3e94cb6e9f/f836404b3728; exit 4 on a wrong one).
  Started by int-v8 15:14Z, all three ok; ports go to the runner by message, never into a committed file.
thermal gate, start method, sleep check: as P-105, unchanged (thermal-gate.mjs 4604218c4041 --expect serious --max-c 44
  --url <B> at the start and end of every hold; pre-warm on B with S runs, at most 4; pmcheck.mjs d36bd7437b7c). A hold
  counts only if both reads PASS; else VOID, re-run once with the same items. Ceiling 44 °C or Critical: stop and cool.
  Low Power Mode runs are dropped.
holds: from int-v8's worktree, `RUNNER=iphone-runner caffeinate -i -s sh <int-v8 worktree>/fixes/v8-best/phone/hold.sh Hn
  <items>` (hold.sh sha256 9a29f95cf06a) under the iphone lease held by iphone-runner, beside any shared group (lead
  ruling 13:0xZ). Before every item: serve.sh check (a wrong hash ends the hold VOID) and a lease renew. Last line
  "HOLD Hn VALID" or "HOLD Hn VOID <why>". An item whose iphone.mjs refuses (WAIT) has no record: void, re-run.
  W leg   H1: wC wV C1 V2 V3 C4 · H2: C5 V6 V7 C8
  M leg   H3: mC1 mV2 mV3 mC4 · H4: mC5 mV6 mV7 mC8
  G leg   H5: sC gFC1 gFV1 gFV2 gFC2 gFC3 gFV3 sC · H6: the same for H · H7: for M · H8: for E
  then `iphone.mjs park` and `serve.sh stop` (int-v8 stops the servers). Cooling between holds only when the end gate
  said ceiling (`wait.mjs phone-temp --below auto`, <= 10 min); otherwise back to back.
W leg (driver W, Timeline off; P-093's driver): `iphone.mjs run --driver window --probe std --block P-111 --to 2700
  --idle 8 --hold 6 --sentinel 3 --arm C|V --run <n>`: 8 s at rest at y 0, steps to y 2700 (past the hero track;
  countdown-faces' pastHero is ~2560 in Chrome geometry, the phone sits ~77 px off), 6 s at rest there, 3 s at the
  bottom. Warm-ups --warmup, one per arm port (A3/U5, also the M leg's); counted C V V C C V V C (n = 4 per arm).
  Every counted C W run is a heat sentinel (bottom >= 58 fps and scroll >= 44 fps).
M leg (driver M, Timeline off; P-098's driver): `iphone.mjs run --driver morph --probe std --block P-111 --arm C|V --run
  <n>`, hold 2000 ms, cycles 3 (6 tweens at the page's max scrollY). Counted C V V C C V V C. Every counted C M run is a
  heat sentinel (held m=1 p95 <= 18 ms).
G leg (driver G, Timeline off; P-105's §5.4 parts): `iphone.mjs gesture <script>`, each run reloads the page itself.
  Scripts (sha256 / GESTURE_HASH, GESTURE_BUDGET_S 150 each), identical to P-105's:
  - F fresh load: g/flick-fresh-v1.json  076bd7d046b6 / b6a4a96d189b (window fresh-flick -> end)
  - H hero:       g/flick-hero-v1.json   6ae05e12ace9 / 53a8e657fa28 (window down1 -> end)
  - M middle:     g/flick-middle-v1.json 0f97205f1d42 / 34e82a3dddcb (window mid1 -> end)
  - E end:        g/flick-end-v1.json    93a1cf7bb091 / 47c5a1b000fb (window into1 -> end)
  Per part 3 runs per arm, C V V C C V; an sC S run on C opens and closes each G hold as its heat sentinel (uncounted).
scorer: `node fixes/v8-best/phone/score.mjs <item>:<file> ... [--json out]` (sha256 26d944bf93e2), in block order over the
  VALID holds; self-test `node fixes/v8-best/phone/selftest.mjs` (sha256 a4b0fc78d40a, 20 checks OK on synthetic
  records). Counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
  - W top: [marks.idle start, marks.scroll end) with yEnd < 1000 (P-093's window). W rest: [marks.hold start, end).
    Both gated: d = median(V) - median(C) of > 50; WORSE when d > +2; threshold-sensitive when a twin differs.
    W idle (y 0 at rest, inside top): reported.
  - M (P-098's terms): moving frames (m differs from the previous or next frame's); > 50 WORSE when d > +1, > 34 when
    d > +2. Tween start frames from the driver rows (f1, f2, f3 for O1-O3, C1-C3; close = per run median of C1-C3):
    O1.f1, O1.f2, O1.f3, close.f1, close.f3 WORSE when d > +2 ms; others reported.
  - G per part: moving frames between the part's start mark and end; > 50 gate as W; new cluster (§5.4, lead ruling
    12:5xZ): fixed 250 px bins of scrollY; a V cluster is a bin with a moving frame > 50 ms in >= 2 valid V runs; NEW when
    no valid C run has one there or in a neighbouring bin; any new cluster fails even inside +2; > 46 / > 54 reported.
  - Fewer than 3 valid runs in an arm (per part for G): insufficient.
void (dropped and listed):
  - W/M/S: no record; not the item's driver; run error; served JS/CSS not the arm's (meta.served); Low Power Mode;
    W: no idle/scroll/hold marks; M: no drive mark, no m seen, tween starts != 6, driver tweens not O1 C1 O2 C2 O3 C3.
  - G: no record; run.aborted; any run.errors entry; missing start or end mark; median moving dt > 25 ms (30 Hz, LPM
    suspect); the hold's served check before the item not all ok.
  - Heat: a counted C W run, a counted C M run or an sC run whose sentinel is not pass voids itself and every run (any
    leg, either arm) since the last passing sentinel. A VOID hold (gate, sleep, served hash) voids all its runs.
  - An I-127/I-141 inspector drop shows as no record or an aborted run: void, re-run in the same order.
  Re-runs: at most one extra hold per leg (W/M: C V V C; G: the part's hold again). Then report as it stands.
verdict: WORSE when any gate (Wtop, Wrest, Mmoving, Mtweens, GF, GH, GM, GE) is WORSE or has a NEW CLUSTER; else
  insufficient when any is; else no-worse. The report gives per-gate medians, d, the twins and the cluster lists.
  WORSE -> v8 does not land as is; int-v8 finds the leg's component by the reversal builds and reports to the lead.
predictions (before data):
  - W top no-worse: P 0.85 (at y 0 v8 changes the roll keyframes (K) and the accent's CSS; both measured equal or
    less work in Chrome and the Simulator). W rest no-worse: P 0.9 (v8 does less there: the hero clock is held).
  - M moving no-worse: P 0.85; M tweens no-worse: P 0.8 (rev 3 removes the fade's repaint from every open and close in
    the Simulator; the phone's first open is the noisiest key).
  - G parts no-worse on > 50: F 0.8, H 0.75 (the hero R2 path now also writes the faces state at go-live), M 0.8, E 0.75.
  - No new cluster in any part: P 0.65. All sentinels pass on the first try: P 0.7. Overall no-worse: P 0.4.
minutes: ~95 (range 80-130): 8 holds; W runs ~1.4 min, M runs ~0.8 min, G runs ~2 min, each hold + pre-warm and gates
  (~3 min).
```

## P-112 morph close-tween attribution ticket (lead 2026-10-04 15:5xZ), before any P-112 data

Why: P-111's M leg (H3-H4, 4 + 4 valid runs) is WORSE on the scored close keys. close.f1 is 28 → 30.5 ms (d +2.5) and
close.f3 is 60 → 63.5 ms (d +3.5). The warm opens are much faster: O2.f1 53 → 36 ms, O3.f1 53 → 37 ms (reported). The
ticket's rule says "WORSE → find the leg's component by the reversal builds". Only morph-gpu rev 3 changes code that
runs at the page end. This block checks whether rev 3 causes the slower close start. Runner: iphone-runner;
verdict owner: int-v8. Order: right after P-111 H8, before P-105 H3-H6.

```
PHONE TICKET P-112 v8-best · attribution of P-111's slower morph close start (M leg only) · runner iphone-runner (after
  P-111 H8, before P-105 H3) · verdict owner int-v8 · registered before any phone data; no counted run before the
  lead's pre-data read
build: V = v8 (as P-111): JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16,
  CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43.
control: C = v8 minus morph-gpu rev 3: v8's copy with fixes/morph-gpu/rev3/delta.diff reversed (patch -R --fuzz=0,
  strict; one CSS line, `opacity: min(var(--morph-fade), 0.9999)` back to `opacity: var(--morph-fade)`):
  JS 3e3e94cb6e9f… (the same), CSS 7eda63cc70155d8abfd89ceb5ea33a7dedbc6f7def014d60b8f11e85acf5d0ea.
  Reversal proof: that CSS is byte-identical to accent-ca-v7's (7eda63cc7015, built independently from v7 + the exact
  accent). Identity line "v8pure − morph − faces − K + V9 = accent-ca-v7" above shows K and faces change only the JS.
  So C differs from V only by rev 3's one line.
copies: out/p112/snap/{C,V} in int-v8's worktree (`sh fixes/v8-best/phone/p112/serve.sh snap`, made 15:5xZ, snap ok);
  read-only, HASHES.txt.
question: at real thermal Serious, does rev 3 cause v8's longer morph close start? Attribution only, no landing basis.
ports: `sh fixes/v8-best/phone/p112/serve.sh` (sha256 6b33baed1949, P-111's serve.sh with the arms changed): B plain
  baseline, C, V; serve.mjs --port 0 --latency 150 --vendors=local, plain http. Served-hash check before every item
  (B 4606120cf392/27776f3d4138, C 3e3e94cb6e9f/7eda63cc7015, V 3e3e94cb6e9f/f836404b3728; exit 4 on a wrong one).
  int-v8 starts them; ports go to the runner by message, never into a committed file.
thermal gate, start method, sleep check: as P-111 (thermal-gate.mjs --expect serious --max-c 44 --url <B> at the start
  and end of every hold; pre-warm on B with S runs, at most 4; pmcheck.mjs). A hold counts only if both reads PASS;
  else VOID, re-run once with the same items.
holds: `RUNNER=iphone-runner caffeinate -i -s sh <int-v8 worktree>/fixes/v8-best/phone/p112/hold.sh Hn <items>`
  (sha256 2f57b979a617: P-111's hold.sh with only M items, an M warm-up item per port, folder out/p112/runs, labels
  p112-*, --block P-112). Under the iphone lease held by iphone-runner, beside any shared group.
  H1: wmC wmV mC1 mV2 mV3 mC4 · H2: mC5 mV6 mV7 mC8 (counted C V V C C V V C, n = 4 per arm)
  then `iphone.mjs park`; int-v8 stops the servers.
M leg (P-111's driver line unchanged): `iphone.mjs run --driver morph --probe std --block P-112 --arm C|V --run <n>`,
  hold 2000 ms, cycles 3 (O1 C1 O2 C2 O3 C3 at the page's max scrollY). Warm-ups wmC / wmV (--warmup), uncounted.
  Every counted C M run is a heat sentinel (held m=1 p95 <= 18 ms); a failing one voids every run since the last
  passing one (either arm).
scorer: `node fixes/v8-best/phone/p112/score.mjs <item>:<file> ... [--json out]` (sha256 831ca91ad2a1). It runs P-111's
  scorer unchanged (fixes/v8-best/phone/score.mjs 26d944bf93e2, refused if changed) with arm C's expected build set to
  v8 − rev 3, over the M gates only. Self-test `node fixes/v8-best/phone/p112/selftest.mjs` (54183e5fdba1, 4 checks OK
  on P-111's M records: v7 records void under P-112's C; P-111's M leg → CAUSE with d +2.5 / +3.5; V closes 3 ms
  shorter → NOT THE CAUSE; warm-ups skipped).
  - Mtweens: O1.f1, O1.f2, O1.f3, close.f1, close.f3 WORSE when d = median(V) − median(C) > +2 ms (close = per run
    median of C1-C3). Mmoving: > 50 WORSE when d > +1, > 34 when d > +2; twins reported.
  - Reported: every tween key, and the O2/O3 opens (f1, f2, f3; C, V, d).
  - Voids as P-111's M leg (no record, driver, run error, served build not the arm's, Low Power Mode, no drive mark,
    no m, tween starts != 6, driver tweens not O1 C1 O2 C2 O3 C3; heat chain; VOID hold). At most one extra hold.
verdict:
  - CAUSE when Mtweens is WORSE: rev 3 is the cause of P-111's longer close start.
  - falsifier: close.f1 and close.f3 d ≤ +2 ms → rev 3 is not the cause ("NOT THE CAUSE", with Mmoving no-worse).
  - MIXED when the tweens are no-worse and Mmoving is WORSE.
  - insufficient when an arm has fewer than 3 valid runs.
  With CAUSE, the lead rules on the trade: v8 with rev 3 (slower close start, much faster warm open) or without it.
  With NOT THE CAUSE, int-v8 continues the reversal search (faces, K, accent, glue) and reports to the lead first.
predictions (before data): CAUSE P 0.65 (rev 3 keeps `#platform` below opacity 1, so the section stays a
  transparency group through the close; the close start pays for it; code reading only, not observed).
  O2/O3 opens faster in V by ≥ 10 ms: P 0.85 (rev 3's Simulator open-frame result). Sentinels pass first try: P 0.75.
minutes: ~25 (2 holds; M runs ~0.8 min, warm-ups 2, pre-warm and gates ~3 min each).
```

## P-111 result (2026-10-04 15:2xZ-16:2xZ, iphone-runner; scored by int-v8): WORSE

All 8 holds VALID: every start and end gate was Serious, every pmcheck passed, no void. Every heat sentinel passed: the
W/M C runs and the sC runs. H5's opening sC record was lost: hold.sh gave both sC runs of a hold one label, so the closing
run overwrote it, and only its exit 0 is known; H5's closing sentinel passed. The opening records for H6-H8 were saved
apart by the runner. Score: `out/p111/score.json`, scorer 26d944bf93e2, in block order over H1-H8.

| gate | C (v7) | V (v8) | d | verdict |
|---|---|---|---|---|
| W top > 50 (median per run) | 0.5 | 2 | +1.5 | no-worse |
| W rest > 50 | 0 | 0 | 0 | no-worse |
| M moving > 50 / > 34 | 2 / 3.5 | 0 / 2.5 | −2 / −1 | no-worse |
| M tweens O1.f1 / f2 / f3 (ms) | 35.5 / 49 / 65.5 | 33.5 / 47 / 61.5 | −2 / −2 / −4 | no-worse |
| M tweens close.f1 (ms) | 28 | 30.5 | **+2.5** | **WORSE** |
| M tweens close.f3 (ms) | 60 | 63.5 | **+3.5** | **WORSE** |
| reported: O2.f1 / O3.f1 (ms) | 53 / 53 | 36 / 37 | −17 / −16 | (faster) |
| G F fresh > 50 | 4 | 3 | −1 | no-worse, no new cluster |
| G H hero > 50 | 8 | 9 | +1 | **NEW CLUSTER at 2500-2749** (threshold-sensitive) |
| G M middle > 50 | 0 | 0 | 0 | no-worse, no new cluster |
| G E end > 50 | 0 | 0 | 0 | no-worse, no new cluster |

- **The GH cluster.** All 3 V runs have a moving frame > 50 ms in bin 10 (scrollY 2500-2749, phone geometry), all of
  them on the script's up flicks: 59@2701; 56@2745 (+ 52@2488 in bin 9); 58@2743 + 57@2701. No C run has a > 50 frame
  in bins 9-11. C's slowest frames in the band are 42-48 ms at the same crossings (48@2496, 48@2485, 45@2747, 44@2750).
  The cluster is new at > 54 too, but not at > 46, so it is threshold-sensitive. The slow scripted W scroll through the
  same band (y 2300-2900) has no frame > 34 ms in either arm (max 25-34 ms). The cluster shows only in fast flicks.
- **Mac load (load1 at each run's start and end).**

  | runs | C | V |
  |---|---|---|
  | W | 14-139 | 9-105 |
  | M | 13-140 | 42-119 |
  | G F | 28-39 | 29-38 |
  | G H | 6.8-12.9 | 6.0-14.3 |
  | G M | 4.5-8.4 | 3.9-7.6 |
  | G E | 4.6-7.3 | 4.2-7.9 |

  The W and M holds ran beside heavy shared jobs. The arms' ranges overlap in every leg. In H6 (G H) the C and V runs
  ran at the same load. The V run with the lowest load (gHV3, 6) has the cluster frames too (58@2743, 57@2701). Load
  does not explain the cluster.
- **Predictions, checked:**
  - Hit: W top, W rest and M moving no-worse; every G part no-worse on > 50; sentinels passed first try.
  - Missed: M tweens no-worse (P 0.8); no new cluster (P 0.65); overall no-worse (P 0.4).
- **Ops second read (mgmt-ops-10): AGREE, WORSE.**
  - N1: V's run mV2 is the high run for both close keys (close.f1 37 ms, close.f3 70 ms). Without it, close.f1 is
    +2.0 (not above the rule) and close.f3 +3.0 (still WORSE). The WORSE does not rest on one run.
  - N2: H5's opening sC record was lost to a label collision. P-111's hold.sh labels both sC runs `p111-sC-<H>`, so
    the closing run overwrote the opening record. Its exit 0 and the passing closing sentinel keep the hold valid.
    P-113's hold.sh labels them apart (sCo / sCc).
- **Consequence (the ticket's rule):** v8 does not land as is. The components are found by reversal builds:
  - P-112: rev 3 against the M close;
  - P-113 below: faces + glue, and K, against the GH cluster.
  After both, the lead rules on what stays in v8.

## P-112 result (2026-10-04 16:1xZ-16:2xZ, iphone-runner; scored by int-v8): the close falsifier holds; the scorer says CAUSE on O1.f2

H1 and H2 were VALID. All gates were Serious (39.6-39.9 °C), pmcheck passed, and every counted C M run passed its
sentinel. 4 + 4 valid runs. Score: `out/p112/score.json`, scorer 831ca91ad2a1 (P-111 base 26d944bf93e2). C = v8 −
rev 3, V = v8.

| key (ms, median of runs) | C (v8 − rev 3) | V (v8) | d | rule |
|---|---|---|---|---|
| close.f1 | 27 | 26.5 | −0.5 | ≤ +2: falsifier met |
| close.f3 | 62 | 62 | 0 | ≤ +2: falsifier met |
| O1.f1 / O1.f3 | 34 / 60 | 34.5 / 62 | +0.5 / +2.0 | no-worse |
| O1.f2 | 46.5 | 49 | **+2.5** | WORSE (scored O1 key) |
| reported: O2.f1 / f2 / f3 | 64.5 / 79.5 / 90.5 | 35.5 / 52.5 / 67 | −29 / −27 / −23.5 | (faster) |
| reported: O3.f1 / f2 / f3 | 70 / 84 / 97.5 | 35.5 / 52.5 / 66.5 | −34.5 / −31.5 / −31 | (faster) |
| M moving > 50 / > 34 (count) | 2 / 2 | 0 / 2 | −2 / 0 | no-worse |

- **The question asked (the close start).** The registered falsifier holds: close.f1 and close.f3 are d ≤ +2 ms
  (−0.5 and 0), and Mmoving is no-worse. **Rev 3 is not the cause of P-111's longer close start.**
- **The scorer's literal verdict is CAUSE.** Its rule counts any scored Mtweens key, and O1.f2 is +2.5 ms (C runs 47,
  46, 48, 44; V runs 49, 54, 49, 45). V's mV3 (54) is the high run: without it, d is +2.0, not above the rule. In
  P-111, O1.f2 was −2 for v8 against v7. Only this pre-registered key fails, and it rests on one run.
- **The warm opens.** V's warm opens are 23-35 ms faster. C's runs are bimodal (O2.f1 53, 90, 51, 76; O3.f1 54, 89,
  52, 86); V's are tight (33-38). Rev 3's open gain reproduces.
- **Mac load (load1, run start/end).** C 2.3-6.2, V 2.0-5.5: a quiet Mac. P-111's M leg ran at 13-140 (C) and 42-119
  (V) beside heavy shared jobs. Here v8's close is 26.5 / 62 ms; in P-111 it was 30.5 / 63.5, and v7's 28 / 60.
  Reading (not measured): P-111's close WORSE may come from that load, from another v8 part, or from run spread. One
  candidate is countdown-faces' panel clock (`__cdPanelShown` flips during the morph), which is in both P-112 arms.
  P-112 shows only that rev 3 is not it.
- **Predictions, checked:**
  - CAUSE for the close (P 0.65): missed. The falsifier held.
  - Opens faster by ≥ 10 ms (P 0.85): hit.
  - Sentinels passed first try (P 0.75): hit.
- **Next:** the lead rules on the trade with P-113. int-v8 has not run any further block.

## P-113 hero-flick cluster attribution ticket (lead 2026-10-04 16:2xZ), before any P-113 data

Why: P-111's G part H has a new > 50 cluster in v8, in scrollY 2500-2749 (up flicks, phone geometry). Code reading
names two suspects (not measured):
- **countdown-faces + the heUp glue.** On an up flick into the hero exit range, the clock goes from held to shown. In
  R2's CSS mode, `heUp` runs `s()`, then the glue sets `__cdHeroShown`. The release snaps every held digit (`z(a, e)`,
  cd-strip transform writes on layered cells), recomputes `u`, and restarts the interval. v7 snapped the clock every
  second while it was out of sight, so its digits were already current at that crossing.
- **K** (cd-roll-ca rev 5, V9's roll with fewer keyframes). The first tick after the release starts a roll with K's
  Web Animations; v7 ran V9's.

The other v8 parts don't run at that crossing: accent exact is CSS on the hero title at the top; morph rev 3 is CSS at
the page end. They are the remaining suspects if neither arm removes the cluster.

```
PHONE TICKET P-113 v8-best · attribution of P-111's new G part H cluster (scrollY 2500-2749) · runner iphone-runner (right
  after P-112, before P-105 H3-H6) · verdict owner int-v8 · registered before any phone data; no counted run before
  the lead's pre-data read
arms (all CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43, v8's):
  C = v8-best: JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16
  F = v8 minus countdown-faces and the heUp glue (glue-heup.diff reversed, then faces-delta.diff reversed):
      JS cf7ec51d037ec01f2b3b131120001c6414d557b6257a5319c431ff6f476861a4
  R = v8 with cd-roll-ca V9 in place of K (the V9 -> K delta reversed; V9 = fixes/cd-roll-ca/patch.diff at 1bb87be9,
      K = the current one, both on the cd-strip build):
      JS 5ea2a58788cf2d6325f2b74fee83767629f49ce443c40793bcde40f818735c02
  identity (node fixes/v8-best/phone/p113/build.mjs, best-build's strict applier, no fuzz; refuses on any failure):
  every input equals its owner's build (st6-rb2, cd-strip, V9 582d120c9f8f, K b43fe790c20c, v8, accent-ca-v7); F − (V9 -> K)
  and R − glue − faces both equal accent-ca-v7 + morph rev 3 (JS 8c90da217745, CSS f836404b3728), the README's
  reversal line "v8pure − morph − faces − K + V9 = accent-ca-v7" with rev 3's CSS kept; three different JS; node --check
  passes on F and R.
copies: out/p113/snap/{C,F,R} in int-v8's worktree (`sh fixes/v8-best/phone/p113/serve.sh snap`, made 16:2xZ, snap ok);
  read-only, HASHES.txt (full sha256 as above).
question: does removing faces + glue, or K, remove v8's > 50 cluster in the hero up flicks? Attribution only, no
  landing basis.
ports: `sh fixes/v8-best/phone/p113/serve.sh` (sha256 cf11151b44ba, P-112's serve.sh with four servers): B plain
  baseline, C, F, R; serve.mjs --port 0 --latency 150 --vendors=local, plain http. Served-hash check before every item
  (B 4606120cf392/27776f3d4138, C 3e3e94cb6e9f, F cf7ec51d037e, R 5ea2a58788cf, CSS f836404b3728; exit 4 on a wrong
  one). int-v8 starts them; ports go to the runner by message, never into a committed file.
thermal gate, start method, sleep check: as P-111 (thermal-gate.mjs --expect serious --max-c 44 --url <B> at the start
  and end of the hold; pre-warm on B with S runs, at most 4; pmcheck.mjs). The hold counts only if both reads PASS;
  else VOID, re-run once with the same items.
hold: `RUNNER=iphone-runner caffeinate -i -s sh <int-v8 worktree>/fixes/v8-best/phone/p113/hold.sh H1 sCo wgC wgF wgR
  gHC1 gHF1 gHR1 gHF2 gHR2 gHC2 gHR3 gHC3 gHF3 sCc` (sha256 603d354f0b3b: P-111's hold.sh with G part H items only,
  three arms, folder out/p113/runs, labels p113-*). Under the iphone lease held by iphone-runner, beside any shared group.
  - sCo / sCc: the opening and closing heat sentinel (S run on C, uncounted). They now have their own labels: in
    P-111 the closing sC overwrote the opening one.
  - wgC / wgF / wgR: one uncounted G-H warm-up per arm port (A3/U5).
  - 9 counted runs in a rotated Latin square: C F R · F R C · R C F (3 per arm).
  Then `iphone.mjs park`; int-v8 stops the servers. ~16 min (14 G/S runs at ~0.6 min, pre-warm and gates ~3 min).
G part H (P-111's, unchanged): `iphone.mjs gesture fixes/v8-best/phone/g/flick-hero-v1.json` (6ae05e12ace9 /
  GESTURE_HASH 53a8e657fa28, window down1 -> end: down, up, down, up). Each run reloads the page itself.
scorer: `node fixes/v8-best/phone/p113/score.mjs <item>:<file> ... [--json out]` (sha256 0daf43f6df58). It imports P-111's
  scorer unchanged (26d944bf93e2, refused if changed): scoreG for part H (moving frames, voids, 250 px bins at > 50,
  > 46, > 54) and applySentinel's chain, with three arms. Self-test `node fixes/v8-best/phone/p113/selftest.mjs`
  (990541977343, 11 checks OK on synthetic records).
  - Band (fixed before data): bins 9-11 = scrollY [2250, 3000), P-111's cluster bin and its neighbours.
  - Cluster PRESENT in an arm at > k ms: one band bin holds a moving frame > k in >= 2 of that arm's valid runs (P-111's
    vCluster rule, restricted to the band). k = 50; twins 46 and 54.
  - Per removed part (F: faces + glue; R: K):
    - C without the cluster -> NOT REPRODUCED (no attribution);
    - C with it and the part's arm with it -> NOT THE CAUSE (falsifier: cluster present in the removed-part arm too);
    - C with it and the part's arm without it -> CAUSE.
    - Threshold-sensitive when the > 46 or > 54 verdict differs.
  - Block verdict: faces + glue CAUSE / K CAUSE / BOTH (either removal removes it) / NEITHER (then accent exact and
    morph rev 3 are left, and int-v8 reports to the lead before any further block) / NOT REPRODUCED / insufficient
    (< 3 valid runs in an arm).
  - Reported, not gated: per run the band's max moving dt and its > 34 frames; per arm the band-max median; P-111's
    > 50 count gate for F and R against C.
  - Voids: P-111's G voids (no record, aborted, run errors, missing marks, median moving dt > 25 ms), the served check
    before the item (B, C, F, R all ok); sentinel S runs: no record, not driver S, run error, served not C's build, Low
    Power Mode; a sentinel whose pass is not true voids every run since the last passing one. At most one extra hold
    (the same items).
predictions (before data):
  - C reproduces the cluster: P 0.6 (P-111's was 3 of 3 runs, but threshold-sensitive).
  - faces + glue CAUSE: P 0.55 (the release write sits at the crossing).
  - K CAUSE: P 0.15 (a roll starts only on the next tick after the release, at most 1 s later, and K has fewer
    keyframes than V9).
  - Sentinels pass first try: P 0.8.
minutes: ~16 (1 hold).
```

## Reproduce

```sh
node fixes/v8-best/check.mjs --json out/v8-best/check.json      # --write-faces-delta rewrites faces-delta.diff
node tools/fix.mjs combine v8-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca \
  fixes/v8-best/faces-delta.diff rest-script fixes/accent-ca/e1-delta.diff fixes/morph-gpu/rev3/delta.diff \
  fixes/v8-best/glue-heup.diff
node tools/fix.mjs apply v8-v7base --from v7-best
node tools/lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner <you> -- \
  node tools/fix.mjs check v8-best --on v8-v7base --viewport both --save
node fixes/v8-best/gates/snap.mjs                                 # out/v8-best/snap/{A=v7, V=v8, Q=accent-ca-v7}
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/px-chrome.mjs mobile
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/px-chrome.mjs desktop
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/census-run.mjs A,V
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <you> -- \
  node tools/sim.mjs session --functional --owner <you> -- node fixes/v8-best/gates/px-sim.mjs <ys>
```

### P-111 lead pre-data read (2026-10-04 15:2xZ, before any P-111 phone data): PASS

Read by the lead in place of mgmt-ops-10 (parked for usage). Checked against protocol v2 §5 and the memory notes:
- Arms, hashes, copies and ports: V = v8 (JS 3e3e94cb6e9f / CSS f836404b3728, glue included), C = v7; served-hash
  check before every item; plain http; the baseline page only for pre-warm and gates. OK.
- Heat (phone-checks-start-warm): Serious start, 44 °C/Critical ceiling, gate per hold, sentinels per leg chained. OK.
- Blocks: one warm-up per arm port, C V V C order, ≤ 9 counted runs per block, at most one extra hold per leg. OK.
- Thresholds: phone ms forms with ±4 ms twins, threshold-sensitive marked, no k forms; G new-cluster rule as ruled. OK.
- W rest at y 2700: past countdown-faces' pastHero (~2560 Chrome geometry) on either side of the ~77 px phone offset. OK.
- Gesture budgets 150 s = max(150, 3x estimate). OK.
Conditions: (1) v8 lands as the best build only with this verdict AND the open Chrome items explained (desktop element
count 1424 -> 1423; mobile bottom screenshot diff 0.46 %, just above the 0.4 % phase band). (2) Phone order: P-111
runs before P-105 H3-H6; the runner may run one P-105 hold while it waits for nothing else. (3) The overall P 0.4 is
accepted: a WORSE verdict sends int-v8 to the reversal builds, it does not drop v8.

### P-112 lead pre-data read (2026-10-04 15:5xZ, before any P-112 phone data): PASS

C = v8 − morph rev 3 (CSS 7eda63cc7015, byte-identical to accent-ca-v7's independently built CSS: a clean reversal),
V = v8. M leg only, P-111's driver, scorer (26d944bf93e2, refused if changed), sentinels and heat gates; warm-up per
port; C V V C C V V C over 2 holds; falsifier and verdict words fixed before data. OK. Runs right after P-111 H8.

## P-113 lead pre-data read (2026-10-04 16:2xZ, before any P-113 data): PASS

Read against protocol v2 (§5 blocks) and P-111's frozen scorer:
- One question (which v8 part brings the G part H cluster at scrollY 2500-2749), one named control (C = v8), arms that
  each remove exactly one suspect on the same base; identity proven by build.mjs (F − (V9 -> K) and R − glue − faces
  both equal accent-ca-v7 + morph rev 3). 3 arms in a rotated Latin square (C F R · F R C · R C F), 9 counted runs,
  one uncounted warm-up per arm port, opening and closing sentinels under separate labels (the P-111 overwrite is fixed).
- Scorer 0daf43f6df58 imports P-111's scorer pinned at 26d944bf93e2; band, "present" rule, twins (46/54) and
  falsifier are fixed before data; predictions recorded.
- Mac load: P-111's H6 C and V runs had equal load1 (6-14), so load is not the explanation; P-113 runs with no
  Simulator session beside it (I-160): Simulator work in the queue takes exclusive holds, which make phone runs WAIT.

Conditions:
1. Order: right after P-112, before P-105 H3-H6 (v8 is priority #1). Simulator gap holds (fix-toolbar-resize, then
   fix-scroll-cb) go after P-113 if its servers are ready when P-112 ends, otherwise in the gap before it.
2. NOT REPRODUCED (C without the cluster): no further block on this question now. P-111's G-H WORSE then stands as
   "threshold-sensitive, not reproduced in a second block", and the lead weighs it with Mtweens when ruling what
   stays in v8 (asking the user if it is close).
3. NEITHER: int-v8 reports before any further block (accent exact, morph rev 3 left); at most 2 blocks per question.
4. Attribution only: no landing basis. The v7 -> v8 switch still needs the lead's ruling on P-111 (Mtweens + G-H)
   after P-112 and P-113.

## Lead ruling on P-112 (2026-10-04 16:3xZ)

- P-112's registered question (is morph rev 3 the cause of P-111's longer close start?) is answered by its falsifier:
  close.f1 d −0.5, close.f3 d 0 → **rev 3 is NOT THE CAUSE**. The scorer's literal "CAUSE" comes from a different key,
  O1.f2 (+2.5 ms), carried by one run (+2.0 without it, at the rule's edge) and −2 for v8 in P-111: recorded as a
  single-run, unreplicated flag, not a rev 3 cost.
- Rev 3 brings warm opens 23-35 ms faster and tight (O2.f1 64.5 → 35.5, O3.f1 70 → 35.5). **Rev 3 stays in v8.**
- P-111's close WORSE is open: P-112 ran on a quiet Mac (load1 2-6), P-111's M leg at 13-140 beside shared jobs.
  Cross-block values don't compare, so no conclusion from 26.5/62 vs 30.5/63.5. After P-113, int-v8 tickets ONE confirm
  block (P-114): v7 against the v8 composition the lead picks after P-113, M leg + G part H, run inside an exclusive
  `--no-timing` chrome-measure hold so no shared job loads the Mac. It is the second and last block on the v8-vs-v7
  close question (sequential rule §5.3); its verdict decides the v7 -> v8 switch.
