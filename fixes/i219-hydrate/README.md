# Fix: i219-hydrate (incident I-219: the page fails to hydrate and is mounted a second time at every load)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** fix built and checked: Chrome console, DOM mutation counts, trace counts, DOM and pixel parity.
**Not timed.** Only counts and pixels, in shared probe holds of 180 s or less while P-152's phone block ran
(memory `defer-timing-focus-call-tree.md`).
**Base (C):** main's landed build = baseline + `fixes/morph-scroll-v9try/patch.diff` (rev 7d, `6d1632eb0ee9`), JS
`1b2eecc66011` / CSS `e1359ab9994a`, C exactly as `fixes/v10/build.sh` (int-v8) defines it. Baseline snapshot
`b1789284481295-4ad4a84a`.
**This build (F = C + `delta.diff`):** JS `30d41592a308` / CSS `e1359ab9994a` (unchanged). `delta.diff` `947c88282561`
(C -> F, JS only, 2 hunks). `patch.diff` (`b9ce26511dc7`) = baseline-relative (rev 7d + this), what `fix.mjs serve` /
`apply` use. On int-v8's v10 V and N (both JS `f5068db34a32`), `delta.diff` applies with `patch -p1 -F 0` (offset only)
-> JS `111d8e02968d`, CSS unchanged.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: the nav template `uN` (C line 13778) and the start of
`dN`'s nav walk (C lines 14580-14584).
**Driver(s):** Chrome (headless, 430x932 DPR 3, mobile + touch) for counts and pixels; the iOS Simulator (fw-sim,
Mobile Safari) for a functional check (hydration and a morph open/close). No iPhone.
Short sha256 values (12 hex), as the probes print them.

## Why it fails (cause CONFIRMED in Chrome)

- **Server HTML** (`site/index.html`): the earn button holds only its label, `<button class="start-selling-top-nav-btn
  is-earn …">Join waitlist</button>`.
- **Client template since nav-earn rev 3** (`030f6ee4`, carried in rev 7d; `morph-scroll-v9try/patch.diff` line 2581;
  baseline JS 12882): `<button …><span class="start-selling-top-nav-earn-box …"> </span></button>`. The walk in `dN` is
  `__ewBox = e(oe)` and then `le = e(__ewBox, !0)` (patch lines 3298-3301; baseline JS 13118-13119).
- **During hydration**, `e` = the runtime's `Ln` (`chunks/BSBv9QXB.js:1436-1445`) ignores its argument and takes the
  first child of the hydration cursor. Then:
  - `e(oe)` returns the server's Text node "Join waitlist" as `__ewBox`;
  - `e(__ewBox, !0)` finds no first child in that Text node and runs `D.appendChild(I())` on it, which throws
    `HierarchyRequestError`.
- **Recovery** (`vi`, `BSBv9QXB.js:2203-2232`): it logs `Failed to hydrate: HierarchyRequestError …`, clears the
  target (`Bn`: `textContent = ""`) and mounts the whole page again from the client templates.

What the probe shows (`probe/hydrate-probe.mjs`, 4 loads of C and 4 of F). The warning, the burst and the removals
are the same in every load. The survivor and header rows come from the 3 C and 3 F loads of the final probe version,
which marks elements as the parser inserts them. The first run (cost-…07-39-17) marked them at DOMContentLoaded,
after the re-mount had already happened, so its survivor figure (86.6 % for both C and F) does not measure this; it
is kept in `results.json` with a note.

| per load | B (plain baseline) | C (main today) | F (this fix) |
|---|---|---|---|
| `Failed to hydrate` / `hydration_mismatch` | 0 | **1** / 0 | 0 / 0 |
| one burst that removes server elements / creates elements | none | **1005 / 1665** (before DOMContentLoaded) | none |
| server-parsed body elements still in the DOM at the end | 992 | **8** (0.5 %) | 992 (same nodes as B) |
| `header.start-selling-top-nav` is still the parsed node | yes | **no** | yes |
| element removals over the whole load | 57 | 1044 | 48 |
| `Nodes` (Performance.getMetrics, about 10 s after load) | 3150 | **6423** | 3676 |

