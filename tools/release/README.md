# Release tooling (I-268, I-269, I-270)

Scripts that build and set up the study's scrubbed public release (memory/public-release.md). Only the user pushes
the release repo and uploads its files; agents never push, add a remote, run `gh release create` or upload.

- `init.mjs` (`npm run init`, I-268): installs the large files the release repo does not carry.
- `rules.mjs`, `check.mjs` (I-269): scrub rules and the fail-closed residual checker.
- the packer (I-270): writes `release-assets.json`, read by `init.mjs`.
- `outgoing.mjs`: the scrub check `.githooks/pre-push` runs on every push of this repo (only the user pushes, user
  2026-10-13); by hand `node tools/release/outgoing.mjs [--remote origin] [<range>]` lists and checks unpushed commits.
  It refuses tags (and deletes, non-fast-forwards, merge commits): make release tags on GitHub, not by pushing them.
  What it cannot stop: `git push --no-verify` (or `-c core.hooksPath=…`), a known values file pointed elsewhere
  (`FW_RELEASE_KNOWN`, `--known`), and a clone where `core.hooksPath` is not set to `.githooks` (`npm run setup`):
  those push unchecked, so the check is a guard for the user's own pushes, not a lock. It decodes only `data:image/…` and
  `data:application/octet-stream` URIs (as `imagemeta.mjs` dataImages reads them; their runs are checked by the release
  packer's history rule, a refused run of 100+ characters refused, and every run's text and bytes scanned for known
  values). What it does not see: values encoded any other way inside a text file (`data:video/…`, `data:text/…;base64`,
  `data:application/json` and other URIs, bare base64 or hex runs, a text compressed before committing), and pictures
  it cannot read (only the formats `imagemeta.mjs` reads pass). It only blocks: it never
  fixes a commit (rebase it). It asks the remote what it has (`git ls-remote`): over ssh a passphrase or host-key
  prompt can stall it, and an unreachable remote refuses the push. A binary file passes only pinned in the known
  values file: `"allowBinary": [{"path": "<glob>", "sha256": "<hex>", "reason": "…"}]` (or `"blob": "<git blob id>"`);
  the text `allow` entries never exempt a binary.

## Getting started (text for the release README; the lead merges it)

The frozen fastwork.com snapshot the study measured (`site/`, `site-pretty/`) and the reviewed pictures and videos
are not in this repository's history. They are files of the GitHub Release `<tag>`, listed with their size and
SHA-256 in `tools/release/release-assets.json`. One command fetches and checks them:

```sh
git clone https://github.com/<owner>/<repo>.git && cd <repo>
npm run init        # Node >= 22, git and tar; no other dependencies, no GitHub login
```

