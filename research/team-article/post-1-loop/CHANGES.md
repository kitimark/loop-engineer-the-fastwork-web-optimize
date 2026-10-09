# Post 1 "Sixteen Milliseconds: Building an AI Loop from Scratch": changes vs the 5 October version

Writer: art-loop, 2026-10-09 (user T-170 #110). Old version: `research/team-article/index.html` (v8/v9 era, left
untouched). New file: `index.html` here, about 0.6 MB with its pictures inlined. Not published; the lead publishes.

## Before publishing (lead)

- **Owner's OK on the deck strip.** The figure "The last thing I saw: the people card on a fast scroll" embeds a crop
  of the masked iPhone strips `out/people-blink/phone-frames/sheet-V.png` and `sheet-K.png` (worktree
  agent-ac97cdb0aa8f3a8b2): frames +300 to +700 ms, address bar masked, no notifications, public demo content only.
  The badge "Owner's OK needed before publishing" stays until the owner says yes; then delete that `<p class="hold-badge">`.
  If the owner says no, delete the whole `<figure aria-labelledby="deck-cap">`.
- **Part one is the owner's voice.** New paragraphs drafted from threads and console steps for the owner to edit:
  "The second week: smooth, then faithful", the second paragraph of "What I learned", hints 7-9 and the 5-9 Oct
  timeline rows. No motive is invented: the rollback paragraph only states what happened and what the owner reported.
- **Cross-links.** Parts 2 and 3 are linked by relative path (`../post-2-techniques/index.html`,
  `../post-3-loop-deep-dive/index.html` with anchors `#wrong`, `#protocol`, `#privacy`). Once the three are artifacts,
  replace these hrefs with the artifact URLs (series nav at the top, the intro note, three in-text links, footer).

## What changed

- Title "Sixteen Milliseconds: Loop Engineering the fastwork.com Scroll" -> "Sixteen Milliseconds: Building an AI Loop
  from Scratch" (agreed with art-tech and art-loopdeep). Series nav added (Part 2 "The Casebook", Part 3 "Wiring the
  Loop"). Masthead label "Draft 3 … 5 October" -> "Revised 9 October 2026 · part 1 of 3".
- Steering timeline extended from 5 Oct to 9 Oct: hint 7 (Serious by default, T-162 #3), hint 8 (background pictures,
  P-137), hint 9 (breakthroughs become practices), the 6 Oct "ULTRA SMOOTH" milestone, the v11 blind swipe with its
  catch pair, the v12 blink, the 7 Oct rollback request, the steady-glass and people-card acceptances, the 9 Oct
  "all done" thread. The old 5 Oct 04:25 "next goal" row was replaced by these.
- New owner sections: "The second week: smooth, then faithful" and the deck-strip figure (g0.0l's fix).
- "What I learned": adds the design-decision lesson; the first-prompt advice now includes "keep the original look and
  behaviour unless I approve a change".
- Stats strip updated to 9 Oct: 10 days, 19 best builds, 2,402 commits, 200+ agents (212 names on the status board),
  260 incidents, 371 findings, 174 numbered predictions and checks, 41 proposals. Old: 5 days, ~130 agents, 1,737
  commits, 199 incidents, 126 predictions, 2,207 tests.
- New figure "The best-build ladder": v0 -> wave 1 -> v1-v4 -> v6-v8 -> v9-final -> v10-v13a (candidates) -> v14 ->
  g0.0b … g0.0l, in four eras, each with its check and the owner's verdict (BEST_BUILDS.md, PROGRESS.json,
  PR_BY_VERSION.md).
- Team map: integrator card replaced by architects; devices and phone-runner cards updated (devices starts ready phone
  tests itself, roles v3); helpers card adds verifiers.
- "Two scarce things" -> "Two scarce devices": adds the shared lane, phone holds and the idle alarm.
- "How one fix travels": adds phone blocks (C V V C order, sentinel controls, heat profiles never pooled) and the two
  landing rules (less-work vs feel).
- New section "How the loop grew": 13 dated rows, what went wrong -> what we added (30 Sep to 8 Oct).
- Rules: rule 05 notes the one snapshot change (9 Oct, six restored pictures, 3607d3b3).
- "Talking to the owner": 170 threads / 53 steps -> 265 threads / 138 steps / 41 proposals.
- New sections "The blind swipe" (with a table of the three swipe sessions since 5 Oct), "Heat, the variable nobody
  asked for" (condensed from the old "What heat does"), "When things break" (API limits, USB, Wi-Fi, disk),
  "Privacy and permission guards".
- "Where it stands" rewritten for g0.0l (final): open items are the full timing run against the original, the one
  real-heat run, and the parked heat tool.
- "What it cost": same 5 Oct reading, now stated as the only one recorded, with a note that the session ran five more
  days; first bullet of "ways to spend less" adds the design rule.
- "What I'd tell the next lead": adds "Smooth and faithful are two bars"; test count now "about 2,200 test cases".
- Every new number carries a source line (file and line, commit, incident, console item) and its status word.

## Removed (and where it went)

- Chrome before/after clips (3), Chrome fast-flick clips (2), the six real-iPhone clips, the "What we changed on the
  page" list and the before -> after result bars: all v8-era comparisons; techniques and numbers belong to Part 2.
- "Worst cases on the original" ranked table: v8-era; not carried into any part (agreed with art-tech).
- "What heat does to the page" long version: condensed into the heat section; the timer-grid and GPU findings keep
  their status words.
- "Publishing plan" owner-only appendix: superseded (the lead publishes the series).

## Kept media

- The five console screenshots (Agents, Status, Progress, a thread reply, Proposals), each now marked with its date
  (4-5 Oct). Copied byte for byte from the old page's data URIs.
- The pacing illustration (canvas) and the frame-budget ruler.
