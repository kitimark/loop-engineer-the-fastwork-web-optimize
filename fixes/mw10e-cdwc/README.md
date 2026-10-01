# Fix: mw10e-cdwc

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft | measured | rejected
**Stage:** R | I | D (LOCATED / NAMED, signed by the lead <date>) | F | V
**Device class / gate:** Chrome-measurable (Chrome A/B) | phone-only (phone ABBA) | render-bound (Instruments hitches) | touch-only (G/F)
**Driver(s) behind the claims:** Chrome A/B | phone S / W / M / G / F
**Prediction:** `fixes/PREDICTIONS.md` <id>
**Topic:** see `fixes/TOPICS.md` (mw10e-cdwc)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (functions / pretty line ranges), `...css` (rules)

## Why it lags

What the code does today and why that costs frames. Cite the evidence:

- research: `research/01-initial-investigation/motion-inventory.md` section ..., `README.md` finding ...
- code: `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js:<line>` (`node tools/fix.mjs show <file> --lines a-b`)
- measurement: LoAF top scripts / forced layout from the baseline run (`results.json` -> `raw`)

## What changed

Short description of the patch (see `patch.diff`). What is visually identical and what, if anything,
differs (with the screenshot diff numbers).

## Why that is faster

The mechanism (e.g. "reads moved before writes, so style/layout is computed once per frame instead of
N times"; "work skipped on phones where CSS forces scale 1").

## Before / after

`node tools/fix.mjs ab mw10e-cdwc --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA order, cold cache,
serve `--vendors=local --https --latency 150`). Paste `results.json` -> `markdown` here:

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|

A/A noise floor for comparison (`node tools/fix.mjs ab --aa --runs 5`), if available: ...

iPhone (optional, under the `iphone` lease): scripted scroll summary / finger test notes.

## Cards (protocol v2)

Paste the filled cards from `fixes/_template/CARDS.md`: census, event, attribution (NAMED, with the lead's
sign-off), build (parity, a11y diff, mechanism delta, idle triple, memory/layers), prediction (and its
measured outcome). Phone blocks: block record (order, warm-up, sentinel per control, heat note, served hashes),
every run, median [IQR] in ticks; position-bin census diff on both devices.

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize ·
rubber band (strike out the ones that did run, with their evidence).

## Risks, conflicts, follow-ups

- Behaviour differences (reduced-motion, desktop layout, resize).
- Overlap with other topics (functions/rules also touched by ...).
