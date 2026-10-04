# Fix: double-drive (v8: future card and commission card follow the scroll, no own trail, no origin jump)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (DOM probes and frozen pixels; no timing, memory `defer-timing-focus-call-tree`). The phone
no-worse check is drafted (`phone/TICKET.md`) and has not run yet.
**Owner:** fix-double-drive, 2026-10-05, user thread T-157 (highest priority), from the sweep `research/v8-double-drive`
(findings F-244, F-245; technique F-249).
**Base:** the v8 best build (`fixes/v8-best/patch.diff`, JS `3e3e94cb6e9f` / CSS `f836404b3728`).
**Build:** v8 + this fix = JS `3076c5a8c9a3` / CSS `2f7197880ffd`.
- `patch.diff` is baseline-relative and rebuilds with `node tools/fix.mjs apply double-drive`.
- `delta.diff` is the fix alone on v8: sha256/12 `baae6114cd65`, +46 -8 lines, 7 hunks. `patch -p1` on v8 gives V
  exactly.
- The fix is v9 component 3. int-v8 checked that it commutes with menu swipe rev 7c.
**Files touched:**
- `/_app/immutable/assets/2.gBuqKVzi.css`: the `.commission-card` origin, the `.start-selling-future-card` rules and
  one phone media rule.
- `/_app/immutable/nodes/2.DyWL8TcE.js`: the commission scroll callback `a` (2 locals, origin weight) and the future
  card's `l()` (class hold).
- Neither the nav-morph nor the menu code is touched.

## Why it lags (desktop, scroll-linked cards)

1. **#people future card trails the scroll.** `l()` eases `--future-shrink` 22 % per frame, but the shrinking rule
   kept the card's 0.9 s `transform` transition. Every frame retargets that transition, so the card follows the
   eased value with its own extra 0.7-1.3 s lag (the PR-021 double drive).
2. **Future card origin flip on a fast scroll up.** `.is-future-shrinking` keys on the raw target (`t > 0.04`), and
   it switches `transform-origin` between 50% 50% and 50% 100%. Scrolling up fast, the class drops while the eased
   scale is still about 0.96, so the card jumps -145.6 / +270.9 / -247.4 px (desktop probe).
3. **Commission card origin switch on scroll up.** The rule `.shrinking:not(.entering)` sets the origin to the bottom.
   The classes key on raw values, while the scale eases (`n`, `r`). Scrolling back up, the origin flips top/bottom at
   scale ~0.967: a one-frame jump of -31.2 px.

## What changed

1. Future card: `transition-property: opacity, filter` while `.is-future-shrinking` is set, so transform follows the
   script's value directly. The other transitions keep their durations (the lists truncate to the first two
   entries). At rest nothing changes.
2. Future card: `transform-origin: 50% 100%` on the base rule, plus the class held while the eased value is above
   the class threshold mapped through the easing (`o > 0.004672`, `w(0.04)`). Outside the shrink the card only
   translates, so the origin there does nothing visible. At rest `o = w(t)`, so the class state is the old one.
3. Commission card: the origin is a weight `--fw-co-w` (0 = top, 1 = bottom), eased 0.22 per frame toward the old
   class rule evaluated on the eased values. At rest it equals the class state exactly. Scrolling up it stays 1
   until `r` is back at ~0 (scale ~1). Where the target flips under a real scale it glides over a few frames
   instead of jumping. Reduced motion uses the raw class rule and snaps, as before. Compact mode (phones, ≤1000 px)
   writes nothing.
4. Phones: the CSS already forces `--future-shrink-scale: 1` there. The new phone rule keeps `translateY(0)` under
   `.is-future-shrinking`, so the class toggle no longer starts a 0.9 s identity transition.

Note: the comment on `.commission-card` says the weight is "in between only while both shrinks are easing". Since
the last build it is eased toward the class rule (point 3). The comment was left as is so the measured hashes
stay valid.

## Results (A = v8, V = v8 + fix; DOM probes, no timing)

Chrome desktop 1440x900 (`research/v8-double-drive/probe/dd-probe.mjs`, `gates/dd-metrics.mjs`):

