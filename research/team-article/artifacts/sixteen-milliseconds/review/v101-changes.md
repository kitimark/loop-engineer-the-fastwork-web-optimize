# v101 change log: arc.md items 1-15 applied to p1-v101-work.html

File: scratchpad/articles/p1-v101-work.html (edited in place). Its source was p1-ten-days-draft.html (= p1-v100-backup.html), and that file is unchanged.
Scripts: scratchpad/v101/apply.py (moves and rewrites), v101/renum.py (Fig renumbering), v101/verify.py and v101/digits.py (checks).

## Items applied (one line each)

1. **Late answers folded in.** "What I decided" is now the last block of every day.
   - Day 2: the three answers were folded in (details under item 9).
   - Day 4: the 15:40 article paragraph moved (item 11).
   - Day 5: "The breakthrough I meant…" now sits after the pull quote. "No one knows how to judge…" sits after "…my own bias.", with its third-pair repeat and its last (Day 10) sentence cut. The afternoon paragraph was merged into the 13:37 sentence (item 8).
   - Day 7: the 03:25 part sits after the pull quote, and "The rule at 16:04…" follows the 16:04 sentence in the same paragraph.
   - Day 7 → Day 8: the 04:16 and Murphy paragraphs moved (item 4).
   - Day 8: "I didn't know that first pair…" follows the first paragraph, and the 10:49 passages were merged (item 4).
   - Day 9: see item 12. Day 10: see the item 13 line, and the 03:31 paragraph now follows "…if it was my bias." with its first sentence cut. That paragraph was split there, so "I picked g0.0j both times…" starts the next one.
2. **The lead's planets answer** now follows the Interstellar paragraph. The lead-in is the one arc.md gives ("I asked the lead whether the agents belong in that picture too. This was its answer:"). The answer is a `<blockquote id="lead-planets">`, word for word, first sentence kept. The "From the lead, on the planets." label is dropped. The page then closes on "And I'd like to end with…" and the "Show the world what YOU can do." pull quote.
3. **The Day 5 four-moments block** moved into "My own thumb", right after the sentence now ending "(table below; source)". The block is the paragraph without its first sentence, the moment table, its note, the "On the original, 26 of the 52…" paragraph and the hero-return clip. In Day 5, Fig. 7 now sits right after the "(Fig. 7)." paragraph, followed by the bridge sentence given in arc.md.
4. **Day 8's middle was rebuilt in the order arc.md gives:**
   1. The merged 10:49 paragraph.
   2. The nav-rise close-up.
   3. The moved Day 7 passage, with the new opening, "(Day 8 has the details)" cut and the Murphy definition after "Interstellar" cut.
   4. The Cooper/Murph paragraph, unchanged.
   5. A new paragraph: "My engineering instinct… sunk cost. At 11:08 I asked for a fresh look…"
   6. Then "The smoothest build that week was v14…".
5. **Team material.**
   - The "Fig. 2 shows what one round did…" paragraph was cut from Day 1. Day 1 now runs Fig. caption → star paragraph → Team 1 → decisions.
   - Team 0 and the "How I ran the team" box moved to a new section, `<h3 id="team">How the team changed</h3>`, just before "What I learned". Its opening keeps the rest of the cut paragraph: "Who did the work changed almost every day. Here is the whole team I ended up with, in the positions the day diagrams keep, so any day can be compared with the end. The management layer… By Day 8 the lead talked to the owners directly." The only change is that "below" was dropped.
   - The canvas illustration moved into "How I measure" after Fig. 1, with the lead-in "This is what those numbers feel like under a thumb:".
6. **Appendix.**
   - "My own thumb" now ends on "Under my own thumb it felt perfect."; its signpost sentence was cut. The Day 11 team paragraph and Team 11 now come before Day 11's "What I decided", so the section ends on the thumb and the day keeps the rule from item 1.
   - "What the phone recorded" became "Appendix: what the phone recorded" (`id="recorded"` kept). It now sits after "Ten days in numbers", with the opening arc.md gives. The "The four replays add up…" paragraph was cut.
