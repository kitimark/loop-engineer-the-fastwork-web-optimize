---
name: answer-format
description: "every answer to the user (threads, chat, proposals, step text): answer first, short plain bullets, codes explained, numbers in small tables (they render in threads since I-129), at most ~10 lines, 'What you need to do' last"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-080 #1 and #4, 2026-10-04; rules proposed by the lead in T-080 #3, user: "ok, let's try").**
Every answer to the user, from the lead and from every agent, in console threads, chat, proposal text and
step instructions:
1. **Answer first.** The first line gives the answer or the decision.
2. **Short blocks.** Bullets or numbered steps, one idea each, no long paragraphs.
3. **Plain words.** No internal codes (P-094, I-123, hashes, arm names) unless explained in a few words:
   "the heat check (P-094)".
4. **What the user must do** goes on its own line at the end: "What you need to do: …" or "nothing".
5. **Numbers** go in a small table or list, saying which is better: "62 ms vs 55 ms (7 ms slower)". Console
   threads render markdown pipe tables, "- " bullets and **bold** since I-129 (a4f43dda, 2026-10-04, user T-091),
   so a table is fine there too. Keep a table to a few rows and columns, and put the "which is better" line under it.
6. **Times** in UTC with a Z, until the user names a time zone (asked in T-080 #3, not answered yet).
7. **At most about 10 lines.** If more is needed, use short headings and put the details on the progress page
   or in the README, with a pointer.

**Why.** The user said the answers were "quite hard to read and understand" (T-080 #1, 2026-10-04 06:41Z):
long paragraphs, unexplained ids, and the action buried in the middle.

**How to apply.** Before you send, check the first line, the codes and the last line. If the user says an
answer is still hard to read, change the format in that thread and tell the lead. Related: [[console-steps-only-for-actions]],
[[user-tasks-via-console]].

**History.** 2026-10-04 06:41Z rule set (T-080 #1-#4). 2026-10-04 10:0xZ tables render in console threads (I-129,
a4f43dda, user T-091); rule 5's plain-list interim removed.
