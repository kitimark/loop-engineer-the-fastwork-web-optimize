# Fix: v9-1d (v9.1d = v9-final + rev 7d + scroll-cb + the g11 close rule)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and pinned, **941aa13e5bdf / f1997edf5309**; identity, g11 exactness, look and census checks below;
the Simulator fling parity passes. **P-134 is folded into the v9.2 ticket** (lead, user T-199 #3, ~14:2xZ): v9.1d is v9.2's base and
its first bisect section, and P-134 gets no phone block of its own; the card below stays as the record (no P-134 data exists).
**Integrator:** int-v8 (wave-integrator). Board row `v9-1`. Lead rulings 2026-10-05: P-132 retired ("superseded by the
PR-023 7d accept"); rev 7d landed on main as 189ca7ed; P-134 = C v9-final + 7d vs V v9.1 + 7d, with 7d's inert
`window.__msDbg` push kept in both arms, so C and V differ only by scroll-cb and g11.
**Build:** `patch.diff` (ce2d32a1bbbb) is baseline-relative over 2 files: JS `941aa13e5bdf0b7a…`, CSS `f1997edf5309…`.
Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.
v9.1 on rev 7c (`fixes/v9-1/`, c3d36476c3ce) is superseded and stays as history.

## Components

| key | component | delta |
|---|---|---|
| ms7d | morph-scroll rev 7d (PR-023 rev 5, accepted 10:15:50Z, landed 189ca7ed): rev 7c + the lift-off rule for a fast or long close fling | `fixes/morph-scroll/delta.diff` @189ca7ed c634e3fbd90b (v8 + it = the owner's 29c0d537e0c9 / 659b02f7169d) |
| dd, earn, nav, glue | as in v9-final (fixes/v9-best) | unchanged; glue applies strictly on v8 + ms7d + nav (offsets 7) |
| scb | scroll-cb (fix-scroll-cb), carried over dd | `fixes/v9-best/scroll-cb-on-v8dd.diff` 7b4a7ee04d85 |
| g11 | the menu close, g11 form (fix-morph-gpu) | on v8 `fixes/morph-gpu/v91/close-v91-on-v8.diff` 3ab8a2fbbc68; on v9-final `close-v91-on-v9final.diff` d677884838c7 |

## Identity checks (`node fixes/v9-best/build.mjs --target v91d`; `out/v91/b7d.log`, `out/v91/b7d2.log`, EXIT 0)

`build.mjs` gained `--target v91d`; ms7c is now read at d683c637 (the last commit with rev 7c's delta), so the v9 and
v91 targets still give 647c9ef2b1e2 / e1359ab9994a and c3d36476c3ce / f1997edf5309 (dry runs, same log).
- **C is the landed build:** v9.1d − scb − g11 = **1b2eecc66011 / e1359ab9994a** (V9D pin) = the landed
  `fixes/morph-scroll-v9try/patch.diff` @189ca7ed (6d1632eb0ee9) on the baseline, byte for byte. C + g11 as delivered
  on v9-final (d677884838c7) = v9.1d − scb (1b2eecc66011 / f1997edf5309).
- **Order:** the 420 legal orders of the 7 components give the same bytes, 941aa13e5bdf / f1997edf5309 (V91D_EXPECT).
- **Reversals** (v9.1d minus each component = the others' build):

  | minus | JS / CSS |
  |---|---|
  | ms7d (and nav, glue) | 0694064c48f8 / f51fd6792520 (the same bytes as v9.1 − ms7c: nothing else depends on the rev) |
  | dd | d0bdf3b38ba7 / a0ade57bb71b |
  | scb | 1b2eecc66011 / f1997edf5309 (C + g11) |
  | earn | 4c8be73805c2 / 7270cc082f3e |
  | nav (and glue) | 5dfb36392d07 / f1997edf5309 |
  | glue | cca09e8aa84e / f1997edf5309 |
  | g11 | 941aa13e5bdf / e1359ab9994a (C + scb) |

- `node --check` OK; patch.diff reproduces the build. Snapshot `out/v91d/snap-941aa13e5bdf` (A = v8, C = v9-final + 7d,
  V = v9.1d); attribution builds `out/v91d/snap-941aa13e5bdf-e1359ab9994a` (− g11) and `out/v91d/snap-1b2eecc66011`
  (− scb); check copies `out/v91d/att` (C, V, G = − g11, S = − scb; HASHES.txt deb1e8bdb8ca) and `out/v91d/cmp`
  (A = C, V = V, for the tools that name arms A/V).
- **C and V differ only by scroll-cb and g11:** both carry 7d's inert `window.__msDbg` push (2 lines each);
  `diff` C vs V JS touches only scroll-cb's lines (JS 3219-3446, 11636-11854, 12249-12383, 13459-13504 in V).

## g11 exactness (lead, from fix-hero-exit-threaded's end-of-page review)

Question: g11 hides the closed panel's 4 children for 0.75 s at the morph-close peak; may it apply only while the panel's
opacity is 0 (m < 0.08, CSS 10961), so it can never hide content that is visible? **Yes: it cannot hide visible content
(T0, exact).**
- **Static proof (V's JS, 7d):** `E = R(() => s(x) > 0)` and `"is-morphing": s(E)` (JS 14873); `--morph` =
  `String(JM(s(x)))`, JM = clamp 0..1; class and `--morph` are written in the same template effect (`U(...)` and
  `__mkW(e['--morph'])`, which writes `--morph` inline on the panel among others). The panel's opacity is
  `clamp(0, (var(--morph) - 0.08) / 0.72, 1)` (CSS 10961), and no other rule sets it (`@property --morph` does not
  inherit; the panel takes `--morph: inherit`). So opacity > 0 ⇒ x > 0.08 ⇒ `.is-morphing` is on ⇒ g11's selector
  `.start-selling-top-nav:not(.is-morphing) .start-selling-morph-panel > *` does not match ⇒ the animation is removed at
  once: CSS Animations 1 §2 "Once an animation has started it continues until it ends or the animation-name is removed",
  §5.2 `animationcancel` on "a change in the animation-name that removes the animation" (CONFIRMED,
  https://www.w3.org/TR/css-animations-1/). 7d changes JS only at lines ≥ 14170 in C and leaves this logic unchanged.
- **Chrome per-frame probe** (`out/v91d/g11exact/g11exact-2026-10-05T10-50-37-132Z.json`; shared probe): 0 violations.
  Max panel opacity while `.is-morphing` is off: 0; max opacity while any child is hidden: 0, in every scenario: close by
  `__navMorphSet` and by scroll, re-open at 0 / 50 / 150 / 300 / 500 / 700 ms into the 0.75 s (set) and 0 / 300 ms
  (scroll); the first visible frame of each re-open has all 4 children visible. Positive control: V shows 44-46 frames
  with `.is-morphing` off and the children hidden (g11 acting), C 0. Limit: these paths move m 0 → 1 in one step, not by
  a tween; the static proof covers gradual paths.

## Function and look checks (C vs V on 7d; shared holds, no timing; `out/v91d/looks.log`)

- **`fix.mjs check v9-1d --on morph-scroll-v9try --viewport both`: CHECK OK.** Mobile 1581 → 1581 elements, desktop
  1423 → 1423; 0 errors, 0 4xx, morph reached on both; screenshot diff mobile 0.12 / 0 / 0.08, desktop 0.06 / 0 / 0.
- **px-chrome** (A/A-gated, 2 loads an arm, 13 stops; PR-010 numbers; arms from `out/v91d/att`). Mobile, word rotator
  aligned (`PX_ALIGN=1`): C vs V **consistent 0 at every stop** (single-pair residues at y 2120, the nav bar, 35 css px²,
  and y 4496, the platform image, 209 css px², each absent in the other pair); G (v9.1d − g11) vs V consistent 0 at
  every stop. The y 5090 nav-bar box of 7c's unaligned run does not appear. Desktop C vs V, aligned (load1 ~99): consistent 1255 and
  1007 css px² (0.097 / 0.078 %) at y 1739 / 2577, the feed record's image (`section.feed > img`, an infinite spin), with
  C's own A/A over8 0.83 / 0.65 % there; repeated unaligned (as on 7c, where desktop was consistent max 3): **consistent 0
  at y 1739 and 2577** (single-pair 5487 / 4310 css px², V/V 0.51 / 0.40 %: V's own loads differ as much there), max
  consistent 2 css px² (y 2796) over all 13 stops. So the aligned residue was the record's spin phase, not a C/V change;
  the planned split (S and G vs V) was dropped as unneeded. Everything is far inside 0.5 %.
- **dom-count** (`out/v91d/cmp`, A = C, V = V): after the walk mobile 1579 in all four loads, desktop 1409 in all four.
  t0 differs by load (1579 / 1382 mobile, 1421 / 1224 desktop: the morph panel and the second countdown mounted or not
  yet at t0), per-load timing, not a change; after the walk only the hero accent's phase class differs.
- **Census (`gates/census-run.mjs`, Chrome work counts per second, no timing; loads C, V, V2, C2; docHeight 7210):**

  | arm | rest-0 | rest-1400 | rest-2796 | rest-3800 | rest-end (y 6278) | scroll top→end: mainFrames / rafFire |
  |---|---|---|---|---|---|---|
  | C = v9-final + 7d | 41.0 | 43.0 | 3.0 | 27.3 | 27.9 | 111.1 / 289.4 |
  | C2 | 39.8 | 41.8 | 2.0 | 26.2 | 29.3 | 111.0 / 288.8 |
  | V = v9.1d | 38.8 | 42.5 | 1.7 | 28.6 | 29.1 | 111.1 / 187.4 |
  | V2 | 39.1 | 42.3 | 2.2 | 26.0 | 28.0 | 110.8 / 186.8 |

  - **No Chrome rest loop with the menu closed** (the old close rule gave 60 at rest-0 and 22-57 at rest-2796).
  - scroll-cb's less-work effect again: rAF callbacks while scrolling 289 → 187 per s (−35 %), other counts unchanged.
- **Rest after a menu close** (`restclose.mjs`, `Performance.getMetrics` RecalcStyleCount / LayoutCount per s over the
  rest window plus the panel's running animations; loads V, C, V2, C2; `out/v91d/restclose/`): at the close point
  (y 5309) 0 recalcs and 0 layouts per s in all four; back at rest-0 after the close 38.6-40.8 per s, the same as a plain
  rest-0 (38.9-40.0); rest-2796 2 per s; no panel animation running in any load.
- **Hero clock roll** (P-097 lib copy, counts only; C lines 4215-4559, V +82 from scroll-cb, range text sha256
  f21cdb723426 in both): roll frames/s C 19.6 (2 loads, 6 stops), V 20.5 (1 load, 3 stops); cd 2-2.25, leak 0. Sent to
  fix-cd-roll-ca-r4; finding F-285.
- **Simulator fling parity** (counts only, `sim.mjs gesture flick-middle-v2.json --count-only --param flingPx=300`, one
  exclusive --no-timing hold 13:50-14:31Z, `sim.mjs session --functional`; C = v9-final + 7d, V = v9.1d, served hashes
  checked; order C1 V1 V2 C2 C3 V3; `out/v91d/par/`): **pass.** First page-up fling after mid1: C 2192 / 2192 / 2190,
  V 1377 / 2190 / 2208; median gap 2 px, 1 of 3 pairs > 300 px (the rule needs a median gap > 300 AND >= 2 pairs). V1's
  path differs from its second stroke on (settled 4108, then 2731 / 4921), as C3's does from its fifth (2630 / 4702);
  host load1 39-81 throughout (OBSERVED, the Simulator's fling path varies under load; cause not traced). The gM split
  (rev 7c, step 4 with and without scroll-cb) saw the first page-up fling 500-950 px short with scroll-cb; here, on 7d
  with scroll-cb in V only, 2 of 3 V runs fling as far as C.

## P-134: v9-final + 7d vs v9.1d, phone no-worse check (FOLDED into the v9.2 ticket by the lead 2026-10-05; never run; record only)

Ticket id P-134 (lead, 2026-10-05; P-132 retired). Phone order (lead): P-129 part 2, P-130, then P-134. The lead signs
after the pre-data read (mgmt-ops-10 is parked, T-196: the lead's Opus reader takes the read; P-ids and records go to
mgmt-clerk-1). The block reuses P-132's harness unchanged (itself P-122's: P-121's path-matched G driver,
nav-hit-cache's flicker gate, the fling-distance parity rule, the time guard, the gates); only the arms, the folders and
the labels change. C now carries rev 7d too, so C and V differ only by scroll-cb and g11.

```
PHONE TICKET P-134 v9-1d · less-work no-worse check, v9-final + 7d C vs v9.1d V (+ scroll-cb, + the g11 close), P-121's
  path-matched G driver + nav's flicker gate (G1) + the fling-distance parity check · runner iphone-runner · verdict
  owner int-v8 · registered before any P-134 data; no counted run before the lead's sign and the pre-data read
build: V = v9.1d = fixes/v9-1d/patch.diff ce2d32a1bbbb (v9-final + 7d + scroll-cb carry 7b4a7ee04d85 + g11 d677884838c7;
  fixes/v9-best/build.mjs --target v91d, V91D_EXPECT),
  JS 941aa13e5bdf0b7a89278eae21e99630d345047377f21ea40d00c9fe97ec408e, CSS f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308
control: C = v9-final + rev 7d (landed 189ca7ed) = fixes/morph-scroll-v9try/patch.diff 6d1632eb0ee9 (build.mjs V9D),
  JS 1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428, CSS e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
  Both arms keep 7d's inert window.__msDbg push. Mirror snapshot b1789284481295-4ad4a84a. B = plain baseline (the
  gate's timer page).
copies and servers: out/p134/snap/{C,V} (read-only; `serve134.sh snap` copies C and V from out/v91d/snap-941aa13e5bdf/{C,V}
  and refuses on any other hash; HASHES.txt sha256/12 9b400b31cb0d), fixes/v9-1d/phone/serve134.sh (serve132.sh with C,
  V, the folder and the sources changed; plain http, --port 0, --latency 150, --vendors=local); served-hash check before
  every item (case C:1b2eecc66011:e1359ab9994a|V:941aa13e5bdf:f1997edf5309; exit 4 on a wrong one).
  Runner's step 1: `sh fixes/v9-1d/phone/serve134.sh snap` (once), then `sh fixes/v9-1d/phone/serve134.sh` (start B C V).
  The snap is per checkout: int-v8's worktree made out/p134/snap (2026-10-05, "snap ok"). A runner in another checkout
  copies the source snap in or rebuilds it with `node fixes/v9-best/build.mjs --target v91d` (refuses other bytes).
pre-data evidence (descriptive only, gates nothing in this block): the build identity checks, g11 exactness, fix.mjs
  check, px-chrome, dom-count, the census, the rest after a close, the hero roll and the Simulator fling parity (above).
  The block's gates are only GM, EX, ES, FLICKER G1 and the phone parity (BEHAVIOUR), as below.
question: under xcode-serious, does v9.1d add slow frames over v9-final + 7d (a) in flicks through the middle (gM:
  scroll-cb acts on scrolling), (b) in flicks into the page end and out again (gX, gS: the out strokes close the menu,
  where g11 hides the closed panel's children for 0.75 s, only while the panel is transparent), (c) nav/.pain class
  flicker (G1); and (d) does it change how far a fling travels (parity, BEHAVIOUR: scroll-cb's open question)?
  No-worse only; landing basis: the less-work rule.
profile: xcode-serious (Xcode Device Conditions Serious, induced; thermal-gate.mjs --accept-induced at the start and end
  of every hold; no pre-warm, no cooling wait; ceiling 44 C or Critical; gate exits 2/3/7 void the hold).
sentinels: sCo/sCc in every hold (S on C: bottom >= 58 fps, scroll >= 44 fps); a failing sentinel voids every run since
  the last passing one; the hold is re-run once with the same items. C is v9-final + 7d (no S-run sentinel on it
  yet): a sentinel that fails on C while its gates are fine goes to the lead before any re-run.
checkout: int-v8's worktree; hold134.sh prints one PIN line per hold (ticket, profile, checkout, HEAD, sha256/12 of
  hold134.sh b6d8ab65cd76, score134.mjs cb0ab20de086, serve134.sh d1b404c58c90, p122/score.mjs d1dddb910cd9 and the
  P-132 list of gate scripts and G programs, unchanged, out/p134/snap/HASHES.txt 9b400b31cb0d) and one PROG line per G
  part (GESTURE_HASH/12 M 607b59612abb, X 21aaafd3a9fd, S 7312cdcd2574, unchanged from P-122). The values of the
  registering commit are the pins; any other value voids that hold.
holds (each inside the runner's exclusive no-timing chrome-measure hold, max 600 s; GESTURE_BUDGET_S 150 per G run;
  every G item with --inject flicker-inject.mjs; time guard: no G item starts after elapsed 420 s, else VOID "time",
  exit 7, re-run whole; at most 5 G runs a hold):
  part M  H1a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H1b sCo gMC2 gMC3 gMV3 sCc · H1c sCo gMV4 gMC4 sCc
  part X  H2a sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · H2b sCo gXC2 gXC3 gXV3 sCc · H2c sCo gXV4 gXC4 sCc
  part S  H3a sCo wgSC wgSV gSC1 gSV1 gSV2 sCc · H3b sCo gSC2 gSV3 gSC3 sCc · H3c sCo gSV4 sCc
  usage per hold (the I-168 wrapper with the block mark):
    TICKET=P-134 node tools/lock.mjs run iphone --owner iphone-runner --block P-134 --max-seconds 900 -- \
      node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "v9.1d P-134 <H>" \
      -- caffeinate -i -s sh fixes/v9-1d/phone/hold134.sh <H> <items>
  then iphone.mjs park; int-v8 stops the servers after the last hold. No re-runs beyond the sentinel and time-guard
  rules: the spares are planned up front, not added after data.
spares: as P-132 (M C 3+1, V 3+1; X C 3+1, V 3+1; S C 3, V 2+2).
scorer: fixes/v9-1d/phone/score134.mjs, a wrapper that imports P-122's scorer (d1dddb910cd9, refused if changed)
  unchanged and only re-pins the arms (C = v9-final + 7d, V = v9.1d). Gates as P-122/P-132: GM (> 50 WORSE d > +2, any
  NEW 250 px cluster; fewer than 3 valid an arm: insufficient), EX and ES (V ceiling: 0 frames > 50 ms in into1..end over
  all valid V runs; twins > 46 / > 54, threshold-sensitive when one differs; (46, 54] flagged; min valid V 3 for EX, 2
  for ES), FLICKER (G1, V monotone blinks 0, per part M, X, S; G2/G3 report only). BEHAVIOUR: the parity (M's first
  page-up fling after mid1, X's first stroke after into1; median gap > 300 px AND >= 2 pairs > 300 px in the same
  direction; the clipped-end rule; path-voided runs included; fewer than 2 pairs: insufficient).
  Changed from P-132's note: on rev 7d a released fast X fling leaves the end (P-124: released 3/3; the P-121 gate
  already encodes 7d's release rule, fv 5 px/ms, travel 300 px), so C's X runs should now pass P-122's C rule (leave the
  end by >= 1600 px); a C X run that is caught is VOIDed by that rule. No gate reads C's X runs, so no verdict changes.
  Arm identity: G runs by the served-hash check log before each item (required "ok", else VOID); S sentinels by the
  record's served map against arm C.
  Self-test: selftest134.mjs, SELFTEST-134 OK 29 (P-132's 27 plus: the P134 pins equal build.mjs's V9D and
  V91D_EXPECT, and C differs from P-122's V).
verdict: BEHAVIOUR FAIL (own line, leads the block verdict) if the parity counts; frames: WORSE if any gate is WORSE or
  has a NEW cluster; else insufficient if any is; else no-worse. BEHAVIOUR FAIL or WORSE -> int-v8 splits by the
  reversal builds (v9.1d - scb = C + g11 1b2eecc66011 / f1997edf5309, v9.1d - g11 = C + scb 941aa13e5bdf / e1359ab9994a;
  both built in out/v91d) and reports to the lead, fix-scroll-cb and fix-morph-gpu.
F-260 (report only, every run): y90 = 0.9 docH - vh and when the run first reaches it.
predictions (int-v8, before phone data):
  - BEHAVIOUR (parity): pass 0.75, BEHAVIOUR FAIL 0.10, insufficient 0.15 (both arms share 7d's release and the open
    end; M is scroll-cb's open question; Simulator result above).
  - GM: no-worse 0.70, insufficient 0.15, WORSE 0.15.
  - EX: no-worse 0.70, WORSE 0.10, insufficient 0.20 (g11 only acts while the panel is transparent, T0 above).
  - ES: no-worse 0.55, insufficient 0.30, WORSE 0.15 (the gS touch-timestamp voids may recur; V's second spare is for it).
  - FLICKER G1: pass 0.85, FAIL 0.10, insufficient 0.05.
  - Sentinels on v9-final + 7d: every hold passes on the first try 0.65.
  - Overall: no-worse 0.45, insufficient 0.35, WORSE or BEHAVIOUR FAIL 0.20.
minutes: ~70 (9 holds; gates included; no pre-warm; the runner's gaps between holds extra).
open items:
  - Next build (lead, T-198 #3): v9.1d + people-word option a (729754eb) + hero-park (fix-hero-exit-threaded, delta
    b2ed79bdbab5, its card P-140); a new V and a new card, not this one.
  - Page-end rest work (P-097, fix-cd-roll-ca-r4) is in both arms; not this ticket's question.
```
