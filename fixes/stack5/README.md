# stack5: the five ready candidates stacked on today's best build (stack test, user T-014)

Owner: `wi-stack` (wave integrator). Status: **S1 run (2 blocks), swipe pair answered, leave-one-out done (Sim).**
Verdict: **idle gain holds; no scroll gain overall; a candidate worst-frame regression at the #people entry under
investigation** (Sim leave-one-out: blur-cubic, not st6; OBSERVED).
Prediction: **P-059** (`fixes/PREDICTIONS.md`), committed before any phone data of this ticket.
Baseline snapshot: `b1789284481295-4ad4a84a`. There is no Chrome timing in this work (T-014 lifts the timing
deferral for this phone stack test only).

## What the two arms are (lead decision "A", 2026-10-02)

| arm | build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|---|
| **C** = today's best = **RB** | user-bplus + scene-scope (V1 + R4a + R4b) | `dbd5fdb4f1fb` | `0d7dfc79e703` |
| **V** = **stack5** | RB + **blur-cubic** + **rotator-st6** | `59b23b3f57fd` | `6e09b2c708fa` |

Full sha256 (the snapshot copies; checked again before serving):
- C: JS `dbd5fdb4f1fb7e255aa2a34e435e0d1031446826ec9015df8df094f07fceaa83`, CSS `0d7dfc79e7036eff5608a10b26ca00708ef9985ca17431c9aed6a91440a0b721`;
- V: JS `59b23b3f57fddc3353ef9aa52f0cae9a2a2756096a1fba38de7ee958931b8e25`, CSS `6e09b2c708fab30951f13fa88e438495b53058ae69916606719ac1cfdc296f00`.

C matches iphone-runner's `snap/ss-RB` and arm B of fwreskip's G1 ticket, byte for byte.

**What V adds: blur-cubic and st6, nothing else.** Of the five candidates named in T-014, three are
already in today's best, so they are in **both arms** and this ticket cannot measure them:
- **cdwc** (fix/mw10e-cdwc 6652ad9, CSS `5dc6e8e37388`);
- **re-keep-op** (fix-hero-exit);
- **f3-arm-scope** (arm-scope-c, fix-nav-morph).

`user-bplus` also carries **mw10e-g** with its DEBUG hook `window.__fwMorphDrive` (the M driver's
entry point). The hook is in **both arms** and does nothing unless it is called. Nothing calls it in
this ticket:
- the S driver (`iphone.mjs run --driver scroll`) never calls it; only `--driver morph` does;
- the mechanism probe below wraps the hook in a call counter and counts **0 calls** in both arms over
  a full walk to the bottom and back.

## How stack5 was built (conflicts: none)

```sh
node tools/fix.mjs combine best user-bplus scene-scope                                   # C = RB
node tools/fix.mjs combine stack5 user-bplus scene-scope <blur-cubic.diff> rotator-st6   # V; 0 conflicts
node tools/fix.mjs diff stack5      # fixes/stack5/patch.diff: the full V build from the baseline (+664 -79)
node tools/fix.mjs apply stack5     # rebuild V's overlay from this branch's patch.diff
```

Patch sources:
- user-bplus and scene-scope: their landed `fixes/<t>/patch.diff`;
- rotator-st6: landed f7d3b1b;
- blur-cubic: fix-hero-exit's worktree, CSS `069725e4f455` (only the filter transition's easing).

`git apply` applied all four in order with no conflict and no fuzz. No other topic's code was touched or
resolved by hand.

**Checks that the change set is what it claims.** Each diff was compared as a multiset of changed lines:
- C → V equals exactly blur-cubic + st6: CSS 38 lines, JS 14 lines, identical;
- ref-g → C (JS) equals aw1-10e → arm-scope-c: 33 lines, identical, so F3 is in C;
- cdwc's and re-keep-op's patches reverse-apply cleanly on C, so both are present in C.

### (B) "built, not measured"

These builds are rb-aw (the RB scene-scope CSS on aw1-10e) and stack5-aw (rb-aw + cdwc + F3 + re-keep-op +
blur-cubic + st6, without mw10e-g). The lead chose A, so they have no ticket, no check and no measurement.

| build | JS | CSS |
|---|---|---|
| rb-aw | `3e2f599a1632` | `4b1d63aa7abc` |
| stack5-aw | `2e5c99f9886b` | `6e09b2c708fa` |

