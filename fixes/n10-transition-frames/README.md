# Fix: n10-transition-frames (N10, #1 iPhone target)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). Diffs contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** **stopped, superseded** (lead decision 09:50Z); record, not in the base. The y≈1960 frame is **not
`.pain`**. It was first attributed to the morph IO image burst (F-043, e1/e2 block 09:48Z: control 94 ms at y 1967,
e1 passive listeners 94 ms at 1965, e2 IO rootMargin 150 % moves it to ≈ 2240, ~96 ms); F-044 corrected that: the
R3 logger's 12-events-per-frame cap hid the real trigger, mw10e-src was not a winner, and the frame was solved per
`research/design-engineering/unknowns-render.md` section 1 (a window wheel/touch listener add forces a full style
rebuild plus event-region invalidation; arming once at setup takes 104/107 to 34/35 ms). The e1/e2 numbers above stay
valid as measurements; the "image burst" reading of them does not. The ablations a-d were dropped from the phone
queue and never ran; their overlays and `patch.diff`s stay as a record. The `.pain` background switch is handled
separately by R2 (`fixes/r2-bg-layers`).
**Owner:** fix-scroll-engine (lead decision 07:07Z). Base: `aw1-10e` (all-wave1 + scroll-engine /10e, landed 60f66b6; JS 3e2f599a…, CSS c6aad94b…). The ablations were rebuilt on aw1-10e at 08:50Z.

## Symptom (superseded, see Status)

iphone-runner's goal check on aw1-10c (scripted, n=3) shows a ~106 ms frame at y≈1960-1970 ("pain entry") in every
run. The other frames > 50 ms are 51-55 ms at y≈50 and ~50 ms at y≈700/1000 (2/3).

## What happens near y≈1.7-2.2 k on a phone (code reading; superseded, see Status: `.pain` is not the cause)

- `.pain` (section, CSS `.pain-sticky { position: sticky }`) is registered with the engine at a 150 % gate
  (`dE(..., { deferRendering: !0, rootMargin: 150% 0px })`, JS 4891). Under /10c it is rendered at load and only
  re-skipped when > 2.25 vh above the viewport.
- **`is-pain-dark`** (JS 11557-11561, future `l`): on phones (`max-width: 860px`), `.pain` gets `is-pain-dark` when
  `.start-selling-future-header`'s top reaches 0.5 px. The CSS (2310-2320) then switches `.pain`, `.pain-sticky` and
  `.pain-hold` from `#fff` to `#131922`: a full-viewport background repaint of a sticky section in one frame.
- The will-change windows (/10c, IO 50 %) flip `data-fw-wc` for `.commission-card`, `.face`, `.orbit-card`,
  `.hero-copy` and `.start-selling-future-card` in this region.
- Filter blurs in the region: the future card's reveal `filter: blur(14px)` while `#people` is not `.is-visible`
  (CSS 2402), and the hero copy's exit blur (CSS 1741). There is **no backdrop blur on `.pain` or
  `.commission-card`** (CSS grep).

## Ablation overlays (diagnostic only, not landable)

Each overlay is a standalone copy of both files (aw1-10e plus one change), so it serves on its own.
Diffs vs aw1-10e are in `fixes/<name>/patch.diff`.

| name | disables |
|---|---|
| `n10-a-region-blur-off` | the region's filter blurs: future-card reveal blur + hero-copy exit blur (`filter: none !important`). There is no backdrop blur on .pain/commission-card to remove. |
| `n10-b-pain-visible` | content-visibility on `.pain` (`.pain[data-start-selling-render="deferred"] { content-visibility: visible !important }`), so it is never skipped |
| `n10-c-wc-windows-off` | /10c's per-element will-change windows (`[data-fw-wc="0"]` no longer forces `will-change: auto`); layers follow the scene gate only, as in all-wave1 |
| `n10-d-pain-dark-frozen` | the `is-pain-dark` toggle (never toggled; on phones `.pain` stays light, so there is no full-viewport repaint). Desktop never turns dark either (visual change, diagnostic only). |

Serve (plain http per I-003; any checkout, absolute overlay path):
`node tools/serve.mjs --root site-pretty --overlay /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a1722cf5058e25591/fixes/<name>/overlay --port auto --vendors=local --latency 150`
Base for comparison: the same with `fixes/aw1-10e/overlay`.

## R3 logger for the phone

`r3-logger.js` (this directory): inject before scrolling; afterwards read
`JSON.stringify(__r3.summary(1700, 2200))`. It names each frame > 34 ms by the transitions that landed in it or in
the frame before: cv state changes (capture phase), render/scene/fw-wc attribute flips, and `.pain` / `#people`
class changes.

## Related diagnostic: I-018 "other" frames (08:14Z, mechanism/attribution, timing not claimed, load1 4.6-5.3)

CPU-profiler trace (`toplevel`, `devtools.timeline`, `disabled-by-default-v8.cpu_profiler`, `v8.gc`, `blink`, `loading`),
aw1-10c, 3 fresh loads, mobile 6x, verify-style scroll, rAF frame log with scrollY. Traces in the worktree's `out/i018-other-0814/`.

- **3/3 loads**: +6.07-6.09 s after scroll start, y=4750, 67-83 ms. This is gtag `onscrollend` JS (`FunctionCall` 58-68 ms: `l.Ug`, `l.apply`, `js:364`, `get cookie` / `CookieJar::Cookies`) plus a ~3 ms MinorGC (N11).
- **1/3 loads**: +1.08 s, y=727, 50 ms: `Document::recalcStyle` 21.7, paint 6.8, compositor update 5.1. Samples are mostly `(program)`, plus the nav's `ee()` (JS 13223: `getComputedStyle` of `.start-selling-profile-sticky` + 2 rects per pass), `getBoundingClientRect` and `elementsFromPoint`. A forced style recalc from the nav (N12, F-029).
- Without the CPU profiler, both show as `RunTask` self time with no timeline child. Neither is a Blink-internal mystery.
