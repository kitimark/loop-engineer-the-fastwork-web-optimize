# First-time reader audit: "Sixteen Milliseconds" (p1-ten-days-draft.html)

Reader: a web developer who has used AI coding tools and has never seen this project. Read top to bottom, text and captions only (SVG internals skipped). No numbers or technical claims judged.

## Verdict (5 lines)

1. The story is strong and has a clear shape: the headline, the laggy thumb, "Laggy the same", the breakthrough, "we did it", Murphy, the rollback, "done". The author's voice (SOOO ULTRA SMOOTHHH, the gelato joke, "Haha") is the best thing in it.
2. It is too long for one Medium post. The body is about 15,500 words before Sources, plus 19 clips and about 40 figures, so Medium will show **about 65-70 min**. It is really three pieces: the story, a log of how the team was wired, and a data appendix.
3. The story only starts after about 1,400 words of method and dense clip captions. **A typical reader quits in "How I measure", or at the latest in Day 1's block of team diagrams** (Fig. 2, Team 0, "How I ran the team", Team 1, Fig. 3), about 2,500 words in and before "Laggy the same". A second drop-off comes at Day 5's moment table.
4. The main drags: jargon and agent names used before they are defined, a team diagram plus a "the wiring" paragraph on every day, and later asides from the author appended after each day's "What I decided". Many captions are as long as paragraphs.
5. The takeaway exists: the first paragraph of "What I learned" ("The loop is very fast at the work after a good question…"). But two dense cards bury it, and after the closing line comes a reply from the lead and then "Ten days in numbers". Aim for about 6,000-7,000 words (25-30 min) and move the rest to Part two or an appendix page.

## Prioritized fixes

