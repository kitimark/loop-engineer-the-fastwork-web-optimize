# Fix: illusion-typing-chunks

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC, proposed to the user; not accepted yet)
**Stage:** R/I (illusion proposal, de-illusion-style 2026-10-02); no D card yet
**Device class / gate:** Chrome-measurable counts; the container-query amplification is WebKit-only
**Driver(s) behind the claims:** Chrome counts probe (no timing), screencasts; phone not run (no phone time before acceptance)
**Prediction:** none filed yet
**Topic:** illusion-typing-chunks (research/design-engineering/illusion-style.md, candidate S3)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (B pretty lines ~2480-2500 referral-fee typing and $ count-up;
~11895-11915 agents-ask typing and delete). **Stacked on `fixes/user-bplus`** (build B).

## Why it lags

- Referral-fee bubble (commission section): the message is typed one character per 28 ms
  (`z(p, s(o).slice(0, t))` + `f(28)`), and the "$N" count-up writes its number on every animation frame for 1.1 s.
- Agents card (#platform): the query is typed one character per 32 ms and deleted one per 18 ms.

Every write is a text change: style + layout of the line. The agents card sits inside #platform's size containers
(6 containers at depth 2); in WebKit every element restyled under a size container costs an extra style round plus
an interleaved whole-view layout per nesting level (F-099/F-101, CONFIRMED in source by fix-scene-scope), so each
typed letter costs more on the phone than in Chrome.

## What changed

- Bubble: 2 characters per 56 ms (`Math.min(t, len)` on the last step), same total time.
- "$N" count-up: the number is written at most every 48 ms (and always at 100); the bar (`C`) still updates per frame.
- Agents query: 2 characters per 64 ms; delete: 3 characters per 54 ms (`slice(0, -3)`). Same totals.

Final texts, durations and pauses are unchanged. Visual: letters appear in pairs (18/s instead of 36/s in the bubble,
16/s instead of 31/s in the field), deletes in triples, the number steps by ~4-5. Screencasts and strips:
`out/proposals/illusion-typing-chunks/` (local).

## Why that is faster

Half the text writes, so half the restyle + layout passes they trigger (and on WebKit, half the container-query
rounds in the agents card). Frame-driven animations elsewhere keep RecalcStyle n almost unchanged.

## Before / after

Counts only (timing deferred). Chrome, 430x932 DPR 3 mobile + touch, CPU 1x, `--vendors=local --latency 150`,
n=1, 9.3 s parked windows, snapshot `b1789284481295-4ad4a84a`, hold 2 (B re-measured in the same hold), served
hashes B JS `dbd5fdb4f1fb` / CSS `cc8d1340b449`, PoC JS `a4424a6bf93c`:

| window | build | RecalcStyle n | ULT elements | Layout n | dirty objects | layout invalidations | Paint | frames | text writes |
|---|---|---|---|---|---|---|---|---|---|
| commission | B | 627 | 2686 | 226 | 5201 | 289 | 699 | 627 | 226 |
| commission | B + typing-chunks | 612 | 2616 | **97** | **2181** | 160 | 662 | 612 | 97 |
| agents | B | 1116 | 9603 | 101 | 880 | 398 | 2353 | 1117 | 107 |
| agents | B + typing-chunks | 1117 | 9599 | **46** | **498** | 344 | 2306 | 1117 | 53 |

(Hold 1 lost this build to a navigation that never committed; the probe now retries and checks `location.href`.)
No new console errors or 404s.

## Cards (protocol v2)

None yet. On acceptance: phone Timeline in the agents card window (layouts per typed step, B vs B+PoC).

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize · rubber band.

## Risks, conflicts, follow-ups

- JS edit in the page bundle: re-apply if the bundle changes (`node tools/fix.mjs apply illusion-typing-chunks --on user-bplus`).
- A 2-unit slice can split a surrogate pair or a Thai base + mark for one step; 1-unit slicing does that today too.
- fix-scene-scope owns #platform's scene flips; this touches only the typing loop inside the agents visual (no class
  or custom-property writes). Combines cleanly with the other illusion PoCs.
