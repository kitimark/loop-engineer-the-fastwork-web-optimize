# Baseline snapshots: freeze the build we measure

`arch-snapshot`, 2026-10-01. Read-only research note; no code, devices or locks were touched. The user asked
how we snapshot fastwork.com and store it here, and how to keep a new live build from breaking the experiments.
Confidence tags: **fact** (checked in this repo today), **spec/vendor doc** (cited), **inference** (mine).

## Recommendation (read this first)

1. **Make a baseline an immutable, named snapshot, and pin it in git.** Snapshots live outside the work tree in
   the shared git dir (`.git/fastwork-mirror/snapshots/<id>/{SNAPSHOT.json,site/,site-pretty/}`, next to
   locks, incidents and findings). They are sealed read-only (`chmod -R a-w`) and never modified after creation.
   A committed pin file `baseline.json` (snapshot id plus content hashes, no Fastwork bytes) says which snapshot
   a branch targets. Tools resolve `site`/`site-pretty` through the pin of *their own checkout*. A worktree
   created before a pin switch keeps measuring the old snapshot until it rebases.
2. **`mirror.mjs` only ever creates a new snapshot.** It writes into a staging dir, refuses to seal an
   incomplete crawl, and makes the snapshot visible with one atomic `rename`. When the content is identical to
   an existing snapshot it reports `UNCHANGED`. It never touches the pinned snapshot, `site/` or `site-pretty/`.
   Taking a snapshot is then harmless at any time. Switching the pin is a separate, explicit lead/user commit.
3. **Pin Prettier to an exact version.** `site-pretty/` is part of the snapshot identity: every `patch.diff`
   is a diff against it.
4. **Detect, don't guess.** Every tool checks at start that the pinned snapshot exists and that its manifest
   hash matches (milliseconds). `ab`/`bench` re-hash all files (about 60 MB, well under a second, inference).
   Each patch and result records the snapshot id. On a mismatch the tools refuse with a message that names
   the fix (`BASELINE MISSING|CORRUPT|MISMATCH`).
5. **Stay on today's build (S1) for the rest of the study** (decision D1). Take new snapshots freely as
   observations. Move to S2 only between waves, after `fix.mjs rebase-baseline --all --dry-run` shows what
   survives.

