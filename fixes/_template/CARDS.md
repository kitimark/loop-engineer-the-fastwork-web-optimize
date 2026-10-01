# Card templates (protocol v2)

One card per stage gate ([`research/architecture/measurement-protocol-v2.md`](../../research/architecture/measurement-protocol-v2.md)
§2, §4; who signs: [`fixes/LEAD.md`](../LEAD.md) "Stages and gates"). Copy a card into your
`fixes/<topic>/README.md` (section "Cards") or into the message that asks for a sign-off; send the census, event and
attribution cards as they close, not at the end. Cite raw files by path (worktree `out/…` or `research/…`), never only
numbers. Positions are in **crossing coordinates** (protocol §3.4: y_i = elementTop_i − f_i·V_i, V_i = the
frame's innerHeight for IO rootMargins and JS reads, lvh 815 / svh 775 on the phone for CSS vh ranges; elementTop_i
from the same run; Δ = 0 inside [yStart, yEnd]; Chrome and phone are compared by crossing, never by raw y). Frame thresholds are in ticks (k = round(dt / 8.333); k≥5 = dt ≥ 37.5 ms,
k≥7 = dt ≥ 54.17 ms, the exact midpoints). On the phone, report both forms (dt > 50 / k≥7, dt > 34 / k≥5) and flag
frames within 4 ms of a threshold; disagreement = threshold-sensitive (A5).

## R: census card (owner signs)

```
CENSUS <topic> · base <overlay or "baseline"> + hashes · <date UTC>
phone: driver <S|W|M|G|F>, runs <n ≥3>, heat class <cool|warm> + battery temp per run (A4), probe <std version>   raw: <paths>
chrome: verify --frame-log at 430x932 (gain) and 430x775 / 430x815 (position)       raw: <paths>
| cluster (crossing ± Δ px) | device | runs with it (of n) | frames k≥5 / k≥7 per run | median dt (ticks) | driver |
|---|---|---|---|---|---|
reproducible (≥2/3 runs at the same crossing): <list>
rare (finger-only, toolbar, load-time; needs F or G runs before any work): <list>
```

## I: event card (owner; mgmt-ops checks it is complete)

```
EVENT <topic> · cluster <crossing> · window y <a>-<b> (± 1 viewport) · raw: <paths>
crossing table: | threshold (IO edge, scene gate, scroll-timeline range, class toggle) | file:line | y chrome-932 | y phone-775 | y phone-815 |
per-step probe (Chrome short lane, counts only, UNCAPPED): per y step: mutations by type + attribute,
  style / layout counts, layer count delta, scene attributes
phone logger (same window, per frame, uncapped): same fields + dt, yStart, yEnd, innerHeight, m
hypotheses: | # | element + selector + property (or function + file:line) | computed style Chrome | computed style WebKit | in this frame? |
```

## D: attribution card (the lead signs)

```
ATTRIBUTION <topic> · cluster <crossing> · verdict NAMED | LOCATED | UNEXPLAINED
1 pipeline stage: script | style | layout | paint recording | raster wait + allocation | Other (compositing update,
  layer creation, event regions, IO) | UI apply | render server (GPU) | input
  evidence: Chrome --trace-frames class of the frame; phone RenderingFrame segments (Script, Layout,
  Paint+Composite read together, Other, gap − frame) + page-rAF JS ms + filter element counts after the frame
  + LayerTree paintCount deltas around it; render-server suspect: Instruments Animation Hitches
  logger y source: rAF-only (A9 lifted, P-023) | timer task / MO-cv callback reads → absolute counts / segment cards flagged (A9)
2 code: <the single mechanism> at <file:line>
3 ablations (new names, one block, same control <name + hashes>):
  | arm | removes | role (positive / negative sibling / position-moving) | mechanism check (computed style, mutation counts, layer count) | result [IQR] |
  (an arm without a mechanism check is void; a position-moving arm never stands alone as the positive control)
  axis: y/crossing | time since <named event> | m · decoupling run: <hold at another y | change hold/transition length | shift a threshold> → <result>   (no decoupling run → at most LOCATED; A2)
4 device class: Chrome-measurable | phone-only | render-bound | touch-only  →  gate: Chrome A/B | phone ABBA | Instruments hitches | G/F
  phone-only: phone Timeline segment card before F: Script / Style / Layout / Paint+Composite / Other, gap − frame, ≥3 captures; which segment the fix removes (A1)
5 lead: <D signed, date, or what is missing>
fast path (lead decides): "counts <X> → 0, by code (<file:line>)"
```

## F: build card (owner)

```
BUILD <build name> (new name, never reused) on base <name> · overlay snapshot <path>
served hashes: <file: sha256> (curl -D: x-mirror-source: overlay)
parity: frozen-frame diff <0 %> (P14) · backdrop/filter look: <who looked, when; or framebuffer capture>
a11y diff: <n/a | what changed> (when inert, visibility, aria-* or focusable content changes)
mechanism delta (bench Tier A, short lane): <named counter X → Y>; everything else unchanged: <yes/no>
idle triple (callbacks/s, writes/s, mutations/s by type, rAF/s): y=0 <base → build> · mid-page after scroll <…> · at the pin <…>
memory/layers: layer count at 3 fixed positions (Chrome layerTreeDidChange vs a no-op control) <…>
prediction: <PREDICTIONS.md id>
debug hooks (__fwMorphDrive, loggers): <none | phone build only, stripped from patch.diff>
```

## F: prediction card (owner, before the first timed run; one row in `fixes/PREDICTIONS.md`)

```
PREDICTION <id> · author <you> · <date UTC>
1 build + hashes <…> vs base + hashes <…> · driver <S|W|M|G|F|Chrome A/B> · metric(s) <…>
2 baseline: same driver, same base, same heat class, ≤24 h old: <value>, raw <path>  (a finger baseline never predicts a driver run; same Mac display state for Chrome baselines, A7)
3 closure check: the model reproduces the base's measured value within one tick: <model value vs measured>
  phone-only class: closure on phone segments, Layout and Composite each within a tick (A1)
4 terms removed: | term | constant | calibrated (ablation on this device: <ref>) or assumed |
5 prediction: <delta> [interval] · visible to <rAF gap | DroppedFrame | Timeline | Instruments> (a threaded move is invisible to rAF gaps)
6 falsified if: <reading>
7 decision: within interval → <…>; below → <…>; worse → <…>
```

## F: slot ticket (phone access; mgmt-ops validates, the lead ranks)

```
TICKET <topic> · <build name> + served hashes · control <ONE name on the same base> + hashes
driver <S|W|M|G|F> · question: <one> · prediction <id>
decisions: if <outcome A> then <…>; if <outcome B> then <…>; if <outcome C> then <…>
probe set: <std | std + timeline (attribution run) | hitches> · expected minutes: <n>
warm-up: one uncounted load per served origin/port, every arm incl. the control (caches are per origin; A3, U5): <ports>
per run: battery temp + charging state (A4)
```
