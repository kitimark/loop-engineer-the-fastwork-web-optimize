# Lead retrospective: the first 24 hours of loop engineering (2026-09-30 19:08Z to 2026-10-01 19:10Z)

Written by the lead at the user's request (2026-10-01 19:0xZ):

> "this is experiment that i'd like to try to do loop engineering for understand you can manage and resolve the
> issue or not. this took around 24h. you can real improve about performance. and the goal is far from it. i'd
> like to ask you investigate, distinguish and reasoning. what your finding in this experiment. then document in
> this project for catch up later."

How to read it:

- **DATA** means counted from git, the incident store, `fixes/PROGRESS.json`, `fixes/PREDICTIONS.md` or the phone
  logs. Each one names its source.
- **JUDGEMENT** is my reasoning from that data.
- **HYPOTHESIS** is untested.
- Phone numbers carry the tags they have in their source documents (OBSERVED unless stated).

## 1. Outcome against the goal

The goal is that finger scrolling on the iPhone 15 Pro Max feels smooth: no frame over 50 ms and a steady 60 fps.

| | baseline | best measured | source |
|---|---|---|---|
| scripted scroll fps (phone) | 52.8 [44.1-53.4] | 57.1 [56.8-57.1] (wave-1 base aw1-10c) | DATA, `fixes/iphone-wave2/README.md` §1, OBSERVED |
| frames > 50 ms per scripted scroll (phone) | 5 [5-13] | 3 [2-3] (aw1-10c); 0-1 with F3 arm-scope (P-022) | DATA, §1 and §4g, OBSERVED |
| worst frame (phone) | 112-146 ms at y≈1970 | the y≈1960 frame is gone with F3 (no frame > 34 ms there in 4/4 runs) | DATA, P-022, OBSERVED |
| end-panel motion, frames > 50 ms per run (phone, M driver) | 1-27 | 0 (cdwc, P-029; threshold-sensitive) | DATA, OBSERVED |
| Chrome p95 frame, A vs B | 25.1 ms | 17.4 ms | DATA, iphone-runner B build check |
| the user's finger | | "B quite smoother" (C-013, hero and end of page); "same" for wave 1 alone and for cdwc alone | DATA, console C-013, PROGRESS felt |

**JUDGEMENT.**

- The improvement is real and repeatable on the phone, and the user can feel the stacked build.
- The goal is **not met**:
  - no build has been shown to reach 0 frames > 50 ms under a finger;
  - every robot-finger (G) run so far is invalid (I-042, F-085);
  - several known slow frames remain:
    - hero exit, 51-55 ms at y≈50;
    - #people entry, ~50 ms at y≈700;
    - the scene flip at y≈2615 (31-32 ms style+layout plus ~16 ms composite);
    - the avatar rotator's per-tick layout;
    - the end-of-page morph start.
- The goal is far, as the user says. Wave 1 plus F3 removed the biggest single frames (y≈1970 and the commission
  cluster). What is left is many 30-55 ms frames spread over the page, each needing its own fix.

## 2. Where the 24 hours went

DATA: `git log` on main has 587 commits. Each commit is classified by the files it touches:

| class | commits | share | what |
|---|---|---|---|
| process | 221 | 38 % | PROGRESS, PREDICTIONS, handover, LEAD/AGENT_ROLES/INCIDENTS/FINDINGS docs, CLAUDE.md, agent definitions |
| research | 129 | 22 % | `research/` studies, architecture, design-engineering, claims audit |
| tooling | 119 | 20 % | `tools/`, `tests/`, hooks |
| fix deliverables | 114 | 19 % | `fixes/<topic>/` README, patch.diff, results.json |

DATA, size of what exists now:

- tools: 14.5k lines; tests: 17.6k lines, with 804 tests in `npm test`;
- `CLAUDE.md`: 527 lines;
- `research/` docs: 17.3k lines; `fixes/` docs: 6.6k lines;
- incidents: 43 (I-001..I-043), of which about 38 are tool or environment problems and none are fix bugs;
- findings board: 96 posts;
- PREDICTIONS ledger: 40 entries;
- peer directory: about 41 named agents across the run;
- user console steps: 14 (C-001..C-014), plus earlier finger tests relayed by chat.

**JUDGEMENT.**

- Fewer than one commit in five is a fix.
- Most of the effort built the machinery to measure safely in parallel and coordinate many agents: locks, queues,
  protocol v2, cards, the console, progress pages.
- The machinery was needed for trustworthy numbers, but it grew faster than the fixes it serves.

## 3. Distinguishing the causes of slow progress

Each candidate cause, with its evidence and my verdict.

### C1. One phone and one Chrome slot serialize everything (main cause)

- **Evidence (DATA):**
  - All timing goes through one `chrome-measure` slot and one `iphone` lease.
  - Phone blocks take 12-35 min plus 10 min cooling.
  - On the phone, 15+ blocks ran in §1-§4o of `iphone-wave2`.
  - Queue waits of 25+ min are recorded (I-007, I-020; ts-headless measured 583 s and ~25 min waits today).
