# Fix: rest-script

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (registration committed; data and verdicts follow in later commits)
**Stage:** F (identity checks done in Chrome); D card P-078 registered below
**Device class / gate:** less-work (heat) fix: cost-card counts, full page, Chrome + Simulator, plus one short phone
no-worse check (memory/less-work-landing-rule.md, user T-029 #30). No timing A/B (deferred, user rule).
**Base:** `--on st6-rb2`; served overlay `_app/immutable/nodes/2.DyWL8TcE.js` sha256 `bf8ffd4ef7a3…`
**Topic:** see `fixes/TOPICS.md` (rest-script), user T-029 heat goal, P-068
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`: `mM` (#people avatar rotator), `JT` (commission count-up),
`hD` (pain notes interval), `EM` (profile count-up). Out of scope and untouched: `HE` (hero accent word), the
secure-network SMIL and sweeps, the countdown.

## Registration (P-078, D card, before any scored data)

Registered 2026-10-03 ~09:31Z, before the scored census and Simulator data were taken. Checks run before this
commit (the Chrome identity runs at 375/430/768/1024/1440 + 430 reduced motion, the item checks, the first Chrome
census at 430 and 375) are reported as pre-registration checks only; the claims rest on the runs after it.

**Gate:** the less-work landing rule (memory/less-work-landing-rule.md). Counts judged per event (rotator slide,
commission tween, pain tick, profile count-up), frame-driven counts from the full page in Chrome and the Simulator,
pixel identity against the same-width A/A floor (1024 included), one short phone no-worse check (start band 38-40 °C,
one start method for every run, Low Power Mode runs dropped and re-run).

**Probes and scorer (sha256, first 12):** copies kept in the worktree's gitignored `out/rest-script/probes/`.

| file | sha256 | role |
|---|---|---|
| census.mjs | b6bc0a5516cb | Chrome rest census per position (trace counts per 2 s, FunctionCalls by owner/fired-by) |
| simcensus.mjs | 98eff8b1425e | Simulator rest census per position (Timeline record counts, F-047 order) |
| tocard.mjs | ~~8291590f6176~~ v2 05daca3beb58 (committed: `fixes/rest-script/tools/tocard.mjs`) | scorer: census -> costcard records (arms C, C2 = A/A, V), position classes, pooled verdict |
| rot.mjs / analyse.mjs | 68b7524c1dbf / 03b2df89340e | Chrome rotator identity (per-frame recorder, frozen shots, replays) and its scorer |
| simrot.mjs | 3b24f27514c6 | the same on the WebKit Simulator (simctl shots, magenta calibration crop) |
| simtb.mjs, stroke-up/down.json | 406a1d5e0f84, 660e9ae68d7c / 7ece659754c4 | Sim toolbar collapse/expand: ResizeObserver-on-html count |
| rocount.mjs | a2874fa946b0 | Chrome fwRO / fwNearChange / fwSync call counts at idle and per resize step |
| items.mjs / items-analyse.mjs | 5dd60d0d3e56 / e492ff4044d5 | JT / EM per-frame text model check, pain interval ticks and phase across width changes |
| run-ic.sh, run-ident.sh, run-items.sh, simrun.sh, simhold.sh | 454aecc2efa4, 6c5bbc99dd0b, 573b3192b59f, a5df9fbdc90a, 91c260bba8c6 | hold wrappers |
| simcen.sh, chain3.sh (added 09:35Z, before their data) | 523ed2a01246, 5116f5fac1d1 | Sim census hold; post-registration chain (Sim census 2 reps, Chrome census 430 and 375 again) |

Cost card: `tools/costcard.mjs` (ts-costcard, I-083) reads `tocard.mjs` records once it is on `main`; until then the
`tocard.mjs` table is the reading.

**Second-read fixes (mgmt-ops-10, NEEDS-FIX at 22dd92e), committed before any post-registration census or Sim
data was read** (the runs themselves were already queued or running; their output files were not opened):

- *Aggregation (pooled over reps).* Per row (position or event) and count: C1, C2 = the two st6-rb2 reps of that run,
  V = every rest-script rep. floor = max(2, |C1 − C2|). **SAVE** when min(C1, C2) − max(V) > floor; **MORE** when
  min(V) − max(C1, C2) > floor; otherwise **SAME**. Chrome 430 and 375: only the post-registration run (`ic2/`) is
  scored; the earlier run is a pre-registration check. Simulator: C1/C2/V from its two reps.
- *Position classes (prediction 1)* from layout values recorded in the C rep 1 run at that position (rowTop = the
  avatar row's viewport top, vh = Chrome's emulated height / the Sim's innerHeight, gate = `#people`
  `data-start-selling-scene`, row height 32 px at every width): **paused** gate == paused (V = C predicted);
  **far** gate active and (rowTop ≥ 1.5 vh + 50 or rowTop + 32 ≤ −0.5 vh − 50) (V < C on style recalcs and paints);
  **near** gate active and rowTop < 1.5 vh − 50 and rowTop + 32 > −0.5 vh + 50 (V = C); **border** otherwise (within
  50 px of the fix's 50 % band edge, or the gate differs between the C/C2/V runs): reported, not scored.
  Implemented in tocard v2.
- *Decisions.*
  - All hit (1-4 as predicted, 5 no per-frame firing, 6 identical) → the short phone no-worse check below → land
    under the less-work rule.
  - 1 misses (no SAVE on style recalcs or paints at any far position) in both engines → drop the `mM` change from the
    patch, keep the other items; in one engine only → keep it, the card names the engine that saves.
  - 2 or 3 misses (no saving for that item) → drop that item from the patch.
  - Any MORE (4, or at any position or count for any item) → find the cause; fix and re-register, or drop the item
    responsible. No landing with a MORE.
  - 5: fires per toolbar frame on the Sim → debounce into the scroll-path check, new registration. 6: a stale or
    non-identical frame beyond the A/A floor → to the user before landing.
- *Phone no-worse check (registered now, before any phone data).* iPhone under the lease, driver S
  (`iphone.mjs scroll`, the full page), arms C = st6-rb2, V = rest-script, one uncounted warm-up per arm, then 4
  counted runs in C V V C order; start band 38-40 °C (battery), one start method for every run, Low Power Mode runs
  dropped and re-run. Bound: per arm median of frames dt > 50 ms and dt > 34 ms per run, V − C ≤ +1 (> 50) and ≤ +2
  (> 34), judged also with the ±4 ms twins (dt > 46/54, dt > 30/38); a twin with another verdict makes it
  threshold-sensitive and it goes to the lead. Pass → no-worse.
- *Confidence (subjective, before the data):* 1: 0.75 Chrome, 0.65 Sim (far+active positions may be few); 2: 0.95;
  3: 0.85; 4: 0.9; 5: idle 0 at 0.9, Sim toolbar per-frame firing 0.5 either way; 6: 0.85 Chrome, 0.6 Sim.

**Predictions (ranges), C = st6-rb2, V = rest-script, same engine, width and position:**

1. Rotator slide (`rotator-slide`, per 1020 ms slide; positions where st6 runs the rotator clock and the avatar row is
   more than half a viewport off screen): V below C on style recalcs and paints by more than the floor; main frames
   V ≤ C; timer fires V = C within the floor (the clock is kept). Positions with the row on or near the screen, and
   positions where the scene gate is paused: V = C within the floor on every count (no new work).
2. Pain tick (`pain-tick`, widths ≤ 860 px, `.pain-notes` centred): V makes 0 `le` calls and 0 interval timer fires;
   C makes one per 3 s. Above 860 px: the same tick count and the same 3 s phase (within one frame), also after
   crossing 860 px in either direction, never two intervals.
3. Commission tween (`JT`, 18 → 0 %): rAF callbacks per tween V < C (V about one per text change, C one per frame);
   the shown text identical in every frame (model check: 0 bad frames).
4. Profile count-up (`EM`): every frame's four texts identical (0 bad frames); counts V ≤ C within the floor (the
   skipped state writes do not change frame counts; claim is "no more work", not a saving).
5. ResizeObserver on `<html>` (new in V): 0 callbacks at idle; one per real layout-size change in a desktop resize;
   on the Simulator toolbar collapse/expand: counted and reported; if it fires per toolbar frame, V gets a debounce
   and a new registration.
6. Identity: rotator per-frame state 0 mismatches against the model at every width; frozen-frame pixel diffs of V
   against C replays within the same-width A/A floor (C replayed against C) on entering mid-slide, at rest, re-entry
   and jumps (scrollTo, anchor, back/forward, reload with scroll restoration) in Chrome and on the Simulator.
   Any stale frame left anywhere goes to the user before landing.

Widths: 375, 430, 768 (touch), 1024, 1440, and 430 with reduced motion (Chrome). Simulator: its 430-wide iPhone.
Chrome positions at 430: y 0, 932, 1864, 2300, 2796, 3728, 4660, `fee` and `pain` centred.

## Why it lags

(to follow with the data)

## What changed

(to follow)

## Cards (protocol v2)

(to follow)
