# Fix: pain-offscreen-notes

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** mechanism verified, gain pending combined. Mechanism: pain-callback `.commission-card` rect reads per mobile scroll pass 333 -> 0 (desktop 441 -> 0), and by construction (the guard returns whenever `T` is empty; `le` never fills `T` at <= 860 px, JS 4595). Gain: the only Chrome A/B (/01) is contaminated (load1 at start 5.1-12.9, 3 runs > 10) and old-tools, so it is inconclusive, neither a gain nor a null; iPhone (/04) within noise. The gain is claimed only in the clean wave-1 combined A/B; single-topic /06 only if the combined result needs it isolated.
**Topic:** see `fixes/TOPICS.md` (pain-offscreen-notes, row 11)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`: component `hD` (`section.pain`), scroll
callback `d` inside its `ne(() => …)` block (baseline 4728-4731); +4 lines, 0 removed.

## Why it lags

`section.pain` (component `hD`, JS 4411-4826) has two pieces of recurring work:

1. **Scroll callback `d`** (JS 4728-4731), registered with the shared scroll engine
   `dE(d, { deferRendering: true, element: b, rootMargin: "150% 0px" })` (JS 4736). `iE` (JS 2670)
   calls it in the engine's rAF on every scroll frame while the section is within 1.5 viewports.
   Every call does this:
   ```js
   let e = document.querySelector(`.commission-card`);
   e && e.getBoundingClientRect().top < window.innerHeight * 0.995 && z(T, [], !0);
   ```
   - a document-wide `querySelector`;
   - a `getBoundingClientRect()`, which forces style + layout whenever an earlier callback in the
     same `iE` loop has written styles;
   - once the commission card is up, `z(T, [], true)`. `z` is Svelte's `set` (`rt` → `F`,
     chunks/BSBv9QXB.js 1229), and state equality is `===`, so a fresh `[]` never equals the old one.
     Each frame it opens a batch and re-runs the notes each-block derivation `[...s(w), ...s(T)]`
     (JS 4755), even though `T` (the "extra" notes) is already empty.

   `T` only fills on desktop, from the 3 s interval `le` (JS 4590-4646). `le` returns at once when
   `(max-width: 860px)` matches (JS 4595). **On phones `T` is always empty for that reason alone**,
   so all of this per-frame work clears nothing. (The notes render into `.pain-canvas`: the
   each-block is JS 4752-4796 and the template JS 4409. The `.pain-notes` wrapper, `display:none` at
   <= 860 px, stays empty everywhere, so its CSS is irrelevant here.)

2. **The 3 s interval `le`** (started at JS 4696 while the notes IntersectionObserver `A` is true,
   JS 4698-4704). The IO observes `x.parentElement`. `x` is `.pain-canvas`, so the IO observes
   `.pain-sticky`, which is visible on phones, and the interval **does start** there. The probe's
   stack is `r` (JS 4696) <- IO callback (JS 4700); it ticks 3-4 times per 10 s idle. Each tick
   only does two `matchMedia` calls and returns at JS 4595, before any DOM work: `extraNotes` stays
   0 on phones in every phase. So the TOPICS premise ("adds hidden notes on phones") is wrong: there
   is no DOM churn, just a cheap 3 s no-op timer.

Evidence, from a read-only instrumentation script under the `chrome-measure` lock
(`lock.mjs run chrome-measure -- node fixes/pain-offscreen-notes/probe/pain-counts.mjs`; own code, no Fastwork excerpts).
It wraps `querySelector`, `getBoundingClientRect` (attributing calls to the pain callback by stack
line 4720-4739), `setInterval(…, 3000)`, and a document-wide MutationObserver, and counts `.pain-note.extra`
elements. Settings: Chrome
mobile 430x932 DPR 3, CPU 6x, the same scroll as `verify.mjs` (smooth `scrollBy(250)` every 300 ms to
the bottom), one run per side:

| per phase (mobile 6x) | baseline | patched |
|---|---|---|
| scroll to bottom: `.commission-card` querySelector calls | 333 | 0 |
| scroll to bottom: `.commission-card` rect reads, all callers | 579 | 245 |
| scroll to bottom: rect reads from the pain callback | 333 | 0 |
| scroll to bottom: time inside those pain rect reads (forced style/layout) | 56.4 ms | 0 |
| slow scroll pain -> commission (16 x 150 px): pain rect reads | 285 | 0 |
| DOM mutations under `.pain`, scroll to bottom | 1 | 1 |
| extra notes (`.pain-note.extra`) on phones, any phase | 0 | 0 |

Caveat: the probe's `.pain-notes-stage` mutation counter was blind (the notes live in `.pain-canvas`;
it read 0 on desktop too, while 11 extras were added), so it is not used as evidence.

Desktop 1440x900 (same script): the pain callback did 441 rect reads (54.5 ms) in baseline and 0
patched. DOM mutations and note counts were identical on both sides.

In the `fix.mjs ab` baseline runs, LoAF puts the engine rAF `iE` (JS 100565 char) at 46-52 ms
forced style+layout in 3 of 5 runs, against 4-7 ms in all 5 patched runs (A/B /01, contaminated:
supporting evidence only).

So the real cost is not DOM churn. The TOPICS row expected the interval to add hidden notes on phones,
but it doesn't (0 extra notes on phones). The cost is a per-scroll-frame layout read, plus a no-op
reactive write in a callback that has nothing to do on phones.

## What changed

One guard at the top of `d` (see `patch.diff`):

```js
d = () => {
  if (s(T).length === 0) return;   // nothing to clear
  let e = document.querySelector(`.commission-card`);
  e && e.getBoundingClientRect().top < window.innerHeight * 0.995 && z(T, [], !0);
};
```

- If `T` is empty, the original `d` would at most replace `[]` with `[]`, and the rendered list is
  identical. So skipping it changes nothing visible on any viewport.
- If `T` is non-empty (desktop, extra notes shown), `d` runs exactly as before. It still reads,
  then writes, and clears the notes when the commission card arrives.
- Not changed: the engine API (`rE`/`iE`/`aE`/`dE`/`uE`), the `dE(...)` call and its 150% margin,
  the interval, the IntersectionObserver gate, drag/keyboard handling, CSS. `prefers-reduced-motion`
  is unaffected: `le` already returns under reduced motion, so `T` stays empty and `d` just returns.

Screenshot diff patched vs baseline (mobile): top 0.23 %, middle 0.01 %, bottom 0.12 % (countdown/orbit
phase noise, <= 0.4 %).

## Why that is faster

On phones, and on desktop whenever no extra note is shown, the pain callback now costs one signal
read per frame. It no longer does a querySelector, a `getBoundingClientRect` that can force a
synchronous style+layout mid-`iE`, or a Svelte batch + each-block re-evaluation. Expected movement:
forced style+layout in LoAF, LoAF script ms, long frames during the pain → future → commission
stretch.

## Before / after

`node tools/fix.mjs ab pain-offscreen-notes --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA order,
cold cache, serve `--vendors=local --https --latency 150`). Host load 5.1-12.9 (busy: other agents'
work). From `results.json` → `markdown`:

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 66.2 [51.5-71.2] | 72.6 [68.2-72.9] | +6.4 (+9.7%) | within noise |
| scroll: frames >20 ms | 95 [77-115] | 79 [75-90] | -16 (-16.8%) | within noise |
| scroll: frames >34 ms | 15 [12-18] | 10 [8-11] | -5 (-33.3%) | better (ranges do not overlap) |
| scroll: frames >50 ms | 6 [4-10] | 5 [5-6] | -1 (-16.7%) | within noise |
| scroll: frames >100 ms | 1 [0-2] | 0 [0-2] | -1 (-100%) | within noise |
| scroll: worst frame ms | 100.2 [91.9-901.6] | 99.9 [91.6-109.2] | -0.3 (-0.3%) | within noise |
| scroll: p95 frame ms | 25.8 [25.4-32.6] | 25.5 [25.3-25.6] | -0.3 (-1.2%) | within noise |
| scroll: LoAF ms | 332 [303-1544] | 374 [347-388] | +42 (+12.7%) | within noise |
| scroll: LoAF script ms | 186 [146-199] | 161 [160-175] | -25 (-13.4%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 83 [43-94] | 59 [54-61] | -24 (-28.9%) | within noise |
| morph: fps | 106.7 [58.7-109] | 109.4 [104.6-110.1] | +2.7 (+2.5%) | within noise |
| morph: frames >50 ms | 0 [0-1] | 0 [0-2] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-294] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

