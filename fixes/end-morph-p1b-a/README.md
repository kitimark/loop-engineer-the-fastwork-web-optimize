# Fix: end-morph-p1b-a (P1b part (a): the reveal's panel size without a layout read)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** measured in Chrome (values, trace counts, states, pixels and one clean headed timing hold; see "Not done"). Built on V of card
P-153 (C + P1); C = v9-final + F1 + U2 (JS a6426953727a, CSS e1359ab9994a), V = C + P1 (JS 4da641f828bb, CSS
a81b9af7b2c9). The full write-up of P1b, with the numbers for (a) and (a)+(b), is `fixes/end-morph-p1b-ab/README.md`.
**Stage:** F (build + Chrome gates), lead GO 2026-10-06 (P1b cost card, after P-153's FIRST-OPEN RISK SEEN).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (V lines 14623-14626 vars, `__rvW`), `/_app/immutable/assets/2.gBuqKVzi.css`
(one rule `.fw-rv-size`). Delta against V: `delta-js.diff`, `delta-css.diff`; `patch.diff` is against the baseline.

## Why it lags

P1's switch-on (the first frame with 0.001 < m < 1) sets `data-fw-rv` on the nav and then reads `I.offsetWidth` /
`I.offsetHeight` and `getComputedStyle(B)` (V JS 14691-14693). That forces style (198 elements) and layout in the frame,
and P1's own writes after it make the nav hit test (F(), JS 13863, microtask from `__msTick` at m <= 0.2) force a second
style (27 elements, 2.3 ms) and a layout of 16 dirty objects (1.5 ms) (Chrome 6x, 430x775, `p1b/first-open.mjs`,
OBSERVED). This is cause 1 of P-153's FIRST-OPEN RISK SEEN (`fixes/end-morph-p1/README.md`).

## What changed

- A hidden child `div.fw-rv-size` (aria-hidden, `position: fixed`, `visibility: hidden`, `pointer-events: none`) is
  appended to the nav on the first `__rvW` call. It is sized `var(--panel-w)` x `var(--panel-h)`, the same custom
  properties the nav takes under `[data-fw-rv]`, so it has the nav's full size at every viewport size.
- A ResizeObserver hands over its border box (rounded, like `offsetWidth`) and `--nav-bar-inset-x`. The switch-on uses
  these cached values. P1's read runs only if no observation came yet.
- When the size changes while the reveal is on (a toolbar showing or hiding changes `100dvh`, a rotation `100vw`), the
  observer callback re-applies the clip and the parts at the same m in that frame. P1 kept the size it read at switch-on,
  so the panel was cut to the old height until the next switch-on.
- Nothing else changes. The look is P1's: same writes, same values.

## Gates (Chrome, counts and values only)

- **Exact size** (`fixes/end-morph-p1/p1b/exact.mjs`, out/end-morph-p1/p1b/exact-2026-10-06T08-16-26-551Z.json). The
  cached box equals the nav's own `offsetWidth`/`offsetHeight` under `[data-fw-rv]` (fractional box too):

  | viewport | nav (P1's read) | cached | equal |
  |---|---|---|---|
  | 430x775 | 406 x 751 | 406 x 751 | yes |
  | 430x815 | 406 x 791 | 406 x 791 | yes |
  | 430x932 | 406 x 908 | 406 x 908 | yes |

- **Resize with the reveal on** (m inside the end track, viewport 775 -> 815 -> 932 -> 775). Clip box height against
  52 + (H - 52) m from the nav's current H:

  | after resize to | V (P1) | A (this) |
  |---|---|---|
  | 815 | +17.03 px (stale) | 0.0005 px |
  | 932 | +38.74 px (stale) | 0.0003 px |
  | back to 775 | 0 | 0 |

- **is-on-dark per frame**: equal to C in every frame, in three runs of `p1b/frames.mjs` (see the ab README).
- **Switch-on frame on its own** (trace counts, headless 6x, one cold load):
  - the forced 198-element restyle in `__rvW` is gone; the only forced style left is F()'s, as in C;
  - open f1: style 7.2 ms (205 elements) vs V 11.1 (232) and C 8.8 (203); script 20.9 vs V 28.0 and C 20.1 ms;
  - repeat open f1 span: 26.0 vs V 33.2 and C 24.9.
- **Frame timing** (clean headed hold 09:01Z, 6x, 4 cycles): no frame over 34 ms in any arm. Switch-on frame
  (open f2) median 16.9 ms (k 2) vs V 25.9 (k 3) and C 16.8 (k 2): a direction, not a verdict (one load per arm).
  Table in the ab README, condition 2.

## Not done

- Simulator gates (the phone block P-152 has ended; Simulator holds are next).
- A phone card (first-open f2) before landing.
