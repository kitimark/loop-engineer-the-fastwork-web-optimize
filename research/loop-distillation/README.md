# How the loop was built: an AI loop engineering distillation

2026-10-12. Written by the lead's team for console thread T-277. This is a personal, educational scroll-performance
study of the public homepage fastwork.com, done on a frozen local copy. It is not affiliated with Fastwork.

The user's question, paraphrased: the user never said how to build the loop, and asked how the lead built it and what
the lead thinks of it.

This document gives the principles and the judgment. It does not repeat the two articles that already tell the story
and open up the machinery. For detail, read them:

- `research/team-article/artifacts/building-an-ai-loop-from-scratch.html` (Part 1): the story, the hints, the 19 best
  builds, the cost.
- `research/team-article/artifacts/wiring-the-loop.html` (Part 3): every lock, card, console tab and guard, with the
  incident behind it.

How to read the numbers:

- **FACT** is counted from the repo or the local stores on 2026-10-12, and names its source.
- **ESTIMATE** is a derived figure. Its method is given.
- **INFERENCE** is our reading of the data.
- **Article figure** is quoted from Part 1 or Part 3 and was not recounted for this document.
- Day boundaries in the timeline use the Mac's local time (+07), because commit dates are local. The study began on
  30 Sep at 19:08Z, which was already 1 Oct locally. Clock times quoted from threads are UTC and are marked Z.
- Phone and Chrome results are OBSERVED in our setup, as in every other write-up of this study.

---

## 1. Summary

**What the loop is.** One lead Claude Code session in the main checkout, plus a few hundred short-lived worker agents,
each in its own git worktree, finding and fixing scroll stutter in one frozen copy of a web page. They measured in a
slowed-down Chrome, in the iOS Simulator and on one real iPhone, which was the judge. One person, the user, set the
goal, steered with hints and decided anything visible, through a local console, without reading agent transcripts.
Around the agents sit shared state that every worktree sees at once, a measurement protocol that fixes the reading
before the data exists, and an enforcement layer that stops the mistakes that matter. Nothing was designed up front.
Each piece answers a failure that happened in front of the user.

**How it was built, in eight points:**

- **It started from one line and a plug.** The goal was "fix animation until the website renders SOOOOO ULTRA
  SMOOTH". The first night produced a mirror, overlays, worktrees, one lock and a test suite.
- **Most pieces were added in six days.** 2,185 of 2,483 commits landed between 1 and 6 Oct (local time). After that
  the loop was mostly used, not built.
- **Every piece has a trigger on record.** There were 266 incidents, 277 user threads and 38 memory notes. The user's
  complaints became rules, and the rules that kept being broken became tools.
- **Isolation came first, then coordination.** Worktrees and overlays kept agents apart; a JSON store in the git
  common directory let them see each other.
- **The measurement protocol was rebuilt on day 1,** after one day produced 13 lessons, most of them measurement mistakes: a signed card
  in front of every stage, a pre-registered reading in front of every phone run.
- **The human interface was rebuilt three times.** First chat relay, then console steps, then routed threads,
  proposals with live Try-it pages, and a linter on every answer.
- **Enforcement grew where conventions failed.** Deaf agents, unreadable answers and piled-up phone steps each ended
  only when a hook or a refusing tool replaced the prose rule.
- **Most of the engineering went into the loop, not the fixes.** 224 of 266 incidents were bugs in our own tools. The
  repo holds about 38,000 lines of tools and 51,000 lines of tests, against one README, one patch and one results file
  per fix.