Every other big mutation (425 elements added about 6 s in, the lazy sections) is the same in C and F.

**Load cost of the re-mount** (CPU 6x, `--latency 150`, one traced load each, `probe/trace-load.mjs`; durations are
indicative, from a shared hold, not a timing result):
- The hydrate task: C (the failed hydrate plus the full mount) took **482 ms**. F (the hydrate) took **386 ms**. Inside
  both: 13 Layout and 20 UpdateLayoutTree (style recalc), 0 Paint.
- So the re-mount adds about 100 ms of main-thread work at 6x, roughly 16 ms at 1x: script and DOM building, **no extra
  layouts or style passes**.
- Over the whole load the counts don't separate. Layout 61 / 57, style recalc 251 / 265, Paint 405 / 432, tasks 2469 /
  2494 (C / F), all within load-to-load noise.
- Nothing paints in the first second in either build (the first frame comes at about 3.5 s with 150 ms latency at
  6x). The re-mount happens before DOMContentLoaded.
- About 2750 more DOM nodes stay alive after load (`Nodes` 6423 vs 3676): the dropped server tree, until GC.

**Visible flash:** none in Chrome. The screencast (`probe/frames.mjs`) shows the server-rendered page at about 3.5 s,
and from then on every frame up to the first content change differs by 0.16 % or less from the one before. The
re-mount produces no blank or changed frame. The next big change, at about 4.3-4.5 s (fonts, countdown digits,
images), comes at the same point in B, C and F. No flash check was run in Safari; the Simulator checked function
only.

**Not a speed problem in Chrome.** The real costs are 100 ms (6x) of wasted work at load, and the fact that since
nav-earn rev 3 every later build ran its client-side code against client clones rather than the hydrated server DOM.

## What changed (`delta.diff`, C -> F)

1. **The `uN` template goes back to the baseline button:** `<button …> </button>`, no span.
2. **In `dN`**, the walk is the baseline's again: `le = e(oe, !0); (M(oe), M(ie), M(B));`. Hydration now meets exactly
   the server's button > text. Right after the walk, script creates the span and wraps the label in it:
   `__ewBox = document.createElement('span')`, `className = 'start-selling-top-nav-earn-box svelte-1dcozpm'`,
   `oe.insertBefore(__ewBox, le)`, `__ewBox.appendChild(le)`.
   - Hydrating or mounting, the result is button > span.start-selling-top-nav-earn-box > text, as C mounts it.
   - `__ewBox` is still the variable that nav-earn's `__ewMeasure` / `__ewGo` read.
   - The label's text node `le` is still the node that `t(le, …)` writes (JS 14732 in C, 14737 in F).

## Parity

- **DOM** (body serialized: elements, attributes, text; `probe/hydrate-probe.mjs dom`): C = C2 and F = F2 byte for
  byte. C vs F differs in two lines only, and in both F matches the baseline's hydrated behaviour:
  - the language switch's `aria-controls="s1"`: the server id is kept; C gets the client id `c1` from the re-mount;
  - SvelteKit's inline start `<script>` is still in the body; C's `textContent = ""` removed it.
- **Earn button:** the outerHTML is identical in C and F, with the dark pill span and "Join waitlist".
- **Inline `style` attributes:** 49 differ in text only. F keeps the server's serialization (`--o-face:0`, full-precision
  percentages, empty `style=""`); C has the client's CSSOM re-serialization (`--o-face: 0`, 6 significant digits). The
  values are the same.
- **Whole page, Chrome** (8 frozen stops from the top to 75 % of the way to the end zone; PR-010 A/A scoring,
  `fixes/v9-best/gates/pxlib.mjs`): consistent difference **0 css px2 at all 8 stops**.