| Card | Measure | v8 | Fix |
|---|---|---|---|
| Future | transform transition runs over the probe | 74 (max 36 per segment) | 3 (max 2) |
| Future | drift after the y 4500 stop | 26.8 px, settles in 849 ms | 10 px, 383 ms (the script's own easing) |
| Future | scroll-up origin flips | -145.6 / +270.9 / -247.4 px | none (class drops at scale 0.9996, 0.5 px) |
| Commission | scroll-up class switch | -31.2 px at scale 0.967 | +2.0 px; the origin glides, ≤ 10.8 px per frame |
| Commission | largest scroll-up jump, sticky noise included | 42 / -36.4 px | 34.9 px |

The table is from build ccbdc1eb (one step before the final one). The final build 3076c5a8c9a3 / 2f7197880ffd
(the eased origin weight) was re-probed in hold 6 (`out/v8-double-drive/probe-2026-10-04T21-18-06-930Z`,
against the same A probe):

| Card | Measure | v8 | Fix (final) |
|---|---|---|---|
| Future | transform transition runs | 74 (max 36) | 3 (max 2) |
| Future | drift after the y 4500 stop | 26.8 px, 849 ms | 11.6 px, 399 ms |
| Future | largest scroll-up jump | 270.9 px | -10.4 px |
| Commission | scroll-up class switch (y 6082) | -31.2 px | +1.9 px; the origin then glides, ≤ 11.8 px per frame |
| Commission | largest scroll-up jump, sticky noise included | 42 px | 30.6 px |
| Commission | drift after the y 6300 stop | 7.7 px, 366 ms | 8.8 px, 367 ms (both arms' own shrink easing) |

0 page errors, 0 4xx in both arms.

- **Chrome phone 430x775:** future transition runs 4 → 2; every geometry number is identical.
- **Safari (iOS Simulator, `dd-sim.mjs`):** future transition runs 3 → 2; jumps ≤ 1.6 px in both arms; 0 errors.

## Pixels at rest (memory `illusion-must-be-pixel-identical`)

Frozen stops, A vs V beyond A vs A2 ("consistent" = differs in both pairs):

| Where | Stops | Result |
|---|---|---|
| Chrome desktop 1440x900 | 19 | equal except y 2796 (2 css px², max 12) and y 6150 (see below) |
| Chrome phone 430x775 | 13 | equal except y 2894 (7 css px²) and y 3875 (see below) |
| Safari Simulator set 1 | 6 (y 0-2796) | hero only: ≤ 72 css px², max shade 212 (y 0, 300, 548); 2 css px² at y 1400 |
| Safari Simulator set 2 | 5 (y 3384-5260) | 0 consistent at every stop |

- **y 6150 desktop / y 3875 phone** sit under the referral card. Its fee counter is a time-driven count-up started
  by an IntersectionObserver, so its phase differs between loads. On phones the commission is compact (transform
  none), so the fix cannot change that card there. Rechecked in the final hold (below).
- **Simulator hero:** the fix touches neither the hero nor the feed; the hero animations run on time, and A vs A
  over 8 shades is 5-6 % of the screen in the Simulator. Phase noise, OBSERVED.

<!-- PX3 -->

## Phone

- No phone data yet. On phones V changes only the future card's transition (the commission is compact, and the
  future scale is 1).
- The no-worse check is `phone/TICKET.md`, with `phone/serve.sh` (snap / serve / check / stop). It has P-117's
  shape: S whole page n = 4 per arm, plus G flicks through the middle n = 3, ~20 min. mgmt-ops numbers and
  validates it, then the lead signs it.

## Risks

- The commission origin moves through in-between values while the target flips under a real scale. That only
  happens when `.entering` toggles during the exit shrink. It is a glide of a few frames, not a jump.
- `--fw-co-w` is a new custom property on `.commission-card`. Without the script it is 0 (top), the old default.
- The class hold can keep `.is-future-shrinking` a few frames longer after a fast scroll up. Opacity and filter
  keep their transitions, so nothing else is cut short.
- Couplings: `l()` also toggles `.pain is-pain-dark` (not changed). The nav close tail (F-243) belongs to
  fix-nav-earn / fix-nav-morph, not this fix.

## Reproduce

```sh
node fixes/double-drive/gates/snap.mjs                                    # out/double-drive/snap/{A,V} + HASHES.txt
node research/v8-double-drive/probe/dd-probe.mjs desktop out/double-drive/snap/V   # in a shared chrome-measure hold
node fixes/double-drive/gates/dd-metrics.mjs <A probe dir> <V probe dir> desktop
node fixes/double-drive/gates/px-chrome.mjs desktop|mobile                # PX_YS=…, in a shared hold
node fixes/double-drive/gates/px-sim.mjs <ys>                             # inside sim.mjs session, shared simulator hold
```