A/A noise floor (fix-countdown-idle-raf, mobile 6x, n=5, host load 2.8-5.8): >34 ms frames 7-10 pooled
(A/A delta +1), >20 ms 54-78, LoAF 195-283 ms, forced 34-83 ms. Rule of thumb at n=5: >20 ms deltas
under ~15, LoAF deltas under ~80 ms and forced deltas under ~40 ms are noise.

`better` in the >34 ms row is unchanged tool output; read it as better, contaminated -> void.

**Reading: void. The tool's >34 ms `better` is contaminated (I-017: 3 runs started above load1 10) and
is withdrawn; fps +6.4 is within noise. Load imbalance may explain the difference, but this A/B can
neither show nor rule out a gain: inconclusive.** (arch-lead measurement review,
research/architecture/measurement-review.md.) What is known:
- Host load1 at run start was higher on the baseline side (12.9, 9.9, 12.9, 7.8, 6.3) than on the
  patched side (9.0, 8.2, 10.8, 8.3, 5.1). Both are far above the A/A's 2.8-5.8, and three runs
  started above 10 (contaminated by the I-017 rule).
- One baseline run stalled (worst frame 901.6 ms, LoAF 1544 ms), so the baseline's >34 ms range
  12-18 sits above the A/A's 7-10.
- The >34 ms paired deltas (run by run, ABBA) favour the patch 5/5 (-7, -7, -8, -2, -2), pair 4
  included, so "artifact" isn't proven either.