## Interaction: st6's avatar layers and RB's will-change arm (not a conflict)

- **The interaction.** RB's flat will-change arm (scene-scope R4) lists the rotator's images with a
  selector written before st6 existed, so it does not cover `.start-selling-avatars.is-carousel img`.
  - In the stack, st6's 5 persistent avatar layers therefore keep `will-change` while their scene is
    paused.
  - On aw1-10e, the old `:where(*)` arm dropped them.
- **Why it is not a conflict.** The patches apply cleanly, nothing breaks, and the animation pause still
  covers those images (`.start-selling-avatars img` is in RB's pause list).
  - The cost is 5 small composited layers kept while the scene is out of view.
  - Both arms of this ticket accept that cost as V's, so it is part of what V measures.
- **Who adds the selector** (lead, 2026-10-02): RB has landed, so st6 lands second and carries
  `.start-selling-avatars.is-carousel img` in RB's will-change arm.
  - The owner is **fix-scroll-engine**, which owns hero-carousel/st6 per PROGRESS.
  - layout-containment's agent has ended, although st6's README still points to `fixes/layout-containment`.
  - fix-scene-scope and fix-scroll-engine have both been told.
- **fwreskip:** it is not in this stack. If it lands on top, it drops those layers while `#people` is
  skipped, but only if the avatars sit inside `#people` (Sim band y≈2988-3539).

## Functional checks (shared lane, no timing)

`node tools/fix.mjs check stack5 --on best` (`fixes/stack5/check.json`):

| check | result |
|---|---|
| new console errors | 0 |
| new 404s | 0 |
| new request failures | 0 |
| morph reached | yes, both sides |
| served files | overlay, `6e09b2c708fa` / `59b23b3f57fd` |
| elements | 1509 → 1511: `img.st5-lead` and `img.st5-next` are st6's persistent slots |
| screenshot diff, top / middle / bottom | 0.06 / 0.01 / 0.02 % (under the 0.4 % phase-noise line) |

**Mechanism probe** (one shared hold, 2026-10-02 07:50Z, counts only). How it ran:
- headless Chrome at 430x775, DPR 3, mobile + touch, against `fix.mjs serve best|stack5 -- --vendors=local`;
- served hashes checked before probing: C `dbd5fdb4f1fb` / `0d7dfc79e703`, V `59b23b3f57fd` / `6e09b2c708fa`;
- a bootstrap script logs every touch/wheel `add`/`removeEventListener` and wraps `__fwMorphDrive` in a call counter.

The probe script is `out/wi-stack/mech.mjs` (gitignored); its output is in `out/wi-stack/mech-075007/`.

| candidate | what was read | C (RB) | V (stack5) |
|---|---|---|---|
| cdwc | morph-panel countdown faces with `will-change` ≠ auto | 0 of 84 | 0 of 84 |
| F3 | touch listeners at setup | `#platform` touchstart (passive) + touchmove; nav header touchstart (passive) + touchmove; window wheel; all once, at t≈2.4-2.7 s | same |
| F3 | touch/wheel add/remove during a walk to y 5102 (of 5189) and back | 0 | 0 |
| re-keep-op | revealed future card at rest: opacity / filter / transform | 0.999 / blur(0px) / identity | 0.999 / blur(0px) / identity |
| blur-cubic | easing of the card's filter transition | `linear(…)` | `cubic-bezier(0.2116, 0.7565, 0.4035, 0.9503)`, no `linear()` left on the card |
| st6 | carousel imgs; img inserts / removes in 8 s in view | 4; 67 / 68 | 5 (`st5-lead`, 3 rest, `st5-next`); 0 / 0 (8 slides by class toggle + 40 `src` writes) |
| st6 | rest state of the visible avatars | (nodes replaced each cycle) | opacity 0.999, transform identity (no flip), `will-change: transform, translate, opacity` (see the interaction above) |
| mw10e-g | `__fwMorphDrive` defined / calls | defined / **0** | defined / **0** |

Reading it: only blur-cubic and st6 differ between the arms. cdwc, F3, re-keep-op and the inert hook are
present and identical in both, as the change-set check said.

## Phone ticket S1 (run 2026-10-02, 2 blocks; results in "S1 results" below)

**Runner:** `iphone-runner`. **Slot:** after fwreskip G1, before PR-001 (mgmt-ops-6). Run JSON stays in `out/`.

**Question.** On the S driver, does adding blur-cubic and st6 to today's best (RB) lower the per-run count
of long frames? Prediction P-059: V − C medians are −2 [−4, +1] for scroll dt>34 (primary) and
0 [−2, +1] for scroll dt>50.

**Builds.** Immutable snapshot copies (`chmod a-w`), in this worktree's `out/wi-stack/snap-s5/`. From the
main checkout, that is `.claude/worktrees/agent-a93135040e12a061d/out/wi-stack/snap-s5/{best,stack5}`.
Each copy holds exactly the two files in the table at the top. Check them before serving:
`shasum -a 256 $S/*/_app/immutable/*/*`. If they are gone, rebuild:
- C = `fix.mjs combine best user-bplus scene-scope`;
- V = `fix.mjs apply stack5` from this branch's `patch.diff`;
- copy each overlay, `chmod -R a-w`, and check the hashes again.

**Serve.** Run from the runner's checkout. One server per arm, started at the block start, with
`S` = the snapshot path above. The phone uses each server's plain-http twin (I-003).

```sh
node tools/serve.mjs --root site-pretty --overlay $S/best   --port 0 --https --vendors=local --latency 150 --no-cache --state out/stack5-s1/serve-C.json
node tools/serve.mjs --root site-pretty --overlay $S/stack5 --port 0 --https --vendors=local --latency 150 --no-cache --state out/stack5-s1/serve-V.json
node tools/wait.mjs serve out/stack5-s1/serve-C.json; node tools/wait.mjs serve out/stack5-s1/serve-V.json
curl -s http://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256    # per arm, against the table
```

**Block** (protocol v2 §5; Timeline **off** for every run; `--owner <runner> --block S1`):

1. Cooling: 10 min since the last block, or `node tools/wait.mjs phone-temp --below <last passing sentinel − 0.5, or 38>`.
   Note Low Power Mode (it must be off; pass `--low-power off`).
2. Park Safari. Start both servers.
3. Uncounted warm-up, one per port, C first:
   `iphone.mjs run --driver scroll --probe std --arm C --warmup`, then the same with `--arm V`.
4. Opening sentinel: one uncounted C run, `--arm C --heat-sentinel --label S1-sent-open`.
   It must reach bottom ≥ 58 fps and scroll ≥ 44 fps.
5. Counted runs, **C V V C C V V C**, `--run 1..8`. For each run:
   - `iphone.mjs open <arm's http URL>`;
   - `iphone.mjs run --driver scroll --probe std --arm <C|V> --block S1 --run <n> --label S1-<arm><n>`.
   The driver: reload, settle 8 s, idle 3 s at the top, scrollBy 250 px every 300 ms to the bottom, bottom 3 s.
6. End sentinel, as in step 4 (`--label S1-sent-end`). Then park Safari and stop the servers.

Record the battery temperature at the start and end of each run (the run JSON does this unless
`--no-battery`). About 15 min per block. Recorded finger parts run only in a Mac-quiet window, never during
this S block.

**Run validity.**
- A failing sentinel voids every run since the last passing one. Cool down as in step 1 and restart the block.
- Every counted C run must also meet the sentinel bar: bottom ≥ 58 fps and scroll ≥ 44 fps. This is a
  non-Timeline S block, so every control run is a heat check. A failing C run voids every run since the
  last passing control (added on mgmt-ops-6's second read).
- A run is void if:
  - the served hash is wrong;
  - the run did not reach the bottom;
  - it has no finite frame time in a phase;
  - Low Power Mode was on;
  - the phone was touched.
- Nothing attached during the block: no Web Inspector, paint rects, `layersForNode` or heap snapshot (§5.5).

**Scoring.** Per phase, one call per metric. The twins are decided on the "both ways" line:

```sh
node tools/stats.mjs runs out/stack5-s1/ --metric gt34 --phase scroll --predicted 2    # primary
node tools/stats.mjs runs out/stack5-s1/ --metric gt50 --phase scroll
node tools/stats.mjs runs out/stack5-s1/ --metric gt34 --phase idle
node tools/stats.mjs runs out/stack5-s1/ --metric gt50 --phase idle
node tools/stats.mjs runs out/stack5-s1/ --metric gt34 --phase bottom
node tools/stats.mjs runs out/stack5-s1/ --metric gt50 --phase bottom
```

Report for each row:
- the median [IQR] per arm and V − C;
- the near-band frames (30, 38] and (46, 54];
- THRESHOLD-SENSITIVE wherever a twin (gt30/gt38, gt46/gt54) changes the verdict;
- whether each P-059 interval is HIT or MISS.

**Decision**, fixed before data. The primary is scroll dt>34; dt>50 is the guard.

| outcome | what happens |
|---|---|
| **Win** on the primary and no dt>50 row worse | the stack is reported better on S. blur-cubic and st6 still land only after their own gates; the blind swipe pair below decides perception. |
| **Futile** | no S gain from these two; the swipe pair decides whether they change anything you can feel. |
| **Block 2** (stats says block2) | a second block, same order, only with the lead's approval (max 2 blocks per question). |
| **Any dt>50 row with V's median above C's**, outside P-059's interval | a regression: leave-one-out (V − st6, V − blur-cubic) on the next ticket; the lead decides. |

## Blind finger swipe pair (posted as C-019; result in "Swipe pair result" below)

As posted after S1 (user T-017 made it top priority; no recording beyond the phone-side frame log):

```sh
node tools/console.mjs post --by wi-stack --kind swipe-pair \
  --title "Stack test: which page feels smoother?" \
  --instructions "Swipe the page up from the top to the bottom at your normal pace, then do the same on page 2. Pick the one that follows your finger better, or same." \
  --url <http URL of arm X> --url2 <http URL of arm Y> \
  --meta '{"ticket":"stack5-S1-F","page1":"<C|V>","page2":"<V|C>","C":"RB dbd5fdb4f1fb/0d7dfc79e703","V":"stack5 59b23b3f57fd/6e09b2c708fa"}' \
  --scale 1-5 --scale-label "How different did they feel?"
```

- **Blind.**
  - The page order comes from a coin flip at post time, stored only in `--meta`.
  - Both servers run on fresh random ports (`--port 0`), so a port number does not give away the arm.
  - The URLs are hidden from the page.
- **Runner side**, per part:
  - `ack --state loading` → `ready` → `wait --until started`;
  - start `iphone.mjs record` → `ack --state recording` → `wait --until done`;
  - finally `wait --until answered`.
- **Reading it.**
  - One pair is a note, not a verdict.
  - "same", or a pick against the S result, is reported as it is.
  - Recordings stay in `out/`.
  - The posted URLs name the LAN host, so they are never copied into committed files (Hard rule 12).

## S1 results (runner `iphone-runner`, 2 blocks of 8, every sentinel and control run passed)

Medians of per-run counts. The decision follows the table above; pooled = 16 runs (van Elteren over blocks).

| row | block 1 C / V | block 1 | block 2 C / V | block 2 | pooled |
|---|---|---|---|---|---|
| scroll dt>34 (primary) | 8.5 / 6.5 | BLOCK2 (U 1, p 0.043) | 8.5 / 9 | FUTILE | **NO-WIN** (p 0.162); THRESHOLD-SENSITIVE: gt30 WIN (p 0.027) |
| scroll dt>50 (guard) | 1.5 / 1.5 | FUTILE | 0.5 / 2 | V +1.5 | V +1 (P-059 HIT at the edge) |
| idle dt>34 | 3 / 0 | WIN | | WIN | **WIN** |
| idle dt>50 | 1 / 0 | BLOCK2 | | | |
| bottom | 0 / 0 | | | | |

- P-059: block 1 all HIT; pooled scroll dt>34 −0.5 HIT, scroll dt>50 +1 HIT at the edge of [−2, +1].
- 6/8 block-2 runs had a longer scroll phase than block 1, cause unknown.
- Run JSON: `iphone-runner`'s worktree, `out/stack5-s1/` (scores `score.txt`, `score2.txt`).

## Swipe pair result (C-019)

- Blind order from `crypto.randomInt`: page 1 = V (stack5), page 2 = C. load1 ≈ 6 during both parts.
- The user picked page 1 (stack5), difference 3/5. Their note, paraphrased: better, but still a bit laggy; asked for
  further improvement.
- Phone-side frame logs (supporting only; finger runs don't compare with S runs, F-071): moving frames dt>50
  V 7/760, C 19/828.

## Remaining-lag map (S1 files, by crossing; lead request after C-019)

Every scroll/idle frame dt>34 in the 16 S1 runs, grouped by the nearest crossing (phone y). Excess = sum(dt − 16.7)
over the arm's 8 runs. **S1b2-V7 is the outlier run** (its 111/113/84 ms frames are the maxima quoted below).
Script: `out/wi-stack/lag/sites.py` (not committed).

| site (phone y) | V: frames/runs, median, max, excess | C: same | V−C excess | known cause |
|---|---|---|---|---|
| #people entry, frame after `+is-visible` (~50 ms later) | 8/8, 70, 113 (S1b2-V7), 465 | 7/7, 41, 45, 166 | **+299** | blur-cubic (see leave-one-out) |
| #people entry, frame holding `+is-visible` | 8/8, 54, 69, 290 | 8/8, 53, 57, 283 | +7 | shared; partly the probe (below) |
| y≈4515 platform-secure `+is-play` | 8/8, 45, 50, 221 | 8/8, 42.5, 48, 217 | +4 | unknown: Composite-only frame |
| scroll start (y 0-60) | 8/8, 42, 50, 216 | 7/7, 42, 51, 183 | +33 | unknown: Composite-only frame |
| y≈2990 hero-track render deferred | 8/8, 43, 46, 209 | 5/5, 43, 44, 128 | +82 | fwreskip (fix-scroll-engine) |
| y≈1560 #people `+is-future-shrinking` | 6/6, 39.5, 111 (S1b2-V7), 208 | 6/6, 40, 49, 163 | +45 | unknown: mild Composite frame |
| hero y 240-580, no crossing | 5/5, 38, 39, 102 | 7/7, 40, 53, 268 | −166 | none needed |
| platform gate y 2485-2759 | 0 | 4 runs, 44, 46, 130 | −130 | PR-002 / T-011 |
| idle at the top | 1 frame, 26 | 8/8, 44, 56, 631 | −605 | the idle win |
| five smaller sites | each ≤ 97 | | | no action |

Totals: V 2026, C 2401 (all phases); scroll only ≈ V 2000, C 1770.

## Leave-one-out (Simulator, functional shared lane; Sim ms = structure, never a gain, F-084; OBSERVED)

| arm | build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|---|
| NS = V − st6 | RB + blur-cubic | `dbd5fdb4f1fb` | `284843d02eec` |
| NB = V − blur-cubic | RB + st6 | `59b23b3f57fd` | `e9603231b413` |

Immutable copies in `out/wi-stack/snap-loo/{nost6,noblur}` (`chmod a-w`). Two holds, W driver (scrollBy 250 px
smooth every 300 ms), Timeline on (Page.disable → Page.enable → Timeline.start, F-047), served hashes checked:
`e1` (#people entry, C V NS NB NB NS V C) and `w1` (full walk, C V NB V C NB).

Composite in the RenderingFrame after `#people +is-visible` (frame 2), Sim ms:

| arm | e1 | w1 |
|---|---|---|
| C | 57.6, 42.5 | 51, 53 |
| NB (RB + st6) | 54.0 (NB2 missed the event) | 45, 51 |
| V | 94.8, 115.9 | 98, 92 |
| NS (RB + blur-cubic) | 89.2, 110.0 | |

- Script in that frame is ~23 ms in every arm; style and layout < 2 ms. Composite self time (nested paints removed)
  agrees: C 18-28, NB 13-25, V 37-88, NS 37-61.
- So blur-cubic, not st6, carries the phone's frame-2 regression. Probable mechanism (hypothesis, OBSERVED):
  blur-cubic's `cubic-bezier` filter transition on `.start-selling-future-card` goes to Core Animation, which commits
  it in one frame at the reveal start, where `linear()` (RB) ran per frame on the main thread.
- Frame 1 (`+is-visible` itself): the ~20 ms Layout in it is our own MutationObserver reading `scrollY` (forced
  layout); the page's rAF script there is 2-3 ms. The phone std probe spends 13-15 ms in the same frame. Whether
  the phone's frame 1 is page work or probe is OBSERVED, open for a probe-off phone read.
- Unknowns (a) `+is-play`, (b) first scroll step, (c) `+is-future-shrinking`: each is one Composite-only frame
  (Sim 55-60, 60-73, 31-35 ms), equal in C, V and NB. Next proposed check: a layer-tree diff across each crossing.
- Scripts and raw data: `out/wi-stack/loo/` (not committed).