### 1. Opening: get to the story and the "can AI do it?" question first
- **Where:** from the title to the end of the four clips ("How I measure", "Here is where the ten days ended", clips 1-4), plus Day 1's "I'm a software engineer, mostly back end…" and "It ran on a fixed budget…".
- **Problem:** "Before day one" is a good hook, but next come about 450 words of method (drivers, heat, the build names v1-v14 and g0.0b-g0.0m, OBSERVED, the strip legend, Chrome's 8.33 ms grid) and four captions of about 100 words each. The question that makes an AI reader care, whether a loop of agents can do this alone, is buried in the middle of Day 1. "Loop engineering" is in the subtitle but is never defined.
- **Fix, new order:**
  1. Title and subtitle. Subtitle wording: "My first AI loop engineering project, built from scratch: ten days, one iPhone and a team of AI agents…"
  2. A one-line disclaimer (keep the existing one).
  3. "Before day one" as it is, through "…smooth animation on my iPhone."
  4. **Move up here** Day 1's "I'm a software engineer, mostly back end…" and "It ran on a fixed budget…", under a small heading "The experiment". Add this definition before them: "Loop engineering, as I use it here: I don't write the fix. I build the loop around the AI (agents, tools, tests, a way to measure) and give it a goal, then let it investigate, fix and check its own work until it gets there."
  5. The respect note, cut to: "A word about the people who made this website. I am not claiming fastwork.com is a bad site. A team launching a new global platform has to make it work first and make it best later, and the morph design is ambitious work that I admire. I hope this helps the Fastwork team on its way to the world-class standard it is aiming for."
  6. "How I measure", cut to this text, with Fig. 1 and Fig. 3 (the three-dot thumb illustration, now in Day 1 with no text pointing at it) next to it: "My iPhone shows a new picture every 16.7 ms. When the page needs more than 34 ms for one, at least one picture is lost: a slow frame. Over 50 ms is a very slow frame. My goal was none of those. Every count comes from Safari's own frame log on the phone. Most tests were run by a robot finger, a test driver that replays the same swipe on both versions. The phone was held hot, at "Serious", its second-hottest heat state, because a hot phone is the phone people really hold. "Original" is my frozen copy of fastwork.com; g0.0m is the final build."
  7. "Here is where the ten days ended" and the four clips, with short captions (item 8).
  8. Day 1.
- Move the rest of "How I measure" into a "How to read the numbers" note just before Sources: the list of who moves the page, the Critical drift, the full list of build names, the small samples, the bar and playhead legend, Chrome's grid. Also strip the production labels ("Medium layout preview…", "capture-ready · 1200 px").

### 2. Cut the per-day team diagrams and their "the wiring" paragraphs
- **Where:** "How I ran the team" plus Team 0 in Day 1, then on every day a paragraph like "On Day 2 I stepped out of the chat…", "On Day 3 the owners started to reach me directly…", "After my note at 16:09, a router…", "On Day 5 a desk agent ran the queue order…", "At 12:33 we hit a usage limit…", "On Day 7 the clerk and the readers wound down…", "On Day 8 the wiring stayed simple…", "Day 9 kept the same wiring…", "After I called the work done at 10:56…", "On Day 11 I swiped the phone myself…", each followed by Team 1 to Team 11.
- **Problem:** This is 12 diagrams and about 1,000 words that run beside the story and repeat it. The "How I ran the team" list in Day 1 tells Days 2-10 ahead of time, in words the reader has not met yet (console, threads, proposals, router, desk, device steward, sonnet clerk, one-shot readers, opus hub). Each day's scene now ends with three blocks of structure: the team paragraph, the team diagram and "What I decided".
- **Fix:** Keep Team 1 in Day 1, with one sentence: "On the first evening the team was a star around the lead: one agent per problem, a lock for Chrome, a lease for the iPhone." Move Team 0 and the "How I ran the team" list, rewritten in plain words, to a short section "How the team grew" just before "What I learned", where the reader knows every term. Drop Teams 2-11 and the per-day team paragraphs (or move them to a Part two on the team). Where a team change is part of the story, it is already in the day text: the console on Day 2, the router on Day 4, cheaper models on Day 6.

### 3. Fold the author's later asides back into the scene
- **Where:** paragraphs that come after "What I decided" and explain an earlier timestamp:
  - Day 2: "The numbers said the page was better overall…", "About the “Chrome 154 limitation”…", "When I wrote to the lead at 19:00…"
  - Day 4: "At 15:40, for the first time, I said we would write an article…"
  - Day 5: "The breakthrough I meant was the hero section…", "No one knows how to judge without bias…", "By the afternoon, the threads I had open…"
  - Day 7: "At 03:25 I thought the end of the page was the hardest part…", "At 04:16 I thought v10 had reached all our goals…", "It comes from a scene early in the film…"
  - Day 8: "I didn't know that first pair was a check on me…", "At 10:49 I found the bug that turned me around…"
  - Day 9: "The order at 17:04 is the order…", "I looked at WebKit's compositing borders myself…", "The flicker at 18:33 was worth another round…", "I drew the line at 19:44…"
  - Day 10: "At 03:31 both builds felt smooth to me…"
- **Problem:** The reader gets the event, then the day's decision list, then a flashback that explains the event ("About the…", "When I wrote… I already knew…"). This reads as notes added later, which they are, and each day gets two endings.
- **Fix:** Put each aside right after the sentence it explains, cut to one or two sentences, and end each day on "What I decided". Exact rewrites:
  - Day 2, right after the "Laggy the same." quote: "The numbers said the page was better overall, and they weren't wrong. But a user doesn't watch the average frame. The hero cards still lagged as they moved out, the carousel still blinked, and the end lagged just the same."
  - Day 2, end of the 12:05 sentence: "…so the lead marked it unverified and sent a researcher. I wasn't sure the claim was wrong. I doubted the agents had read enough of the docs to know."
  - Day 2, the 19:00 sentence: "At 19:00 I told the lead what this was: a loop-engineering experiment, about a day in, with the goal still far away. I already knew the agents were missing context. I wanted to see how far they got at their best before my next hint."
  - Day 5, right after "This is breakthrough.": "I meant the hero: the cards moved out SOO SMOOTH, all the way until the People card faded in."
  - Day 5, after "…whether it was my own bias.": "No one knows how to judge without bias, not even me. So when I suspected my own, I said so in the note, so the team knew that piece might come from me and not from the page."
  - Day 5, the 13:37 sentence: "At 13:37 I told the lead it was the bottleneck. I had opened the Claude Code conversation itself and seen why: it was answering every agent's message on its own."
  - Day 9: "At 17:04 I set the order a real user meets the page: drag toward the end first, the menu second. I wanted the team to optimize what a user sees, not what its measurements happened to count." / "At 17:27 I said I had looked at WebKit's compositing borders myself and found many layers on the nav bar and at the end. I don't ask for fixes that can't be done, so I check first." / "At 19:44 I set one more rule: if the phone drops out without my asking, investigate and fix it first. I have a full-time job; every time the loop waited for me to fix the phone, we lost hours, and most of those problems the team could fix itself."
  - Day 4's 15:40 article note: move it into the day text, or cut it (Day 6 already covers the article).

### 4. Do not end after the ending
- **Where:** "From the lead, on the planets. Yes, the agents belong in that picture…", which comes after "Show the world what YOU can do.", followed by "Ten days in numbers".
- **Problem:** The fastwork.com headline is a perfect last line, but two more sections follow it. The lead's reply is good content, but it reads like a comment pasted under the post.
- **Fix:** Final order: "Ten days in numbers" (as a short box) → "What I learned" → the lead's reply, introduced as part of the scene ("When I shared the Interstellar thought, the lead answered:", then its text, cut to three sentences: "We landed on our own wrong planets… Ours looked good because we measured what was easy to measure. What got us to our Edmunds' planet was what you did: you checked our numbers against what you saw.") → the Interstellar paragraph → "Show the world what YOU can do." as the very last line. Sources go below a divider, or are linked.

### 5. Define every term at first use, and drop agent IDs
- **Where and fix (exact text at first use):**
  - "lead", Day 1 "At 21:14 I made the lead the orchestrator…": "At 21:14 I made the lead, the one Claude Code session I talk to, which starts the other agents and lands their work, the orchestrator until the job was done…"
  - "robot", "How I measure" and the clips: "a robot finger (a test driver that replays touch gestures on the phone)". Define it once; afterwards "the robot" works.
  - "blind swipe", Day 2 13:50: "At 13:50 I suggested blind swipe tests instead of watching: the phone shows two unlabeled versions, I swipe both and pick the smoother one."
  - "console", Day 2 14:19: "…a click-through console, a small local web page where every step for me is one card with a Start button, because the main chat was too long to follow."
  - "proposal": remove it from Day 1 ("no proposals yet" in the header, "proposals" in the Fig. 2 caption and in "How I ran the team"). The definition on Day 3 is fine, but merge "The console was new, and so were proposals: when a fix…" with the long proposal paragraph (item 12).
  - "OBSERVED" in capitals: say it once in plain words ("measured on our own phone only, not confirmed by a browser engine's docs") and use lowercase after that.
  - "timing gave way to counts" / "with timing put off" (Day 2): "we stopped timing every change and counted the browser's work instead (layouts, paints), so three agents could share Chrome at once."
  - "sonnet clerk… opus hub" (Day 6): "a clerk on a cheaper model (Claude Sonnet) and one-shot readers replaced the coordinator on Opus".
  - Agent IDs that mean nothing to a reader: "mgmt-ops" → "a manager agent"; "arch-compositor-morph, the agent building the GPU card" → "the agent building the GPU card"; "mgmt-devices became the steward" → "a device-steward agent took over"; "mgmt-ops-10 and iphone-runner were parked" → "two coordinating agents were stopped"; "arch-end-fresh" → "a fresh reviewer agent"; "toolsmith" → "a toolsmith (an agent that fixes one broken tool)".
  - The "What I decided" lists: replace the PR number ranges ("Accepted PR-001 to PR-005 and PR-007", "Accepted PR-036 to PR-039", "Rejected PR-029 and PR-033; accepted PR-031, PR-032, PR-035") with plain words ("Accepted six proposals, among them the countdown with three faces per digit"). Keep a PR number only where the text names that proposal.

### 6. The build names: explain "g0", and drop the sentence about g0.0m keeping its People card
- **Where:** "How I measure" ("Recordings from 9 October show g0.0l… g0.0m keeps its People card and only paints the card before it appears (Day 11)"). The same clause comes back in the Day 10 flick caption and under the "9 October" heading.
- **Problem:** At first read this sentence cannot be understood: the People card, its fade and its paint are not introduced until Day 10-11. It is pasted three times, word for word. "g0" itself is never explained: Day 8 says "PR-034, the first g0 build" and nothing more.
- **Fix:** Everywhere, write "g0.0l, one step before the final build (g0.0m only shortens one frame, Day 11)". At Day 8 18:44: "At 18:44 I accepted the result, PR-034, the first of a new line of builds, g0.0b to g0.0m, which start again from the original end." Optional: one sentence in "How I measure", "v1 to v14 were the first line of best builds; on Day 8 I rolled the end of the page back and a second line, g0.0b to g0.0m, began."

### 7. Day 5: move the moment table out of the breakthrough
- **Where:** Day 5, from "What I felt that morning is easiest to see in my own swipe…" through Fig. 6b, its long note and caption, "On the original, 26 of the 52 frames…" and the hero clip ("The hero part of my swipe from clip 1…").
- **Problem:** The best scene in the story ("This is breakthrough.") is interrupted by a table recorded on Day 11 that compares the original with the final build. The text itself admits: "The Day 5 build was not replayed with this swipe". The table also relies on the People card and the "o", which the story explains only on Day 8. Fig. 6b's note and caption repeat each other.
- **Fix:** In Day 5 keep one sentence: "Clip 1 at the top shows that stretch: on the original, about half of the frames drawn while only the hero cards moved under my finger were slow." Move Fig. 6b, its caption (keep one of the two texts) and the hero clip to "My own thumb" (Day 11), where they belong in time. Also drop "(Fig. 13)" from "363 messages and answers from me (Fig. 13)", a reference to the last figure.

### 8. Captions: two sentences each, plus one shared note
- **Where:** clips 1-4, the Day 3 full view, the Day 5 hero clip, the three Day 8 menu media, the Day 10 People card clips and still strip, the Day 11 clips.
- **Problem:** Most captions are 80-130 words: counts, run counts, heat, "cause not checked" drifts, the crop and the speed. A reader scrolling a video-heavy post reads captions first and hits a wall each time.
- **Fix:** Each caption gives what you see plus one headline number. Under clip 1, once: "All clips: real iPhone 15 Pro Max screen, address bar cropped off, phone held at Serious heat by a tool, robot finger unless I say "my finger". Where the two sides drift apart, the robot started a stroke later on the original." Everything else goes to Sources. Example, clip 1: "1 of 4. My own swipe, replayed by the robot: a short flick down through the hero cards, a stop on “People still need people”, then back up, twice. Original (left) against the final build g0.0m (right). In these 11.5 s: 104 slow frames against 9." Clip 4: "4 of 4. At the end of the page, a robot push opens the menu and another closes it, twice. On the original the page holds still and the menu jumps open by itself; on g0.0m it follows the finger. In these 13 s: 80 slow frames against 4, longest 584 ms against 42 ms."

### 9. Too many timestamps
- **Where:** throughout, most of all Day 5's "At 12:07, after a fast flick lagged…", which has eight "At HH:MM" in one paragraph. Day 9 and Day 10 open the same way.
- **Problem:** When nearly every sentence starts with "At HH:MM", the story reads like a log, and in UTC the times also don't match the author's day ("just after midnight my time").
- **Fix:** Keep the times that carry feeling (the midnight start, the 07:13 breakthrough, the 03:25 "we did it", 10:56 "done") and say the rest in words ("Around noon…", "That evening…"). Example rewrite of the Day 5 paragraph: "Around noon a fast flick lagged, and I asked whether we had ever tested fast scrolling. I asked for tools, not agents, to keep the status up to date, because agents spend tokens and make mistakes. In the evening I asked why we warmed the phone up by hand before every test, and Xcode's Serious setting became the default. At 23:33 I wrote that the best build, v8, was "SOOO SMOOTHHHHH", told the team I was proud of them, and asked the lead to write the story down."

### 10. Day 7: halve it
- **Where:** Day 7 (about 1,640 words, the longest chapter).
- **Problem:** Eight bugs in a row: the Join lift, the panel height and vh, the GPU question, the background animations, the top-priority agent, PR-029's fade, the rig (a 107-minute test, the USB port, Critical at 35 °C), and the ghost Safari tab. The rig paragraphs ("At 14:33, seeing agents search Chrome's bug tracker…", "Both were real, and our tools had read them right…", "The last bug of the day was small and odd…") are inside-baseball. Murphy's law is explained twice ("…Murphy's law, the way Cooper explains it…" and then "It comes from a scene early in the film…").
- **Fix:** Aim for about 800 words. Keep: "we did it" at 03:25, the first flaw (the Join lift), the vh bug with "It had come from memory. Five minutes later the lead had read the source", the GPU question, PR-030 "we did it" again, and "every breakthrough gets written up". Cut the rig section to: "The afternoon's bugs were in our own rig: a phone test that ran almost two hours, a USB port where the Mac never saw the phone, a heat state stuck at Critical on a cool phone. The team made the tools say plainly what was wrong. I also made a rule: read the engine's source before guessing." Cut the Safari tab paragraph. Murphy, once: "For a moment I wondered whether we were making AI slop. Then I remembered Murphy's law the way Cooper explains it to his daughter in Interstellar: it doesn't mean something bad will happen, it means whatever can happen will happen. Whatever could still go wrong on the phone would show up sooner or later, so I kept looking until it did."

### 11. Days 8 and 9: one picture per point
- **Where:** Day 8's three media for v14's menu ("The same slow robot push on both…", "The opening push, 2x slower…", the six-frame still strip) plus the top-row bug close-up; the two "o" clips (close-up and full view, with near-identical captions). Day 9's Join fade (still and clip) and logo (still and clip), each followed by a "Day 9 frames" chart whose caption says the clip "was not timed".
- **Problem:** About 10 media in two days for four points. The Simulator captions spend sentences explaining why the Simulator looks choppy, and the "Day 9 frames" charts measure something other than what the clip above them shows.
- **Fix:** Day 8: one "o" clip (the full view) and one menu clip (the real-speed v14 push), and the top-row close-up placed right after "At 10:49…", merged with the duplicate 10:49 paragraph ("At 10:49 I found the bug that turned me around…"). Day 9: the two still pairs (corners, Join fade) and the logo still only; drop both clips and both "Day 9 frames" charts. Targets: Day 8 about 700 words, Day 9 about 600.

### 12. Day 3: say what a proposal is in four sentences
- **Where:** Day 3, "The console was new, and so were proposals…" and "A proposal was how the team asked me before a fix changed how the page could look…", plus the two PR-007 screenshot captions ("PR-007 as I saw it in the console that night…", "Further down the same page…").
- **Problem:** Two review rounds, six revisions, 22:07/22:08/23:25, and screenshot captions about how the screenshots were re-run. This is process detail a reader doesn't need, and the definition is split across two paragraphs.
- **Fix:** One paragraph in place of both: "Day 3 also brought proposals. When a fix could change how the page looks, the team asked me first: the problem, the idea, the risk, and one or more options with before and after pictures. I could accept, reject or ask for changes, and my note became the spec for the next revision. That night proposals also got "Try it": the original and the fix as real pages side by side. The countdown fix from my hint 3 came as PR-007 with three options, and I accepted "full"." Caption for the screenshot: "PR-007 in the console: the cost, the idea, the risk and three options, with my decision." Keep one screenshot.

### 13. "What the phone recorded": cut to the two figures that close the story
- **Where:** "What the phone recorded" and "9 October: the robot’s slow drags, original against g0.0l, and g0.0m two days later" (Fig. 9, Fig. 10, Fig. 10b, the dark-section clip, Fig. 11, Fig. 12), about 1,050 words between the epilogue and "What I learned".
- **Problem:** After the emotional end ("Under my own thumb it felt perfect."), the reader gets a data appendix with two near-duplicate tables (Fig. 10 is 9 Oct, Fig. 10b repeats it on 11 Oct). The heading is a sentence long. The Day 10 text sends readers here ("the second half of What the phone recorded") before they know what it is.
- **Fix:** Keep Fig. 9 (every frame of my swipe) and Fig. 10b (the three builds), under one heading "The numbers behind the clips", and add one line of plain reading: "On my swipe the original drew about 264 slow frames per run; the final builds drew 20 to 26." Move Fig. 10, 11, 12 and the dark-section clip to Part two or the linked log page. In Day 10, replace "those recordings are the second half of What the phone recorded" with "those recordings close this story".

### 14. "What I learned": lead with the takeaway, one card at most
- **Where:** "What I learned": the "What the logs say about those four" card, the "In short" paragraph, the "If a design engineer who already knows the fix ran the loop" card, and the "In words" paragraph.
- **Problem:** The first paragraph is the clear takeaway. Then come two dense infographic cards, each followed by a prose paragraph that repeats it, so the takeaway is told about four times in different forms. It also introduces new terms (prompt cache, agent-hours, list prices) at the very end.
- **Fix:** Keep the first two paragraphs, the four lessons, the "In short" paragraph and the "In words" paragraph. Keep the lessons card and drop the expert card (its "In words" paragraph already says everything), or the other way round. Before the Interstellar paragraph, add the author's own line as the last word of this section: "The loop did the work. My job was to know what smooth feels like, and to say so when the numbers disagreed with my thumb."

### 15. Figure references, placement and the day count
- **Where:**
  - Fig. 3 (the three-dot thumb illustration) sits in Day 1 between Team 1 and "What I decided", with no text pointing at it.
  - Fig. 15 is cited in "How I measure"; Fig. 13 in Day 5; Fig. 10 in a Day 10 caption ("Fig. 10’s last row counts this flick"). All three appear much later.
  - Fig. 2's caption says "Day 1 built steps 3, 4 and 7", but a reader has no numbered steps in mind. Fig. 2 also arrives before the reader knows any part of the loop.
  - Day 3: "I kept that on Day 5 (PR-013)" is never followed up.
  - "Ten days" (title and headings) against "the eleven days" (Team 0 caption), "Day 11 · Epilogue", "9.4 days" and "8.7 days", and $8,576, $10,930 and about $13,500 as totals, with no sentence that ties them together.
- **Fix:**
  - Move Fig. 3 next to Fig. 1 in "How I measure".
  - Drop the forward figure numbers in body text (keep "Clip 1 at the top", which points back) or replace them with "(at the end)".
  - Move Fig. 2 to "How the team grew" (item 2), or put it at the end of Day 1 with the caption "One round of the loop as it ran from Day 5 on: from the frozen copy, through a fix, a measurement and my thumb, to a new best build."
  - Cut "(PR-013)" and "I kept that on Day 5".
  - Add one line under the subtitle or in "How I measure": "Ten days of work, 30 September to 9 October, then one more day of polish." Under "Ten days in numbers", add one line that says which dollar figure is which (the session readout on 5 Oct, list prices for the whole run, the scaled estimate), without changing them.