- Contaminated /01, a hypothesis for a clean run to confirm: forced layout may move instead of
  disappearing. In LoAF, the hero rAF `l` (JS 11303, the `.hero-track` test) went from 13-20 ms to
  24-29 ms of forced layout per run, as if a later reader now forces the layout that `d` used to
  force.

Net forced is -24 ms (within the ±40 ms A/A noise). **This A/B is inconclusive for the whole page.**
The gain is to be judged in the clean wave-1 combined A/B.

The mechanism itself is certain, and it is measured with counts, which don't depend on host load:
333 → 0 `.commission-card` rect reads per mobile scroll pass, ~56 ms spent inside those reads at 6x.

Desktop A/B: not run (the lead's queue budget). The patch leaves desktop behaviour identical by
construction (`d` runs unchanged whenever there are notes to clear). The desktop instrumentation
runs confirm it:
- in the full scroll, note counts and DOM mutations are the same on both sides, and pain rect reads
  go 441 → 0;
- idling 10 s at pain top -0.5 / 0 / +0.5 / +1.2 viewports, extra notes go 3 → 7 → 11 → cleared
  (commission card in view) on **both** sides, with identical mutation counts;
- where extra notes are shown, `d` runs unchanged (pain rect reads 314 base / 331 patched at the
  "0" spot);
- from pain to commission, pain rect reads go 251 → 0, because the notes were already cleared.

Side observation (reported to the lead as a possible new topic, not in scope): on desktop at
scrollY = `.pain` top, the engine `iE` keeps running at ~33 Hz **while idle**: ~320 pain callback
calls and ~650 `.commission-card` rect reads per 10 s with no input, on both sides. At that spot the
commission card top is exactly 2.0 viewports down, which suggests a scene gate flapping at its
rootMargin edge (topic 12).

Idle phase: see the second A/B below (`verify.mjs --idle 6`, after I-002). That idle phase sits at
the page top, where the pain callback never runs (the probe counted 0 pain reads and 0 interval ticks
at the top), so no idle change is expected there.

**Single-topic A/B on current tools (/06): not run.** It was queued (`fix.mjs ab --runs 5`, with the
idle phase; `out/ab/pain-offscreen-notes/2026-09-30T22-57-08-660Z`, serve logs only), then withdrawn
on the ops lead's queue-order decision. `results.json` is the contaminated run /01 (see its `notes`).
/06 runs only if the clean combined A/B needs this topic isolated.

iPhone 15 Pro Max (scripted `iphone.mjs scroll`, plain http, 3 runs each, alternating
base/patched/patched/base/base/patched): scroll-phase fps base 52.4 / 29.8 / 30.9 vs patched
51.3 / 33.3 / 36.3, >50 ms frames base 5 / 35 / 35 vs patched 7 / 30 / 30, idle fps 59.5-59.9 on both.
**Within noise.** The first pair ran a much shorter, smoother scroll than the later four, so only
runs 2-6 compare well: patched is slightly ahead there, which is not a claim. Raw:
`out/iphone/pain-offscreen-notes-*.json`. The phone was then disconnected; no finger test (not
needed: nothing touch-specific changed).

## Risks, conflicts, follow-ups

- **Behaviour:** identical on desktop, phones and reduced motion (see "What changed"). If `T` is
  non-empty after a resize, `d` runs unchanged (the guard only skips when `T` is empty); the extras
  stay in `.pain-canvas` until the commission card arrives, as in baseline.
- **commission-forced-layout (topic 4):** reads the same `.commission-card` rect in its own callback.
  With this patch, pain no longer reads it on phones. In a combined run, a forced layout that pain
  paid may land in commission's (or the hero's) read instead. Told the owner.
