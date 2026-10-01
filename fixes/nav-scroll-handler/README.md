# Fix: nav-scroll-handler

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** ready, iPhone-pending. Mechanism + parity done; the gain (20-34 ms band) does not show in Chrome; not in the wave-2 base. Landed as a record (like N11). Whether it goes into the base waits for an iPhone scripted check.
**Topic:** wave 2 N12 in `fixes/TOPICS.md` (F-009; scope per `research/architecture/apple-smooth-scroll.md` §2.1, §2.9, §5 rows 2 and 4)
**Stacked on:** `patch.diff` (v5) is against `fixes/wave1-partial` (it includes nav-hit-test #3). Rebuild with `node tools/fix.mjs apply nav-scroll-handler --on wave1-partial`.
`patch-on-aw1-10c.diff` is the same v5 change as a plain `diff -u` against the wave-2 base `aw1-10c` (`fix.mjs combine aw1-10c all-wave1 scroll-engine`; JS 757e2cbc…, CSS c6aad94b…).
The nav effect region is byte-identical in both bases, so the hunks are the same.

## Wave-2 result (on aw1-10c)

**A/B (v4).** `fix.mjs ab n12-aw1 --on aw1-10c --runs 5`, 06:31-06:39Z, mobile 6x.
- Results: `fixes/n12-aw1/results.json`. Its `patch.diff` is v4 stacked, sha256 59d9f949…; v5 had no timing slot.
- Host: 1/10 runs contaminated (base run 1, other CPU 26.8 %), 1 warn, load1 2.6-4.1. Verdicts are provisional.

| mobile 6x, n=5 | aw1-10c median [min-max] | + N12 v4 median [min-max] | verdict |
|---|---|---|---|
| frames > 50 ms | 2 [1-3] | 2 [1-2] | within noise |
| frames > 34 ms | 5 [5-9] | 5 [5-5] | within noise |
| forced style+layout ms in scroll LoAF (AV1) | 1 [0-2] | 1 [0-2] | within noise: already ~0 on aw1-10c, nothing left for N12 to remove |
| frames > 20 ms | 24 [23-27] | 18 [17-27] | within noise |
| fps | 95.3 [93.4-96.4] | 99 [98.3-100] | "better" (no overlap), provisional |
| LoAF ms / LoAF script ms | 121 [80-134] / 69 [60-79] | 63 [61-82] / 59 [57-76] | within noise |

Regressions: 0 errors, 0 404s; screenshot diff 0.09 / 0.01 / 0 %. As the ticket predicted, there is no
change at > 34 or > 50 ms.

**Parity regression on aw1-10c (v4): a /10c interaction.** Same probe, run in the same hold (`probe-results/v4-on-aw1-10c-parity.json`):
mobile 2/124 and mobile-rtl 2/124 (`is-on-dark` missed at y 2231/2251), desktop 1/168 (profile-sticky missed at 2001); mobile-shift 0, desktop-rtl 0. Two causes:
1. **Re-measure while stuck.** /10c re-skips and un-skips sections (content-visibility) mid-scroll, so the
   ResizeObserver re-measures mid-scroll. v4 took the profile window's lower bound from the sticky's own
   rect, and while stuck that rect is the stuck position. v5 takes it from the section top.
2. **Transitions after a class flip.** The future card's transform has a 0.9 s CSS transition. After a
   class flip, the hit boundary keeps moving for up to 0.9 s with no further class change and no edge
   crossing. v5 keeps running the real hit test for 1 s after any forced or edge-crossing hit test.

v5 touches nothing in /10c's code (no cv/re-skip, no will-change windows); only the nav effect.

**v5 on aw1-10c** (short lane, counts only, `probe-results/v5-on-aw1-10c.json`):
- Parity is 0 in all five viewports: mobile 0/124, desktop 0/168, mobile-shift 0/130, desktop-rtl 0/168, mobile-rtl 0/124.
- The price: in continuous scrolling the 1 s window is always open, so the hit test runs every frame again.

| per scroll frame, aw1-10c -> + v5 | mobile | desktop |
|---|---|---|
| nav getBoundingClientRect | 1.72 -> 0.86 | 3.62 -> 2.12 |
| nav getComputedStyle | 0.86 -> 0 | 0.90 -> 0 |
| nav elementsFromPoint | 0.86 -> 0.86 | 0.90 -> 0.90 |
| LayoutCount | 0.47 -> 0.47 | 0.58 -> 0.58 |

What v5 still saves per frame:
- one getComputedStyle (`ee`);
- the hero-track rect;
- the profile's two rects, outside the desktop window and always on phones.

The theme hit-test gating (v2-v4's main saving) does not survive the transition rule. A correct gate would
need to know when transform transitions end, for example a `transitionend` listener on the
shrink/enter sections. That is untested.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, nav component `dN` only (wave1-partial lines 13013-13163: `__navProbeY`, the nav `ne()` effect: `_`, setup, cleanup)

## Why it lags

The nav callback `L` is registered with the global scroll engine (`dE(L, { manageAnimations: !1 })`, JS 13149
in wave1-partial), so it runs in every scroll frame. On every run, `_` did these layout reads:
- `ee()`: one `getComputedStyle` and 2 rects (profile sticky state);
- `F()`: one `getBoundingClientRect` of the nav plus `document.elementsFromPoint` (theme hit test, already
  without style writes after #3);
- one rect of `.hero-track` (hero pill progress).

When another engine callback has written styles earlier in the same frame, each read forces style/layout
(F-009, `apple-smooth-scroll.md` §2.1: read scroll position in the scroll event, measure offsets in
ResizeObserver callbacks).

## What changed

- **Offsets cached.** `__nsMeasure` stores document offsets: hero track, the profile window, section edges,
  "moving zones" and the nav probe line. It re-runs from a ResizeObserver on `documentElement` and `.start-selling`,
  on a resize, a breakpoint MQ change, a reduced-motion/600px MQ change, and `fonts.ready`.
  Note that `html, body { height: 100% }`, so a RO on the root alone never fires on content growth (v1 lesson).
- **scrollY from the scroll event.** It is captured in a passive scroll listener; no read in the frame.
- **Hero pill.** The same formula, from the cached track offset and the scrollY captured above.
- **Profile sticky (`ee`).** No reads on phones: below 861px the profile is `position: relative`, which the
  cached computed style tells us. On desktop, no reads outside a window of +-max(innerHeight, 600) around the
  section. Inside the window it does the same two rect tests as `ee()`, without its getComputedStyle.
  - A closed-form sticky formula (v1-v3) cannot match `ee()` there. The sticky sits inside
    `.start-selling-future-card`, which scroll-driven transforms translate and scale (`translateY(48px)` before
    `is-visible`, `scale(var(--future-shrink-scale))` with origin 50% 100%, plus 0.9 s transitions).
    `ee()` compares *visual* rects, so its answer depends on the transform state and on transitions.
    Examples: the sticky's visual top is 81 px > 49 at y=1164. The baseline was "stuck" at y 2100-3900 in the
    stepwise parity run, but not when the debug run jumped straight to those positions.
- **Theme (`F`).** The real hit test runs only:
  - when the probe line crosses a cached section edge (+-12 px);
  - inside `.commission` / `.start-selling-future` / `.start-selling-platform` while their className has
    `shrink` or `enter` (their sticky and scaled content moves the hit boundary with no layout and no RO);
  - in the first frame after any className change on those sections or `.pain` (string compare, no layout);
  - while the morph is active (`C()`), and after a re-measure;
  - (v5) for 1 s after any forced or edge-crossing test, to cover the 0.9 s transform transitions. In
    continuous scrolling this means every frame (see "Wave-2 result").

  Otherwise the last answer stands.

The visual output is identical by construction: the parity probe shows 0 mismatches in 5 viewports (below).
The screenshot diff waits for the A/B.

## Why that is faster

Fewer forced style/layout reads in the scroll frame: no getComputedStyle at all, and rect reads and
elementsFromPoint only in boundary frames, moving zones and the desktop profile window.

## Before / after

**Mechanism (Tier A), stage 1.**
- Probe: `probe.mjs` (copy of the scratch probe, absolute paths of this worktree).
- Run: one short-lane hold, 105 s (wall 105348 ms = monotonic 105348 ms, so no sleep jump, I-026).
- Driver: CPU 1x, `scrollTo({behavior:'instant'})` +24 px per rAF, top to bottom. Counts only, timing not claimed.
- Comparison: baseline = `wave1-partial` overlay vs v4.

Per scroll frame:

| | mobile 430x932 base -> v4 | desktop 1440x900 base -> v4 |
|---|---|---|
| nav getBoundingClientRect | 1.71 -> 0.54 | 3.62 -> 1.58 |
| nav getComputedStyle | 0.86 -> 0.01 | 0.90 -> 0 |
| nav elementsFromPoint | 0.86 -> 0.45 | 0.90 -> 0.37 |
| page rect / gCS / efp | 5.45 / 0.86 / 0.86 -> 4.28 / 0.01 / 0.45 | 6.94 / 0.90 / 0.90 -> 4.90 / 0 / 0.37 |
| LayoutCount / RecalcStyleCount | 0.62 / 1.66 -> 0.63 / 1.60 | 0.68 / 2.00 -> 0.67 / 1.88 |
| ScriptDuration (ms, whole scroll) | 137 -> 110 | 216 -> 169 |

LayoutCount per frame does not move: in this driver, the nav's reads did not force extra layouts (the layout
was clean when `L` ran, or got dirtied later anyway). Any benefit must come from fewer forced reads under
CPU 6x with real scroll-linked writes before `L`. That is what the A/B has to show; Tier A alone does not
prove a frame-time win.

**Parity.**
- Method: `probe.mjs parity`, nav state classes (`is-on-dark`, `is-scroll-hidden`,
  `is-profile-sticky-hidden`, `is-hero-pill`, `is-morphing`, `is-expanded`) after a 3-rAF settle. Steps:
  39 even positions + 97 px steps down, then every 3rd step back up.
- `mobile-shift` inserts a 300 px div before `.commission` mid-page, with no resize.
- The `-rtl` cases set `dir=rtl` at DOMContentLoaded.

| case | v1 | v2 | v3 | v4 |
|---|---|---|---|---|
| mobile | 2/123 | 0/123 | 0/123 | 0/123 |
| desktop | 24/168 | 24/168 | 23/168 | 0/168 |
| mobile-shift | 28/130 | 2/130 | 0/130 | 0/130 |
| desktop-rtl | 24/168 | 24/168 | 23/168 | 0/168 |
| mobile-rtl | 2/123 | 0/123 | 0/123 | 0/123 |

**A/B hypothesis (slot ticket): 20-34 ms band only.** N12 is not expected to remove any specific > 34 ms or
> 50 ms frame. LayoutCount per frame is unchanged, so it removes no forced layout; it saves only script and
hit-test time. That was ~0.1 ms per frame at CPU 1x (mobile ScriptDuration 137 -> 110 ms over 259 frames),
roughly 0.6 ms per frame at 6x. Expected A/B outcome: frames > 20 ms and the mean frame time slightly lower,
or within noise; > 34/> 50 ms counts unchanged. A drop in > 50 ms frames would need a different explanation
than this patch.

**A/B:** run on the wave-2 base with v4; see "Wave-2 result" above. The tables in this section are
stage 1 (v4 on wave1-partial).

**iPhone scripted check (what it should measure).**
- Nav `L` time per scroll frame (self time of the nav callback in the engine rAF), base aw1-10c vs + v5.
  This is the only cost v5 changes.
- Frames > 34 ms and their scroll positions, compared with the base at the same positions:
  - hero end, y ≈ 1800-1900 on mobile;
  - future card → pain boundary, y ≈ 2230-2260;
  - commission entry, y ≈ 3190;
  - platform, y ≈ 4360.

  v5 should change none of them.
- The parity spots, as nav classes after the scroll settles:
  - `is-on-dark` at y 2231/2251 (future-card transition);
  - the commission `.shrinking` toggle around 3190-4360;
  - the iOS toolbar collapse (innerHeight change → re-measure; the probe line is relative to the viewport).

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| nav-scroll-handler/01 | offsets cached (RO on documentElement), sticky closed form, hit test only on edge crossing, MutationObserver force on `.commission` class | nav reads per frame -> 0 with the same state | fail (parity) | mechanism/attribution, timing not claimed; count driver was slowed by `html { scroll-behavior: smooth }` (scrollBy), top ~830 px only | nav rect/gCS/efp 1.43/0.71/0.71 -> 0/0/0; parity 2/24/28/24/2 | `variants/01.diff` | html/body are height:100%: a RO on the root never fires on content growth; an MO microtask is too late for a class toggled by another engine callback in the same frame | superseded | variants/01.diff; mech: parity probe |
| nav-scroll-handler/02 | #01 + RO also on `.start-selling` + per-frame `classList` check of `.commission.shrinking` | fixes the stale-geometry and late-class misses | partial | same, driver fixed (instant scrollTo, full page) | nav rect 1.71 -> 0.14, gCS 0.85 -> 0.01, efp 0.85 -> 0.07 (mobile); LayoutCount 0.62 -> 0.63; parity 0/24/2/24/0 | `variants/02.diff` | the edge cache assumes theme boxes are static in document space; sticky + scaled content breaks it (F-018) | superseded | variants/02.diff |
| nav-scroll-handler/03 | #02 + moving zones (real hit test inside commission/future/platform while shrink/enter is on) + className signature of the theme sections | mobile-shift parity | partial | same | mobile nav rect 0.54, efp 0.45 per frame; parity 0/23/0/23/0 | `variants/03.diff` | the remaining desktop misses are the profile: `ee()` reads visual rects under a transformed ancestor, no closed form matches | superseded | variants/03.diff |
| nav-scroll-handler/04 | #03, profile: no reads where it can't be stuck, else ee()'s two rect tests without its gCS | parity 0 everywhere at a known read cost | pass (mechanism + parity) | mechanism/attribution, CPU 1x counts, timing not claimed | table above; parity 0/0/0/0/0 | `variants/04.diff` (= patch.diff, plus a comment-only edit after the probe) | Tier A reads drop, but LayoutCount per frame does not | superseded (A/B on aw1-10c run with v4; parity broke there) | variants/04.diff; mech: `probe.mjs` count + parity |
| nav-scroll-handler/04-aw1 | #04 stacked on aw1-10c (`fixes/n12-aw1`) | 20-34 ms band only | within noise at > 34/> 50 ms; fps "better" provisional | clean-host single-topic run, but 1/10 contaminated, provisional | > 50 ms 2 [1-3] -> 2 [1-2]; > 34 ms 5 [5-9] -> 5 [5-5]; forced 1 -> 1 ms; parity 2/1/0/0/2 | `fixes/n12-aw1/results.json`, `probe-results/v4-on-aw1-10c-parity.json` | /10c re-measures mid-scroll (re-skip) and the future card's 0.9 s transition moves the hit boundary: the parity of an edge cache depends on the base | superseded by 05 | fixes/n12-aw1/patch.diff (v4 stacked) |
| nav-scroll-handler/05 | #04 + profile window from the section top + real hit test for 1 s after any forced/crossing test | parity 0 on aw1-10c | pass (parity), no timing slot | mechanism/attribution, counts only | parity 0/0/0/0/0; mobile nav efp 0.86 -> 0.86, gCS 0.86 -> 0, rect 1.72 -> 0.86 | `variants/05.diff` (= patch.diff), `patch-on-aw1-10c.diff`, `probe-results/v5-on-aw1-10c.json` | correctness kept, but continuous scrolling keeps the 1 s window open, so the hit test runs every frame | current; ready, iPhone-pending | variants/05.diff; mech: `probe.mjs` count + parity |

## Risks, conflicts, follow-ups

- **iOS toolbar collapse (finger test).** `innerHeight` changes without a layout change of the content root.
  `resize` re-measures, and the probe line is relative to the viewport. To check on the iPhone
  (FINGER_TESTS row).
- **Selector coupling.** Moving zones and the class signature name `.commission`, `.start-selling-future`,
  `.start-selling-platform` and `.pain`. If a new theme section with sticky or scaled content is added, it
  needs to be listed there.
- **Elements replaced without a size change.** The cached `cls`/zone elements would go stale. Today the
  sections mount once.
- **Coupling.** This edits the same nav effect as nav-hit-test (#3, `F`) and morph topics (`C()`). The
  scroll-engine cluster (`dE`/`iE`) calls `L`; stage 2 (engine-wide offset cache) only if Tier A shows reads
  in other callbacks (page-wide rect stays ~4-5 per frame from other callbacks).
- **Measurement.** No measurement code was changed. `probe.mjs` is a one-off tool (absolute paths).
