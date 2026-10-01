# Automated benchmark tests per fix topic

Author: `arch-bench` (architecture team, 2026-10-01). Read-only study: no Chrome, iPhone or locks were
used. The worked examples below take their numbers from committed `README.md` / `results.json` files.
Where a counter value was never measured, it is labelled **predicted**. Sources are at the end. Each
claim carries a confidence label: *spec*, *vendor doc*, *blog*, *bug/code*, or *my inference*.

User question: "Automate benchmark tests: each topic could provide these tests." The goal is that
every done topic ships a test that shows (1) its **mechanism** still works and (2) its **gain** still
holds, so that later waves, combined overlays and tool changes can't undo it without anyone noticing.

---

## 0. Recommendation in five lines

1. **Two tiers.** Tier A: exact, load-independent **mechanism checks**. These are in-page counters
   (calls, writes, reads after writes, animated properties, listener flags) plus a state-parity
   snapshot, taken during a *stepped* scroll with no throttle. Each check must fail on the baseline
   and pass on the patch. Tier B: statistical **gain checks**. They are short throttled
   micro-scenarios per topic (not the whole page), ABBA with n=5, an exact Mann-Whitney test plus a
   Hodges-Lehmann shift against an A/A noise floor, and three verdicts (HOLDS / REGRESSED / INCONCLUSIVE).
2. **Contract:** each topic commits one data-only file, `fixes/<topic>/bench.json`. It holds
   selectors, property names, scroll segments and expectations, and **no code**. The runner owns all
   probe code. That keeps Hard rule 3 simple and puts every probe under tests (Hard rule 6).
3. **Tooling:** `tools/bench.mjs` (`lint | mech | gain | guard | calibrate`), plus page-side probes in
   `tools/lib/bench-probes.mjs` (vm-testable like `perf-page.mjs`), `lib/bench-stats.mjs`, and small
   additive helpers in `lib/cdp.mjs` (`getMetrics`, `eventListeners`). `verify.mjs` and `fix.mjs ab`
   stay untouched, so every existing `results.json` keeps its meaning.
4. **Every overlay, and re-confirmation after every landing:** a benchmark must pass on its own
   overlay, stacked (`--on`), and on every later combined overlay. `bench.mjs reconfirm` runs the
   **whole suite** (Tier A for every landed topic, then all Tier B scenarios) against the current
   `_landed` combined overlay. It runs in **one normal `chrome-measure` slot**, about 5 min for
   Tier A only and 25-30 min for both, after every landing. Tier B records host CPU from tick deltas
   plus load and memory for each run, and gates on them (I-017): a contaminated run can't produce a
   verdict (§3, §5a).
5. **New role `bench-author`:** one per topic finished before the runner existed. New topics write
   their own `bench.json` (Definition of done item 8). The bench-author writes `bench.json`, proves
   each check discriminates, calibrates, and commits `bench.json` + `bench-results.json`. Draft:
   `research/architecture/bench-author.draft.md`.

Inputs folded in after the first draft (lead, 2026-10-01): benchmarks are required (Definition of done
item 8, main 490620a), the load and host-CPU study `research/measurement-parallelism/README.md`
(I-017), and arch-render's `research/architecture/render.md` recommendation 1 and Q9/Q10 (per-frame
attribution needs `Performance.getMetrics` deltas or an afterFrame probe, because LoAF can't see
frames under 50 ms).

---

## 1. Why two tiers (evidence from this project)

- **Whole-page timing A/Bs rarely clear the noise.** They report "within noise" on most metrics even
  when the mechanism clearly changed. Examples:
  - layout-animations: every scroll and morph metric within noise.
  - commission-forced-layout: forced 83 → 42 ms, within noise.
  - phone-invisible-shrink: forced 94 → 31 ms, within noise.

  Host load 6-20 widens the ranges (`fixes/FINDINGS.md`, "Measurement lessons"). A regression test
  built only on those metrics would be INCONCLUSIVE most of the time.
- **LoAF can't see per-frame costs.** It reports only frames over 50 ms and attributes only scripts
  over 5 ms (*spec*, W3C LoAF). `forcedStyleAndLayoutDuration` is still "implementation-defined"
  (*spec*). Our frames over 20 ms (p95 ≈ 25.7 ms) are exactly the frames LoAF misses (FINDINGS
  "Measurement lessons"). So a "forced layout gone" claim needs a counter, not the LoAF total.
- **Counters were already the decisive evidence** in several topics:
  - pain-offscreen-notes: `.commission-card` `querySelector` calls 333 → 0. This also disproved the
    TOPICS premise (P10).
  - layout-animations: idle layouts per 5 s 231-330 → 13-16; running off-screen sweeps 4 → 0.
  - scroll-engine: parity over 39 steps with 0 state diffs.

  They were one-off scratch scripts. Tier A turns exactly these into reusable, committed checks.
- **Counts don't depend on host load; timings do** (*my inference*, consistent with every probe
  above). Tier A can therefore run on a busy machine and still give a hard pass/fail. Tier B can't.
- **Other projects split the same way:**
  - Chromium's Pinpoint has a *functional* comparison (failure rates) next to a *performance*
    comparison (KS + Mann-Whitney with an "Unknown" band) (*code*, go.skia.org pinpoint `compare`).
  - crossbench "probes" are JS snippets that pull page-specific numbers next to traces (*vendor
    doc*, crossbench README).

## 2. Tier A: deterministic mechanism checks

