# blur-cubic-v8: does blur-cubic on top of v8 bring back the heavy #people frame? (user T-153)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `blur-cubic-delta.diff` contain excerpts of Fastwork's code: keep them on local
> branches, never push.

**Owner:** fix-blur-cubic-v8 (fix owner), 2026-10-04/05. **Status:** Simulator mechanism check, layer diff and pixel check done; no timing, no phone. Parked (resume on a lead decision).
**Verdict (OBSERVED, Simulator; Sim ms are structure, never a gain, F-084):** yes. With blur-cubic, v8's frame 2 after
`#people +is-visible` has a Composite of about **111 Sim ms against 55** without it (n 6 vs 7, no overlap). That is
the same doubling stack5 showed on the older base RB (C 42-58, V 92-116). The lead's prediction holds: no code conflict,
and the heavy frame returns on v8.
Baseline snapshot: `b1789284481295-4ad4a84a`.

## Question

blur-cubic (PoC 2, fix-hero-exit) changes one thing: the easing of the people card's `filter` transition
(`.start-selling-future-card`, the reveal and the hide). It replaces T10's `linear(…)` tail with the exact
cubic-bezier split of the original curve (CSS only, 2 lines). On RB the phone showed frame 2 after `#people
+is-visible` at 42 ms without it and 74 ms with it. The Simulator leave-one-out in `fixes/stack5/README.md` pinned that
on blur-cubic. Does the same happen on today's best build, v8?

Prediction (the lead, to the user): no code conflict, but the heavy frame most likely returns. v8 does not change the
card's `transform`/`opacity` transitions, and those are what blur-cubic lets Core Animation run (stack5 "Layer diff").

## Builds (no conflicts)

| arm | build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|---|
| **C** | v8 (`fixes/v8-best/patch.diff`) | `3e3e94cb6e9f` | `f836404b3728` |
| **V** | v8 + blur-cubic | `3e3e94cb6e9f` | `265e48039d05` |

Full sha256:
- C: JS `3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16`, CSS `f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43` (equal to v8-best's);
- V: CSS `265e48039d059ef77b1407249fda70cb7b742e4961af3ace8d23f8299fb2f598`.

```sh
node tools/fix.mjs apply bcv8-c --from v8-best                                                   # C = v8
node tools/fix.mjs combine blur-cubic-v8 fixes/v8-best/patch.diff fixes/blur-cubic-v8/blur-cubic-delta.diff   # V
node tools/fix.mjs diff blur-cubic-v8      # patch.diff: the full V build from the baseline
```

- **The blur-cubic delta** (`blur-cubic-delta.diff`, sha256/12 `1a7e297316b3`) is wi-stack's NS-vs-RB CSS diff (stack5
  leave-one-out arm NS = RB + blur-cubic, `out/wi-stack/snap-loo/nost6` vs `snap-s5/best`). That is fix-hero-exit's CSS
  `069725e4f455`, only the filter transition's easing.
- Both hunks applied to v8 with offsets only, no fuzz, 0 conflicts. C → V is exactly the two `filter … linear(…)` lines
  → `cubic-bezier(0.2350, 0.6733, 0.4511, 0.9140)` (0.7 s, hide) and `cubic-bezier(0.2116, 0.7565, 0.4035, 0.9503)`
  (0.9 s, reveal), plus their comments. No `linear(` is left in V's CSS.
- v8's card rules are RB's, so the mechanism applies unchanged. That means the `opacity 0.7s` / `transform 0.9s`
  cubic-bezier transitions, `will-change: transform, border-radius`, and re-keep-op's rest state (0.999 / blur(0px) /
  translateY(0)).

## Method (stack5's leave-one-out, unchanged)

- Simulator `fw-sim 15 Pro Max`, a functional session in the shared lane (weight simulator, ≤ 300 s per hold).
- One server per arm from immutable snapshot copies (`out/bcv8/snap/{C,V}`, `chmod a-w`), run with `--port 0
  --vendors=local --latency 150 --no-cache`. The served JS/CSS hashes are checked against the table before each hold.
- Driver: wi-stack's `entry.mjs` (copied to `out/bcv8/loo/`, gitignored). Each run is a fresh load, then a 4 s
  settle, then Timeline on (Page.disable → Page.enable → Timeline.start, F-047). It logs rAF frames and uses a
  MutationObserver on `#people`'s class. W steps (scrollBy 250 smooth, every 300 ms) run until `+is-visible`, then
  6 more.
- Frame 1 = the RenderingFrame that holds `+is-visible`. Frame 2 = the next one, starting +40..+120 ms after it.
  Composite is the frame's direct Composite record. Composite self = that record minus its nested children (our MO
  callback, timers, a nested Layout).
- Two holds, order **C V V C C V V C** each:
  - `e1`, 2026-10-04 19:54Z. In 3 of its 8 runs (V2, C3, V4) Safari restored the previous run's scroll on the
    same-URL reload (the page started at y ≈ 1900), so `+is-visible` was never seen. The cause is our driver, not
    the build.
  - `e2`, 20:15Z. Each load now gets its own `?run=` query, and a guard scrolls back to the top. 8 of 8 runs valid.
  - Host load was high during e2 (load1 ≈ 100, Sim background mean 59 % of a core). Both arms alternate within each
    hold, so this affects them alike. These are Sim structure numbers anyway.