- **End zone, Chrome**: int-v8's 20-stop gate (`probe/em-px.mjs`, a copy of `fixes/v10/gates/em-px.mjs`; groups g1-g4
  as in `fixes/v10/px-split.sh`; A = C, V = F, A2, V2).
  - Pixel-identical at 19 of the 20 stops: pre, up0, up 0.02-1, dn 0.5 / 0.1 / 0 (consistent 0 css px2).
  - The **post** stop is consistent 0 in g1, g3 and g4. In g2 it is 330 css px2 (0.099 %, max 128), inside the nav band.
  - Cause of the g2 post difference: the platform card under the glass nav sits about 4 px apart between loads (A vs A2
    differ there too; A/A over 8 is 1.28 %). This is the known per-load page state under the nav at that stop (F-301,
    F-294), and within T2 (0.5 %, edge 128).
- **No page errors** in any of the 16 gate loads; the nav's `--morph` reaches 1 at up1 in every load; the earn button's
  rect is the same in all four loads at every stop (e.g. [296, 24, 406, 60] at pre / up0).
- **Countdown, morph panel, dark pill:** identical in every end-zone frame.
- **Simulator** (fw-sim, Mobile Safari; `probe/sim-check.mjs`; two functional shared holds at 08:20Z and 08:23Z,
  no timing):
  - **Hydration:**
    - C, cold Safari: logs `Failed to hydrate`.
    - C, warm Safari (2nd run): the replayed console held only one message, so no warning shows there. The DOM still
      shows the re-mount in both runs: the start script is gone and the language switch has the client id `c1`.
    - F: no warning in either run; the start script is kept and the language switch keeps the server id `s1`, as on
      the baseline.
  - **Earn button:** the outerHTML is identical in C and F.
  - **Morph open and close** (2nd run, held synthetic touch, page scrolled to m 1 and back): C and F give identical
    states at pre, open and closed.
    - At m 1: header `is-morphing is-expanded is-earn-hidden`, and F-183's inline `--morph: 1` on the bar, logo,
      actions, earn button and language wrap. Panel opacity 1, earn opacity 0, earn box background `rgb(19, 25, 34)`.
    - Back at closed: `--morph` 0 everywhere and earn opacity 1.
    - So rev 7d's WebKit-only path works on the hydrated DOM.
    - Not reached: the m 0.5 stop (the page settled back to above the zone in both builds).
- **Not run:** Simulator pixels, desktop and prefers-reduced-motion. The change is
  structural and has no media branch: desktop and reduced-motion run the same `dN` and the same template.

## Risks, conflicts, follow-ups

- **What changes for code after load:** it now runs on the hydrated server DOM instead of client clones.
  - That is how the plain baseline and every build before nav-earn rev 3 ran.
  - Rev 7d's code has not run hydrated since `030f6ee4`. The DOM and 28-stop pixel parity above show no difference
    in Chrome.
  - Code that reads `firstChild` / `lastChild` (not `…ElementChild`) can now meet Svelte's hydration comment markers.
    I told fix-end-morph-p1, which appends `div.fw-rv-size` to the header.
- **v10:** int-v8 can stack `delta.diff` on N and V as the last step (pins above).
- **Finding:** F-306 (pitfall): never change a template's static structure against the server HTML; add elements from
  script after hydration, and check every build's console for `Failed to hydrate` and `hydration_mismatch`.
- **Phone:** the Simulator now confirms the fix in Mobile Safari (see Parity). A real iPhone check is optional.

## Reproduce

```sh
# C copy (frozen): baseline JS/CSS + fixes/morph-scroll-v9try/patch.diff -> out/i219/C (1b2eecc66011 / e1359ab9994a)
sh fixes/i219-hydrate/probe/run.sh cost dom g1 g2 g3 g4            # each part its own shared probe hold (<= 180 s)
node fixes/i219-hydrate/probe/trace-load.mjs out/i219/cost-<stamp>  # offline: task and window counts
node fixes/i219-hydrate/probe/frames.mjs out/i219/cost-<stamp> 2500 5200
```
