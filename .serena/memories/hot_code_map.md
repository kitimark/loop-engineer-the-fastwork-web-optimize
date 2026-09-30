# Hot code in the prettified baseline (verified with Serena, 2026-10-01)

Line numbers here are 1-based file lines (as in `sed -n`, `node tools/fix.mjs show --lines`, fixes/TOPICS.md).
Serena reports 0-based lines (start_line/end_line and content_around_reference are one lower).
Names are minified and repeat across closures: always pass relative_path and use the full name path.
Mapping from the minified char offsets used in research/01-initial-investigation: see the header of fixes/TOPICS.md.

JS = `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js` (13,510 lines; all first-party scroll effects)
- Scroll engine: `rE` 2667 (rAF scheduler), `iE` 2670-2673 (runs every active callback in one rAF; #1 LoAF script),
  `aE` 2674 / `oE` 2680 (scroll+resize listeners), `sE` 2689, `cE` 2709, `lE` 2715 (initial active check),
  `uE` 2719 (IntersectionObserver gate, rootMargin default `100% 0px`), `dE` 2749-2783 (register callback; API).
  `find_referencing_symbols dE` gives all 8 callers: AE (commission) 3143, fD (hero) 4239, hD (pain) 4736,
  WD (roles) 6269, uM (profile) 10977, mM (future) 11359, GM (platform) 12448, dN (nav/morph) 13090.
- Countdown: `GE` 3791-3803 spring (params `UE` 3789), `YE` 3817 reduced-motion query, `$E` 3823-3876 digit
  component (rAF spring loop), `cD` 3918-3982 countdown (setInterval 1 s at 3936).
- Commission `AE`: `AE/A` 3085, `AE/j` 3092 (Range.getClientRects line count), `AE/ne() callback/a` 3106-3126.
- Hero exit `fD/ne() callback/s` 4163-4172 (`--exit-*`).
- Pain `hD` 4411-4826 (notes setInterval 3 s at 4696).
- Profile shrink `uM/ne() callback/f` 10928-10970. Future shrink `mM/ne() callback/l` 11303-11326
  (also reads `.hero-track`, toggles `.pain` is-pain-dark). Platform `GM` 12416-12682.
- Nav / morph `dN` 12884-: hit test `dN/j` 12950, `dN/F` 12955 (elementFromPoint 12961), `dN/ee` 12964;
  scroll-jack handlers `dN/ne() callback/A` 13049 (wheel) and `/M` 13055 (touchmove), registered
  `{passive:false, capture:true}` at 13063-13065, pin `scrollTo({behavior:'instant'})` 13078.

CSS = `site-pretty/_app/immutable/assets/2.gBuqKVzi.css` (not indexed by Serena; use `fix.mjs grep/show`).

Svelte runtime `site-pretty/_app/immutable/chunks/BSBv9QXB.js`:
- `_t` 254-257 / `A` 258-266 = microtask queue (research "Svelte flush" @4529, 25-30 ms/frame at 4x).
- `ai` 2054-2110 = delegated event handler (research @30474, ~110 touch/pointer events/s at page end).