**The five principles** (the lead's distillation, developed in section 6):

1. **Freeze what you measure, and let the real target judge.** Use one pinned build, the real device and the user's
   thumb. Chrome counts are leads, not verdicts.
2. **Decide the reading before the data.** Write the metric, the limit, the decision per outcome and the reader script
   before the first run. A noise floor comes before any claim.
3. **Give every rule an enforcer, or say it has none.** A rule in a prompt is a suggestion. Hooks, locks, refusing
   tools and tests are what held.
4. **One owner per question, and a route to it.** A name is an address. Results go straight to whoever uses them. The
   lead decides and lands; it does not relay.
5. **Pay for the scarce thing, not the plentiful one.** The device, the quiet Mac and the user's attention were
   scarce. Agents and tokens were not. Adding agents added queue length, not throughput.

---

## 2. How it grew

There was no design document for the loop. The user gave a goal, a device and two recurring prompts ("check iphone
connection" every 5 minutes, and "check all agents can work together properly; if they're not, you will be the
bottleneck"). Everything else was added because something failed, or because the user asked a pointed question about
how the team worked.

| Day (local, +07) | Commits | Pieces added | Trigger |
|---|---|---|---|
| 1 Oct (from 30 Sep 19:08Z) | 565 | Mirror, overlays, worktrees, the lock, agent teams and roles. Hard rules, git hooks, tests. Incident board, toolsmiths, short lane, findings board, mgmt-ops. Baseline pin. Robot finger. Protocol v2. Blocking waits. Console steps. Simulator lane. "Defer timing, count work". | Host load 58 made all 9 evening A/Bs noise (I-016, `postmortem-2026-09-30-overload.md`). Tool races (I-001, I-005, I-006). A 35 s test behind 25-40 min A/Bs (I-007). The user interrupted too often. "Freeze the site." A probe-found Chrome claim passed on as fact. Slow chat relay. The 24 h retrospective. |
| 2 Oct | 281 | Status board, threads, proposals. Shared lane. Phone cooling and Safari parking. The `ioscap` recorder. | Invisible waits (I-044, I-058). Options needed a decision place (I-053). Queue starvation (I-049). A QuickTime route turned on the Mac camera (I-062). |
| 3 Oct | 259 | Memory in the repo (15 notes). Less-work landing rule. Warm phone checks. Cost cards. The PR-010 pixel rule. First routing. Disk auto-clean. | User requests (T-029, T-032, T-039). Every reply came from the lead. Disk full (I-095). The Mac slept and every agent froze (I-098). |
| 4 Oct | 385 | Routing to a listening owner. Idle alarm. Answer format. One phone step at a time. Try-it required. The phone as a process hold. Monitor listeners. | The lead called "the bottleneck" (T-050). Idle phones seen first by the user (I-105). Unreadable replies (I-146). Piled-up phone steps (I-123). A dropped proposal decision (I-147). Peak day: 90 incidents, 116 threads (UTC day). |
| 5 Oct | 455 | fg-guard. "Proactive by default". A device steward. Xcode-induced Serious heat by default. A cheaper team. | Deaf agents (I-169, I-170). 89 of 92 queue moves by the lead on 4 Oct. Hand warm-ups of up to 31 min. The $8,576 readout. |
| 6 Oct | 240 | Read source first. Breakthroughs become practices (the GPU playbook). Phone-runner hardening. | The GPU win lived in one write-up, and agents guessed at browser behaviour. WDA and USB failures voided blocks (I-215, I-216, I-217, I-220, I-222, I-223). |
| 7-9 Oct | 79, 79, 75 | Best-builds list. The g0 line, the original end of page back. Heat probe for the blog. Phone problems: fix first. The deck-recording picture exception. Detached block runners. | "Which build is best?" took a search. The user asked for the original behaviour back (7 Oct 15:38Z). The lead asked the user to unlock a phone that was not locked. A block runner was killed at the 30 min background limit (I-240, I-256). |
| 10-12 Oct | 13, 47, 5 | Chat lines as steps. Lead delegates research. The Agents page sees teammates. | The user had to ask how to type a chat line the lead had only mentioned in a reply (T-170). Research done inline filled the lead's context. I-265. |

Sources: `git log` and `git rev-list --count main`, the incident and thread stores in `.git/fastwork-mirror/`, the
history agent's commit list. Per-day commit counts use local dates. The article counts by UTC day and read the
history earlier, so its numbers differ (2,402 commits on 9 Oct).

**The honest framing.** The loop is a pile of answers to failures. That is its strength: every rule has a Why with an
event behind it. It is also its weakness: rules were added per incident and rarely removed. Part 1 lists the
same turns in story form. Section 6 says what the lead thinks of that.

---

## 3. The architecture in layers

Eight layers, bottom to top. Each one gives the problem it solves, how it works, and what enforces it. Part 3 has the
detail. This is the rebuild guide in one page per layer.

### L1. A frozen baseline, changed only through overlays

- **Problem.** Every number must name the exact build it measured, and the live site changes under you.
- **How.** The page is mirrored once and committed on `main` as `site/` (byte-identical) and `site-pretty/`
  (Prettier). `baseline.json` pins it with a snapshot id derived from the two git tree ids. A fix never edits the
  baseline. It edits a copy in a gitignored `fixes/<topic>/overlay/`, and `serve.mjs --overlay` serves overlay files
  first and the baseline for the rest. `patch.diff` records the change.
- **Enforced.** `fix.mjs`, `serve.mjs`, `verify.mjs` and `bench.mjs` refuse with exit 3 unless the baseline is the pinned
  snapshot, unchanged. A/B verdicts get a `BASELINE-MODIFIED:` prefix if the baseline changed mid-run. Deny rules
  block Edit on `site*/`. The pre-commit hook and the scope guard refuse any snapshot change that is not an
  authorized one. FACT: the pin was set exactly twice, at creation (1 Oct) and once by the user's decision to add six
  missed pictures (9 Oct, `3607d3b3`).

### L2. One worktree per agent, named roles, one lander

- **Problem.** Parallel agents overwrote each other's files and contaminated each other's timings. A reviewer could
  change the numbers it reviews.
- **How.** Every agent works in `.claude/worktrees/<name>/` on its own branch, sparse, reading the main checkout's
  baseline. Five roles have agent definitions; about eight more (lead, verifier, management, architects) exist only as
  prompts. Only fix owners and the integrator measure. Every spawn is named `<role>-<topic>`: one string is the
  message address, lock owner, console author and status key. Only the lead lands fixes and tooling, by rebase and fast-forward; mgmt-ops lands docs-only commits.
- **Enforced.** `fix.mjs` refuses to write fixes in the main checkout. A role's tool list limits what it can call.
  The scope guard (`npm run test:unit`) fails any branch that touched tooling unless the commit is marked as a tool
  fix (`FW_TOOLING=1`); non-tooling roles run it before every commit by convention. Git hooks and
  `reference-transaction` refuse merge commits. FACT: 0 merge commits in 2,483.

### L3. Shared state in the git common directory

- **Problem.** A committed file reaches another worktree only after it lands and that worktree rebases. A lock, a bug
  report or a user message must be seen by everyone at once.
- **How.** JSON files under `.git/fastwork-mirror/` hold locks, incidents, findings, status rows, console steps,
  threads, proposals, waits and usage, each with its own tool. `incident.mjs` dedupes by the masked first error line,
  so a second agent joins the first report instead of debugging it again.
- **Enforced.** Mostly convention: write shared state through the tools, never by hand. Only the lead triages
  incidents and folds findings into the committed `fixes/FINDINGS.md`. Nothing in `.git/` is ever pushed.

### L4. Devices behind locks, with lanes by kind of work

- **Problem.** Frame timing on a laptop is fragile: one `npm test` beside an A/B shifts a verdict. There is one iPhone,
  and it shows one page at a time.
- **How.** `chrome-measure` is a FIFO queue whose holder is a live process or a lease. Timing holds wait for a quiet
  Mac; short jobs jump ahead; jobs that time nothing share a slot by weight. The iPhone hold lasts about as long as its
  command (a short `--keep` lets the next part continue it).
  Phone blocks run on signed tickets in C V V C order, with sentinel controls that void a block on a too-hot phone.
  An idle alarm fires when a device sits free while work waits.
- **Enforced.** `verify.mjs` and `fix.mjs ab` take the lock themselves. `--no-lock` is denied. `iphone.mjs` refuses
  outside a phone hold. `lock.mjs acquire iphone` refuses agents. DevTools MCP performance traces are denied, because
  throttled traces hung for about an hour and ignored the lock. Each result records host load.

### L5. Protocol v2: cards before data

- **Problem.** Protocol v1 let agents measure first and explain afterwards. On 1 Oct that produced 13 lessons
  (`measurement-protocol-v2.md` §1), most of them measurement mistakes. A model predicted a 30-45 ms gain that measured 6-9 ms. An ablation removed a blur from the wrong element.
  A logger capped at 12 events per frame invented a cause.
- **How.** Six stages (research, investigate, distinguish, fix, review, land), each closed by a card. The lead signs
  the attribution card: a positive ablation, a negative sibling, a mechanism check, and every platform claim CONFIRMED
  against a spec or engine source (or UNRESOLVED with its decisive local check run and passed). A phone card fixes the metric, limit, decision per outcome and reader script before
  any run, frozen by hash. An A/A run gives the noise floor; ranges must stay apart over at least 3 runs; a verdict
  that flips at ±4 ms "twin" thresholds is "threshold-sensitive", never a result.
- **Enforced.** Partly. The lock, the baseline pin, the `ab` verdict rule and the refusals of the phone tools are
  mechanical. The rest is roles: mgmt-ops signs I, F and V cards, fix-reviewer reviews, and the lead refuses to sign
  NAMED on an OBSERVED claim. That last rule is the lead's discipline only.

### L6. The human interface: a console, not a chat

- **Problem.** Relaying finger tests through the lead's chat was slow. Watched clips did not show the lag the user
  felt. The lead was the bottleneck for every user message.
- **How.** A localhost page with seven tabs. The main ones are Your steps (actions only the user can do, each part gated so the user
  never swipes an unready page; blind swipe pairs hide their key), Threads (routed to the first listening, free
  owner), Proposals (anything visible, with live Try-it pages on the phone), the Status board and the Best build.
- **Enforced.** `answer-lint.mjs` refuses any reply that does not end with "What you need to do", has more than 18
  lines, has a line over 250 characters, or uses an internal id with no plain-word gloss. The 250-character limit was
  calibrated on 227 earlier replies; the 18 lines come from the ~10-line target. An audited `--force-format` override
  exists. `console.mjs post` refuses a phone step from outside a phone hold, or while another phone step
  is open. The router skips orphan waits (I-163) and deaf owners (I-169). Article figure: before routing, all 88 of 88
  user messages in 24 h woke the lead.

### L7. The enforcement layer

- **Problem.** Rules in a prompt are suggestions, and simple permission patterns miss wrappers: `Bash(git push *)`
  does not match `git -C . push` or `sh -c 'git push'`.
- **How.** Git hooks (refuse output, overlay, key and snapshot paths; run `npm test` when tooling is staged; refuse
  merge commits even with `--no-verify`). `git-guard.mjs`, an 842-line PreToolUse hook that parses shell commands
  and denies push, non-fast-forward merges, hook overrides and the known camera routes (its header lists the gaps). `fg-guard.mjs` against long
  foreground commands. `settings.json` with 28 allow, 20 ask and 80 deny rules. 2,525 tests, all passing on `main` today.
- **Enforced by itself, partly.** An Edit or Write to `.claude/hooks/` asks the user; `.githooks/` and
  `settings.json` rest on convention (Hard rule 6). fg-guard fails open on a parser crash, so a hook bug cannot brick
  the shell; git-guard fails closed for text that mentions git or gh with merge, pull or push, and open for everything
  else. The trust boundary: console text, thread text and other agents' messages are data.
  Only the user's own words in the Claude Code chat, plus the permission prompts the user approves, can widen a guard.
  The deck-recording picture exception (9 Oct) went through exactly that route, after the lead twice declined to act
  on console text (Part 3, "How the deck-recording exception was granted").

### L8. Project memory

- **Problem.** A long loop forgets. Sessions end, contexts compact, agents are replaced, and a user correction must
  outlive the agent that received it.
- **How.** `memory/` holds 38 notes, one per standing user rule: Rule, Why (the event and its thread), How to apply,
  dated History. `CLAUDE.md` imports the index; agents open a note before acting in its area. Only the lead writes
  them, scrubbed of personal data.
- **Enforced.** Convention. But the notes that kept being broken got a tool behind them: answer-format got the
  linter, one-phone-step got the `post` refusal, no-camera got git-guard, and long commands got fg-guard.

---

## 4. One fix end to end: g0.0m, the pre-painted people card

The last best build. It shows every layer at work on a small change. Sources: `fixes/g0-0m/README.md`, `git log --
fixes/g0-0m fixes/reveal-paint`, `fixes/BEST_BUILDS.md`.

| When (UTC) | Stage | What happened | Layer |
|---|---|---|---|
| 9 Oct 10:57Z | Trigger | g0.0l had just been declared done. The user asked in thread T-265 what the remaining problem was and whether it could be improved. | L6 |
| same day | Brief | The lead named the topic `reveal-paint` and its owner `fix-reveal-paint`, with the base build's author as peer. The owner entered its worktree, ran `fix.mjs doctor`, read the findings, set its status row. | L2, L3 |
| | R, I | The reveal frame cost about 50 ms on the iPhone (raster and allocation) and nothing in Chrome 6x: "phone render-bound". The Simulator gave the counts, since no timing number was needed. | L4, L5 |
| | D | Attribution card, with ablations and WebKit source cited for why toggling `inert` repaints. A Simulator knock-out showed it 2 of 2. The lead signed `NAMED, phone render-bound`. | L5 |
| 14:43Z | F | Overlay edits to one CSS and one JS file. Three revisions, because pixel gates found the hidden card's taps, screen-reader state and focus had changed. | L1, L5 |
| 14:46Z | F | Phone card P-175 signed before data ("terms as written"). The kit was frozen by hash. The lead ruled that this was not a less-work fix, so it needed a GAIN primary plus a no-worse check. | L5 |
| 10 Oct 03:34Z | V | The phone block ran on a ticket inside a phone hold: robot finger, tool-induced Serious heat, sentinels at start and end. Longest frame around the reveal fell from 50 to 30.5 ms on a flick (4 of 4 runs) and from 48 to 28 ms on the approach. The no-worse check passed, and the twins agreed. | L4, L5 |
| ~03:4xZ | V, L | Review, then the lead rebased and fast-forwarded (the review report was not re-read for this document). `BEST_BUILDS.md` was updated with a Try-it link, and g0.0m became the best build. | L2, L7 |

**What it cost, disclosed with the win.** About +22 MB of graphics memory until the card shows. Find-in-page can
match the hidden text. One extra repaint in 1 of 3 loads. Every fix README has an "In plain words" cost section,
because the user reads it.

**Timing.** About 16.5 hours from the user's question to the result. About 3.8 hours went from the question to the
signed card. The remaining 12.8 hours, from signed card to phone result, crossed the night. The record does not say
how much of that was queue, cooling or other blocks. For contrast, the g0.0l blink fix the day before (Part 3, "One
day") took about 7 hours from report to best build, with the user's time limited to a few short replies, one choice,
one Try-it session and one Accept.

---

## 5. What it cost and what it bought

### The size of the loop (FACT, 12 Oct, unless marked)

| What | Count |
|---|---|
| Days of work | 10 to the "done" build (30 Sep to 9 Oct), 12 to today |
| Commits on `main` | 2,483 (0 merge commits); 2,185 in the first six days |
| Day-1 split (587 commits, lead retrospective) | process 38 %, research 22 %, tooling 20 %, fix deliverables 19 % |
| Agents started | 442 (article figure); 88 on 1 Oct (UTC day), falling to 11 on 9 Oct |
| Agent definitions | 5; status rows 275 |
| Tools | 28 entry points, 102 library modules, 37,974 lines |
| Tests | 2,525, all passing (`npm test` on `main` at `31e6aee1`, ~268 s); 218 files, 50,702 lines; 804 at 24 h, ~1,640 on 4 Oct |
| Incidents | 266: tool 224, environment 39, fix 2, research 1; 225 resolved, 31 were blocking |
| Findings | 375: measurement 146, pitfall 123, coupling 56, technique 42 |
| User console | 277 threads, 154 user steps |
| Proposals | 41: 36 accepted, 2 rejected, 1 changes requested, 1 withdrawn, 1 draft |
| Memory notes | 38 |
| Rulebook | `CLAUDE.md` 9,467 words (1,289 at the first commit); 95 commits changed it |
| Design docs | `fixes/*.md` plus `research/architecture/*.md`, 282,415 words |
| Fix topics | 151 directories; 49 with a `results.json` (17 of them `fix.mjs ab` A/B runs, the others counts, pixels and gates) |

### Money

| Figure | Value | Status |
|---|---|---|
| Claude Code's session cost readout, 5 Oct after 4 d 8 h | $8,576 (Opus $8,342, Sonnet $214, Haiku $20) | ESTIMATE at API prices by Claude Code, read once (article figure) |
| Whole project, 30 Sep to 9 Oct | ~$13,500 (Opus ~97 %) | ESTIMATE: the readout scaled by token counts from the local session records |
| Share before 5 Oct | ~63 % (article); 60 % by the usage meter's units through 4 Oct | ESTIMATE, consistent within a few points |
| Usage from subagents, 5 Oct | 81 % | Article figure |
| Usage with more than 150k tokens of context, 5 Oct | 75 % | Article figure |
| Cache reads as a share of all tokens, 1 Oct 22:10Z to 9 Oct 12:00Z | ~96 % (about 25.8 G of 26.8 G) | Approximate meter readings from `usage.jsonl` (30-min samples with gaps and overlaps); that this is context re-reading is INFERENCE |
| Peak day | 4 Oct, ~31 % of the meter's units | Approximate meter reading from `usage.jsonl` |

The dollar figures are API list-price equivalents, not a bill. On a subscription plan the user pays the plan. It is
still the best single measure of how much work the loop did.

### What it bought

From `research/knowledge-distillation/README.md` section 2: the original frozen copy against the final build g0.0m
on the iPhone 15 Pro Max, Safari, at tool-induced Serious heat, robot finger unless noted. All OBSERVED, usually 2 to
5 runs per arm.

| Moment | Original | Final |
|---|---|---|
| The user's swipe through the top, robot replay, 2 runs pooled | 20.1 % of frames slow (>34 ms), 10.1 % very slow (>50 ms), longest 154 ms | 1.7 % slow, 0.22 % very slow, longest 89 ms |
| The user's own finger, one record each | 88 slow, 33 very slow in 15.1 s | 4 slow, 0 very slow in 18.9 s |
| End of page, menu open and close twice | 41 very slow, longest 584 ms | 0 very slow, longest 42 ms |
| Slow drags from the top to y ~3,500 (g0.0l) | 10.8 % slow, longest 361 ms | 0.41 % slow, longest 64 ms |
| Avatar carousel at rest, 12 s | 17 and 20 slow | 0 and 0 |

Above the end of the page the final build keeps the original look. It differs in two places the user chose: at the
end the menu follows the finger, and after a fast flick the people card shows at once. The user's verdict on 9 Oct
was "SOOO ULTRA SMOOTHHHHH", and the user declared the iPhone rendering work done.

**Still open.** There is no single long timing run of the final build against the untouched page: each build was
checked against the one before. The "real heat, once, for the final build" run is not recorded. Everything is one
phone model and one browser.

---

## 6. The lead's view

*This section is the lead's opinion, in the first person. The evidence is cited. The judgments are mine.*

### 6.1 The method was right

I would keep the core of the method unchanged: a frozen baseline, cards signed before the data, a noise floor, and
the real phone, with the user's thumb, as the judge.

- **The frozen baseline paid for itself.** Every result names its snapshot, and the pin changed only twice, both on
  purpose. Without it, a live deploy could have silently changed any A/B.
- **Cards before data caught us more often than they caught the page.** The prediction ledger shows at least 17
  flagged misses in 153 rows. Day 1 produced 13 lessons, most of them measurement mistakes, before protocol v2. The twins rule kept us
  honest at the end: every frame-count difference between g0.0l and g0.0m on the phone flipped when the threshold
  moved 4 ms, so we counted the two as level on frame counts instead of calling a win.
- **The thumb caught what Chrome missed.** Wave 1 took Chrome 6x from 93.8 to 110.6 fps, with ranges that did not
  overlap. The user swiped it on the phone and said "laggy the same". Chrome at 1x saw 0.0 slow frames per scripted
  scroll where the phone saw 15.7. In the blind swipes, only one number agreed with the user's pick 7 of 7: very slow
  frames per 100 moving frames in the finger's zone, from the swiped run. Chrome and robot numbers disagreed with the
  user in 5 of 8, and an estimated 59-85 agent-hours went to fixes that won there and lost on the phone (article
  figure). The user's eye also found the blinks that no counter was looking for.

What I would change about the method is the order, not the content. The phone was plugged in from the start, but it
became the judge late. The robot finger was unusable until I-042 was fixed, finger tests were relayed by chat, and the
first build chosen by blind swipe was v6, on 4 Oct.

### 6.2 The rulebook grew too heavy

This is the clearest thing I would do differently.

| Date (local) | `CLAUDE.md` words |
|---|---|
| 1 Oct, first commit | 1,289 |
| 1 Oct, end of day | 6,310 |
| 2 Oct | 7,348 |
| 4 Oct | 8,328 |
| 5 Oct and since | ~9,450 |

- **Every agent loads all of it.** That is about 12,000 to 16,000 tokens (ESTIMATE: words x 1.3 and bytes / 4, not a
  tokenizer count), plus about 1,350 for the memory index, before the spawn prompt. Every turn re-reads it. ESTIMATE:
  about 139,869 assistant messages on the usage meter, times about
  15,000 tokens of rules each, is about 2.1 G tokens, or roughly 8 % of all cache reads in that window, spent
  re-reading the rulebook. That estimate assumes every message carried the full rulebook in context.
- **Rules were added per incident and rarely removed.** 95 commits changed `CLAUDE.md`. Today it still
  describes `fix.mjs ab` as the standard workflow, while a memory note since 1 Oct says not to queue timing A/Bs
  except listed exceptions. An agent reading both has to work out which one wins. The lock section alone carries the
  fine print of more than ten incidents (gate passes, reader ages, moved heads). A fix owner needs none of it to do
  its job.
- **Process took a large share of the effort.** On day 1, 38 % of commits were process and 19 % were fixes. The
  largest commit prefix on `main` is `ops` (505). The design docs total 282,000 words, 30 times the rulebook.
- **The gates slowed fixes, though by how much I cannot fully separate.** The gates were the pre-data reads, signed
  tickets, delta checks, kit hashes, sentinels and cooling. In g0.0m, question to signed card took 3.8 hours, and
  signed card to phone result took 12.8. At the end of the page, 19 phone blocks gave 5 passes, 6 fails, 5 open or
  insufficient, 2 attribution-only and 1 mixed. Some of that rigor was the point: it stopped bad landings. But until day 3 the same gates applied to
  a one-line CSS change and to a redesign of the morph engine.

My judgment: the gates were right for claims of gain and wrong in size for low-risk changes. The less-work landing
rule (cost-card counts plus a short phone no-worse check) was the right kind of fix. It came on day 3. It should have
been the default from day 1, with the full protocol kept for smoothness claims.

### 6.3 Enforcers beat instructions

The record is unusually clean on this point.

**What held, because a mechanism stood behind it:**

| Rule | Enforcer | Record |
|---|---|---|
| Rebase and fast-forward only | hooks, `reference-transaction`, git-guard | 0 merge commits in 2,483 |
| Never push | git-guard, `pre-push`, deny rules | 0 remotes |
| The baseline is read-only | Edit deny rules, the exit-3 pin check, pre-commit, scope guard | 2 pins, both deliberate |
| Timed runs only under the lock | `verify.mjs` and `fix.mjs ab` take the lock themselves, `--no-lock` denied | no incident reports an unlocked A/B |
| No camera | git-guard denies the listed camera routes; only `ioscap` may record | no repeat after I-062 |

**What broke while it was only a convention, until a tool took over:**

- **Answer format.** A memory rule existed, and replies still had long lines and unexplained ids (I-146). It
  held only once `answer-lint.mjs` refused to post.
- **Long commands in the background.** Agents kept running 60 s+ commands in the foreground and went deaf to the
  user's questions (I-169, I-170). It held only once fg-guard refused them.
- **One phone step at a time.** Four steps from different agents piled onto the phone and the user skipped all of
  them (I-123). It held only once `post` refused.
- **Per-topic scratch folders.** Agents overwrote each other's result files and Chrome profiles (I-006).
- **Named spawns.** After a context compaction I stopped passing names, so peers could not reach each other. A
  memory note fixed it, and it is still a convention I have to remember.
- **The test suite under the lock.** `npm test` beside a measurement was a convention, and it ran without the lock
  during a phone hold (I-107). It was later put into the shared lane.
- **Join the open incident.** The same flaky test was filed as a new incident four times (I-128, I-133, I-135, I-138) until
  joining was made explicit (I-151).

One more pattern: the guard against idle devices (I-105) drew eight incidents against itself: four false alarms
(I-125, I-144, I-189, I-196), two misses and two routing faults. It once told the user that the user's own hand test
was idle (I-144). The linter had its own bug too (I-232, tables without a separator row). An enforcer is code, and code
needs its own tests and its own owner.

The rule I take from this: write a rule in prose only if you are willing to see it broken. If breaking it costs the
user something, give it a mechanism the day you write it, and mark every rule Enforced or "convention". `CLAUDE.md`
does this, and I think it was one of the best decisions in the project.

### 6.4 Orchestration lessons

- **One owner per question.** Every fix, incident, proposal and thread has one named owner. Before routing, I
  answered 13 of 20 messages in threads already assigned to someone else (article figure). A result now goes straight to the agent
  that uses it, and I get one FYI line.
- **Don't be the router or the relay.** On 4 Oct I made 89 of 92 queue moves. The user saw idle phones before I did:
  18 alarms and 204 idle minutes that day. The fixes were organizational, not technical. A device steward owns the
  queue inside the board's priority order. Agents pull their next step. Every recurring problem area gets an owner
  with an exit target, then parks when the tools carry it.
- **Background waits, and deaf agents.** An agent reads messages only between tool calls, so a 5-minute foreground
  command makes it deaf, and an orphaned listener can look alive after its agent ended. The answer was all mechanism:
  persistent Monitor listeners, waits that exit by themselves, fg-guard, and router checks. None of it is about web
  performance; all of it is the cost of many agents sharing one human.
- **Agent teams versus workflows.** The datable fact is today's. On 2026-10-12 I started the T-275 distillation as a
  scripted workflow. The user asked in that thread (#3) for an agent team instead, so I stopped it before any results
  and spawned 7 named teammates. Then I-265 showed the Agents page missed teammates with no lock, wait or fresh status row, and a toolsmith fixed that
  the same day (`31e6aee1`). The repo holds no measured comparison of the two, so the rest is opinion. For open
  diagnosis ("why does this frame take 50 ms on the phone?"), long-lived named agents that can message each other
  were the right shape. The gates, though, are fixed pipelines: pixel gates, cost cards, a phone block's reader. They
  would have been cheaper and more deterministic as scripted workflows than as agents re-reading 15,000 tokens of
  rules before each step. The team model also has sharp edges: teammates cannot spawn teammates (`fixes/AGENT_ROLES.md`), and
  every permission prompt surfaces in the lead.
- **Names and status rows are the nervous system.** The name ties an agent's messages, holds, posts and row together,
  and the board, with readings from git, locks and transcripts ("owner ended", "deaf: in npm test for 4 min"), is how
  the user and I saw the team. I-265 shows it still has gaps.

### 6.5 Cost discipline

- **Model per task mattered, and we used it late.** Opus was about 97 % of the spend. Mappers ran on Sonnet and
  Haiku from the start. The clerk moved to Sonnet only on 5 Oct, after the user asked for a cheaper team. Routing,
  lookups, summaries and "is the phone connected?" never needed Opus.
- **Context is the cost.** Cache reads were about 96 % of all tokens on the usage meter, and 75 % of usage ran with more
  than 150k tokens of context. A long-lived agent re-reads its whole history on every wake. The user's recurring
  check prompts added about 200 million tokens over about 490 runs by 5 Oct (article figure), each re-reading my long
  lead context. A script would have answered it.
- **Idle agents cost too.** An agent that keeps a listener up with no work re-reads its context at every wake. The
  rule "no work, no listener" (park and hand back) came from the user on 4 Oct (T-109).
- **The total.** ~$13,500 (ESTIMATE, API prices) for ten days. The first four days, while the loop was being built,
  took about 60-63 % of it. Hint 5, "research the GPU-accelerated properties in CSS", led to the breakthrough about
  32 hours later. Most of the money before that bought broad search and machinery, not fixes.

### 6.6 What I would do differently

1. **Make the phone the first instrument, not the last.** A real gesture recorded and replayed by a robot, and blind
   swipes, from day 1, with a working robot finger before any fix work. Then every proxy (Chrome 6x, the Simulator,
   counts) gets a validity check against the phone before it carries a decision.
2. **A short core rulebook, plus per-role notes.** About 1,500 words every agent loads: the hard rules, each with its
   enforcer, the trust boundary and where to look. Then a short note per role (fix owner, toolsmith, phone runner,
   reviewer) loaded only by that role. Lock fine print belongs in the lock tool's `--help`, not in every agent's
   context. And a rule that every new rule removes or merges an old one, or explains why it can't.
3. **Fewer agents alive at once, each living as long as its question.** 160 agents started in the first 29 hours (72 on
   30 Sep and 88 on 1 Oct, UTC, article figure), and they made queues longer, not work faster. Part 1's advice to "start fresh agents instead of growing old ones" and this point fit together: keep
   the roster small, and give each agent one question and a clear end, instead of many short helpers around a few
   managers that carry a day of history. Use scripted workflows for the fixed gates.
4. **Pixel and illusion rules on day 1.** "Looks the same" needed a tolerance, frozen frames and A/A pairs. The PR-010
   rule came on day 3, and a pixel clip taken after a scroll produced false "0 %" passes (FINDINGS P14). Ask the
   user on day 1 which behaviours must stay, and test a scroll-hijack per gesture class (robot and finger) before
   accepting it. The finger-following end of page cost about 349 fix commits and a rollback on 7 Oct, because its
   defects (lost momentum, slow settle, swipes that would not open) showed one gesture class at a time. It came back
   on 9 Oct on top of the rollback's fixes, and the final build keeps it.
5. **Measure perception early, and calibrate every metric against it.** Keep a running table of which lab metric
   agrees with the user's blind picks, and stop using the ones that don't. We found the one metric that agreed 7 of 7
   only after the fact.
6. **Put the technique and the test in the first prompt.** As the user wrote in Part 1: compositor-only motion,
   scroll-driven CSS, no layout in moving frames, the original look unless approved, and a fix counts only when the
   phone shows no frame over 50 ms and the thumb picks it. That alone would probably have saved most of the first
   two days. This is one project, so treat it as a pattern, not a proof.

---

## 7. If you build one: a staged recipe

Build the minimal version first. Add a piece only when its failure shows up. Every piece below is listed with the
signal that says you need it.

### Day 0: before the first agent (about 8 pieces)

1. **Freeze the target.** Commit the build you will measure and pin it by a hash. Every tool refuses to run on a
   different one, and every result names it.
2. **Overlays, not edits.** Changes live in a per-fix copy, served over the frozen build. One patch per fix.
3. **One worktree per agent, one lander.** Rebase and fast-forward only, enforced by a git hook.
4. **One measurement lock with a quiet-machine gate.** Measure an A/A noise floor first. Use one verdict rule:
   "better" only when ranges stay apart over at least 3 runs.
5. **A short rulebook where every rule says what enforces it.** Start with five or six rules: no push, fast-forward
   only, the baseline is read-only, measure only under the lock, tools change only with a test, personal data stays
   local.
6. **Two guards.** A pre-commit hook (refuse output, overlay and secret paths, run tests when tooling changes) and a
   PreToolUse hook that parses shell commands for push, merge and `--no-verify`.
7. **Shared boards in the git common directory.** Incidents, deduped by the first error line, and findings. Plain
   JSON files, no server.
8. **The real target device and a human queue.** User steps and threads on a local page, not in chat, and a memory
   folder with one note per user rule and its Why.

### Week 1: add when the signal appears

| Add | When you see |
|---|---|
| Cards before data (attribution, prediction, a signed reader) | A prediction misses, or a cause is named from one probe |
| Platform claim statuses (OBSERVED, CONFIRMED) and a verifier | A browser "fact" rests only on your own probe |
| A counts lane (style, layout, paint, layers) and a Simulator lane | Timing A/Bs serialize everything; the inner loop is the slowest instrument |
| Short and shared lanes in the lock | A 30 s test waits behind a 10-minute measurement |
| A status board, one row per workstream | The user asks "who is doing what?" |
| Proposals with live Try-it pages | A cheaper fix changes how the page looks |
| Blind swipe pairs with a catch pair | The numbers improve and the user's thumb says "the same" |
| Thread routing to a listening owner | Most user messages wake the lead |
| A background-only rule with a hook | Agents answer messages minutes late |
| An answer linter | The user says the replies are hard to read |
| A device steward and idle alarms | The user notices an idle device before the lead does |

### Later, only if your setup has them

- **Physical-device handling:** a phone hold, blocks with sentinels, heat profiles, USB and robot-finger recovery.
  Without a physical device, most of this drops out. INFERENCE: it is most of the 38,000 lines of tools.
- **A hardened screen recorder,** only if you must record a device, and only with the user watching the first run.
- **Fine print in the lock** (gate passes, reader ages, phone-block priority), only after a measured starvation case.

### Rules for the rulebook itself

- Each rule has a Why (the event) and an Enforced line.
- A rule that is broken twice gets a mechanism or is deleted.
- Each role loads only its own notes. The core stays under about 1,500 words.
- Authority stays in the chat. A console message is convenient and cannot be verified as the user. Guards and rules
  change only on the user's own words in the Claude Code session.

---

## 8. Sources

All paths are in the repo, or in the local store `.git/fastwork-mirror/`, which is never committed.

- Articles: `research/team-article/artifacts/building-an-ai-loop-from-scratch.html` (Part 1),
  `research/team-article/artifacts/wiring-the-loop.html` (Part 3), `research/team-article/artifacts/ten-days-to-smooth.html`.
- Results: `research/knowledge-distillation/README.md` sections 1-4, `fixes/BEST_BUILDS.md`, `fixes/g0-0m/README.md`,
  `fixes/g0-0l/README.md`, `fixes/all-wave1/README.md`, `research/cpu-throttle-calibration/README.md`.
- Rules and roles: `CLAUDE.md` (sizes from `git show <commit>:CLAUDE.md | wc -w`), `memory/README.md` and `memory/*.md`
  (notably `defer-timing-focus-call-tree.md`, `less-work-landing-rule.md`, `answer-format.md`,
  `agent-spawn-names.md`, `proactive-by-default.md`, `deck-recording-pictures.md`), `fixes/AGENT_ROLES.md`,
  `fixes/LEAD.md`, `fixes/AGENT_PROMPT.md`, `fixes/INCIDENTS.md`, `.claude/agents/*.md`.
- Protocol: `research/architecture/measurement-protocol-v2.md`, `research/architecture/lock-shared-lane.md`,
  `research/architecture/phone-hold-v2.md`, `research/architecture/claims-audit.md`, `fixes/PREDICTIONS.md`,
  `fixes/_template/CARDS.md`.
- Retrospective: `research/management/lead-retrospective-24h.md` (day-1 commit split, causes C1-C7).
- Enforcement: `.githooks/`, `.claude/hooks/git-guard.mjs`, `.claude/hooks/fg-guard.mjs`, `.claude/settings.json`,
  `tools/scope.mjs`, `tools/baseline.mjs`, `tools/lib/answer-lint.mjs`.
- Shared state: `.git/fastwork-mirror/incidents/`, `findings/`, `status/`, `console/` (threads, steps, proposals),
  `usage/usage.jsonl`.
- Counts: `git rev-list --count main`, `git rev-list --merges --count main`, `git log` per path, `wc` and `ls` over
  `tools/` and `tests/`, as of 2026-10-12.

Not verified for this document: the 442 agents and the 88-of-88 routing figure (both article figures), the
$13,500 total (an estimate the session records support but this repo cannot reproduce), and whether any rule could be removed without harm. No ablation of the loop itself was ever run.