**What it asserts.** Each topic's mechanism is stated as an invariant on something countable in the
page. Every check asserts a **pair**: an expectation on the baseline side (for example `>= 20`) and
one on the patched side (for example `== 0`).
- The baseline expectation proves the probe still sees the mechanism (it discriminates, so the check
  isn't vacuous).
- The patched expectation proves the fix still removes it.

*Note added 2026-10-02 (ts-headless, lead decision Q1):* Tier A's headless Chrome now sees the page a headed one does. It
gets a User-Agent override (`HeadlessChrome/` → `Chrome/`; Hotjar's bootstrap skips headless user agents) and a virtual
screen pinned to 1512x982 at DPR 2 (`--screen-info`; the headless default is DPR 1). It also runs in its own temp
profile. Each `bench mech` record and `mechPartial`, and reconfirm's `tierAPage`, record `chromeMode`, `uaOverride`,
`screenInfo`, `mechPage: "headed-equivalent"` and `lock.mode`. **Mech records without `mechPage` are from before this
change and are not comparable with newer ones** (different counting conditions). They are kept as they are, not
recomputed. Details: `research/architecture/headless-functional.md`.

A second kind of check is **parity**. At every settled step, the listed classes, custom-property
values and attributes on the patched page must equal the baseline's. This is the scroll-engine
"parity smoke" in general form, and it guards the side jobs from P2/P12.

**Probe kinds** (runner-owned, parameterised only by data in `bench.json`):

| kind | what it counts | notes |
|---|---|---|
| `setProperty` | `CSSStyleDeclaration.prototype.setProperty` calls, filtered by `prop`, optional receiver `selector`; also counts **no-op writes** (value equal to the current one) | exact, includes redundant writes (T3) |
| `inlineProp` | changes of one custom property in the `style` attribute (MutationObserver, attributeOldValue) | catches template-driven writes such as the Svelte `--platform-shrink` style string, which don't go through `setProperty` |
| `styleWrite` | writes to `style.<prop>` accessors (e.g. `pointerEvents`, `height`, `width`), filtered by receiver selector | measured (I-028, one evaluate in Chrome 154.0.8037.58): Chrome has no CSSStyleProperties / CSS2Properties; each CSSStyleDeclaration instance carries its ~750 camelCase properties as own properties, the prototype only cssText / cssFloat and the methods. So on Chrome the element `style` getters return a Proxy whose set trap sees the writes; on the Firefox / spec shape the prototype setters are wrapped. Either way only `el.style.<prop> = v` is seen (not CSSStyleRule.style, attributeStyleMap, setAttribute('style'), `el.style = "…"` or Element.animate) |
| `layoutRead` | `getBoundingClientRect`, `getClientRects` (Element and `Range`), `getComputedStyle`, `offset*`, `elementFromPoint(s)`, filtered by receiver/subtree selector | exact call counts |
| `readAfterWrite` | layout reads that come after a wrapped style or DOM write in the same frame (a flag set by writes and cleared at each rAF), filtered by the reader's subtree | a JS-side stand-in for "forced layout". It is an upper bound (*my inference*); see open question Q6 |
| `matchMedia` | `window.matchMedia` calls, filtered by exact query string | T2 |
| `querySelector` | `querySelector(All)` calls, filtered by selector argument | T7-style caching |
| `raf` / `timer` | `requestAnimationFrame` requests and `setInterval`/`setTimeout` registrations per window | idle loops (countdown, engine trampolines) |
| `animations` | union of animated properties (`getKeyframes()`) and running/paused state of `document.getAnimations()` whose target matches a selector, sampled once per frame in a window | T5/T6: "no running animation on X animates width", "no sweep runs off-screen". CSS transitions show up here too (*spec*: CSS animations and transitions are exposed as `Animation` objects) |
| `listeners` | `DOMDebugger.getEventListeners` on `window`/`document`: type, `passive`, `useCapture` | exact; for topic 6 (passive vs blocking) |
| `perfMetrics` | `Performance.getMetrics` deltas: `LayoutCount`, `RecalcStyleCount` (and durations, informational only in Tier A) | counts of layouts and style recalcs (*vendor doc*); timing-dependent, so assert **ratios** (`patched <= 0.25 * baseline`) |
| `layoutsPerFrame` | per scroll step: the `LayoutCount` / `RecalcStyleCount` delta divided by the frames the in-page rAF counter saw in that step | a frame with no forced work does one style pass and one layout; more than 1 per frame means forced work (render.md Q9 (a); *my inference* that this holds per frame, not only per scroll phase). This is the page-wide counterpart of `readAfterWrite`: a whole-page ceiling such as "≤ 1.2 layouts per frame in segment X" is checked on combined overlays, where a single topic's attribution doesn't matter |
| `frozenFrame` | pause every animation under a selector, set the same `currentTime` on both sides, screenshot the clip, pixel diff | layout-animations' visual-equivalence check in general form; fills the gap in P6 |

**Scenario.** Tier A never uses the smooth scroll. The runner does a **stepped scroll** over the
segments the checks name (for example "from one viewport above `.start-selling-future` to the end of
`#platform`, 150 px steps"). Each step:
1. `scrollTo({top, behavior: 'instant'})`;
2. wait until the page is **quiescent**: 2 consecutive frames with no probe activity, capped at 40
   frames. Easing tails converge per frame, not per millisecond, so the tail's writes are included;
3. take the parity snapshot.

Idle checks use named **spots** (scroll to a selector, wait 1 s, record a 3-6 s window). Before the
first step: `document.fonts.ready`, then images loaded, so a font swap or image decode can't shift
layout mid-scenario.

**How it avoids flakiness.**
- It asserts counts or ratios, never milliseconds. Ranges are one-sided (`>=`, `==0`) with margins
  set at authoring. Rule of thumb: baseline expectation ≤ 50 % of the observed baseline count;
  patched `== 0` only where the mechanism removes the call entirely, otherwise a ratio.
- Stepped scroll plus quiescence instead of time-based smooth scrolling.
- No CPU throttle. Throttle changes how many frames an easing or animation window spans, not whether
  a call happens.
- Both sides run in the same session, one after the other: A, B, then B, A for the repeat.
- `--repeat 2` by default: both repeats must agree. A disagreement marks the check **FLAKY**, which
  is a bug in the check (the author fixes it). The runner never retries until green.
- Tier A records the same host data as Tier B (load1, host CPU ticks) but doesn't gate on it:
  counts don't depend on load. Hitting the 40-frame quiescence cap on more than a few steps signals
  a stalled page, which marks the check FLAKY.
- Probes attribute by **receiver, selector or argument**, never by stack line numbers or minified
  function names: overlays shift line numbers, and combined overlays shift them more. The pain probe
  attributed by stack lines 4720-4739, which would break under any stacked patch.

**Runtime** (*my inference*, from verify's load + settle ≈ 5-8 s and unthrottled stepped scrolling):
- per topic, mobile only, both sides, repeat 2: about 60-90 s;
- with a desktop guard: +40 s;
- the **whole landed set in one pass per target**: the runner merges every topic's probes into one
  page session and unions the segments, so 12 topics cost about 2-4 min, not 12×.

Headless is fine for Tier A (counts don't need a visible window). Headless rAF runs at a different
rate, which layout-animations noticed, so assertions must not assume 60 Hz.

**Lock.** Tier A starts Chrome, so it holds `chrome-measure`. It reports no timings, so I propose
the short lane (`--short --max-seconds 180` per topic). The whole-set guard (about 4 min) takes a
normal entry. The current rule says the short lane is "never for a measurement". See Q1.

## 3. Tier B: statistical gain checks

**What it asserts.** The gain the topic claimed is still there, in the phase where its mechanism
acts. The benchmark does **not** re-run the whole-page A/B. Each topic declares a
**micro-scenario**: its own scroll segment or idle spot. The mechanism's share of the measured work is
much larger there than on a full page (Chromium's rendering benchmarks also use many small stories:
*vendor doc*, Chromium rendering benchmarks). Examples:
- idle 6 s at the carousel for layout-animations;
- stepped or smooth scroll through commission for commission-forced-layout.

**Metrics**, in order of preference:
1. **Main-thread work in the scenario** from `Performance.getMetrics` deltas: `RecalcStyleDuration +
   LayoutDuration`, `ScriptDuration`, `TaskDuration` (*vendor doc*, Puppeteer `Metrics`).
   `Performance.enable` accepts `timeDomain: threadTicks` ("use thread running time", *vendor doc*,
   CDP pdl). Thread time is less sensitive to other processes competing for cores (*my inference*,
   untested). The 6x throttle is a busy-spin on the renderer main thread itself (render.md Q10,
   *vendor source*), so thread time should still grow with the throttle (*my inference*). Q3 asks the
   toolsmith to pick between `timeTicks` and `threadTicks` by A/A spread.
2. **Per-frame split** from an in-page afterFrame probe: a mark in a task posted from rAF, joined to
   the rAF-delta logger (render.md Q9 (b), *blog*). It gives the style + layout + paint time of each
   scenario frame. Use it as the metric where a topic's claim is "fewer slow frames" rather than
   "less total work".
3. The **frame buckets** verify already computes (frames over 20 ms, p95), restricted to the
   scenario. They are informational: bucket counts sit at a threshold, so they are noisier, and they
   are the metric most sensitive to host load (frames over 20 ms ≈ 66 at load1 < 6 vs 96-103 at load
   6-15 on the unchanged baseline: measurement-parallelism §2).
4. LoAF forced-layout ms: informational only (it misses sub-50 ms frames).

**Host gate (I-017), for every Tier B run.** Record for each run:
- load1 at start and end;
- **host CPU % from `os.cpus()` tick deltas** over the scenario. On macOS the load average counts
  memory stalls too: load 40 while CPU was 45 % (measurement-parallelism §1), so load alone
  misreports;
- the measured Chrome's own CPU (its pid family), free memory and the compressor rate.

Rules, from measurement-parallelism "Recommendation" 2:
- a run is **contaminated** when it starts at load1 > 10, or when host CPU minus the measured Chrome
  is over ~25 %;
- it is **warn** at load1 > 6;
- with `--max-load 6` the runner waits, still holding the lock, up to 60 s before each run.

Any contaminated run makes the whole comparison INCONCLUSIVE. Warn runs may still decide a
**same-session** ABBA verdict, because within one session load barely moves the runs (r = 0.13).
Calibrations (A/A floors) and authored budgets must come only from runs that are clean **and** under
the warn line. A verdict is never judged against a floor from a different load band.

**Statistics.**
- The unit is one **run** (one fresh page, one scenario pass). Frames inside a run are autocorrelated
  and must not be pooled as independent samples. Kalibera & Jones: repeat at the level where the
  variance is (*paper*).
- **ABBA order, n = 5 per side** (like `fix.mjs ab`). **Exact one-sided Mann-Whitney U** in the
  claimed direction, the same non-parametric family Pinpoint uses (*code*). What it means for n = 5 vs
  5 (*my inference*, exact enumeration over C(10,5) = 252 orderings):
  - "no overlap" (U = 0) has one-sided p = 1/252 = 0.004 (two-sided 0.008);
  - p ≤ 0.05 one-sided allows U ≤ 4 (p = 12/252 = 0.048).
- The current `fix.mjs ab` rule "ranges don't overlap over ≥ 3 runs" is much weaker at n = 3:
  one-sided p = 1/20 = 0.05, two-sided 0.10 (*my inference*, same enumeration).
- **Don't pair the runs** for the test. A Wilcoxon signed-rank test on 5 ABBA pairs can't go below
  two-sided p = 2/32 = 0.0625 (*my inference*). Pinpoint's pairwise mode uses Wilcoxon (*code*), but
  it only works with more pairs.
- **Effect size:** the Hodges-Lehmann shift (median of the 25 pairwise differences) with the Moses
  distribution-free CI. For 5 vs 5 that is the 3rd smallest to the 3rd largest difference, about 97 %
  coverage (*my inference*, from U ≤ 2 ↔ p = 4/252 one-sided).
- **No bootstrap at n = 5.** A percentile bootstrap from 5 values under-covers (*my inference*,
  standard small-sample result). MotionMark bootstraps over the many frame samples inside a ramp, not
  over 5 page runs (*vendor doc*, MotionMark "About").
- **Noise floor:** `bench.mjs calibrate <topic>` runs the same scenario as an A/A, 5 vs 5, on the
  current tools version and Chrome major. `minEffect` = the half-width of the A/A's Moses CI. This is
  stored in `bench-results.json` and redone when the tools SHA or the Chrome major changes.
- **Budget:** the gain holds if the shift is at least `max(minEffect, 0.5 × authored HL shift)`.
  Perfherder uses the same "significance **and** magnitude" idea: a t-test plus a percentage threshold
  (*vendor doc*, Firefox perf sheriffing). Lighthouse CI defaults to `aggregationMethod: optimistic`
  over 3 runs (*vendor doc*). That is lenient by design, so don't copy it for a regression guard.

**Verdicts** (three states, like Pinpoint's Same/Different/Unknown, *code*):
- `HOLDS`: one-sided p ≤ 0.05 in the claimed direction and HL shift ≥ budget.
- `REGRESSED`: the upper end of the Moses CI of the improvement is below the budget (confidently
  smaller than half the authored gain), or a significant shift in the wrong direction.
- `INCONCLUSIVE`: anything else. Also forced by any contaminated run (host gate above) and by a stale
  calibration (different `toolsSha`, Chrome major, or load band). INCONCLUSIVE is never a pass. The
  lead re-runs it on a quiet machine. Every verdict line prints the host gate, for example
  `HOLDS (load1 3.1-4.8, other CPU 9 %)` or `INCONCLUSIVE (contaminated: load1 12.4 at run 3)`.

**Runtime** (*my inference* from the ~5-min `fix.mjs ab --runs 5`):
- one run = load with `--latency 150` (~8 s) + settle (3.5 s) + a 10-20 s scenario, about 30 s;
  a single topic's gain check (10 runs) is about 5 min;
- the **wave suite** (one page per run, all K scenarios in a fixed order, top of page and quiescence
  between them) is about `8 + 15·K` s per run; K = 8 gives about 2.2 min per run, about 22 min for
  5 vs 5, in **one normal `chrome-measure` slot**.

Scenario order effects (for example a mounted morph panel) are the same on both sides and cancel in
the comparison. Serve args stay the `fix.mjs ab` defaults (`--vendors=local --https --latency 150`),
so the setting matches the calibration.

## 4. Per-topic contract

**File:** `fixes/<topic>/bench.json`. It is **data only**, no JavaScript. That choice (instead of a
`bench.mjs` with a `mechanism(page)` function) is deliberate:
- (a) a data file can't carry Fastwork code, so Hard rule 3 holds by construction;
- (b) every probe lives in `tools/lib`, where Hard rule 6 tests cover it;
- (c) a reviewer can read an expectation in one line.

When a topic needs a probe kind that doesn't exist, that is an incident for a toolsmith, not inline code.

**Allowed content** (like README excerpts): CSS selectors, class names, custom-property names,
media-query strings, animation names, event types, numbers and prose (`why`, `evidence`). Minified
function names and 1-based line references may appear **only in prose**, never as attribution keys.
**Not allowed:** JS or CSS source text, function bodies, keyframe blocks. `bench.mjs lint` rejects
code-like tokens (`=>`, `function`, `return`, `;` or newlines outside prose) and strings over 200
characters. It runs in `npm test` over every committed `bench.json`.

**Shape** (abridged; the full example is in §6.1):

```json
{
  "schema": 1, "topic": "<topic>", "status": "authored|superseded", "supersededBy": null,
  "evidence": "README 'Before / after': <the numbers this bench protects>",
  "segments": { "<name>": { "from": "<selector>", "to": "<selector>|end", "step": 150, "before": 1.0 } },
  "spots":    { "<name>": { "at": "<selector>", "wait": 1, "window": 5 } },
  "probes":   { "<id>": { "kind": "setProperty", "prop": "--x", "selector": "<optional receiver>" } },
  "mechanism": [ { "id": "...", "viewport": "mobile", "segment": "<name>", "probe": "<id>",
                   "baseline": ">= 20", "patched": "== 0", "why": "..." } ],
  "parity":    [ { "viewport": "mobile", "segment": "<name>", "classes": ["<selector>"],
                   "props": [["<selector>", "--x", 0.001]] } ],
  "gain": { "scenario": { "viewport": "mobile", "segment": "<name>" }, "metric": "styleLayoutMs",
            "direction": "lower", "device": "chrome|iphone", "status": "authored|pending-quiet-host" }
}
```

Expectation grammar: `== n`, `>= n`, `<= n`, `<= f * baseline`, `>= f * baseline`, `equal`. Each
patched expectation may refer to the baseline value **from the same session**.

**Results:** `fixes/<topic>/bench-results.json`, committed like `results.json`. It holds:
- the last mechanism run: per check, baseline and patched values per repeat, verdict;
- the authored gain: HL shift, CI, p, minEffect;
- the last gain run;
- `patch.sha256`, `toolsSha` (git SHA of `tools/bench.mjs` + `tools/lib/bench-*`), Chrome version,
  host load, baseline manifest hash.

**Which sides it compares:**

| mode | "baseline" side | "patched" side | assertions |
|---|---|---|---|
| `bench.mjs mech <t>` | `site-pretty` | overlay **rebuilt from the committed `patch.diff`** into `out/bench/overlays/<t>/` (`--live` uses the owner's `fixes/<t>/overlay/` instead) | both |
| `bench.mjs mech <t> --on <o>` | `<o>`'s overlay | `<o>` + `<t>` | both. If the baseline expectation fails on `<o>` alone, the result is `ALREADY-REMOVED-BY <o>`, not a failure |
| `bench.mjs gain <t> --on <o>` | `<o>` | `<o>` + `<t>` | the topic's gain on top of a wave: what a wave-2 topic claims |
| `bench.mjs guard --target <combined>` | `site-pretty` (one pass: proves every probe still discriminates) | the combined overlay (for example `all-wave1`, or `_landed` = `fix.mjs combine` of every landed topic) | patched expectations of every topic in the target; parity per topic |
| `bench.mjs reconfirm` | `site-pretty` | `_landed`, rebuilt from `main`'s committed `patch.diff`s in landing order | the whole suite: Tier A of every landed topic + Tier B of every scenario, one slot (§5a) |

Rebuilding from `patch.diff` ties the result to exactly the landed patch (its SHA-256 is recorded).
It never touches an owner's live overlay.

**What "passes on a later combined overlay" means for each tier:**
- **Tier A:** the patched expectations hold on the combined overlay, and the baseline expectations
  still hold on `site-pretty`.
- **Tier B:** the topic's scenario, measured combined vs **plain baseline**, still shows at least the
  budget. It does *not* compare the combined overlay with and without the topic (leave-one-out). That
  would cost one extra A/B per topic, and the regression question is "is the gain still in the
  product", not "is it still attributable to this patch". Interactions only add to the gain in the
  expected direction (FINDINGS: "expect the combined wave to beat the sum"). A combined result
  **below** budget is exactly the regression to catch.

This satisfies Definition of done item 8 ("must pass against the fix's own overlay and every later
combined overlay (`--on`)"):
- `mech <t>` and `gain <t>` (or `--on <wave>`) when the topic is done;
- `reconfirm` after every later landing.

**Superseded mechanisms.** A later topic may change an earlier mechanism on purpose: scroll-engine
folds `l` and `a` into measure/mutate, and hero-exit replaces `s`'s rect read with a scroll timeline.
Rules:
- Invariants should be phrased so they survive that (examples: "no `--future-shrink` writes on
  phones", "parity holds"). A phrasing like "function `l` doesn't appear in LoAF" would not survive.
- If a later topic must break an earlier invariant, its owner edits the earlier `bench.json` **in the
  same branch**: `status: superseded`, `supersededBy`, and a reason. `fix-reviewer` checks it.
  A guard failure is never silently waived.

## 5. Tooling needed (for a toolsmith, test-first)

- **`tools/bench.mjs`** with subcommands `lint [<t>]`, `mech <t> [--on o] [--viewport mobile|desktop|both]
  [--repeat 2] [--live]`, `gain <t> [--on o] [--runs 5] [--max-load 6]`, `calibrate <t>`,
  `guard --target <name> [--topics a,b] [--tier mech|gain|both]`, `reconfirm [--tier mech|both] [--runs 5]`.
- **Host gate:** `tools/lib/hostload.mjs` samples `os.cpus()` ticks, load1, free memory and the
  measured Chrome's pid-family CPU. This is I-017's guard: one shared implementation, so `verify.mjs`
  gets the same guard when I-017 lands. The same toolsmith should do both.
  - Exit 0 pass, 1 check failed / REGRESSED, 3 INCONCLUSIVE or FLAKY, 2 usage.
  - It takes `chrome-measure` itself: short lane for `mech <t>`, normal for `gain`, `calibrate`,
    `guard`. It never accepts `--no-lock`.
  - Chrome profile: `out/chrome-bench-profile`, DevTools port 0.
- **`tools/lib/bench-probes.mjs`**: page-side code as exported strings (installed with
  `Page.addScriptToEvaluateOnNewDocument`; wrappers keep `this`, arguments and return values), with an
  `uninstall`. Kept free of side effects so `node:vm` tests can run the exact page code, as
  `tools/lib/perf-page.mjs` already does.
- **`tools/lib/bench-scenario.mjs`**: stepped scroll with quiescence, spots, parity snapshot,
  fonts/images settle.
- **`tools/lib/bench-stats.mjs`**: exact MWU by enumeration or DP for n ≤ 12 with ties, Hodges-Lehmann,
  Moses CI, verdict function with the load guard.
- **`tools/lib/cdp.mjs`, additive only:**
  - `getMetrics(page)` returns `{name: value}`;
  - `enablePerformance(page, timeDomain)`;
  - `eventListeners(page, expr)` (`Runtime.evaluate` objectId → `DOMDebugger.getEventListeners`);
  - later, optionally, `trace(page, categories, fn)`.

  None of them is called on the `verify.mjs` path.
- **Server start:** `bench.mjs` needs `fix.mjs ab`'s baseline and overlay servers. Either extract
  `startServer` into `tools/lib/servers.mjs` (this touches the `fix.mjs ab` path, so it needs the
  comparability callout and a test that `ab` still spawns an identical serve argv), or spawn
  `serve.mjs` directly in `bench.mjs`. I'd extract, with that test.

**Tests the toolsmith must write:**
1. `tests/unit/bench-stats.test.mjs`:
   - MWU exact p for 5 vs 5 U = 0 (1/252 one-sided), U ≤ 4 (12/252), 3 vs 3 U = 0 (1/20);
   - ties;
   - HL shift and Moses CI on known vectors;
   - all three verdicts, including INCONCLUSIVE on a contaminated run (load1 > 10 or other CPU
     > 25 %), warn-band behaviour, and a stale calibration.
   - `hostload.mjs`: tick-delta CPU % from synthetic `os.cpus()` snapshots.
   - Refuses to author or calibrate from warn or contaminated runs.
2. `tests/unit/bench-spec.test.mjs`:
   - schema and expectation grammar;
   - the lint rejects code-like strings and accepts selectors and media queries;
   - **every committed `fixes/*/bench.json` passes the lint**. This is the only part of the
     benchmark suite in plain `npm test`.
3. `tests/unit/bench-probes.test.mjs` (node:vm with minimal fakes):
   - every wrapper counts and filters correctly and leaves return values and `this` unchanged;
   - `uninstall` restores the originals;
   - `readAfterWrite` resets per frame;
   - no-op `setProperty` detection.
4. `tests/e2e/bench-fake.test.mjs` (fake Chrome, temp lock dir):
   - short-lane vs normal-lane acquisition, and no `--no-lock`;
   - the overlay is rebuilt into `out/` and `fixes/<t>/overlay` is left untouched;
   - `--on` resolution; `bench-results.json` fields (patch SHA, tools SHA);
   - exit codes; FLAKY on repeat disagreement.
   - `reconfirm`:
     - builds `_landed` from the committed patches in `git log` order;
     - takes **one** lock hold for Tier A + Tier B (tools inside re-enter it, I-005);
     - a patch that no longer applies is reported as `CONFLICT <topic>`, never skipped.
5. `tests/chrome/bench.chrome.test.mjs` (opt-in, fixture baseline). Reuse the fixture topic from
   `fix-ab.chrome.test.mjs`, whose overlay caches `querySelector('.start-selling-top-nav')`:
   - a `bench.json` with `querySelector` baseline `>= 10` / patched `== 0` passes;
   - a deliberately wrong expectation fails;
   - parity on `body[data-y]` passes;
   - the stepped scroll terminates; under 60 s.
6. **Comparability guard:** `verify-fake`, `ab-fake`, `perf-page` and `fix-ab.chrome` stay green
   without edits. That shows `verify.mjs` / `fix.mjs ab` measure exactly as before.

**Measurement-code comparability.**
- Nothing on the `verify.mjs` path changes, so existing `results.json` numbers stay comparable (only
  the `servers.mjs` extraction touches `fix.mjs ab`; it is guarded by test 6 plus an argv-equality
  test).
- Tier A wrappers slow the page down. Tier A therefore never reports timings, and its wrappers are
  never installed in a Tier B or `verify.mjs` run.
- Tier B numbers are a **new series**. They compare only with bench runs of the same `toolsSha` and
  Chrome major (as with I-002's phase change). `gain` refuses to judge against an authored effect
  from a different `toolsSha` until the topic is re-calibrated.
- Tracing, if ever added, only in Tier A (its overhead would bias timings).

**Where it runs:**
- `npm test`: `bench lint` only.
- New opt-in script `npm run test:bench` = `bench.mjs reconfirm --tier mech`. I would not put it in
  `test:chrome`, which is fixture-based and ~2 min.
- The lead runs it **before** landing any branch that changes an overlay or `tools/`, on the
  candidate. After the landing, the lead runs the full `reconfirm` (§5a).

## 5a. Re-confirmation after every landing (one lock slot)

`node tools/bench.mjs reconfirm` (the lead, in the main checkout, which holds `site/`) does four things:

1. **Build the target.** It rebuilds `_landed` in `out/bench/overlays/_landed/`: `fix.mjs combine`
   of every topic with a committed `patch.diff` on `main`, in landing order (first-parent `git log`
   of `fixes/*/patch.diff`), plus stacked topics after their base. A patch that no longer applies
   fails the run as `CONFLICT <topic>`: two landed topics now disagree, which is a finding.
2. **Take one `chrome-measure` hold** (normal lane) for the whole run. It runs the next two steps
   inside it, in this order, without releasing. With I-005, tools started inside re-enter the hold
   instead of queueing behind it.
3. **Tier A for every landed topic.**
   - One merged page session per (side, viewport).
   - Baseline side = `site-pretty`, which proves every probe still discriminates.
   - Patched side = `_landed`, with every topic's patched expectations and parity checks.
   - Mobile always; desktop only for topics with a desktop check.
   - Headless, unthrottled, repeat 2.
   - About 4-5 min for 12 topics (*my inference*, §2).
4. **Tier B, all scenarios.**
   - One headed, 6x throttled page per run, running every topic's scenario in a fixed order (top of
     page and quiescence between scenarios).
   - ABBA, 5 runs per side, with the host gate per run and per scenario.
   - About 8 s + 15 s × K per run: K = 10 gives about 2.6 min per run, about 26 min in total
     (*my inference*).
   - When `toolsSha` or the Chrome major changed since the last calibration, it first runs the same
     loop as an A/A (baseline vs baseline, another ~26 min). It uses those floors, and says so.

**Output:**
- `out/bench/reconfirm/<main-sha>/report.json` (every value, host gate per run) and `report.md`.
- The lead appends one row to a committed log, `fixes/BENCH_LOG.md` (proposed): main SHA, per topic
  `A: pass|FAIL|FLAKY`, `B: HOLDS|REGRESSED|INCONCLUSIVE`, the load1 / other-CPU range, duration.
- Exit 1 on any Tier A failure or `REGRESSED`, exit 3 on INCONCLUSIVE or FLAKY only.

**Cost control:**
- If a landing touched no overlay file, no `tools/` measurement code, and no Chrome update happened
  (docs only), `reconfirm --tier mech` (~5 min) is enough.
- Several branches landed back to back get one reconfirm at the end, not one each.
- `--runs 4` cuts Tier B by a fifth (4 vs 4: the smallest one-sided p is 1/70 = 0.014, and p ≤ 0.05
  needs U ≤ 1, so it gets stricter).
- A 30-minute hold blocks the owners' A/B queue, so schedule the full run when the queue is empty
  (see Q12).

**On failure:**
- Tier A FAIL or Tier B REGRESSED: `git bisect` over the landings is cheap because each landing is
  one contiguous series (Hard rule 1). Run `bench.mjs mech <t> --on <prefix of _landed>` per
  landing, then open an incident against the topic whose landing broke it.
- INCONCLUSIVE: rerun on a quiet host. Never waive it.

## 6. Worked examples

Values marked *measured* come from the topic's committed README / `results.json`. Values marked
*predicted* are my estimates for the bench-author to replace with measured values at authoring.

### 6.1 phone-invisible-shrink (no rect reads or property writes for invisible effects on phones)

Mechanism (README "What changed"):
- on phones, where the CSS forces scale 1 and radius 0, `--future-shrink` is not written and its
  easing rAF tail doesn't run;
- the Svelte style string `--platform-shrink` is not rewritten;
- the profile `oe()`/`ce()` cache their `MediaQueryList`s;
- the side jobs are kept: `is-visible`, `is-pain-dark`, `is-future-shrinking`, `is-platform-shrinking`.

```json
{
  "schema": 1, "topic": "phone-invisible-shrink", "status": "authored",
  "evidence": "results.json mobile 6x n=5: fps 66.5 -> 71.6 (disjoint), forced 94 -> 31 ms; LoAF future l 122/114 ms (11 LoAFs) -> absent; iPhone frames >20 ms 60-64 -> 40-43",
  "segments": {
    "future":   { "from": ".start-selling-future",   "to": ".start-selling-platform", "step": 150, "before": 1.0 },
    "platform": { "from": ".start-selling-platform", "to": "end", "step": 150, "before": 1.0 },
    "profile":  { "from": ".start-selling-profile-sticky", "to": ".start-selling-future", "step": 150, "before": 1.0 }
  },
  "probes": {
    "futureWrites":   { "kind": "setProperty", "prop": "--future-shrink" },
    "platformWrites": { "kind": "inlineProp", "selector": ".start-selling-platform", "prop": "--platform-shrink" },
    "profileMql":     { "kind": "matchMedia", "query": "(min-width: 861px)" }
  },
  "mechanism": [
    { "id": "no-future-writes-phone", "viewport": "mobile", "segment": "future", "probe": "futureWrites",
      "baseline": ">= 20", "patched": "== 0", "why": "CSS 3384/3650 force scale 1 on phones (T1)" },
    { "id": "no-platform-writes-phone", "viewport": "mobile", "segment": "platform", "probe": "platformWrites",
      "baseline": ">= 5", "patched": "== 0", "why": "CSS 10990-11016 neutralise --platform-shrink on phones" },
    { "id": "profile-mql-cached", "viewport": "mobile", "segment": "profile", "probe": "profileMql",
      "baseline": ">= 10", "patched": "<= 2", "why": "T2: one MQL per mount instead of one per frame" },
    { "id": "desktop-still-animates", "viewport": "desktop", "segment": "future", "probe": "futureWrites",
      "baseline": ">= 20", "patched": ">= 0.5 * baseline", "why": "gate must not match a 1440 mouse viewport" }
  ],
  "parity": [
    { "viewport": "mobile",  "segment": "future",   "classes": [".start-selling-future", ".pain"] },
    { "viewport": "mobile",  "segment": "platform", "classes": [".start-selling-platform"] },
    { "viewport": "desktop", "segment": "future",   "classes": [".start-selling-future", ".pain"],
      "props": [[".start-selling-future", "--future-shrink", 0.001]] }
  ],
  "gain": { "scenario": { "viewport": "mobile", "segment": "future" }, "metric": "styleLayoutMs",
            "direction": "lower", "device": "chrome" }
}
```

- The query `(min-width: 861px)` is used only by `ce()` (JS 10783). `(prefers-reduced-motion:
  reduce)` is shared with 5 other call sites, so counting it would mix topics.
- `--future-shrink` is written with `setProperty` (JS 11317). `--platform-shrink` goes through a
  template style string (JS 12677), hence `inlineProp`.
- Expected values:
  - baseline: `futureWrites` ≥ 1 per step while the section is active, plus about 20 easing-tail
    writes per step. Over roughly 10 steps that is on the order of 100-200. *Predicted*: the 22 %/frame
    tail is in the README, but the count was never taken.
  - patched: 0 on mobile, about the baseline value on desktop.
- *Measured* evidence for the gain: LoAF top script future `l` 122 ms / 114 ms forced over 11 LoAFs
  → absent; forced 94 [46-116] → 31 [27-83] ms. The whole-page A/B is within noise on forced but
  disjoint on fps.
- Tier B: the stepped `future` segment at 6x, metric `RecalcStyleDuration + LayoutDuration`.
  Authored shift *predicted* to be clearly beyond the A/A floor, because the scenario excludes the rest
  of the page.

### 6.2 layout-animations (no layout from the avatar carousel, the accent or the fee bar at idle)

Mechanism (README "What changed"):
- the carousel's `avatars-exit` animates `translate` / `clip-path` / `transform` / `opacity` instead
  of `width`, `flex-basis`, `margin-right`, `border-width`;
- the accent has no `width` transition (WAAPI FLIP on its siblings instead);
- the fee bar writes `--fee-progress` instead of `width`;
- off-screen title sweeps are paused.

| check | probe | spot / segment | baseline expect | patched expect | evidence |
|---|---|---|---|---|---|
| carousel animates no layout properties | `animations`, selector `.start-selling-avatars.is-carousel img`, output = set of animated properties | spot `people` (idle 4 s, ≥ 3 swaps) | contains `width` | contains none of `width, flex-basis, margin-*, border-*-width, height, padding-*, top, left` | CSS 2888 keyframes (*measured*: README "Why it lags") |
| accent has no width transition | `animations` (CSS transitions) on the hero accent element | spot `top` (idle 4 s, ≥ 1 accent cycle) | contains `width` | not `width` | README step 2 |
| idle layouts at the hero | `perfMetrics` `LayoutCount` | spot `top`, 5 s | ≥ 100 | `<= 0.25 * baseline` | *measured* at 6x: 231 / 330 → 13 / 16 |
| idle layouts at the carousel | `perfMetrics` `LayoutCount` | spot `people`, 5 s | ≥ 100 | `<= 0.25 * baseline` | *measured* at 6x: 248 / 279 → 16 / 13 |
| no off-screen sweep runs | `animations`, name matches `sweep`, state `running` and target outside the viewport | spot `fee` (the `.fee-progress` bar) | ≥ 2 | `== 0` | *measured*: running sweeps 4 → 0 |
| fee bar writes no width | `styleWrite` `width` on `.fee-progress > span` + `setProperty` `--fee-progress` | segment through commission (count-up runs once) | width ≥ 10 | width `== 0`, `--fee-progress` ≥ 10 | README step 3 (*predicted* counts) |
| frozen-frame visual equivalence | `frozenFrame` on the carousel at 60/110/180 ms and on 7 fee values | spots | n/a | diff ≤ 0.1 % (carousel, fee), ≤ 0.5 % (h1 accent: anti-aliasing) | *measured*: 0 / 0 / 0 %, 0 %, 0.09-0.35 % |

- The ratio assertions (not absolute counts) work unthrottled: the layout count scales with the
  frame rate (headless rAF ≈ 120/s per the README), but the ratio doesn't.
- The P11 phase shift (the screenshot diff rises to 0.56 %) doesn't affect any of these checks.
- Tier B: idle 6 s at `people`, `LayoutDuration` + `LayoutCount`. *Measured* at 6x: layout ms
  150 / 174 → 11 / 7. This gain is large enough to reach `HOLDS` even at moderate load (*my
  inference*). The verify idle phase (I-002) sits only at the top of the page, which is why the bench
  needs its own spot.

### 6.3 commission-forced-layout (no forced layout inside the callback)

Mechanism (README "What changed"):
- `j`'s `Range.getClientRects()` (JS 3098) no longer runs every frame after the `--commission-*`
  writes (JS 3119-3120);
- the three `matchMedia` calls in `A()` (JS 3087-3089) are cached;
- on compact breakpoints the writes and the easing tail are skipped;
- desktop writes only on change (T3);
- the rects are still read, because `entering` / `shrinking` feed the nav hit-test.

| check | probe | viewport / segment | baseline expect | patched expect | evidence |
|---|---|---|---|---|---|
| no Range reads per frame | `layoutRead` kind `Range.getClientRects`, subtree `section.commission` | mobile / commission | ≥ 10 | `<= 2` (first run and one compact flip) | *measured* LoAF: `a` 20 ms / 18 ms forced in 3/5 runs → 0/5 |
| no layout read after a style write in the commission subtree | `readAfterWrite`, reader subtree `section.commission` | mobile / commission | ≥ 10 | `== 0` | the README's core claim; *predicted* counts |
| no `--commission-*` writes on phones | `setProperty` `--commission-shrink`, `--commission-enter-shrink` | mobile / commission | ≥ 20 | `== 0` | README step 3 |
| queries cached | `matchMedia` `(max-width: 1000px)` | mobile / commission | ≥ 10 | `<= 1` | README step 1 |
| desktop writes only on change | `setProperty` no-op count on the same props | desktop / commission | ≥ 5 (converged frames) | `== 0` | README step 4 (T3). A same-value `setProperty` is already a style no-op in Blink (render.md recommendation 4, *vendor source*), so this checks the mechanism only. No Tier B gain is expected from it |
| desktop still eases | `setProperty` count, same props | desktop / commission | ≥ 20 | `>= 0.5 * baseline` | desktop parity claim |
| parity | classes `entering`, `shrinking` on `section.commission`, `title-wrapped` on its `h2`; desktop `--commission-*` values ± 0.001 | both | equal | equal | nav hit-test coupling (FINDINGS "Couplings") |

- Tier B: stepped or smooth scroll through commission at 6x, `RecalcStyleDuration + LayoutDuration`.
  *Measured* whole-page context: frames over 20 ms 96 [89-99] → 71 [63-83] (disjoint); `iE` forced
  147 → 64 ms (LoAF sums over 5 runs).
- For the other cluster-B option, nav-hit-test, the analogous checks are:
  - `styleWrite` `pointerEvents` on `.start-selling-top-nav`: 2 per frame → 0 (JS 12960-12962);
  - `layoutRead` `elementFromPoint`: 1 per frame → 0;
  - parity of `is-on-dark` at every step.

### 6.4 First probe for every other topic (for the bench-authors)

| topic | first mechanism check | source of the evidence |
|---|---|---|
| pain-offscreen-notes | `querySelector` `.commission-card` during full scroll: 333 → `== 0`; `layoutRead` on `.commission-card` 579 → ≤ 0.5 × baseline | README probe (*measured*) |
| countdown-idle-raf | `styleWrite`/`setProperty` on countdown digits per second at idle: ~60/s → ≤ 2/s; `raf` requests while idle | README "Why it lags" (51 repaints/s on iPhone) |
| morph-scrolljack-passive | `listeners` on `window`: non-passive `touchmove`/`wheel` two screens above the end: present → absent; at the end with the morph active: present → present | README "What changed" |
| morph-panel-lazy-mount | MutationObserver node count added under the morph panel inside scroll tasks: large → 0 (mounted at idle before the zone) | TOPICS row 13 |
| hero-exit-scroll-timeline | `setProperty` `--exit-opacity` during the hero segment: ≥ 20 → `== 0` where scroll timelines are supported; parity of the computed opacity of the hero copy at 3 steps ± 0.01 | FINDINGS T12 (*measured* .901/.501/.03) |
| scroll-engine | `raf` requests per scroll step: > 1 → `== 1`; parity on 39 steps | README parity smoke (*measured* 0 diffs) |
| large-area-blur | Tier A only: the future-card reveal transition duration is ≤ 0.9 s (`animations`); Tier B `device: iphone` (P5, Chrome can't see raster cost) | FINDINGS T10 |

---

## 7. New agent role

`bench-author`, one agent per topic that was **done before the runner existed**: landed on `main`,
or accepted by `fix-reviewer`. From the day `tools/bench.mjs` lands, new topics ship `bench.json`
themselves (Definition of done item 8, fix-owner). The bench-author then remains the backfill role,
and a second opinion when a reviewer finds a vacuous check. It is a worktree subagent, runs Tier A in
the short lane and Tier B (calibrate + gain) in one normal slot, and writes only `bench.json`,
`bench-results.json` and a `## Benchmark` section in the topic README. Full draft:
`research/architecture/bench-author.draft.md`. The lead copies it into
`.claude/agents/bench-author.md` once `tools/bench.mjs` has landed.

The lead also needs to add two lines to `fix-owner.md` / `fixes/_template/README.md`: "write
`fixes/<t>/bench.json`, run `bench.mjs mech <t>` and `bench.mjs gain <t>`, commit
`bench-results.json`".

---

## 8. Risks and open questions for the lead

| # | question / risk | recommendation |
|---|---|---|
| Q1 | The short lane is "never for a measurement". Tier A runs Chrome but reports only counts. | Allow `bench.mjs mech <t>` in the short lane (≤ 180 s): it needs no quiet host. Keep `guard`, `gain` and `calibrate` in the normal lane. Amend CLAUDE.md "Shared devices". |
| Q2 | Today only owners and the integrator measure. `bench-author` would be a new measuring role. | Yes: one Tier A short job per iteration, one Tier B normal entry per topic (calibrate + gain in one `lock.mjs run`, allowed since I-005). Update `AGENT_ROLES.md`. |
| Q3 | Tier B primary metric: `threadTicks` vs `timeTicks` durations vs the afterFrame per-frame split vs frame buckets. The throttle's interaction with thread time is unverified (it is a busy-spin on the main thread, render.md Q10). | Toolsmith runs 2 A/As on 2 scenarios (commission scroll, carousel idle), clean and under load1 6, and picks the metric with the smallest relative spread. Frame buckets stay informational: they are the most load-sensitive metric. |
| Q4 | `npm run test:chrome` or a separate script? | `bench lint` in `npm test`. A new `npm run test:bench` (= `reconfirm --tier mech`, ~5 min) that the lead runs before landing overlay or tool changes. Keep `test:chrome` fixture-only. |
| Q5 | Superseding mechanisms (scroll-engine, hero-exit) could look like regressions. | Invariants are phrased on observable behaviour; superseding requires `status: superseded` + reason in the same branch, checked by `fix-reviewer`. |
| Q6 | The in-page `readAfterWrite` is a proxy for forced layout: it can't see writes Chrome makes internally or layouts that were already clean. | Accept it for Tier A. The toolsmith validates it once against a trace of the commission segment (count `Layout` events nested in script). Trace-based counting is a later, optional probe (it adds overhead, so Tier A only). |
| Q7 | The user re-mirrors (a new Fastwork deploy): selectors change, and every bench fails at once. | Record the baseline manifest hash. On a mismatch, report `BASELINE-CHANGED` for all benches instead of FAIL (the patches would not apply anyway). |
| Q8 | iPhone-only gains (large-area-blur, input latency for scrolljack) aren't automatable in Chrome. | `gain.device: "iphone"` is recorded but skipped by the suite. Tier A still guards the mechanism. Revisit when `iphone.mjs` can run a scenario unattended under its lease. |
| Q9 | Flaky counters (IO timing, font swap, lazy images, the 3 s intervals). | Settle fonts and images before scenarios, use quiescence-based steps, use windows ≥ 2 interval ticks, `--repeat 2` with FLAKY on disagreement. Never retry until green. |
| Q10 | Cost: 12+ authors. | Start with the three worked examples (phone-invisible-shrink, layout-animations, commission-forced-layout) once the runner lands. Measure the authoring cost and false failures, then scale. |
| Q12 | A full `reconfirm` holds `chrome-measure` for 25-30 min (55 when it recalibrates) after every landing, which blocks owners' A/Bs. | Run `reconfirm --tier mech` (~5 min) right after each landing. Run the full suite once per batch of landings, when the queue is empty, or at the end of a wave. Keep "after every landing" for Tier A. If the user insists on the full suite after every landing, batch the landings. |
| Q13 | The host gate duplicates I-017's guard for `verify.mjs`. | One `tools/lib/hostload.mjs`, built by the I-017 toolsmith first; `bench.mjs` imports it. Its thresholds (contaminated above load1 10 or other CPU 25 %, warn above 6) come from measurement-parallelism and should be revisited after a clean A/A. |
| Q14 | Authored budgets are only as good as the host when they were authored. Most existing `results.json` were taken at load 6-20. | Don't copy budgets from `results.json`. The bench-author calibrates (A/A) and authors (A/B) on a clean host (load1 ≤ 6, other CPU < 25 %), or leaves the topic `status: authored-pending-quiet-host` with Tier A only. |
| Q11 | Doc inconsistency found while reading: CLAUDE.md says the I-002 idle phase comes "after the scroll and morph phases", but `verify.mjs` records it **before** scrolling, at the top (`tools/verify.mjs` lines 17-19, 44, 138). | Fix the CLAUDE.md sentence. It matters for anyone reading `idle*` metrics (the idle window sees the top of the page only, which is why §6.2 needs its own spots). |

---

## Sources

- W3C Long Animation Frames: the 50 ms frame threshold, the 5 ms script threshold,
  `forcedStyleAndLayoutDuration` "implementation-defined". https://w3c.github.io/long-animation-frames/ (*spec*)
- Chrome for Developers, Long Animation Frames API: script attribution limits, lab and CI use, not
  in Safari. https://developer.chrome.com/docs/web-platform/long-animation-frames (*vendor doc*)
- CDP Performance domain (`enable` `timeDomain`: `timeTicks` | `threadTicks`; `getMetrics`).
  https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Performance.pdl (*vendor doc*)
- Metric names and meanings (`LayoutCount`, `RecalcStyleCount`, `LayoutDuration`,
  `RecalcStyleDuration`, `ScriptDuration`, `TaskDuration`). https://pptr.dev/api/puppeteer.metrics (*vendor doc*)
- CDP Emulation (`setVirtualTimePolicy` experimental; `setCPUThrottlingRate`).
  https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl (*vendor doc*).
  Deterministic BeginFrame control needs headless-shell: https://chromedevtools.github.io/devtools-protocol/tot/HeadlessExperimental/ (*vendor doc*).
  Not recommended here: a different binary, and counters don't need it.
- Pinpoint `compare`: KS + Mann-Whitney, a Same/Different/Unknown band, Wilcoxon for pairwise,
  functional vs performance comparisons. https://pkg.go.dev/go.skia.org/infra/pinpoint/go/compare (*code*)
- crossbench (probes as JS snippets, Perfetto traces). https://chromium.googlesource.com/crossbench/ (*vendor doc*)
- Chromium rendering benchmarks (frame_times, mostly_smooth; small stories).
  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/speed/benchmark/harnesses/rendering.md and
  https://chromium.googlesource.com/website/+/HEAD/site/developers/design-documents/rendering-benchmarks/index.md (*vendor doc*)
- web.dev, Towards an animation smoothness metric. https://web.dev/articles/smoothness (*vendor doc*)
- MotionMark about page (ramp controller, piecewise regression, bootstrap CI).
  https://browserbench.org/MotionMark1.3.1/about.html; https://webkit.org/blog/14908/motionmark-1-3/ (*vendor doc*)
- Lighthouse CI configuration (assert levels, `aggregationMethod` default `optimistic`,
  `numberOfRuns` 3, budgets). https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md (*vendor doc*)
- Firefox performance sheriffing (t-test + magnitude thresholds, e.g. 2 %).
  https://firefox-source-docs.mozilla.org/testing/perfdocs/perf-sheriffing.html (*vendor doc*)
- Chrome DevTools forced reflow insight. https://developer.chrome.com/blog/new-in-devtools-134 (*vendor doc*)
- Kalibera & Jones, Rigorous Benchmarking in Reasonable Time (ISMM 2013).
  https://kar.kent.ac.uk/33611/45/p63-kaliber.pdf (*paper*)
- In-repo research:
  - `research/measurement-parallelism/README.md`: the load step at about 6, macOS load ≠ CPU,
    tick-based host CPU, the contamination thresholds, N = 1 slot. Incident I-017.
  - `research/architecture/render.md`: recommendation 1, Q9 (getMetrics deltas, afterFrame probe,
    trace events), Q10 (the throttle is a main-thread busy-spin), recommendation 4 (same-value
    `setProperty` is a style no-op in Blink).
  - The afterFrame technique: https://nolanlawson.com/2018/09/25/accurately-measuring-layout-on-the-web/ (*blog*).
- Exact MWU / Wilcoxon p-values, the Moses CI and the "no bootstrap at n=5" point are my own
  enumeration and standard small-sample statistics (*my inference*). A toolsmith unit test pins them.
