# Fix: people-word (proposal: when the "people" word animation starts)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The `patch.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** proposal (visual-timing change the user asked for, user thread T-192); not a performance fix, no timing A/B
(memory "defer timing"). The user decides on the console proposal PR-024 (options `a`, `a-phone`; recommended `a`).
Rev 2 got changes-requested (2026-10-05 11:08Z); this README describes **rev 3** (the word starts when the card's
fade-in has ended, and resets when the card starts to fade out). Rev 2's design is kept below under "Rev 2 (superseded)".
**Owner:** fix-people-word. **Driver behind the claims:** Chrome functional probe (headless, unthrottled, counts and
class timestamps only). No iPhone use (the phone is in timed blocks).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, the word component `WD`'s effect only (pretty lines
6997-7083 of the rev 3 overlay; v9-final 6997-7046 = baseline 6225-6275).

## Builds (base hashes, sha256 first 12)

| build | dir | how to rebuild | JS `2.DyWL8TcE.js` | CSS `2.gBuqKVzi.css` |
|---|---|---|---|---|
| base = shipping v9-final + 7d (main 189ca7ed) | `fixes/people-word-base/` (overlay only, not committed) | `node tools/fix.mjs apply people-word-base --from morph-scroll-v9try` | `1b2eecc66011` | `e1359ab9994a` |
| A, rev 3 | `fixes/people-word-a/patch.diff` (full patch vs the baseline = v9-final + A) | `node tools/fix.mjs apply people-word-a` | `bf75ce87958c` | `e1359ab9994a` |
| A-phone, rev 3 | `fixes/people-word-aphone/patch.diff` (full patch vs the baseline = v9-final + A-phone) | `node tools/fix.mjs apply people-word-aphone` | `0c1845cb72c0` | `e1359ab9994a` |
| (rev 2, superseded) | same paths at commit 7f3fad3b | | A `6788ba9a8009`, A-phone `36dbcef9a12e` | `e1359ab9994a` |