7. **"How I measure" was trimmed.**
   - It now holds the 16.7 ms item, the slow / very slow item, Fig. 1, the illustration and the first two sentences of the bar legend as a paragraph.
   - The other items (counts, who moves the page, heat, builds, small samples, the rest of the bar legend) moved to `<h3 id="reading">Reading the numbers</h3>`, just before Sources.
   - The Day 2 Chrome sentence is now a paragraph just before the Day 2 Chrome figure.
   - The stakes line was added after "…with smooth animation on my iPhone."
8. **Day 5's 12:07 paragraph** became the three paragraphs given in arc.md, with the afternoon paragraph folded in. In the team paragraph, "After my 21:18 note the roles became proactive, so owners…" became "From then on, owners…".
9. **Day 2.**
   - The "numbers said…" paragraph now follows "…with only a little lag."
   - The next opening is "That changed how I took part. Instead of only swiping the team's builds, I gave the loop hints."
   - The Chrome-154 answer was inserted after "…sent a researcher.", starting "I wasn’t sure it was wrong." The paragraph was split before "At 13:50".
   - The 19:00 answer was appended after "…its own findings.", starting "I already knew…".
   - The team paragraph now starts "From 15:12…".
10. **Day 3.**
    - The proposals definition now opens the first proposals paragraph.
    - The later paragraph starts at "The countdown fix from my hint 3…".
    - The shot caption now ends "…and my decision, without a note (source)."
    - The hint 3 sentence reads "…and it doesn't need ten digits per place for its roll. Three would do."
11. **Day 4.** The team paragraph was rewritten as given ("The team built it that afternoon: …"). The article paragraph (15:40) was moved after the 15:21 paragraph and rewritten as given.
12. **Day 9.**
    - The four answers were folded in after their own sentences, opening as arc.md gives: "That is the order…", "I looked to understand…", "The flicker was worth another round: a real user can see it. Hold your finger…", "I drew that line because…".
    - The 17:04 and 17:27 parts, and the 18:33 and 19:16 parts, were split into their own paragraphs.
    - "At 19:44 I made a dropped phone link…" was cut from the team paragraph.
    - No figure, still or clip was removed; the optional cut was skipped as instructed.
13. **Day 10 and the appendix.**
    - In Day 10, "Everyone can make mistakes…" now follows "At 11:16 I planned three blog posts.", continued with "So even then I kept looking: at 11:26…". "At 11:54…" starts a new paragraph.
    - In the appendix, "Two days later…" became "I had called the job done on 9 October, but the team found one more thing to improve. That became g0.0m, on Day 11."
14. **Repetition.**
    - "g0.0m keeps its People card…" was cut from the Builds item and from the Day 10 flick caption, and kept in the 9 October subsection.
    - Day 6: "At 12:33 we hit a usage limit… at 12:36 I asked for cheaper models." was cut, so the team paragraph starts "By 13:02…". The 12:33 fact is still in Team 6's diagram and its aria-label.
    - Day 8 now reads "The smoothest build that week was v14. As on Day 6, the smoothest builds had changed how the end of the page behaves."
    - "In short:" was reduced to its last sentence, under the Lessons card.
15. **Voice rewrites.**
    - Day 2 team: "and since timing waited, jobs that measure nothing could share Chrome".
    - Day 5 team: "a desk agent took the queue and the incident list off the lead from 10:15 to 18:12, and then, after 18 idle-phone alarms in one day, one agent became the phone's steward". I kept the times 10:15 to 18:12.
    - Day 6 team: see deviation 2.
    - The "My own thumb" signpost, the "Day 5 table" signpost and "In short" were cut.
    - "In words:" became "So an engineer … could get here in about 2.5 to 5 days…".
- **Your clarification (a):** the Day 11 clip caption now reads "recorded on 11 Oct for this article".
- **Your clarification (b):** the appendix sentence now reads "On my swipe, in this 11 October session, the original drew 263 and 265 slow frames per run (254 and 265 in the two replays of 10 October); g0.0l and g0.0m drew 20 to 26."

