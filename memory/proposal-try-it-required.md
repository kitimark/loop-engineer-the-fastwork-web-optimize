---
name: proposal-try-it-required
description: "every proposal option carries a Try-it (live) panel so the user can load A and B themselves; shots alone are not enough"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-063 #2, 2026-10-04 04:03Z, on PR-015).** A proposal posted to the console includes a Try-it panel
(`live`, I-074/I-093) for every option: A and B as real pages the user can open, built from the same snapshot copies the
shots came from. Screenshots and numbers stay, but they do not replace Try-it. An option that cannot be built (for
example "keep the original", where B = A) says so in its Try-it entry rather than leaving it out.

**Why.** The user asked for Try-it on PR-014 (T-062) and again on PR-015 (T-063) after both were posted without it; they
judge visual differences by loading the pages themselves, as with the swipe tests.

**How to apply.** Before `proposal post`, attach `--live-patch` (and `--live-a-patch` when A is not the plain baseline)
per option, or run `proposal live <id>` before telling the user. A patch stacked on another fix needs a baseline-relative
copy (`fix.mjs combine`), as rest-script-live did. The validator will enforce it once I-109 lands.
