# Fix: r2-bg-layers

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** prototype record, **not in the base** (mechanism-checked in Chrome; no timing claimed; iPhone pending: waits for "phone back")
**Owner:** fix-scroll-engine (N10 cluster), lead decision 09:25Z (DIRECTION, de-middle R2)
**Base:** `aw1-10e` (all-wave1 + scroll-engine /10e; JS 3e2f599a…, CSS c6aad94b…). Standalone overlay: aw1-10e
plus this change, so it serves on its own. Rebuild: `node tools/fix.mjs apply r2-bg-layers --on aw1-10e`.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (phone media blocks). Overlay hashes: CSS
ce301ce30bc49192…, JS 3e2f599a163256c1… (= aw1-10e, unchanged). `patch.diff` +32/-3, sha ee72c22e1a49e6a0.

## Why it lags

`research/design-engineering/middle.md` §3.1, §3.5, §5 R2 (de-middle). On phones (`width <= 860px`) `.pain`,
`.pain-sticky` and `.pain-hold` switch their own backgrounds `#fff` ↔ `#131922` when `is-pain-dark` toggles
(CSS 2311-2321 of the aw1-10e overlay; JS 11563 sets it when `.start-selling-future-header` reaches the top).
A background change on an element that paints into a big backing store repaints that backing store: the
sticky's buffer holds the copy and the 11 rotated notes, and `.pain`/`.pain-hold` paint into the root layer.
de-middle estimates 10-20 ms per crossing on the phone (the WebKit Timeline rect `0,1408,430,922` at y ≈ 888).
`.commission.shrinking` (CSS 15-17) is the same kind of switch: on phones scale is 1 and radius 0, so the class
only turns the section background `#131922`.

## What changed

Phone media blocks only (desktop untouched):
- `@media (width<=860px)`: `.pain`, `.pain-sticky`, `.pain-hold` get `background: 0 0`. The colour lives on
  `.pain::before` (`content:""; position:absolute; inset:0; z-index:-1; pointer-events:none;
  will-change:transform; background:#fff`), and `.pain.is-pain-dark::before { background:#131922 }`.
  `.pain` is a stacking context (`position:relative; z-index:1`), so the pseudo paints above `.pain`'s own
  (now transparent) background and below the sticky (z 2) and the hold, the same place the backgrounds painted.
  `.pain` has `overflow: visible` and no border, so `inset:0` covers the same rect as the old background.
- Commission phone block (`width<=1000px`, …): `.commission.shrinking { background: 0 0 }`, plus a
  `.commission::before` with the same geometry, transparent, and `#131922` under `.shrinking`.
  `.commission` is a stacking context (z-index 3); the runway is `display: none` on phones.
- The classes still toggle as before (the nav hit test `e.closest('.commission.shrinking')`, JS 13205, is
  unaffected).

## Parity (short lane 09:27Z, `scratchpad/scroll-engine/r2.sh`; CPU 1x, mobile 430x932 DPR3; animations frozen)

Frozen-frame diff aw1-10e vs r2, viewport screenshots, |ΔR|+|ΔG|+|ΔB| > 48 as verify.mjs, blank check passed:

| shot | state (both builds) | diff |
|---|---|---|
| y 900 | light | 0 % |
| y 1408 | dark | 0 % |
| y 2183 | dark | 0 % |
| y 2958 | dark | 0 % |
| y 4100 | dark + shrinking | 0.01 % (bbox 6 × 6 CSS px at the top: the fee bar's end cap, fee-animation phase) |
| forced `is-pain-dark` off, y 1730 | light | 0 % |
| forced `is-pain-dark` on, y 1730 | dark | 0 % |
| forced `.shrinking` off, y 3494 | – | 0.05 % (bbox 208 × 40 CSS px: the fee counter "$84" vs "$85" and the bar fill, a JS-driven animation, P11 phase) |
| forced `.shrinking` on, y 3494 | shrinking | 0 % |

Computed styles confirm the switch moved: aw1-10e `.pain` bg #fff/#131922 and pseudo transparent; r2 `.pain` and
`.pain-sticky` transparent, `.pain::before` #fff/#131922. The two non-zero diffs are inspected crops of the fee
animation, not backgrounds.

## Mechanism (short lane 09:34Z, `scratchpad/scroll-engine/r2c.mjs`; mechanism/attribution, load 3.6-4.7, timing not claimed)

Per-layer `paintCount` deltas (CDP `LayerTree.layerTreeDidChange`) in a 600 ms window after a class toggle,
animations frozen, vs a no-op class toggle on the same element:

| toggle | aw1-10e repainted layers | r2 repainted layers |
|---|---|---|
| no-op class on `.pain` (control) | future card 462×1329 ×2 (its own, unrelated) | same |
| `is-pain-dark` on/off (3 real switches) | **root layer 430×6278 ×1 + `.pain-sticky` 434×932 ×1** + the control's future card, each switch: +3.1 M CSS px | **only the control's future card**: +0 |
| `.shrinking` on/off | fee animation only (= control) | same |

So in Chrome each `is-pain-dark` switch stops repainting the 2.7 M CSS px root layer and the sticky; the switch is a
property change of the pseudo's layer. `.shrinking` repainted nothing extra in Chrome in either build (the
section background seems to sit under the card's own layer at that position); on WebKit it is de-middle's §3.5
estimate, still to be checked on the phone. Layer count: +4 layers (the two pseudos), solid-colour layers (no
backing expected; Chrome's layer list does not show memory).

Blind counters, for the record: `LayerTree.layerPainted` fired 0 times in both builds (P10), and a
`devtools.timeline` Paint-event count around the toggles was dominated by unrelated periodic paints (3-173 per
window in both builds) and could not isolate the switch.

## Before / after

No timing A/B yet (no normal Chrome holds, per mgmt-ops-4). The expected gain is on the phone: de-middle predicts
10-20 ms → < 2 ms per `is-pain-dark` crossing (y ≈ 888 on the phone), ~5-10 ms → < 2 ms per `.shrinking` crossing.

iPhone ablation (plain http per I-003; any checkout, absolute overlay path):
`node tools/serve.mjs --root site-pretty --overlay /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a1722cf5058e25591/fixes/r2-bg-layers/overlay --port auto --vendors=local --latency 150`
Base for comparison: the same with `fixes/aw1-10e/overlay`. Check: scripted scroll B P P B frames > 34 ms at
y ≈ 850-1000 (the `is-pain-dark` crossing) and near the commission end; Web Inspector Layers on `.pain::before`
shows 0 paints after the first frame, and the Timeline shows no 430 × 922 paint rect at the switch.

## Risks, conflicts, follow-ups

- Stacking: the pseudo sits at z-index −1 inside `.pain`/`.commission`; a later rule giving a descendant a
  negative z-index would go under it (none today: CSS grep).
- The stuck sticky is transparent now; anything that scrolls under it inside `.pain` shows through. Today that is
  only the empty `.pain-hold` and the pseudo itself (same colour), confirmed by the frozen frames at 1408/2183/2958.
- Desktop (> 860 px, and the commission's desktop shrink) unchanged.
- Couples with N10 ablation `n10-d-pain-dark-frozen` (same switch, frozen instead of made cheap) and with
  fix-nav-morph's y ≈ 1830 frame (independent).
