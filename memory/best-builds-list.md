---
name: best-builds-list
description: "fixes/BEST_BUILDS.md is the one list of best-build versions, newest first; the lead updates it and thread T-228 at every build change"
type: feedback
audience: lead, integrators
since: 2026-10-07
updated: 2026-10-07
---

**Rule.** `fixes/BEST_BUILDS.md` lists every best-build version, newest first: status (current best / candidate /
replaced / never landed), when it became best (commit), JS/CSS pins, what it added in plain words, how it was checked.
At every build change (a new candidate built, a landing, a version dropped) the lead updates the file in the same step
and posts the new top rows in console thread T-228.

**Why.** On 2026-10-07 the user asked whether the best build was updated, then asked to keep it up to date, including
the best-build versions, newest first (T-228 #1/#3). `fixes/PROGRESS.json`'s `best` flag had gone stale at v8.

**How to apply.** Integrators (int-vN) send the lead the row for their build with the pins; the lead edits the file and
lands it. Read the current best from this file, not from PROGRESS.json.