- Scripts and raw data are in `out/bcv8/loo/` (`hold.sh`, `inner.sh`, `entry.mjs`, `tab.py`, `e1/`, `e2/`), not
  committed.

## Result

Frame 2 (the RenderingFrame after `#people +is-visible`), Sim ms:

| arm | n | Composite per run (e1; e2) | Composite median | Composite self median | frame 2 duration median |
|---|---|---|---|---|---|
| C (v8) | 7 | 59.2, 49.2, 37.0; 67.9, 58.5, 54.6, 54.5 | **54.6** | 31.8 | 90 |
| V (v8 + blur-cubic) | 6 | 112.9, 110.3; 116.7, 111.8, 100.6, 101.3 | **111.1** | 92.5 | 147 |

- The ranges do not overlap: C max 67.9 < V min 100.6. Self time agrees (C 19.6-49.3, V 79.2-105.3).
- Script in frame 2 is the same in both arms, about 24-30 ms of rAF (the page's frame and our logger).
- Frame 1 (holds `+is-visible`) does not change: Composite median C 58.0 (45-71) and V 52.0 (41-56); rAF script
  25-35 in both arms.
- The rAF worst gap per run puts the long frame in the same place: C 83-114 ms at about +90 ms, V 137-154 ms at about
  +240 ms (rAF's view of the long Composite).
- For comparison, stack5 on RB (same method): C 42.5-57.6 / 51-53, NS (RB + blur-cubic) 89-110, V 92-116.

**Verdict.** The prediction is **confirmed (OBSERVED, Simulator)**. blur-cubic on v8 roughly doubles the Composite of
the frame after the #people reveal, as it did on RB.
- Nothing in v8 changes the mechanism stack5's layer diff described (CONFIRMED by WebKit source there, non-threaded path):
  - The `linear()` filter easing keeps the card's whole effect stack on the main thread.
  - The cubic-bezier lets the 0.9 s `translateY(48px)→0` transform run on Core Animation.
  - That gives the card's off-screen deck shells their backing stores at the reveal (`GraphicsLayerCA`
    `ancestorWithTransformAnimationIntersectsCoverageRect`).
- No phone number was taken (memory defer-timing-focus-call-tree). The phone's 42 → 74 ms was measured on RB only.

## Layer diff (Simulator, hold `l1`, 2026-10-04 20:43Z, C and V once each; OBSERVED, n=1 per arm)

The method is stack5's `layers.mjs`, plus a per-run query. It does W steps (scrollBy 250 smooth, 300 ms). After every
step it calls `LayerTree.layersForNode(document)` and diffs that snapshot against the step before. A change is located
to its step, not its frame.

| at the step holding `#people +is-visible` (y 750) | C (v8) | V (v8 + blur-cubic) |
|---|---|---|
| profile-shell layers added | 5 (1 willChange + 4 overlap) | the same 5 |
| active shell backing | 12102 KB | 12102 KB |
| 4 overlap deck shells (402x857), backing each | **0 KB** | **12102 KB** (≈ 48 MB together) |
| total layer memory, this step / the next | 108 / 120 MB | 162 / 168 MB |

- Nothing else differs at that step. In both arms the 4 overlap shells are dropped at `+is-future-shrinking`
  (y ≈ 1750).
- This matches stack5's mechanism on v8. In V the card's transform reveal runs on Core Animation, so WebKit gives the
  card's off-screen composited descendants backing stores and paints about 48 MB more in the reveal's frame 2.
- It is a correlation, layer memory against the Composite jump. It is not a knock-out test. The decisive local check:
  take V and keep the 4 deck shells from getting backing during the reveal (no overlap layer for them, or no transform
  transition on the card). Frame 2 should then fall back to C's level. A blur-cubic retry needs such a fix first.

## Pixel / function check

`node tools/fix.mjs check blur-cubic-v8 --on bcv8-c --save` ran in the shared lane, headless Chrome, 2026-10-04
23:08Z. The result is in `check.json`. The V overlay holds only the CSS file: `--on` refuses an overlay file that is
byte-identical to the base's.

| check | C (v8) → V (v8 + blur-cubic) |
|---|---|
| served files | 1 overlay file differs (CSS `265e48039d05`) and is served from the overlay |
| console errors / 4xx | 0 / 0 on both sides |
| morph reached | yes, both sides |
| elements | 1580 → 1580 |
| screenshot diff, top / middle / bottom | 0.15 / 0.01 / 0.43 % |

- The 0.43 % at the bottom is just over the 0.4 % phase-noise line. v8-best's own check shows the same bottom noise
  (0.46 %), and v7-best's too (0.42 %).
- The card is not in the bottom shot, and V changes only the easing during the 0.7/0.9 s filter transitions. The end
  states stay byte-identical (opacity 0.999, blur(0px), translateY(0)).
- So the resting card looks the same, and nothing else changes.

## Files

- `README.md` (this file).
- `blur-cubic-delta.diff`: the 2-line CSS delta, applies on v8.
- `patch.diff`: the full V build from the baseline (`fix.mjs diff blur-cubic-v8`, sha256/12 `95197b9587b0`).
- Overlays (`fixes/blur-cubic-v8/overlay/`, `fixes/bcv8-c/overlay/`) are gitignored and not committed.
- No tooling was changed.
