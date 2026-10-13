# Release tooling (I-268, I-269, I-270)

Scripts that build and set up the study's scrubbed public release (memory/public-release.md). Only the user pushes
the release repo and uploads its files; agents never push, add a remote, run `gh release create` or upload.

- `init.mjs` (`npm run init`, I-268): installs the large files the release repo does not carry.
- `rules.mjs`, `check.mjs` (I-269): scrub rules and the fail-closed residual checker.
- the packer (I-270): writes `release-assets.json`, read by `init.mjs`.

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
2. unpacks each file into a staging folder, refusing absolute paths, `..`, links and special files;
3. checks that the snapshot's `site/` and `site-pretty/` have exactly the git tree ids that `baseline.json` pins, the
   same check the tools run on every start;
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