The first step (`baseline.mjs adopt`: copy today's baseline into the store as S1 and print the pin) only reads
the shared baseline. It is safe to land while agents measure (§6).

## 1. What the baseline is today (facts)

- `site/` is 29 MB with 264 files (251 in the manifest plus 9 vendor scripts and `.mirror/`). `site-pretty/` is
  31 MB. About 26.5 MB of each is images and fonts, so `site-pretty/` stores the same binaries twice. The disk
  is APFS with 80 GB free.
- Build id: `_app/version.json` = `{"version":"1789284481295"}`. That is SvelteKit's default `version.name`,
  "a timestamp of the build" ([SvelteKit config](https://svelte.dev/docs/kit/configuration), vendor doc), here
  2026-09-13 07:28 UTC. It is a good human-readable build id.
- `mirror.mjs` updates `site/` **in place**, like `wget --mirror` (`-r -N`, re-fetch when newer, overwrite;
  [GNU Wget manual](https://www.gnu.org/software/wget/manual/wget.html), vendor doc). Hashed files are cached by
  path, and `index.html`, `version.json`, `analytics.js`, `robots.txt` and the webmanifest are revalidated and
  overwritten. Old hashed files stay. `manifest.json` is a union over every run (entries are never dropped) and
  carries `lastRun`/`fetchedAt` timestamps.
- `prettify.mjs` runs `rm -rf site-pretty`, copies `site/`, then runs `npx prettier@3` (the newest 3.x at run
  time). The npx cache on this machine holds **Prettier 3.5.0, 3.8.1 and 3.9.9**. Prettier itself warns that
  "even a patch release … can result in slightly different formatting" and recommends exact pins
  ([Prettier install](https://prettier.io/docs/install), vendor doc).
- 15 `patch.diff`s on this branch touch only three files: `nodes/2.DyWL8TcE.js` (13), `assets/2.gBuqKVzi.css`
  (8) and `analytics.js` (1). Each one records `# base-sha256 <path> <sha>` per file. All of them match today's
  `site-pretty/` (`4606120c…`, `27776f3d…`, `a2ceb977…`), except the two stacked patches, whose header shas
  name the `all-wave1` overlay. So every existing patch can be attributed to S1 automatically.
- `results.json` records `config.baseline: "site-pretty"` (a name, not an identity). `bench.mjs` records
  `baselineManifest` = sha256 of `site/.mirror/manifest.json` (first 16 hex digits). That hash changes on
  *every* mirror run, because of `lastRun`/`fetchedAt`, even when no byte changed.
- `serve.mjs` appends 404s to `site/.mirror/missing-local.txt` (last write 13:17 today), so the baseline is
  not strictly read-only even now.
- Docs in `fixes/` and `research/` mention `DyWL8TcE` 3,143 times in 170 files, with line numbers into S1's
  pretty file. That is history. It stays correct as long as it is read against S1.

## 2. What breaks today if the user re-mirrors after a new deploy

A new SvelteKit/Vite build renames every changed file (content hash), and the change cascades: a chunk that
imports a renamed chunk changes too ([vite#6773](https://github.com/vitejs/vite/issues/6773), bug report).
`nodes/2.*.js`, `assets/2.*.css` and the entry files get new names, and minifier names (`iE`, `dE`, `T`) may
be reassigned. Svelte's scoped classes `svelte-<hash>` are `hash(filename ?? css)`
([Svelte compiler](https://svelte.dev/docs/svelte/svelte-compiler), vendor doc), and they were content-based
in builds before [svelte#16636](https://github.com/sveltejs/svelte/issues/16636) (closed via #16740, bug
report). They can change with the CSS.

| what | failure | loud or silent |
|---|---|---|
| **Overlays** | The overlay still holds `nodes/2.DyWL8TcE.js`. The new `index.html` imports `nodes/2.<new>.js`, so the fix is **never loaded**. `fix.mjs ab`'s served-file check still passes, because it fetches the overlay path directly and the old file still exists in `site/`. The A/B reports "within noise". | **silent, wrong verdict** |
| **patch.diff / apply / combine** (`all-wave1`, `aw1-10c` = `all-wave1` + `scroll-engine`, stacked `se10c-aw1`, `vendor-scrollend`) | `git apply` targets the old path, which still exists, so every patch applies "OK" and builds an overlay the page ignores. `analytics.js` (unhashed) is overwritten, so `vendor-scrollend` either conflicts or silently lands on new code. | mostly **silent** |
| **bench BASELINE-CHANGED** (Q7) | `baselineDrift` compares `base-sha256` against the *old path*, which is unchanged, so a new build gives **no drift** (false negative). The patched expectations then fail as FAIL/VACUOUS. A re-prettify with a different Prettier 3.x reformats everything, so **all** patches drift even though production is unchanged (false positive). `baselineManifest` changes on every run. | wrong verdicts both ways |
| **results.json comparability** | Nothing records which build a result ran on. Results from before and after a re-mirror look comparable. | silent |
| **Mixed baseline mid-update** | Until `prettify.mjs` runs, `site/` has the new `index.html` and manifest (`Link: modulepreload` header for the *new* chunks) while `site-pretty/` serves the old `index.html`. `serve --root site-pretty` takes headers from `site/` and files from `site-pretty/`, i.e. two builds at once. During `prettify.mjs`, `site-pretty/` is missing or unformatted (`rm -rf` then copy then format). | silent or 404s |
| **Agents mid-experiment** | `serve.mjs` caches by mtime/size and re-reads changed files, so an A/B can switch builds between runs 2 and 3. `fix.mjs edit/diff` mid-update copies or diffs against a half-updated tree (a re-prettify turns a 20-line patch into a whole-file diff). Fix owners' line references (`fix.mjs show --lines`) shift. | silent contamination |
| **Serena** | It indexes `site-pretty/_app/**` (`jsconfig.json`). After a re-mirror both builds sit side by side, so `find_symbol` returns duplicates across builds. The `hot_code_map` memory's lines and minified names point at S1. The cache is stale until `serena project index`. | misleading navigation |
| **Bench specs** | Probe selectors that use `svelte-<hash>` classes or minified receiver names stop matching, and Tier A turns VACUOUS. (No `bench.json` is committed yet, so the cheapest fix is a lint rule now: no `svelte-` hashes or minified names in selectors.) | VACUOUS/FAIL |
| **Vendors** | `gtm.js?id=…` keeps its URL while the content changes. Vendor files are cached by URL, so they come from another date than the first-party build unless you use `--refresh`, which then overwrites in place. | silent drift of `--vendors=local` cost |
| **Partial crawl** | `index.html` is fetched first and written at once. A 429/5xx returns `null` ("not retrying this run"). Network errors are logged and skipped, and the manifest is saved per round. **Exit code is 0.** The result is a new `index.html` that references chunks that never arrived: hydration fails, `morphReached` turns false, and S1's `index.html` is gone for good (it is unhashed and was overwritten). | looks like success |

The irreplaceable part of a build is its **unhashed entry points** (`index.html`, `version.json`, `analytics.js`,
`manifest.json`). Today the first re-mirror destroys them, so S1 cannot be reconstructed afterwards.

## 3. Design

### 3.1 Options compared

| option | immutability | worktrees | cost | verdict |
|---|---|---|---|---|
| A. today: in-place `site/` | none | shared, mutable | 60 MB | the cause of §2 |
| B. `site-<build>/` dirs in the main checkout | by convention | must be named everywhere | 60 MB each | weak: easy to `git add`, Serena/jsconfig globs pick them up |
| C. **snapshot store in the git common dir** + committed pin + read-only seal | `chmod a-w` + manifest hash | resolved per checkout via its own pin | ~4-6 MB unique per snapshot with APFS clones (inference) | **recommended** |
| D. content-addressed object store (`objects/ab/<sha256>` + per-snapshot tree manifest, git/Nix style) | strong | same as C | minimal | more code: serve and fix need a materialized tree anyway. C gets ~the same dedup from clones |
| E. WARC files (ISO 28500: request/response records, `WARC-Payload-Digest`, `revisit` records for dedup; [WARC 1.1](https://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/), spec) | strong | needs a replay server | small | the archival standard, but serve/fix/Serena need plain files. Borrow two ideas: store headers with the payload digest (already in our manifest), and dedup unchanged payloads |

Standard practice behind C (all of these support the design; the mapping to this repo is my inference):
- Nix: immutable store objects whose path embeds a digest; profiles switch by atomically re-pointing a link;
  GC roots keep referenced paths alive ([Nix store](https://nix.dev/manual/nix/2.24/store/),
  [store path](https://nix.dev/manual/nix/2.24/store/store-path), vendor doc).
- git: content-addressed blobs, and a small committed pointer that names immutable content (our `baseline.json`).
- SvelteKit itself: `_app/immutable/*` is content-hashed "so that your assets can be cached forever"
  ([SvelteKit performance](https://svelte.dev/docs/kit/performance), vendor doc). Hashed files never change
  under a name; only the entry points do. A snapshot only has to freeze the entry points plus the closure
  they reference.
- POSIX `rename`: the target name "shall remain visible … and refer either to the file referred to by *new* or
  *old*", and renaming onto a non-empty directory fails
  ([POSIX rename](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html), spec). This gives
  you an atomic publish and a natural "never overwrite".

### 3.2 Layout and identity

```
<git-common-dir>/fastwork-mirror/snapshots/        ($FW_SNAPSHOT_STORE overrides, e.g. a sibling dir)
  b1789284481295-3fa2c19d/                          id = b<version.json name>-<contentHash[0:8]>
    SNAPSHOT.json   {id, build, origin, crawledAt, mirrorToolSha, prettier: "3.x.y" (exact),
                     contentHash, prettyHash, complete: true, files: {path: {sha256, size, type,
                     cacheControl, link, csp}}, vendors: {...}, missing: {...}}
    site/           byte-identical; site/.mirror/manifest.json kept so serve.mjs works unchanged
    site-pretty/    formatted with the pinned Prettier
  .staging-<pid>-<ts>/                              never read by tools; .failed-<ts>/ after an incomplete crawl
<git-common-dir>/fastwork-mirror/missing-local/<id>.txt    serve.mjs's 404 log, moved OUT of the snapshot
```

- **`contentHash`** = sha256 of the sorted lines `path \t sha256 \t type \t cacheControl \t link \t csp` for
  every served file, vendors included. These are exactly the bytes and headers `serve.mjs` replays. It
  excludes `lastRun`, `fetchedAt`, `etag` and `crawl.json`, so re-taking an identical build yields the same
  id. **`prettyHash`** is the same over `site-pretty/` plus the Prettier version. It replaces
  `baselineManifest`.
- The snapshot holds **only the closure of one crawl**, not a union, so Serena sees one build.
- Dedup: build the snapshot by cloning unchanged files from the previous one, and `site-pretty/`'s binaries
  from `site/`, with `copyFileSync(…, COPYFILE_FICLONE)` (copy-on-write reflink, falls back to a real copy;
  [Node fs](https://nodejs.org/api/fs.html), vendor doc) or `cp -c` (clonefile(2), macOS `man cp`). Don't use
  hardlinks: they share one inode, so one accidental `chmod u+w` and write corrupts every snapshot. Clones
  are independent. An S2 with unchanged images then costs ~3-5 MB (inference from the 26.5 MB binary share).
- Why the git common dir: every worktree already finds it (`sharedStateDir()`). It is outside the work tree,
  so it cannot be `git add`ed, and it is outside Serena, Prettier and jsconfig globs. `git clean -fdx`
  doesn't touch it. The risk: deleting or re-cloning `.git` loses it, so keep an optional `tar` backup (D2).
  `git gc` only manages git's own objects/refs/logs (inference, medium confidence: verify once with a
  `git gc` on a scratch clone).

### 3.3 The pin: `baseline.json` (committed, tiny, no Fastwork content)

```json
{ "snapshot": "b1789284481295-3fa2c19d", "build": "1789284481295",
  "contentHash": "<64 hex>", "prettyHash": "<64 hex>", "prettier": "3.x.y",
  "pinnedAt": "2026-10-0xT..Z", "note": "S1: the 2026-09-30 mirror; all wave-1/2 work targets it" }
```

- Each checkout resolves `site`/`site-pretty` via **its own** `baseline.json`. `FW_MIRROR_HOME` keeps working
  for tests. `FW_SNAPSHOT=<id>` is a deliberate per-command override (rebase-baseline, cross-build A/A).
- `fix.mjs diff` adds `# baseline-snapshot <id> <prettyHash[0:12]>` to every patch header. `results.json`,
  `bench-results.json` and `verify.mjs` output add `baseline: {snapshot, contentHash, prettyHash}`. Old
  patches without the line are attributed by their `base-sha256` lines (all 15 resolve to S1, §1).
- The main checkout's `site/` and `site-pretty/` become **symlinks** onto the pinned snapshot. That keeps the
  user's port-5173 server, human browsing, Serena paths and `jsconfig.json` unchanged. If Serena/LSP
  mishandles a symlinked dir (unverified), fall back to a read-only APFS clone of the snapshot (D3).
  **Caveat (fact, [gitignore](https://git-scm.com/docs/gitignore), vendor doc):** `site/` "will not match a
  regular file or a symbolic link `foo`". `.gitignore` must become `/site` and `/site-pretty` (no trailing
  slash), and the pre-commit `FORBIDDEN` list needs `^site$`/`^site-pretty$`. Otherwise `git add -A` stages the
  symlink.

### 3.4 Read-only enforcement

- Seal: files `0444`, dirs `0555`. The Edit tool, `prettify.mjs`'s `rm -rf` and `serve.mjs`'s
  `appendFileSync` all fail with EACCES. (serve swallows that error, which is why `missing-local` must move
  first.) A process can still `chmod` it back, so this guards against accidents, not malice. The manifest
  hash covers the rest. An optional `chflags uchg` on the pinned snapshot is stronger but blocks even the
  owner's `rm` until it is cleared.
- Enforcement layer (user edits): deny `Edit(/.git/fastwork-mirror/snapshots/**)` in `.claude/settings.json`;
  `mirror.mjs` keeps its "ask" rule.

## 4. Guard rails: what every tool checks at start

Order: cheap checks always (`fix`, `serve`, `bench`, `verify`, `iphone` URL helpers). The full re-hash runs in
`fix.mjs ab`, `bench` and `baseline.mjs verify`, before taking the lock.

| check | message (exit) |
|---|---|
| `baseline.json` present | `BASELINE UNPINNED: no baseline.json in <checkout>; using legacy <path>. Pin it: node tools/baseline.mjs adopt` (warning in phase 1, exit 2 from phase 3) |
| pinned dir exists and `complete:true` | `BASELINE MISSING: baseline.json pins <id>, not in <store>. Available: <ids>. Report an incident (class baseline); do not re-mirror.` (1) |
| `SNAPSHOT.json` hash = pin; full mode: every file's sha = manifest | `BASELINE CORRUPT: <id> differs from its pin (n files, first: <path>). Do not measure; tell the lead.` (1) |
| patch header snapshot = pin (`ab`, `serve`, `apply`, `combine`, `bench`) | `BASELINE MISMATCH: fixes/<t>/patch.diff targets <S1>, this checkout pins <S2>. Re-port: node tools/fix.mjs rebase-baseline <t> --to <S2>, or measure on S1 with FW_SNAPSHOT=<S1>.` (2); bench prints `BASELINE-CHANGED`, keyed on the snapshot id instead of per-file shas |
| main checkout: `site` symlink target = pin | `WARN: main checkout's site/ points at <X>, pin is <Y>: node tools/baseline.mjs link` |
| `serve.mjs` | `realpath` the root once at startup, so the server keeps one snapshot for its lifetime even if the symlink is switched under it |

Guarantees: creating a snapshot changes nothing for anyone. Switching the pin on `main` affects a worktree
only when it rebases, and then its old patches are flagged, not silently no-op'd. A half-failed crawl never
becomes a snapshot.

### `mirror.mjs` and `prettify.mjs` as snapshot writers

1. Seed the staging dir by cloning cached immutable files from the pinned (or newest) snapshot. That keeps
   today's politeness ("hashed files are never re-fetched"). Revalidate the unhashed entry points with the
   previous ETags.
2. **Completeness gate:** every resource referenced by the new `index.html`/JS/CSS closure returned 200.
   Any 429/5xx/network error means: keep `.failed-<ts>`, print `INCOMPLETE: n of m resources failed (first:
   …); no snapshot created; the pin is unchanged`, exit 1.
3. Compute `contentHash`. If a snapshot with it exists: `UNCHANGED: live build <v> is snapshot <id>`, drop
   the staging dir, exit 0.
4. Prettify inside the staging dir with the exact pinned Prettier (offline npx cache). Write
   `SNAPSHOT.json`, seal, `rename` to `<id>` (atomic, refuses to overwrite).
   Print: `NEW SNAPSHOT <id> (build <v>). Pinned: <old> (unchanged). Preview the impact: node tools/fix.mjs
   rebase-baseline --all --to <id> --dry-run`.
5. `--crawl` launches Chrome: run it only while no one holds `chrome-measure` (Hard rule 7), or under the lock
   in the short lane. The static pass is network-only.

## 5. Migration S1 → S2: `fix.mjs rebase-baseline <topic>|--all --to <S2> [--dry-run]`

1. **Map each patched file S1 → S2.**
   - (a) same path and sha in S2: IDENTICAL.
   - (b) unhashed path (`analytics.js`, `index.html`) with a different sha: merge.
   - (c) Vite name `<name>.<hash>.<ext>`: strip the hash to a logical key (`nodes/2.*.js`, `assets/2.*.css`,
     `entry/app.*.js`). Route node numbers stay stable while the route tree is unchanged (inference).
   - (d) hash-only chunk names (`chunks/BSBv9QXB.js`): first by import-graph position (which node/entry
     imports it), then by similarity. Use Jaccard over token shingles after normalizing short identifiers
     (≤ 3 chars → `_`), so minifier renames don't hide a match. Accept at ≥ 0.5 and a margin of ≥ 0.15 over
     the runner-up, else AMBIGUOUS (thresholds are a starting point, inference).
2. **Three-way merge per file:** `git merge-file -p <S2 file> <S1 file> <S1 + patch>` incorporates "all
   changes that lead from <base> to <other> into <current>" and brackets conflicts with markers. It needs no
   repository ([git merge-file](https://git-scm.com/docs/git-merge-file), vendor doc). `git apply --3way`
   doesn't work here: our diffs carry no blob `index` lines.
3. **Report per topic:** `IDENTICAL` (re-header only), `MOVED` (path change only), `MERGED` (applies;
   **re-measure required**), `CONFLICT` (the owner re-ports; conflict files go into a gitignored
   `fixes/<t>/overlay-<S2>/`), `GONE` (no counterpart: the code was removed or rewritten upstream).
   Expect most `nodes/2` JS hunks to conflict whenever their module changed, because minified names get
   reassigned. CSS hunks merge more often (inference).
4. **Order:** landed base topics in landing order, then re-`combine` the waves (`all-wave1`, `aw1-10c`), then
   the stacked patches (`se10c-aw1`, `vendor-scrollend`) merged against the *new* combined overlay.
5. **Never overwrite S1 artifacts.** The S2 patch is a new commit with `# baseline-snapshot S2`. S1
   `results.json` stays as history, tagged S1. No S2 claim without a fresh `ab` on S2. Serena: re-index, and
   the user or lead re-checks `hot_code_map` (add a `snapshot:` header line to that memory).

## 6. Implementation plan for a toolsmith (ranked; test-first, separate commits, Hard rule 6)

Effort: S ≈ 1-2 toolsmith hours, M ≈ half a day.

| # | step | effort | safe while agents work? | measurement-adjacent? |
|---|---|---|---|---|
| 1 | `tools/lib/snapshot.mjs` (canonical `contentHash`/`prettyHash`, read/verify `SNAPSHOT.json`, seal) + `tools/baseline.mjs status\|verify\|adopt`. `adopt` **clones** today's `site/`+`site-pretty/` into the store as S1, seals it and prints `baseline.json`. It only reads the live baseline: no change to `site/` or to tool resolution. Also identify which cached Prettier (3.5.0/3.8.1/3.9.9) reproduces `site-pretty/` byte for byte (short lane, CPU) and record it. Tests on the fixture baseline: hash stable across `lastRun`/`fetchedAt` changes, changes on one byte or one header; refuses to overwrite an existing id; mode bits after seal. | S | **yes** (≈60 MB of clone I/O, sub-second, inference) | no |
| 2 | Record identity: `results.json`/`verify` output/`bench-results.json` get `baseline:{snapshot,contentHash,prettyHash}`; `bench.mjs`'s `baselineManifest` becomes `contentHash`; `fix.mjs diff` writes `# baseline-snapshot`. Metadata only, numbers unchanged. | S | yes | `fix.mjs ab`/`bench` metadata: call it out per rule 6 (no comparability impact) |
| 3 | `mirror.mjs` → staging + completeness gate + `UNCHANGED` + atomic publish, never touching `site/`; `prettify.mjs` → exact Prettier, writes only into staging. Extend the existing e2e mirror test with a fixture origin serving build v1, then v2 (new dir, v1 untouched), and v3 with one chunk returning 500 (exit 1, no snapshot). | M | yes once landed: from then on the user may mirror any time | no (network only) |
| 4 | Resolution through the pin in `paths.mjs` + the §4 checks in fix/serve/bench/verify; `serve.mjs` realpaths its root and writes `missing-local` outside the snapshot; MISMATCH refusal. Warn-only for UNPINNED first. | M | land **between holds** (lead announces a rebase) | **yes, `serve.mjs`**: served bytes must not change. `npm run test:chrome` plus one `ab --aa` before/after |
| 5 | Main checkout: `baseline.mjs link` (atomic symlink swap via a temp link + `rename`); `.gitignore` `/site` `/site-pretty`; pre-commit `^site$`; settings deny rule; Serena check (follows symlink? else clones). | S | the user runs it in a quiet window | no (enforcement edits ask the user) |
| 6 | `fix.mjs rebase-baseline` (§5) with `--dry-run --all` report. Fixture tests: IDENTICAL, MOVED (renamed hash), MERGED, CONFLICT, GONE, stacked order. | M-L | yes (writes only `fixes/<t>/overlay-<S2>/`) | no |
| 7 | `baseline.mjs gc --keep 3` (never deletes a snapshot named by `baseline.json` on any local ref: GC roots via `git for-each-ref` + `git show <ref>:baseline.json`); `baseline.mjs check-live` = one polite GET of `/_app/version.json` that says whether live moved past the pin (no mirror). UNPINNED becomes an error. | S | yes | no |

Steps 1-2 alone already fix the silent failures for *future* evidence: every result says which build it ran
on. Step 3 makes re-mirroring harmless. Until step 3 lands, **the user must not run `mirror.mjs` or
`prettify.mjs`** (as today, Hard rule 4).

## 7. What the user does once

1. Until step 3 lands: don't run `mirror.mjs`/`prettify.mjs` (unchanged rule; the reason is now concrete, §2).
2. After step 1: let the lead commit `baseline.json` (S1) on `main`. Optionally back up the store:
   `tar -C .git/fastwork-mirror -czf ~/fastwork-snapshots-S1.tgz snapshots` (it stays on this machine).
3. Step 5, in a quiet window: approve the `.gitignore`/hook/settings edits and run `node tools/baseline.mjs
   link`. Restart the port-5173 server. Reconnect or re-index Serena.
4. Whenever curious: `node tools/mirror.mjs` creates S2 without affecting anyone, and `rebase-baseline --all
   --dry-run` shows the impact. Switching the pin is a deliberate commit by the lead, between waves.

## 8. Decisions for the user

- **D1 (main):** freeze S1 for the study (recommended: all evidence, 3,143 doc references and both waves target
  it) **or** follow live builds (each switch costs a re-port of conflicting JS patches plus a full re-bench).
- **D2:** store in `.git/fastwork-mirror/snapshots/` (recommended; lost with `.git`, so back it up) or a
  sibling directory outside the repo via `$FW_SNAPSHOT_STORE` (survives a re-clone).
- **D3:** main-checkout `site/` as a symlink (recommended, atomic switch) or a read-only clone (if Serena
  dislikes symlinks).
- **D4:** retention: keep the pinned snapshot, anything a local branch pins, and the newest 3.
- **D5:** pin Prettier to the exact version that reproduces today's `site-pretty/` (step 1 finds it), not the
  newest one: a newer version would make every patch "drift".

## Sources

- SvelteKit `version.name` defaults to the build timestamp, `pollInterval` 0: https://svelte.dev/docs/kit/configuration (vendor doc, high)
- SvelteKit file hashing "cached forever": https://svelte.dev/docs/kit/performance (vendor doc, high)
- Vite hash cascade across importing chunks: https://github.com/vitejs/vite/issues/6773 (bug report, high)
- Svelte `cssHash` default `svelte-${hash(filename ?? css)}`: https://svelte.dev/docs/svelte/svelte-compiler (vendor doc, high); content-based before: https://github.com/sveltejs/svelte/issues/16636 (bug report, medium; which variant Fastwork's build uses is unknown)
- Prettier patch releases change formatting, pin exact: https://prettier.io/docs/install (vendor doc, high)
- gitignore trailing slash doesn't match a symlink: https://git-scm.com/docs/gitignore (vendor doc, high)
- `git merge-file` three-way merge, no repo needed: https://git-scm.com/docs/git-merge-file (vendor doc, high)
- POSIX `rename` atomicity, fails onto a non-empty dir: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html (spec, high)
- Node `COPYFILE_FICLONE` reflink with fallback: https://nodejs.org/api/fs.html (vendor doc, high); macOS `cp -c` = clonefile(2): local `man cp` (vendor doc, high)
- wget `--mirror` = `-r -N -l inf`, in-place timestamping: https://www.gnu.org/software/wget/manual/wget.html (vendor doc, high)
- WARC records, payload digest, revisit dedup: https://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/ (spec, high)
- Nix store, digests in store paths: https://nix.dev/manual/nix/2.24/store/ and https://nix.dev/manual/nix/2.24/store/store-path (vendor doc, medium on the details paraphrased)