- **JUDGEMENT:**
  - Adding agents did not add measurement throughput. It added queue length.
  - It also added host load:
    - I-016: load 58 on 8 cores;
    - today load1 35-75, and a test:chrome run marked CONTAMINATED by other CPU at 25.9 %.
  - That load contaminated or delayed timing runs (I-017, I-023, I-031).
  - The system's throughput was set by the device, not by the number of agents. I scaled the wrong resource.

### C2. The inner loop was the slowest instrument (main cause)

- **Evidence (DATA):**
  - Every verdict was a frame-gap A/B: Chrome 6x for gain, the phone for confirmation.
  - Work counts existed only as one-off mechanism checks, not as a standard gate:
    - bench mech;
    - layer and paint-rect probes (I-032, landed today);
    - invalidation tracking in single studies.
  - The user pointed this out today: "does the restyle drop from ~345 elements to ~30?". de-counts-chrome and
    de-counts-sim were spawned at 19:0xZ to research it.
- **JUDGEMENT:**
  - A good loop has a fast, deterministic inner loop and a slow, authoritative outer loop. We ran almost
    everything through the outer loop.
  - Counts such as restyled elements, layout objects, invalidations, layers and paints take seconds, need no quiet
    host, and can run in parallel (headless, per ts-headless).
  - They would have screened most candidates before any phone time.
  - This is the largest process lesson.
  - **HYPOTHESIS:** it is the change with the biggest speed-up for the next 24 h. It holds only if counts
    predict the phone direction; de-counts-* are checking that against our existing pairs.

### C3. Tool faults with real hardware cost hours before their root cause was found

- **Evidence (DATA):** iPhone/inspector incidents:
  - I-037: the wrong web view;
  - I-038 and I-039: the inspector hangs;
  - I-040: USB drops;
  - I-042: WDA strokes collapse to a 50 ms flick, so all G runs are void;
  - I-043: a leaked socket.
- **Evidence (today):**
  - From 17:16Z to 17:42Z the user was asked four times to reload, open a new tab, force-quit Safari and retype
    the URL (C-009..C-012).
  - The root cause came from the user at 18:3xZ: their Mac Safari Web Inspector was attached to the phone.
  - The mechanism is CONFIRMED in WebKit source: RemoteInspectorCocoa.mm `receivedSetupMessage` ignores a second
    client for a target.
  - That this caused our wedges stays OBSERVED.
  - Our own second connection (`--morph-log`) is the other cause: CONFIRMED in ios_webkit_debug_proxy.c, where a
    newer client claims the page.
- **JUDGEMENT:**
  - I treated the symptom ("Safari stuck, please reload") several times instead of asking what else was connected,
    or reading the inspector source after the first wedge.
  - Root-causing at source level after the first repeat would have saved the user's time and about an hour of
    blocked phone work.

### C4. Chrome and the phone disagree on the causes, not only on size

- **Evidence (DATA):**
  - CPU 6x reproduces the phone's jank counts (calibration), but not its causes.
  - Safari's "Recalculate Styles" includes nested container-query layout (U3).
  - P-028: lc-cq3 moved the layout out of the style record but not out of the frame.
  - Composite costs are WebKit-only.
  - The rotator's whole-view Layout is a phone signal; Chrome's view-rooted Layouts carry none.
- **JUDGEMENT:**
  - Chrome is good at finding triggers. The user put it this way: "layout and rendering (safari) and call tree
    (chrome) is the same".
  - Chrome is not good at pricing them.
  - Some Chrome wins could not show on the phone, and some phone costs could not show in Chrome.
  - WebKit-true counts from the Simulator, if de-counts-sim confirms them, would close part of this gap without
    the phone.

### C5. Single fixes stay below what the finger can feel

- **Evidence (DATA):**
  - The user felt "same" for wave 1 alone (5 → 3 frames > 50 ms) and for cdwc alone (end-panel 1-27 → 0), and
    "better" only for the stacked B.
  - nonpassive-touch was dropped as "same".