### Deviations from the arc.md wording (to keep facts intact)
1. **Item 10 proposals definition.** I kept ", with a slider or by blinking" at the end of the definition. The arc.md rewrite dropped it, and it is the only place that detail appears.
2. **Item 15, Day 6.** "two management agents were parked" would be wrong: iphone-runner is a phone agent, labelled "Phone + capture agents" in Team 0. I wrote "a management agent and the phone agent were parked".
3. **Item 15, Day 5.** I kept "from 10:15 to 18:12", which the arc.md "…" elided.
4. **Item 7, bar legend.** The moved part of the bar-legend item now opens "Under each clip, dotted lines mark 16.7, 34 and 50 ms." so it still makes sense on its own.
5. **Production labels.**
   - The Day 10 link text now reads "Appendix: what the phone recorded".
   - In Sources, src-12 is now labelled "Fig. 9 and the hero clip in My own thumb, and my own swipes on Day 11:" (it was "Day 5 table and clip…"), and "The Day 5 clip:" became "The hero clip:".

## Fig. renumbering (old → new, applied in one regex pass)

| old | new | what | where now |
|---|---|---|---|
| 1 | 1 | frame ruler | How I measure |
| 3 | 2 | three-dot illustration (canvas) | How I measure |
| 2 | 3 | the loop, one round | Day 1 |
| 4 | 4 | Chrome vs thumb | Day 2 |
| 5 | 5 | countdown digit | Day 3 |
| 6 | 6 | heat test | Day 4 |
| 7 | 7 | phone check behind v6 | Day 5 |
| 8 | 8 | background pictures | Day 6 |
| 6b | 9 | swipe moment table | Day 11, My own thumb |
| 13 | 10 | activity per day | Ten days in numbers |
| 14 | 11 | proposal decisions | Ten days in numbers |
| 15 | 12 | best-build path | Ten days in numbers |
| 9 | 13 | swipe histogram | Appendix |
| 10 | 14 | 9 Oct table | Appendix |
| 10b | 15 | 11 Oct three-build table | Appendix |
| 11 | 16 | slow-drag histogram | Appendix |
| 12 | 17 | frame time vs scroll position | Appendix |

These were renumbered together: the cap-bar labels, `id="fig-N"` and the one href (`#fig-4`), every "Fig. N" in text, captions, the moment-table note and Sources. "Fig. 11 and 12" became "Fig. 16 and 17". That was 68 "Fig." substitutions and 18 id/href substitutions.

These keep their own labels: Team 0-11, "clip N of 4", "Day 9 frames" (two histograms, unnumbered as before), Lessons and Expert.

