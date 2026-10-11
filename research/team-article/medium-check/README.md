# medium-check: prove the Medium post matches the article

The article "Sixteen Milliseconds" lives in this repo as a Medium layout preview
(`research/team-article/artifacts/sixteen-milliseconds/index.html`, old versions in `versions/p1-vNN.html`). The owner
pastes it into Medium from the Medium kit (`out/article/medium-kit/`). The article will change again, so these scripts
turn "I think I updated Medium right" into a check that prints `CHECK CLEAN` or a list of what differs (owner's
request, console thread T-170 #330).

Everything runs locally with Node (no dependencies). Nothing logs in to Medium, and nothing goes over the network
except `check.mjs --url` (one public page, when the owner asks for it) and the kit builder's Google Fonts.

## The scripts and what each one proves

| file | what it does | what a pass proves |
|---|---|---|
| `model.mjs` + `lib/article.mjs` | article page → **article model** (JSON): title, subtitle, byline, disclaimer lines, then every block in order (paragraph, big/small heading, list item, quote/pull quote, separator, picture NN with file, caption and alt, clip NN with Stream uid, player params and caption), text normalized | nothing by itself; it is the reference every check compares against |
| `medium-dump.js` | browser-console snippet: the Medium draft or post → dump JSON (blocks in order, captions, image alt, every URL in an embed, a length + SHA-256 for the copy) | nothing by itself; read-only, story body only |
| `lib/medium.mjs` | dump JSON or a saved Medium page → the same model | |
| `check.mjs` | article model vs Medium model | title, subtitle, disclaimer exact; every block present, in order, same text, same heading level / quote kind / list kind / link targets; every picture present in order with the right caption and alt; every clip embedded with the right Stream uid and `loop/autoplay/muted=true`; no kit marker left (`[PICTURE`, `[CLIP`, `Caption:`, a Stream link left as text) |
| `changes.mjs` | article version A vs B → a to-do list for Medium in story order, plus the kit pictures to rebuild | which edits Medium needs, and which pictures changed (their `.cap-area` HTML, or a copied picture's src/size) |
| `kit/build.mjs`, `kit/render.mjs` | the kit builder (headless Chrome): `story.md`, `story.html`, `NN-*.png`, `alt.txt`, `kit.json`, `CHECKLIST.md`, `contact-sheet.html` | the kit matches the article it was built from |

Normalization (`lib/text.mjs`): curly/straight quotes, dash kinds, `...`/`…`, non-breaking, thin and zero-width
spaces and runs of whitespace count as equal, so Medium's smart punctuation never flags. Everything else counts.
What Medium's automatic punctuation did to a pasted draft (OBSERVED in the Medium editor, 11 Oct): straight quotes
to curly, a hyphen between digits to an en dash (also in file paths: `fixes/g0-0m/README.md` became
`fixes/g0–0m/README.md`), a spaced en dash to an em dash; each has a test (`test/alt.test.mjs`). Not covered: an
en dash that Medium turns into an em dash without the spaces around it ("a – b" read back as "a—b" would differ).

Alt text (`lib/alt.mjs`, `kit/alt-medium.json`): the page keeps its long aria-labels; for Medium, a picture whose
page alt is too long gets a short one (at most 480 characters, written from the figure's own content) from
`kit/alt-medium.json`, keyed by figure id. The kit (`alt.txt`, `kit.json`; the page's alt stays in `altPage`) and
the check read that same file, so a kit built before an edit of it shows up as `KIT` stale. Nothing cuts an alt any
more: the kit build refuses (exit 1, nothing written) an alt over 500 characters or one ending in a cut mark, and
`kit/render.mjs` alone re-applies the file to an existing `kit.json` (no Chrome) after it changed.

## After an article update: the owner's commands

From the repo root of the main checkout:

```sh
# 1. What changed since the version that is on Medium (e.g. 106), as a to-do list
node research/team-article/medium-check/changes.mjs --from 106          # versions/p1-v106.html -> index.html
#    (or any two files: changes.mjs <old.html> <new.html>)

# 2. Rebuild the kit (headless Chrome: only inside a chrome-measure hold, in the background)
node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- \
  node research/team-article/medium-check/kit/build.mjs
#    all pictures (about 15 s); "--only 05,13" re-captures only the pictures changes.mjs listed

# 3. Edit the Medium draft following the to-do list (pictures from out/article/medium-kit/, alt from alt.txt)

# 4. Dump the draft: open it in your browser, open the JavaScript console, paste the whole of
#    research/team-article/medium-check/medium-dump.js, press Enter. It copies one JSON text to the
#    clipboard; save it, e.g. as out/article/medium-dump-<date>.json (out/ is gitignored).

# 5. Check
node research/team-article/medium-check/check.mjs --dump out/article/medium-dump-<date>.json
#    last line CHECK CLEAN (exit 0) = done; CHECK FAIL <n> differences (exit 1) lists what to fix; repeat 4-5
```

The first time (a new story) is the same without step 1: build the kit, paste as `CHECKLIST.md` says, dump, check.

Other inputs for step 5: `--html <file>` reads a page saved with the browser's "Save Page As" (published post or
editor); `--url https://medium.com/...` fetches the published post once, with no cookies and no personal headers
(only when the owner wants it; earlier plain fetches of Medium got HTTP 403, then use the dump). Useful options:
`--list` (every picture and clip with its state), `--json`, `--kit <dir>` (default `out/article/medium-kit`, this
checkout first, then the main checkout; `--kit none` = no kit), `--no-links`, `--strict-alt`, `--allow-unproven`.

## Reading the check

The header lines count blocks, pictures and clips; then one line per difference, then notes that are not counted.

| type | meaning |
|---|---|
| `TITLE`, `SUBTITLE`, `DISCLAIMER` | not exactly the article's text (with a word diff), missing, or the disclaimer not italic |
| `MISSING`, `EXTRA`, `MOVED` | block in the article but not in Medium; in Medium but not in the article; in both, at another place |
| `TEXT` | same block, other words: `...context [-old-]{+new+} context...` |
| `KIND`, `LEVEL`, `PULL`, `LIST` | paragraph vs quote vs list item; big vs small heading; pull vs plain quote; bulleted vs numbered |
| `LINKS` | the block's link targets differ (Medium's `medium.com/r/?url=` wrapper and `source=` params are ignored) |
| `CAPTION`, `ALT`, `IMAGE` | a picture's caption or alt text differs or is missing; a figure without an image (or still uploading) |
| `CLIP-UID`, `CLIP-PARAMS` | the embed plays another Stream video; `loop/autoplay/muted` are not all `true` |
| `CLIP-UNPROVEN`, `CLIP-PARAMS?` | an embed is there, but no Stream address (or no player parameters) is visible in it: not wrong, not proven (see below) |
| `MARKER` | a kit line left in the story: `[PICTURE …]`, `[CLIP …]`, `Caption: …`, or a Stream link that was never turned into an embed |
| `KIT` | the kit does not match the article (rebuild it): its alt text would be wrong |
| `TRANSFER` | the dump file is not the text the page produced (a part lost or doubled while copying) |
| notes: `ALT-CUT` | the alt text in Medium is the first ~500 characters of the kit's: Medium's limit, the kept part matches (`--strict-alt` counts it) |
| notes: `PULL?`, `LEVEL?`, `ALT?`, `EMPTY` | the markup can't tell pull from plain quotes or big from small headings; alt compared without the kit; blank lines |

Blocks are paired in order by content (an alignment, so one missing paragraph does not shift everything after it).
Pictures are paired by order, caption and alt, never by bytes: Medium re-encodes every upload.

## What it cannot prove

- **The picture itself.** A wrong file uploaded under the right caption and alt passes. Look at the post next to
  `contact-sheet.html`; image hosts, sizes and order are in the dump if needed.
- **Inline formatting.** Bold, italic and code inside a paragraph are not compared (only whole-italic paragraphs,
  checked for the disclaimer lines). Internal links of the page (`#src-1`, "Day 8") are dropped on purpose.
- **That a clip plays.** The check proves which Stream uid the embed points at, when the address is visible in the
  page. In the editor the embed may be a `medium.com/media/<id>` frame; `medium-dump.js` then reads the provider
  frame inside it (same origin, no request), and for a saved published page the reader looks the id up in the page's
  data (`window.__APOLLO_STATE__`). If neither shows a Stream address, the clip is `CLIP-UNPROVEN`: play it and
  look. Whether Medium/Embedly keep `loop/autoplay/muted` from the pasted link at all is UNVERIFIED.
- **Story settings.** Tags, the preview image and text, the URL slug, publication and distribution are not read.
- **Medium's markup.** It is not documented. UNVERIFIED (not seen by this tool on a real Medium page): the editor's
  `graf graf--<kind>` classes and `.postArticle-content` root, the published page's `data-selectable-paragraph`,
  `h1.pw-post-title`, `.pw-subtitle-paragraph`, `role="separator"`, the `MediaResource:<id>` keys in
  `__APOLLO_STATE__`, and Medium's 500-character alt limit. OBSERVED by the earlier verifier
  (`research/team-article/medium/`, after its first run on a real draft, commit f6fd2934): the editor puts the title
  first, opens the story with a section divider and ends it with an empty `graf--trailing` line; this reader skips
  those three. When an assumption fails, the dump says so instead of guessing: `mode` is `generic` (no Medium
  classes found), the title is found "by position" (a warning), pull quotes and heading levels become notes, an
  embed without a visible address is `CLIP-UNPROVEN`. The first real dump should be read with `model.mjs --dump
  <file> --summary` and its counts compared with the article's.
- **Alt text without the kit.** The kit builder decides alt text in Chrome (one rule needs layout: a figure whose
  labels are all small inline labels gets its visible text). `lib/article.mjs` applies the same rule without layout
  and marks the uncertain cases; with `--kit none` those differ as notes (`ALT?`), not differences.
- **CSS-only changes in `changes.mjs`.** A picture is listed for rebuild when its own HTML changed. When the page's
  `<style>` or scripts changed, the list says so and asks for a full rebuild instead of guessing which pictures.

## The kit builder

`kit/build.mjs` and `kit/render.mjs` are the builder from the art-medium-kit session (it lived only in that
session's scratchpad), brought in with paths made configurable (`--page`, `--out`, `--gifs`), a `--only` option, a
`kit.json` for the checker, the SVG cut-off-text probe built in, and `CHECKLIST.md` notes generated from the data
instead of written by hand. It refuses to start Chrome outside a `chrome-measure` hold (Hard rule 7).
Checked on 2026-10-11 against the existing kit (built from the same article text): `story.md`, `story.html` and
`alt.txt` byte-identical; 40 of 43 pictures byte-identical; `02-fig-2.png` differs (an animation frame, expected),
`12-team-4.png` and `19-team-7.png` differ in bytes at the same size (not inspected further).

Drawn figures as clips (article v109): a `figure.cap` directly followed by a `p.mlink` (Medium embed line) is a
**clip**, not a picture, in both walkers (`lib/article.mjs` and the in-page walker of `kit/build.mjs`): caption from
its figcaption, description (`aria`) from the drawing's own aria-label (the canvas), clip name from
`research/article-clips/cf-stream-links.tsv` by the embed line's Stream uid (no name hard-coded; an unknown uid is a
warning). A `figure.cap` without an embed line stays a picture. Fig. 2 (the dots canvas) is the first: since v109 it
is clip 01 (`fig2-frame-rhythms-60fps`), so clips are numbered 01-20 and pictures 01-42; the builder no longer
freezes and captures the canvas (the 2x canvas and frame-freeze code is gone).

## Tests

```sh
node --test research/team-article/medium-check/test/              # all files (test/index.js loads them)
node --test 'research/team-article/medium-check/test/*.test.mjs'    # the same, file by file
```

Text-only fixtures (`test/fixtures/article-mini.html`, a 2-clip table; `article-capclip.html` with
`clips-capclip.tsv`, a drawn figure + embed line that becomes a clip, `test/capclip.test.mjs`): no Fastwork pictures or recordings. A fake
Medium page is rendered from the article model in two flavours (editor and published markup,
`test/helpers/fake-medium.mjs`), run through the real `medium-dump.js` and reader, and compared. A clean page passes;
seeded faults each fire their check: missing picture, changed word, wrong clip uid, missing autoplay, leftover marker
lines, caption/alt faults, alt cut at the limit, heading level, pull quote, list kind, a moved paragraph, title,
subtitle and disclaimer, link targets, an unproven clip, a cut dump file. `medium-dump.js` also runs end to end in a
fake browser context (its in-page SHA-256 equals Node's). `changes.mjs` is tested on the fixture and on the committed
versions (v104 → v105: one paragraph; v105 → v106: pictures 05 and 13 to rebuild, which matches that commit).

## Relation to `research/team-article/medium/`

That folder is the earlier verifier for the earlier Medium copy (`medium-copy.html` + `manifest.json`, a different
article build). It stays as it was. This folder checks the current article page and its kit.