Both option patches are the v9-final patch (`fixes/morph-scroll-v9try/patch.diff`) plus one hunk group in `WD`'s
effect; the CSS is v9-final's, unchanged. Served from the overlay (`x-mirror-source: overlay`, all three builds,
hashes as above).

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
  blur 1.6 s, transform 0.9 s). **On v9-final the fade is shorter** (overlay CSS 2634-2668, a later `transition`
  declaration in the same rules, from an earlier smoothness fix): fade-in opacity 0.7 s, filter 0.9 s (`linear()`
  easing), transform 0.9 s, ending at opacity 0.999 / `blur(0px)`; fade-out opacity 0.7 s, filter 0.7 s, transform
  0.9 s, visibility hidden after 1.6 s. Rev 2's README and proposal text quoted the baseline's 1.6 s blur; wrong for
  v9-final (corrected in rev 3). The section is pulled up over the hero's last screen (`margin-top: calc(1px -
  100svh)`, CSS 2368), so its heading is on screen long before the hero reaches 0.72.
- So the two triggers are independent: the heading crosses 35 % at scrollY ~110-120 (Chrome 430x932;
  ~140-150 at 1440x900), the fade starts at the hero's 0.72, scrollY 671 (648 on desktop): 550-570 px later
  (~500 px on desktop). The word starts 1.3 s after the heading crossing, so how much of it plays inside the hidden
  card depends only on scroll speed: at a gentle ~300 px/s it is nearly over (1.3 s + 0.5 s of motion vs ~1.9 s to
  reach the fade); at 900 px/s (the probe) it starts ~0.64 s into the fade, still behind 14 px of blur; scrolled
  back and forth near the fade (P3 below) it plays entirely while the card is hidden. Measured below (OBSERVED, Chrome).

This is the original site's behaviour; v9-final changes neither trigger (it only caches the 0.72 geometry).

## The user's change request on rev 2 (PR-024, 2026-10-05 11:08Z), and how rev 3 answers it

The note is the user's own text and stays in the console (Hard rule 12; `node tools/console.mjs proposal show PR-024`).
Its points, as read for rev 3 (the lead's reading, checked against the note):

1. Trigger "when the text is shown, opacity 1": the word starts when the card's fade-in has **ended** (the card fully
   opaque, blur gone), read from the browser's own `transitionend` event of the card's `filter` transition (the last
   of the fade-in transitions to end), not from a fixed timer after the class change. Guard: the heading is still at
   least 35 % in view (the original IntersectionObserver). No scroll listener, no rAF, no layout read.
2. "Text display first, then the animation": no extra wait after the fade-in end. Reason: the original 1.3 s wait
   was there so the title is seen before the "o" changes; the 0.9 s fade-in now does that job, and a further wait
   only lets the title scroll on (at a gentle ~300 px/s the heading leaves its 35 % line ~1.3 s after the fade starts,
   so a 1.3 s wait could miss it entirely). Rev 2 started 1.3 s after the fade start, i.e. 0.4 s after the fade-in
   had already ended on v9-final; rev 3 starts 0.4 s earlier but exactly at the end the user can see. No new option for
   the wait (the user did not ask for one); the proposal says a pause can be added if wanted.
3. "Reset in the opposite direction": when the card starts to fade out (`is-visible` goes off, scrolling back up) the
   word resets (its own closing motion: the width eases back over 0.92 s); the next fade-in plays it again. The reset
   on the heading leaving stays. A quick in-and-out (card shown < 0.9 s) neither starts nor strands the word.

## Options (rev 3)

- **A (recommended):** every width. Mechanism in `WD`'s effect: a MutationObserver on the section's `class`
  (`is-visible` on: wait for the fade-in end, with a 1.2 s fallback timer in case no transition runs; off: drop the
  wait, mark not-shown, reset the word if the heading is in view) and a `transitionend` listener on the card itself,
  filtered to `event.target === card` and `propertyName === "filter"` (the word's own `.start-selling-future-people-o-vector`
  also transitions `filter` and its events bubble to the card: excluded by the target check). On the heading's enter
  (the original observer) the word plays at once if the card is already fully shown, else when the fade-in ends.
- **A-phone:** A only at the site's phone breakpoint (`(max-width: 860px)`); wider screens keep the original path
  (1.3 s after the heading's 35 % crossing; reset only on the heading leaving). The observer and listener exist on
  desktop too and only track the card state there.
- **B (dropped, as in rev 2):** a later IntersectionObserver trigger only approximates the fade, which is driven by the
  hero's scroll progress; the gap changes with viewport height and breakpoint (550-570 px at 430x932, ~500 px at
  1440x900 in Chrome). The fade-end event is exact at no cost.

Unchanged in both: the word's own motion (no CSS change), reduced motion (both classes at once at the heading's
crossing, as before), the `standalone` path, the hover preview (JS 6217 `j`, gated on `is-expanded` and desktop), the
replay after the heading leaves and comes back, everything else on the page.

### Rev 2 (superseded)

Rev 2 started the original 1.3 s wait when `is-visible` went on (MutationObserver only; reset only on the heading
leaving). Patches at commit 7f3fad3b; results in that commit's README.

## Checks (functional, no timing), rev 3

Probe: `out/people-word/probe.mjs` (not committed; headless new Chrome with the headed UA, `--screen-info` pinned,
unthrottled; shared lane, `lock.mjs run chrome-measure --shared --weight probe --max-seconds 300`; holds at 11:22Z and
~11:25Z). Per build: mobile 430x932 DPR 3 touch, mobile with `prefers-reduced-motion: reduce`, desktop 1440x900.
Scripted stepped scroll (`scrollBy` 30 px / 33 ms, ~900 px/s): P1 from the top to 150 px past the fade trigger, hold;
P2 back to the top and down again (replay); P3 a quick in-and-out across the trigger (card shown 33-67 ms), hold out,
then in; **P4 (new in rev 3)** with the word open, back up to 100 px above the trigger (card fades out, heading still
in view), hold 2.5 s, then down again. Logged with `performance.now()`: `is-visible`, `is-stack`, `is-expanded`
(probe MutationObservers), the heading's 0.35 crossings (probe IntersectionObserver), and **the card's own `filter`
`transitionend`** (probe listener, `fadeInEnd` / `fadeOutEnd`). Counts: rAF calls, MutationObserver /
IntersectionObserver constructions and callback runs, scroll/wheel/touch/resize/transitionend listeners added by the
page (wrappers installed before any page script; the probe's own listener is not counted). All three builds measured
with the same rev 3 probe (rev 2's numbers came from a probe without P4, so its totals don't compare).

`is-stack` (the word's start), ms after the event named. OBSERVED, Chrome headless, unthrottled, one run per cell.

| build, viewport | P1 first scroll | P2 replay | P3 quick in/out | P3 then in | P4 card fades out, heading in view | P4 back in |
|---|---|---|---|---|---|---|
| base, 430x932 | fade start +634 (fade end +915) | fade start +635 | plays at heading +1301, card hidden | already open | word stays open | stays open |
| A, 430x932 | fade end +0 (fade start +913) | fade end +0 (+916) | nothing starts | fade end +0 (+899) | **resets at fade-out start (+1 ms)** | fade end +0 (+916) |
| A-phone, 430x932 | fade end +0 (+932) | fade end +0 (+916) | nothing starts | fade end +0 (+915) | resets (+1 ms) | fade end +0 (+899) |
| base, 1440x900 | heading +1301 = fade start +701 | heading +1300 | plays at heading +1300, card hidden | already open | stays open | stays open |
| A, 1440x900 | fade end +0 (+932) | fade end +0 (+932) | nothing starts | fade end +0 (+915) | resets (+1 ms) | fade end +0 (+915) |
| A-phone, 1440x900 | heading +1302 | heading +1300 | plays at heading +1300, card hidden | already open | stays open | stays open |

- The card's fade-in ends (`filter` `transitionend`) 899-932 ms after `is-visible` (0.9 s transition plus frame
  alignment); the word starts in the same task (0-1 ms). `is-expanded` follows `is-stack` by 120-121 ms, as before.
- Reset: A and A-phone (phone width) reset the word 0-1 ms after `is-visible` goes off (scrollY 641/671 on the way up,
  P2 and P4); base resets only when the heading leaves (scrollY 101 on the way up). Both keep the reset on the heading
  leaving.
- A-phone at 1440x900 equals base: every `is-stack` within 2 ms of the heading crossing +1300, same resets.
- Reduced motion (430x932, all three builds): `is-stack` and `is-expanded` together at the heading crossing, as before.
- Console errors: 0 in all 9 runs.

Mechanism counts (whole run, same scripted scroll incl. P4, counts only):

| | base | A | A-phone |
|---|---|---|---|
| rAF calls, 430x932 / 1440x900 | 616 / 737 | 618 / 737 | 618 / 739 |
| MutationObservers created by the page | 4 | 5 | 5 |
| IntersectionObservers created | 23 | 23 | 23 |
| listeners added: scroll/wheel/touch/resize | 14 / 16 | 14 / 16 | 14 / 16 |
| listeners added: transitionend | 1 | 2 | 2 |
| MO callback runs, all page observers (430x932 / 1440x900) | 53 / 53 | 64 / 60 | 62 / 62 |

The new observer watches only the section's `class` (it changes on `is-visible` and `is-future-shrinking`); its
callback reads one `classList.contains` and sets or clears one timer or resets the word, no layout read. The new
`transitionend` listener runs once per transition end on the card or its descendants that bubbles up (a target and
property check). No new scroll listener, no new rAF.

Stills (`out/people-word/shots.mjs`, Chrome 430x932, gentle stepped scroll ~300 px/s to 150 px past the trigger,
full-viewport shots cropped around the title at 0 (taken +0.49 s), 0.9, 1.2, 1.6, 2.0, 3.0 s after `is-visible`): base
has the word open at every still (it opened 0.65 s before the fade started); A shows the blurred plain title at 0.49 s,
the sharp title with the "o" just turning at 0.9 s (`is-stack` at +915 ms), the faces at 1.2 s, open from ~2 s.

Served-file check: `x-mirror-source: overlay` for `2.DyWL8TcE.js`, hashes as in the builds table. `node --check`
passes for both option files.

## Risks

- A motion-timing change: the user decides (proposal). On phones the word now plays once the card is fully shown and
  closes when the card starts to fade out; before, it played unseen and stayed open until the heading left.
- The word's widening is a layout animation (0.92 s of `grid-template-columns`/`height`); the work is the same as
  before, now in a seen moment right after the card's fade-in (it no longer overlaps the fade on v9-final). The new
  reset adds one closing motion per fade-out with the heading in view (the same width transition, reversed). Phone
  smoothness of either second is not measured (no timing; phone busy). If accepted, a short phone no-worse check of
  that second is the natural follow-up.
- A on desktop: the word now waits for the fade-in end there too (~0.2 s later than today at 900 px/s: fade end +0 vs
  fade start +700) and closes on the fade-out.
- At a continuous gentle scroll the heading reaches its 35 % leave line ~1.3 s after the fade starts, mid-way through
  the word's motion, and the original leave reset closes it there (base had the same reset; rev 2 at 1.3 s would
  often not have started at all). Not changed: the user asked only for the start and the fade-out reset.
- `transitionend` does not fire when a transition does not run (no computed change, `display: none`) or is cancelled;
  the 1.2 s fallback covers the first, the class observer the second. Spec: CSS Transitions Level 1, "Transition
  Events" (https://www.w3.org/TR/css-transitions-1/#transition-events): `transitionend` at completion, `transitioncancel`
  when a running transition is cancelled (CONFIRMED by the spec text; Safari behaviour not checked on the phone).
- Coupling: the trigger reads the section's `is-visible` class and the card's `filter` transition (CSS 2634-2668). A
  change that renames `is-visible` makes the word wait forever while the heading is in view (A everywhere, A-phone on
  phones); a change that drops the card's `filter` transition only delays the word to the 1.2 s fallback. Posted as a
  coupling finding.

## Proposal PR-024

- Posted 2026-10-05 by fix-people-word; options `a` (A: every width) and `a-phone` (phones and tablets only);
  recommended `a`. B option (later observer trigger) dropped, reason above. Stills: Chrome 430x932, gentle stepped
  scroll (~300 px/s), full-viewport shots cropped around the title at 0.5 / 1.2 / 1.6 / 3.0 s after `is-visible`
  (base: the word already open at 0.5 s, it ended 0.53 s before the fade started; A: plain "people" until 1.3 s, faces
  coming in at 1.6 s). A-phone reuses A's stills (same code path at phone width). Probe and stills scripts:
  `out/people-word/probe.mjs`, `out/people-word/shots.mjs` (not committed).
- Try-it (console's Try-it host, plain http, I-126/I-143): A = base build (live A patch
  `fixes/morph-scroll-v9try/patch.diff`), B = `fixes/people-word-a/patch.diff` or `fixes/people-word-aphone/patch.diff`.
  Served hashes checked: A JS `1b2eecc66011`, option a JS `6788ba9a8009`, option a-phone JS `36dbcef9a12e`, CSS
  `e1359ab9994a` on all three. Phone Try-it after the current phone blocks; the lead tells the user when.
- `proposal post` warned that B "does not carry all of A's changes (4 lines)"; the overlays show B = A plus this
  hunk group only (`diff` of the two JS files: 11 removed lines, all baseline lines of `WD`'s effect). Reported as
  incident I-206 (tool, not blocking, triaged P3). Lead's check before any Try-it, done: main and this branch carry
  the same `morph-scroll-v9try/patch.diff` (blob c5365637, commit ada7f461); the served Try-it JS files A vs B differ
  in 7 hunks, all inside lines 7001-7043 (`WD`'s effect), 11 lines removed (baseline lines of that effect), 41 (a) /
  43 (a-phone) added; nothing of A is missing from B. Noted in I-206 and in PR-024 rev 2 (note only, no content change).
- **Rev 3** (2026-10-05, after the user's changes-requested at 11:08Z): `proposal revise` with the user's note quoted
  in full and answered point by point (see "The user's change request" above), the corrected fade duration, new stills
  (`out/people-word/r3/shots/crop/`, 0.49 / 0.9 / 1.2 / 3.0 s after `is-visible`) and the rev 3 gains. Try-it: A =
  the v9-final build (JS `1b2eecc66011`), option a's B JS `bf75ce87958c`, option a-phone's B JS `0c1845cb72c0`, CSS
  `e1359ab9994a` on all three, fetched from the Try-it host after the revise; A vs each B differs only in `WD`'s effect
  (hunks inside lines 7001-7083, 16 lines removed, all baseline lines of that effect). `proposal revise` printed the
  same "B does not carry all of A's changes (4 lines)" warning as on rev 2: the I-206 false positive, noted there.