- **scroll-engine (topics 2/10/12):** told fix-scroll-engine that `d` keeps its read-then-write order
  and its `dE` call/rootMargin. In a measure/mutate engine, the `T`-empty check and the rect read
  belong in measure and `z(T, [])` in mutate.
- **Not done: gating the 3 s interval** on `(max-width: 860px)` in `r()` (e.g. `t.matches ||
  (F ||= setInterval(le, 3e3))`). The interval does run on phones, but each tick is two `matchMedia`
  calls and a return (see "Why it lags"). That's far below anything measurable, and not worth an A/B
  slot. (The IO observes `.pain-sticky`, which is visible on every viewport, so a matchMedia check
  in `r()` would also need the MQL `change` listener to start the interval after a resize to desktop.)
- **Not done: `pointermove` only while dragging** (architecture review). `window.addEventListener
  ("pointermove", l)` (JS 4733) is always attached, and `l` returns at once when nothing is dragged
  (`!O`). On phones every touch pointermove calls it. pointermove listeners never block scrolling (only
  touch/wheel listeners can), so `passive` changes nothing. The per-event cost is one function call.
  Attaching it in `W` (pointerdown, JS 4647, which already returns on phones) needs `l` hoisted out
  of the effect, a bigger edit for no measurable gain. Follow-up; no CDP touch probe was run (no
  extra slot).

## Experiments tried