- **JUDGEMENT:**
  - Perception tests cost the most (the user's time) and resolve least for single fixes.
  - They are worth it only for stacked candidates.
  - We spent finger tests on single fixes too early.

### C6. Patching a frozen, minified third-party bundle limits the size of each fix

- **Evidence (DATA):**
  - Every fix is an overlay patch on prettified bundles, with conflict clusters (`fixes/TOPICS.md`).
  - B needed a hand-resolved line.
  - The scroll-jacking engine, the morph and the scene manager are shared by many topics: scroll-engine,
    nav-morph-all, layout-containment, scene-scope.
- **JUDGEMENT:** most remaining frames trace back to how the page's own engine drives style:
  - attribute flips on large subtrees;
  - inherited custom properties;
  - the `:where(*)` pause rule;
  - JS-driven scroll effects.

  Local patches remove them one at a time.
- **HYPOTHESIS (UNRESOLVED):** a redesign of the scroll engine and scene manager could remove several remaining
  frames at once. Its decisive check would be a design spike measured with counts first. Examples of what to
  try:
  - native CSS scroll-driven animations;
  - per-element animation control instead of section-wide attribute flips;
  - no inherited custom properties on large ancestors.

  No one has tested this.

### C7. Process overhead compounds

- **Evidence (DATA):**
  - CLAUDE.md is 527 lines, and every agent loads it.
  - 221 process commits.
  - Six mgmt-ops generations.
  - Several lead context compactions. After one, the lead stopped passing agent names, so peers could not reach
    each other (memory `agent-spawn-names`).
  - After another, a user console answer (C-009) went unnoticed for ~4 min (memory `console-step-wait-yourself`).
- **JUDGEMENT:**
  - Rules were added per incident and rarely removed.
  - Each new agent pays the full reading cost, and a long handover becomes the bottleneck after every
    compaction.
  - Rigor caught real errors:
    - every G run void (I-042);
    - simulator-judge dropped;
    - headless rAF at 60 Hz (F-091);
    - platform claims corrected by the claims audit.
  - But the overhead is now a tax on every task.

### C8. The lead accepted side work without stating its cost against the goal

- **Evidence (DATA):** in the last 2 h alone, the lead started or approved:
  - the console menu and notifications;
  - the progress page;
  - the shared lock lane;
  - headless Chrome;
  - the status board;
  - console threads;
  - Simulator rerouting.
  - All of them are useful, and all were user requests.
  - Each is a toolsmith plus review, and each runs `npm test` on the shared host. Today's load1 of 35-75 came
    largely from these suites.
- **JUDGEMENT:**
  - I said yes each time without telling the user what it would delay.
  - A lead's job includes saying: "this costs about N agent-hours and contends with the phone queue; do it now
    or after the next fix lands?"

## 4. What worked (keep)

- **The frozen baseline snapshot plus overlays:** every number names its build, and nothing drifts.
- **The pre-registered PREDICTIONS ledger and protocol v2 cards:** they stopped wishful reading. Examples:
  P-028 lc-cq3 dropped; P-032 void runs not counted.
- **The claims audit (OBSERVED/CONFIRMED):** it found wrong platform beliefs before they became decisions.
- **Shared stores in the git dir (locks, incidents, findings, console):** agents in different worktrees
  coordinate without the lead relaying.
- **The user console:** the user's steps in one place. Arming my own wait on each step fixed the missed answers.
- **Delegated mode with an ops hub:** the lead stopped being the relay for every peer message.
- **Tests on tooling (804):** tool bugs got caught before they corrupted A/B numbers. I-008, I-023 and I-024
  are examples.

## 5. Changes for the next loop (recommendations)

1. **Two-speed loop.**
   - Inner: deterministic work counts, Chrome headless in parallel plus WebKit counts from the Simulator,
     validated against the phone pairs we already have.
   - Outer: one phone block only for candidates that pass the counts.
   - Finger tests only for stacked builds.
   - Owner: de-counts-chrome + de-counts-sim (research), then a toolsmith.
2. **Size the team to the devices.**
   - At most 2 agents that need timing measurements at once.
   - Tool builds and full `npm test` runs batched into windows outside phone blocks.
   - Track load1 on the status board.
3. **Root-cause hardware faults at source after the first repeat,** and ask the user about their setup first
   (other inspectors, other apps on the phone, Low Power Mode).
4. **Fix budget.** Aim for at least 50 % of agent-hours on fix topics. Show the split on the status board, and
   state the cost of every side request to the user before starting it.
5. **Design spike on the page's engine (C6).** One researcher, counts only, to test whether a structural change
   removes several remaining frames at once.
6. **Shrink CLAUDE.md** to the hard rules plus pointers, with detail in linked docs. Review rules for removal
   when their incident is closed.
7. **Keep the next goal check honest.** Run a full-scroll phone block of B against the baseline (frames > 50 /
   > 34, fps) once scene-scope lands, and record it in §1 of this file's successor.

## 6. State at the time of writing (19:1xZ)

- **Style-recalc work (user priority 1):**
  - the diagnosis doc landed (30eaa11);
  - fix-scene-scope's Chrome count check is next on chrome-measure;
  - iphone-runner's A/B Timeline rerun (Mac inspector closed, 18:55-19:01Z, sentinels pass) gives these results,
    all OBSERVED:
    - B removes A's 28-30 ms forced recalc at y≈1840;
    - people-phase style time falls ~120 → ~60 ms, and mid-page ~335 → ~215 ms;
    - **but** B's scene-flip record at y≈2615 is *larger* than A's: 29-32 vs 17-19 ms, of which 25-27 ms is
      nested Layout;
    - hero idle style is +~90 ms in B.
  - So the best build also moved some cost to new places. This is one more reason for C2: a count gate would
    flag a grown subtree before the phone does.
- **Phone fixes:** ts-gesture has the I-042 compile fix (≥40 ms move segments) and is waiting for its phone
  slot. ts-iphone-run has the I-038 fix (hint plus reconnect).
- **Tooling in flight:** ts-lock-share (shared lane), ts-headless (functional checks), ts-status-board,
  ts-console-threads.
- **Research:** de-counts-chrome and de-counts-sim (the two-speed loop, item 1).
