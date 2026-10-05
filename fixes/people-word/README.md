# Fix: people-word (proposal: when the "people" word animation starts)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The `patch.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** proposal (visual-timing change the user asked for, user thread T-192); not a performance fix, no timing A/B
(memory "defer timing"). The user decides on the console proposal __PR__.
**Owner:** fix-people-word. **Driver behind the claims:** Chrome functional probe (headless, unthrottled, counts and
class timestamps only). No iPhone use (the phone is in timed blocks).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, the word component `WD`'s effect only (pretty lines
6997-7046 of the v9-final build = baseline 6225-6275).

## Builds (base hashes, sha256 first 12)

| build | dir | how to rebuild | JS `2.DyWL8TcE.js` | CSS `2.gBuqKVzi.css` |
|---|---|---|---|---|
| base = shipping v9-final + 7d (main 189ca7ed) | `fixes/people-word-base/` (overlay only, not committed) | `node tools/fix.mjs apply people-word-base --from morph-scroll-v9try` | `1b2eecc66011` | `e1359ab9994a` |
| A | `fixes/people-word-a/patch.diff` (full patch vs the baseline = v9-final + A) | `node tools/fix.mjs apply people-word-a` | `6788ba9a8009` | `e1359ab9994a` |
| A-phone | `fixes/people-word-aphone/patch.diff` (full patch vs the baseline = v9-final + A-phone) | `node tools/fix.mjs apply people-word-aphone` | `36dbcef9a12e` | `e1359ab9994a` |

Both option patches are the v9-final patch (`fixes/morph-scroll-v9try/patch.diff`) plus one hunk group in `WD`'s
effect; the CSS is v9-final's, unchanged. Round trip checked: `apply --from <option>` into a fresh topic rebuilds the
same hashes. Served from the overlay (`x-mirror-source: overlay` on both files, all three builds).

## Cause (code read, baseline `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`, 1-based)

- The word: component `WD` (JS 6160). Its effect (JS 6225-6275) watches `#future-heading` with an
  IntersectionObserver, `threshold: 0.35`, no rootMargin (JS 6264-6270). On enter: `is-stack` after a 1300 ms
  timer, `is-expanded` 120 ms later (JS 6252-6261); on leave both reset, so it replays (JS 6230-6238, 6267).
  Reduced motion: both classes at once (JS 6232-6234). `standalone`: no 1300 ms wait (JS 6242-6250).
  CSS 2465-2593: the "o" fades/scales out (0.48-0.52 s), the faces stack in with 0.17 s steps, then the word widens
  (`grid-template-columns`/`height`, 0.92 s): about 2.3 s from the trigger to the end.