Probe script: `fixes/pain-offscreen-notes/probe/pain-counts.mjs` (own code; attributes pain reads by
stack line 4720-4739 of the served pretty file, so it only fits this overlay/baseline pair; its
`.pain-notes-stage` counter is blind, see "Why it lags"). Run it under
`lock.mjs run chrome-measure --owner <you> -- node …` (`QUICK=1 OFFS=… IDLE=…` for the idle-offset mode).

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| pain-offscreen-notes/01 | `d`: `if (s(T).length === 0) return;` (skip the `.commission-card` query, rect read and no-op `z(T, [])`) | Less forced layout and fewer long frames on phones | better (tool, >34 ms only) -> void: contaminated; inconclusive | old-tools, contaminated (load 5.1-12.9) | n=5: >34 ms 15 [12-18] -> 10 [8-11]; >20 ms 95 [77-115] -> 79 [75-90]; forced 83 [43-94] -> 59 [54-61] ms; fps 66.2 -> 72.6 | `WT:a700c/fixes/pain-offscreen-notes/results.json` (2026-09-30T21:21Z); README "Before / after" | P9, P10; hypothesis (contaminated): forced layout moves to the next reader (hero `l`, 13-20 -> 24-29 ms) | landed in this commit; retry the A/B when load1 <= 6 on current tools (= /06) | pending runner: WT:a700c `variants/01.diff` |
| pain-offscreen-notes/02 | Probe: counters for querySelector, rect reads, 3 s intervals, MutationObserver; full scroll and idle in pain, mobile + desktop, n=1 | Verify the TOPICS premise "the interval adds hidden notes on phones" | pass (mechanism confirmed, premise wrong) | clean (counts, not timing) | mobile pain rect reads 333 -> 0 (56.4 ms in-read -> 0); desktop 441 -> 0; extraNotes 0 on phones (the stage mutation counter was blind) | README "Why it lags" | P10: count first; the cost was the scroll callback | done | pending runner: mech = pain rect reads per mobile scroll 333 -> 0 (probe/pain-counts.mjs) |
| pain-offscreen-notes/03 | Desktop A/B `--viewport desktop --runs 5` | Show desktop unchanged | abandoned (queue budget; started as `out/ab/pain-offscreen-notes/2026-09-30T21-21-54-731Z`, stopped while queued: serve logs only, no verify.json) | n/a | none | README row | Parity by counts is cheaper than a desktop timing A/B | dropped | no patch kept (same patch as /01: variants/01.diff) |
| pain-offscreen-notes/04 | iPhone scripted scroll, 3 + 3, plain http | The patch helps on the phone | within noise | clean (device); pair 1 not comparable (shorter scroll) | fps base 52.4/29.8/30.9 vs patched 51.3/33.3/36.3; >50 ms 5/35/35 vs 7/30/30 | README "iPhone"; raw WT:a700c `out/iphone/pain-offscreen-notes-*.json` | A small mechanism doesn't clear the iPhone run-to-run spread at n=3 | done | pending runner: same diff as /01 |
| pain-offscreen-notes/05 | Probe: interval origin and idle at 4 offsets in pain, mobile + desktop, n=1 | Does the interval start on phones? Is desktop behaviour identical? | pass (probe) | clean (counts) | interval starts on phones but does no DOM work (3-4 ticks per 10 s); desktop extra notes 3/7/11/cleared on both sides | README | the notes IO observes `.pain-sticky` (visible on phones), so the interval starts; `le` returns on matchMedia (4595); found an idle `iE` loop at ~33 Hz at pain top (desktop), reported | done (first attempt broke on a syntax error in the injected snippet, re-run) | no patch kept (probe script only) |
| pain-offscreen-notes/06 | Final A/B of /01 with the idle phase (after I-002) | Same as /01 on current tools; idle unchanged | pending (queued at 22:57Z, then withdrawn on ops' queue-order decision; no results; `out/ab/pain-offscreen-notes/2026-09-30T22-57-08-660Z` serve logs only) | n/a | none yet | README "Before / after" | - | retry when load1 <= 6 on current tools, only if the combined A/B needs it isolated | pending runner: WT:a700c `variants/01.diff` |
| pain-offscreen-notes/07 | Gate the 3 s interval on `(max-width: 860px)` in `r()` | Stop a no-op timer on phones | abandoned (two matchMedia calls per 3 s: nothing to measure) | n/a | none | README "Risks" | Only gate what costs | retry only as part of an idle-timer cleanup | no patch kept (never written) |
| pain-offscreen-notes/08 | Attach `pointermove` only while dragging (architecture review, N7) | Remove a per-touch no-op handler call on phones | abandoned (one function call per pointer event; cannot block scroll) | n/a | none | README "Risks" | Passive only matters for touch and wheel listeners | follow-up (N7) | no patch kept (never written) |
