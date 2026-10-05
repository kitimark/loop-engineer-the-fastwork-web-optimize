# Medium writer: role and playbook

The study article goes to Medium as a draft. This page says who does that, how, and when it counts as done
(user T-170 #84). The rule in one line: **nobody says "done" without a `VERIFY PASS` line from the verifier.**

## Who

- **medium-writer**: a separate Claude Code session the user opened. It drives the user's own Chrome through
  Claude in Chrome. The lead talks to it with SendMessage, addressed as `medium-writer`.
- **The lead** gives the work, re-checks the result, and asks the user for the final look.
- **The user** logs in to Medium, approves permission prompts, and looks at the preview at the end.

## Inputs

All paths are in the main checkout.

| file | what it is |
|---|---|
| `out/lead/medium-visuals/medium-copy.html` | the source of truth: the article flattened for Medium, images inline |
| `out/lead/medium-visuals/manifest.json` | each image: file, section, the text it sits after, caption, alt |
| `out/lead/medium-visuals/v01-...png` to `v11-...gif` | the image files to paste |
| `out/lead/medium-audit/alt-short.json` | short alt texts for images whose alt is over Medium's 500-character cap |
| `research/team-article/index.html` | the article as a person reads it; for reference only |
| `research/team-article/medium/expected-summary.md` | what "complete" means: block counts, headings, every figure |

The copy is built by `research/team-article/capture/medium-visuals.mjs`. When the copy is rebuilt, regenerate
`expected-summary.md` (see the end of this page).

## Limits

- Never publish. Never schedule. The draft stays a draft.
- Never change the title, the URL slug, or the story settings (tags, preview, distribution).
- No personal data in the draft or in reports: no email, account name, address or device id.
- The user logs in. Never type or store a password.
- A permission prompt or a refusal is a stop sign. Stop and report it. Never route around it (another tab,
  another tool, a pasted script that does the same thing).

## How to put content in

- **Text:** paste from `medium-copy.html` opened in Chrome, one section at a time. Paste drops images and
  flattens tables, so check every list and figure after each paste.
- **Images:** paste the image file itself (a file URL on the macOS pasteboard). This is the method that works,
  and it keeps GIFs animated. The extension's file upload fails on Medium; don't use it.
- **GIF items:** v03, v09, v10 and v11 must be animated GIFs in the draft, not still images.
- **Captions:** type the manifest caption under each image. An empty caption is an error.
- **Alt text:** use the manifest alt, or the short one from `alt-short.json` where it exists (v02, v05, v07).
  Medium cuts alt text at 500 characters without a warning; the verifier reports that as `CUT`.
- **Lists after images:** v04, v07 and v08 keep their number list after the image. Keep them as lists.

## The working loop

1. **Plan.** Read the manifest and `expected-summary.md`. Write down the batches: one section, or 3 to 4
   figures, per batch.
2. **Edit one batch.** Small steps. Don't start the next batch before this one is checked.
3. **Snapshot.** Run `draft-snapshot.js` in the Medium editor tab (next section). Save the result as
   `out/lead/medium-audit/draft-<UTC>.json`, for example `draft-20261005T0430Z.json`.
4. **Verify.** In the main checkout:
   `node research/team-article/medium/medium-verify.mjs --draft out/lead/medium-audit/draft-<UTC>.json`
5. **Fix** what the table shows, then go back to step 3.
6. Repeat until the verifier prints `VERIFY PASS`.

## The snapshot script

`research/team-article/medium/draft-snapshot.js` is read-only. It makes no network call and changes nothing.
It reads the editor's blocks in order: headings, paragraphs, quotes, list items, figures (image host, size,
GIF or not, caption, alt), code blocks and dividers.

- Paste the whole file into the Claude in Chrome javascript tool, in the Medium editor tab.
- The first run may ask for permission. The user approves it. If it is refused, stop and report.
- It returns one JSON string. Save it unchanged to `out/lead/medium-audit/draft-<UTC>.json` (gitignored).
- The tool cuts a result at about 1,000 characters. Read it in parts: `window.__fwDraftSnapshot.length`, then
  `window.__fwDraftSnapshot.slice(0, 1000)`, `.slice(1000, 2000)` and so on. Join the parts exactly, with nothing
  added or dropped, and save.
- The result ends with `transfer` (length and SHA-256, computed in the page). The verifier checks it and prints
  `TRANSFER OK` or `TRANSFER MISMATCH`. A mismatch means a part was lost, doubled or changed: read the parts again.
- First run: check `root` and `counts` in the result. The script was tested on a Medium-like page, not yet on
  Medium's real editor. If `root` is `body`, or the counts are far from `expected-summary.md`, the editor's markup
  differs. Report it with the first 20 blocks; don't patch the script yourself.
- If the verifier's GIF column shows `?`, the script could not tell from the page. Report it; the user checks
  that image by eye. `--gif-unknown-ok` turns it into a warning only when the lead says so.

## Reading the verifier

States: `OK`, `MISSING` (not in the draft), `CHANGED` (text, block type or a figure part differs; the note has a
short diff), `EXTRA` (in the draft, not in the copy, such as a stray empty paragraph), `OUT-OF-ORDER` (right
block, wrong place). Figures also show image, caption, alt and GIF. Quotes, dashes and spaces that Medium
changes by itself don't count. The last line is `VERIFY PASS` or `VERIFY FAIL <n> issues`.

Two Medium habits are expected and not counted: the title comes first, with the "Educational study" banner
right after it, and Medium's own empty last line (class `graf--trailing`). Any other empty paragraph is `EXTRA`.

If Medium can't keep something else from the copy, don't hide it. Report the row, and the lead decides.

## Definition of done

Two confirmations, both needed:

1. The writer's verifier run on a fresh snapshot prints `VERIFY PASS`. The lead re-runs the verifier on the same
   snapshot file and gets the same line.
2. The user looks at the Medium preview and agrees.

Until both, the state is "in progress", never "done".

## Report format

Every report to the lead has three parts:

1. The verifier's table (or `--issues-only` when it is long), and its last line pasted as printed.
2. A short table of what is left:

   | item | state | what is left |
   |---|---|---|
   | v03 (pace GIF) | missing | paste the GIF after "My hints stopped being needed" |
   | "Who is on the team" list | wrong | list pasted as paragraphs |

3. The snapshot file name, so the lead can re-run the check.

Never write "done", "complete" or "all set" without the `VERIFY PASS` line in the same report.

## When Chrome or a permission blocks you

A hidden tab, a Grammarly frame, or a permission check can stop the work. Then:

1. Stop. Don't try a way around it.
2. Leave the draft stable: finish or undo the block you were in, so no half-pasted block is left. Medium saves by
   itself; wait until it says "Saved".
3. Take a snapshot if you can, and run the verifier.
4. Report exactly what blocked you (the message as shown), and the list of items still left from the table.

## For the lead: rebuild the expected list

After the copy changes, regenerate the checklist and commit it:

```sh
node research/team-article/medium/medium-verify.mjs --expected-summary > research/team-article/medium/expected-summary.md
node research/team-article/medium/selftest.mjs     # the verifier's own test, on the fixtures next to it
```