- The card fade-in: class `is-visible` on `section.start-selling-future` (JS 11469), set in the section's rAF
  callback when `.hero-track` progress >= 0.72 (JS 11303-11311; v9-final keeps the same formula). Hidden state
  CSS 2393-2404 (visibility hidden, opacity 0, blur 14px, translateY 48px); shown CSS 2405-2414 (opacity 0.7 s,
  blur 1.6 s, transform 0.9 s). The section is pulled up over the hero's last screen (`margin-top: calc(1px -
  100svh)`, CSS 2368), so its heading is on screen long before the hero reaches 0.72.
- So the two triggers are independent: the heading crosses 35 % at scrollY ~110-120 (Chrome 430x932;
  ~140-150 at 1440x900), the fade starts at the hero's 0.72, scrollY 671 (648 on desktop): 550-570 px later
  (~500 px on desktop). The word starts 1.3 s after the heading crossing, so how much of it plays inside the hidden
  card depends only on scroll speed: at a gentle ~300 px/s it is nearly over (1.3 s + 0.5 s of motion vs ~1.9 s to
  reach the fade); at 900 px/s (the probe) it starts ~0.64 s into the fade, still behind 14 px of blur; scrolled
  back and forth near the fade (P3 below) it plays entirely while the card is hidden. Measured below (OBSERVED, Chrome).

This is the original site's behaviour; v9-final changes neither trigger (it only caches the 0.72 geometry).

## Options

- **A (recommended):** the word's original 1.3 s wait starts when the card is shown (`is-visible` on), at every
  width. Started when both are true: the heading is in view (the original 0.35 observer, unchanged) and the card is
  shown. If the card hides again (scrolled back above 0.72) before the word started, the pending wait is cancelled and
  re-armed for the next show. A word that already started is left alone; the reset/replay stays on the heading
  leaving the viewport, exactly as before (decided: a reset on "card hidden" would visibly undo the word during the
  card's 1.6 s fade-out, which the original never does). Mechanism: one MutationObserver on the section's `class`
  attribute (event-driven: no scroll listener, no rAF, no layout read; it runs only when that class changes).
- **A-phone:** A only at the site's phone breakpoint (`(max-width: 860px)`, the same query the page uses for its
  phone layout); wider than that the decision path is the original's (start at the heading's 0.35 crossing), checked
  equal below. The observer exists on desktop too but does nothing there (both its branches need the phone query or a
  phone-set wait flag).
- **B (dropped):** a later IntersectionObserver trigger (higher threshold or a negative bottom rootMargin). The fade
  is driven by the hero's scroll progress, not by the heading's position, so any heading margin only approximates it,
  and the distance between the two changes with the viewport height (svh, the iPhone toolbar) and the breakpoint:
  in Chrome the gap is 550-570 px at 430x932 and ~500 px at 1440x900 (scroll positions above), and the
  iPhone's 775-815 px viewport changes it again. A ties the word to the fade itself, exactly, at no extra cost, so B adds nothing.
- Sub-choice "start at the fade end instead of 1.3 s after its start": not offered (no Try-it built for it). With A the
  word starts 1.3 s after the fade starts, when opacity (0.7 s) and the slide (0.9 s) are done and the blur (1.6 s)
  is in its last, almost invisible part.

Unchanged in both: the word's own motion (no CSS change), reduced motion (both classes at once, on the heading's
crossing, as before), the `standalone` path, the hover preview (JS 6217 `j`, gated on `is-expanded` and desktop), the
replay on leaving, everything else on the page.

## Checks (functional, no timing)

Probe: `out/people-word/probe.mjs` (not committed; headless new Chrome with the headed UA, `--screen-info` pinned,
unthrottled; run in the shared lane, `lock.mjs run chrome-measure --shared --weight probe --max-seconds 300`, one hold
per build). Per build: mobile 430x932 DPR 3 touch, mobile with `prefers-reduced-motion: reduce`, desktop 1440x900.
Scripted stepped scroll (`scrollBy` 30 px / 33 ms): P1 down from the top to 600 px past the fade trigger, hold; P2 back
to the top (heading leaves) and down again (replay); P3 a quick in-and-out across the trigger (card shown < 0.3 s),
hold out, then in. A probe MutationObserver logs `is-visible`, `is-stack`, `is-expanded` with `performance.now()`
and scrollY; a probe IntersectionObserver (threshold 0.35) logs the heading's crossings. Counts: rAF calls,
MutationObserver / IntersectionObserver constructions and callback runs (wrappers installed before any page script),
scroll/wheel/touch/resize listeners added.

Class timing, ms after the event named (all from one run per cell; P1 = first scroll in, P2 = back to the top and
in again, P3 = quick in/out then in). OBSERVED, Chrome headless, unthrottled.

| build, viewport | P1 `is-stack` | P2 replay `is-stack` | P3 quick in/out (card shown 33-67 ms) | P3 then in | reset on heading leave |
|---|---|---|---|---|---|
| base, 430x932 | heading +1301 = fade +635 | heading +1301 = fade +651 | word plays at heading +1300, card hidden | word already open when the card shows | yes |
| A, 430x932 | fade +1301 | fade +1301 | nothing starts (wait cancelled) | fade +1301 | yes |
| A-phone, 430x932 | fade +1300 | fade +1301 | nothing starts (wait cancelled) | fade +1300 | yes |
| base, 1440x900 | heading +1301 = fade +700 | heading +1301 | plays at heading +1300, card hidden | already open | yes |
| A, 1440x900 | fade +1301 | fade +1301 | nothing starts | fade +1300 | yes |
| A-phone, 1440x900 | heading +1302 | heading +1300 | plays at heading +1300, card hidden | already open | yes |

- `is-expanded` follows `is-stack` by 120-122 ms in every cell, as before.
- A-phone at 1440x900 has the base's decision path and the same class timing (all three phases within 2 ms).
- Reduced motion (430x932, all three builds): `is-stack` and `is-expanded` set together at the heading crossing,
  same as base (the card is shown from the start there: the hero track is one screen tall under reduced motion).
- Console errors: 0 in all 9 runs.

Mechanism counts (whole run, same scripted scroll, counts only):

| | base | A | A-phone |
|---|---|---|---|
| rAF calls, 430x932 | 523 | 522 | 523 |
| rAF calls, 1440x900 | 509 | 509 | 510 |
| MutationObservers created by the page | 4 | 5 | 5 |
| IntersectionObservers created | 23 | 23 | 23 |
| scroll/wheel/touch/resize listeners added (430x932 / 1440x900) | 14 / 16 | 14 / 16 | 14 / 16 |
| MO callback runs, all page observers (430x932 / 1440x900) | 24 / 21 | 31 / 31 | 38 / 38 |

The one new observer watches only the section's `class` attribute, which changes on `is-visible` (6 times in this
run) and `is-future-shrinking`; its callback reads one `classList.contains` and may set or clear one timer, no
layout read. The total MO callback count includes the page's other observers, whose runs vary between page loads
(IntersectionObserver callbacks also varied, 54-57 on the phone size), so the difference is not attributed exactly.
No new scroll listener, no new rAF.

Served-file check (all three servers): `x-mirror-source: overlay` for `2.DyWL8TcE.js` and `2.gBuqKVzi.css`, hashes as
in the table above. `node --check` passes for both option files.

## Risks

- A motion-timing change: the user decides (proposal). On phones the word now plays while the card is on screen;
  before, it played unseen.
- The word's widening is a layout animation (0.92 s of `grid-template-columns`/`height`). The work is the same as
  before; it only moves from an unseen moment to a seen one, overlapping the last ~0.3 s of the card's blur fade-in.
  Phone smoothness during that second is not measured (no timing; phone busy). If the user accepts, a short phone
  no-worse check of that second is the natural follow-up.
- A on desktop: the word now waits for the fade there too (the probe: 1301 ms after the fade start instead of 1301 ms after the heading crossing, i.e. ~0.6-0.7 s later at
  900 px/s; the user saw the desktop as fine, which is why A-phone exists).
- Coupling: the trigger now reads the section's `is-visible` class (set by the section component's rAF callback,
  JS 11303-11311, the area morph-scroll-v9try and fix-double-drive touched). A future change that renames or stops
  toggling `is-visible` must keep the class or the word waits forever on phones (A-phone) / everywhere (A) while the
  heading is in view. The code falls back to the original path only when the section element is missing.