`npm run init` (not `npm init`, which is npm's own command):

1. downloads every file from `https://github.com/<owner>/<repo>/releases/download/<tag>/<name>` into
   `out/release-init/downloads/` and checks its size and SHA-256;
2. unpacks each file into a staging folder, refusing (from the archive listing, before extracting) absolute paths,
   `..`, anything under a `.git` folder, links and special files;
3. checks that the snapshot's `site/` and `site-pretty/` have exactly the git tree ids that `baseline.json` pins, the
   same check the tools run on every start. The release redacts secret-shaped values in the snapshot (third-party keys
   in vendored code, `[secret omitted: <rule>]`); `release-assets.json` lists each such file with its original and
   redacted git blob ids, and a listed file counts as its original blob, so the pin still matches (a listed file that
   holds its original bytes counts as is). Any other difference, or a listed file that is neither, fails;
4. refuses to overwrite a file with other content, then moves everything into place.

Any failed check stops it with `INIT FAILED: …` and a non-zero exit before anything is installed; fix what it names
and run it again (good downloads are reused). A second run skips what is already in place.

Offline, or with the files downloaded by hand: `node tools/release/init.mjs --from <folder with the release files>`.
`--dry-run` prints what it would fetch; `--repo <owner>/<repo>` overrides the repository in `release-assets.json`.

Afterwards `node tools/baseline.mjs status` reports `state ok` and `read from <checkout> (untracked, verified)`:
the snapshot is not tracked by git here, so the tools hash it as git would and compare it with `baseline.json`
(cached by file stats, so later checks only stat its files). Any changed, added or deleted file reads as
`BASELINE-MODIFIED`; remove `site/` and `site-pretty/` and run `npm run init` again to restore them.

## Notes for the packer (I-270)

- The release repo's `.gitignore` should list `/site/` and `/site-pretty/` (as the test fixture does), so the unpacked
  snapshot never shows up in `git status`. Without it `init.mjs` adds both to `.git/info/exclude` (local) when HEAD
  does not track them, so `git status` and the scope guard (`npm run test:unit`) stay clean either way.
- The snapshot file must hold exactly the committed trees `site/` and `site-pretty/` at its root (`unpackTo: "."`),
  e.g. `git archive --format=tar <snapshot commit> site site-pretty | gzip -n`, or tar with `COPYFILE_DISABLE=1` on
  macOS: the snapshot files carry extended attributes, and AppleDouble `._*` entries would change the tree ids (init
  then fails closed with `SNAPSHOT-MISMATCH`). Files the tools write and `.gitignore` drops
  (`.mirror/missing-local.txt`, `.mirror/chrome-profile/`, `.DS_Store`) do not count either way.
- Media and data files may unpack anywhere in the checkout except under `site/` and `site-pretty/`; two files may not
  hold the same path.
- What ships from `out/` (`pack.mjs`): `out/lead` and `out/tryit` only as far as the committed write-ups (`research/`,
  `fixes/`, `memory/`, README files at HEAD) cite a file by path; `out/article` as far as they cite a file or a folder
  (every file in it); `out/lead/medium-images` and `out/lead/medium-visuals` whole. Pictures and videos of the last
  three go into `out-media.tar` through the picture check, their other files into `out-data.tar.gz` under the text
  rules. Never `*.log`, keys, SQLite files,
  cookie/login stores, `.DS_Store` or AppleDouble `._*` files. A cited `out/` path that does not exist is a broken link
  in the published text: the build reports it (`CITED-MISSING`, the paths in the scrub report) and lists it in
  `LOST-FILES.md` at the release repo's root (pictures and videos first, paths only, scrubbed). No archive carries
  xattrs, ACLs or Apple metadata (tar `--no-xattrs --no-acls --no-mac-metadata`, `COPYFILE_DISABLE=1`); the build reads
  every archive's headers and is not ready on a hit (`TAR-META`). Pictures lose their metadata (PNG and GIF losslessly); a JPEG, AVIF or WebP with XMP, IPTC, GPS,
  camera, owner or other non-pixel EXIF data is refused and the build is not ready (`imagemeta.mjs`). Pictures embedded
  in a shipped text file as `data:image/...;base64` URIs (JSON's `data:image\/png` form too) get the same check
  (`<file>#data-N`): stripped in place, or refused with the file left out; an SVG `data:` URI's decoded text is
  literal-scanned, and any other non-base64, unparsed or undecodable `data:image` and an octet-stream run holding a
  picture are refused. The review sheet lists each with its OCR result.
- The same picture policy covers the release repo's git history (`build.mjs`, `pack.mjs` `historyPictures`), check
  only (history is never stripped): every picture and video blob reachable from a ref (by name or magic bytes) and
  every `data:` URI in a text blob; unreachable blobs are never pushed and only counted. A picture that would need a
  strip or is refused, a video with tags beyond the encoder, or a base64 run of 100+ characters that does not decode
  to a picture this reads makes the build not ready (`HISTORY-PICTURE-REFUSED`); shorter runs (examples,
  placeholders) and unparsed mentions are noted in the scrub report, except that a short run whose text or decoded
  bytes hold a known value is refused (`known-value-in-data-uri`); clean ones go on the review sheet as
  `git:<path>@<blob>[#data-N]`. `HISTORY-PICTURES` gives the pass's wall time.
- The release's snapshot is not byte for byte the study's: its vendored third-party files with secret-shaped values
  (for the snapshot pinned today, 4 Google gtag/gtm files under `__vendor/www.googletagmanager.com/`, in `site/` and
  `site-pretty/`) ship with those values replaced by `[secret omitted: <rule>]`, and `release-assets.json` lists each
  (`redacted`). The pin still verifies (see step 3 above). Served with `--vendors=local`, those scripts run redacted,
  so console errors and requests may differ from the study's own runs; results measured on a release checkout are not
  the study's numbers.