## New section order
1. Before day one
2. How I measure (Fig. 1, Fig. 2, the bar-legend sentence, then clips 1-4)
3. Days 1 to 10
4. Day 11 · Epilogue, with "My own thumb" (Fig. 9)
5. How the team changed (Team 0 and the "How I ran the team" box)
6. What I learned (Lessons, Expert, the lead's quote, the closing headline)
7. Ten days in numbers (Fig. 10-12)
8. Appendix: what the phone recorded (Fig. 13-17, with the 9 October subsection)
9. Reading the numbers
10. Sources

## `<video src>` order in v101
1. hero-gesture-long-60fps-strip
2. hero-gesture-stop-1x-strip
3. opening-carousel-1x-strip
4. end-openclose-take-60fps-strip
5. day3-carousel-60fps-strip
6. end-openclose-take-2x-strip
7. hero-gesture-stop-2x-strip
8. hero-gesture-stop-full-60fps-strip
9. day8-navrise-closeup-2x
10. day8-menu-60fps-strip
11. day8-menu-2x-strip
12. day9-join-closeup-2x-hq
13. day9-logo-closeup-2x-hq
14. day10-people-60fps-strip
15. day10-people-wc-60fps-strip
16. day11-reveal-60fps-strip
17. day11-reveal-2x-strip
18. hero-cards-return-60fps-strip (moved from Day 5 into My own thumb)
19. middle-60fps-strip

All are under `videos/`. The draft had the same 19 sources.

## Verification

1. **Links:** all 79 `href="#…"` resolve.
2. **IDs:** 138 ids, no duplicates.
3. **Element counts against the draft:**

   | element | draft | v101 |
   |---|---|---|
   | `<figure` | 61 | 61 |
   | `<video` | 19 | 19 |
   | `<svg` | 42 | 42 |
   | `<li id="src-` | 44 | 44 |
   | `<img` | 9 | 9 |
   | `<canvas` | 1 | 1 |
   | `<table` | 3 | 3 |
   | `<figcaption` | 60 | 60 |

   - Video and img src sets are identical to the draft's.
   - `<blockquote` went from 6 to 7, because the lead's aside became a blockquote (one fewer `<aside>`).
4. **Old Fig labels:** none left; no "Fig. 6b", "Fig. 10b" or fig-Nb. The cap-bar order and the fig-id order both run 1 to 17, and every figure's cap-bar, id and caption "(Fig. N" agree.
   - **HTML:** a tag-balance parse of v101 shows no stray or unclosed tags, the same as the draft. The `<style>` block and both scripts are untouched, and the canvas `#cap-pace` and the chart containers are present.
5. **Digit tokens** (visible text inside `<main>`, scripts excluded):
   - "Fig. N" tokens: 69 in both files.
     - Lost: "Fig. 2" from the cut "Fig. 2 shows…" paragraph.
     - Added: the src-12 label "Fig. 9".
     - All other changes are the renumbering.
   - Other tokens removed, every one a repeat that arc.md names or a named cut:

     | token(s) | source |
     |---|---|
     | 19:00 | Day 2 late paragraph |
     | 154 | "About the 'Chrome 154 limitation'" lead-in; the body still has "Chrome 154 limitation" |
     | 22:08 | Day 3 shot caption (still in the body and in "By 22:08") |
     | 16:09 | Day 4 team paragraph (still in the body) |
     | 13:37 ×1, 21:18 ×2 | Day 5 merge (one of each remains in the body; 21:18 also in decisions) |
     | 12:33, 12:36 | Day 6 team paragraph (12:36 still in the body; 12:33 in the Team 6 diagram) |
     | 10:49 | Day 8 duplicate (once remains) |
     | 17:04, 18:33, 19:44 ×2 | Day 9 late answers and team sentence (each still once in the body) |
     | 03:31 | Day 10 late paragraph (still in the body) |
     | 1.5 ×2, 2, 0.5, 70, 200, 2,760, 1 ("day 1") | the "In short" paragraph; every value is also in the Lessons card |
     | 1 ("clip 1"), 11 ("Day 11") | cut first sentence of the four-moments paragraph |
     | 10 ("Day 10"), 0.0 ×2 (g0.0j / g0.0i) | cut last sentence of the Day 5 bias paragraph |
     | 0.0 (g0.0m) ×2, 11 ×2 | "g0.0m keeps its People card… (Day 11)" in Builds and in the Day 10 caption |
     | 11 | cut "The four replays add up to the Day 11 counts" |
     | 5 ×4 | "Day 5 table" ×2, src-12 "Day 5 table" and "The Day 5 clip" |
     | 2 | "On Day 2 I stepped out of the chat" |
     | 10 | "mgmt-ops-10" (item 15) |
     | 8 | "(Day 8 has the details)" |

   - Tokens added:

     | token(s) | source |
     |---|---|
     | 8, 10, 11 | arc.md bridge sentence "…until Day 8, 10 and 11" |
     | 7 | "On Day 7 at 04:16" (arc.md rewrite) |
     | 6 | "As on Day 6" (arc.md rewrite) |
     | 9 | "on 9 October" (arc.md item 13 rewrite) |
     | 11, 254, 265, 10 | your clarification (b) |

     The Day 11 caption change (clarification a) adds no digits.
   - Net, outside Fig labels: removed 1 ×2, 0.0 ×4, 11 ×2, 2 ×2, 5 ×4, 154, 200, 0.5, 1.5 ×2, 70, 2,760 and the 13 clock times listed above; added 9, 6, 7, 254, 265. Every number in the tables, SVGs and captions is unchanged. Visible words went from 23,883 to 23,622.

## Skipped or not done
- **Item 12's optional cut** of the Join and logo still pairs: skipped, per your instruction to remove no figure.
- **Item 5:** I took the stronger option, cutting the whole Fig. 2 paragraph, rather than its tail only. Its last three sentences live on in the recap opening.
- **Sources order:** the intro sentence "In the order the story first cites them." is no longer exact after the moves; for example, src-12 is now first cited in Day 11. I did not renumber src-N, which is out of scope. The sentence needs a reword or a src renumber in the production pass.
- **Day 8 time reference:** after the 00:56 paragraph moved up, the next paragraph's "Just before that, at 00:09" now follows the 00:56 sentence. It is still true, since 00:09 comes before both 00:20 and 00:56, so I left it.
- **The lead's first sentence** ("Yes, the agents belong in that picture.") was kept. arc.md made cutting it optional.
