#!/usr/bin/env python3
# tools/release/rewrite.py <git-filter-repo options>: git-filter-repo v2.47.0 used as a library, one pass (I-269).
# Run only by tools/release/rewrite.mjs (python3 -I, cwd = the mirror, FW_FILTER_REPO_PATH = the pinned
# git-filter-repo file it checked). For every file version it:
#   - applies --replace-text itself: a --file-info-callback turns filter-repo's own blob replacement off
#     (Documentation/git-filter-repo.txt "file_info_callback"); text files get literals and regexes, binary files
#     (a NUL in the first 8 KiB, filter-repo's own test) the literal values only;
#   - applies --replace-text to the file's path too, and to the path of a deletion (filter-repo passes deletions to
#     no callback and uses them as they are, so a renamed path would otherwise never be deleted);
#   - rewrites the commit hashes cited in a text file to the new hashes, the way filter-repo does in commit messages
#     (_tweak_commit -> _hash_re.sub(_translate_commit_hash)). Cited commits are older, so already rewritten under
#     --date-order; an unknown or ambiguous hash stays as it is. A token with no digit or no letter (a 7-40 char
#     hex hash has none of one about 2-4 % of the time) is translated too, except in data files (.json .csv .log
#     .txt …) where it is far more likely a number; research/article-clips/recipes/*/gitlog.txt and firstadds.txt
#     are real `git log` output and are translated like prose.
# Uses filter-repo internals (_hash_re, _translate_commit_hash, FileInfoValueHelper._replace_text): the version
# is pinned by rewrite.mjs. Prints one line "RELEASE_REWRITE {json stats}" at the end.
import importlib.machinery, importlib.util, json, os, re, sys

path = os.environ.get('FW_FILTER_REPO_PATH')
if not path:
  sys.exit('rewrite.py: FW_FILTER_REPO_PATH is not set (run tools/release/rewrite.mjs)')
loader = importlib.machinery.SourceFileLoader('git_filter_repo', path)
spec = importlib.util.spec_from_loader('git_filter_repo', loader)
fr = importlib.util.module_from_spec(spec)
loader.exec_module(fr)

HEX = re.compile(br'\b[0-9a-f]{7,40}\b')
DATA = re.compile(br'\.(json|jsonl|ndjson|csv|tsv|log|txt|raw)$')
GITLOG = re.compile(br'^research/article-clips/recipes/[^/]+/(gitlog|firstadds)\.txt$')
cache = {}
stats = {'files': 0, 'text': 0, 'binary': 0, 'changed': 0, 'binaryChanged': 0, 'renamed': 0, 'shaRewrites': 0, 'pureShaRewrites': 0}
filt = None
cur = {'data': False}

def translate(m):
  t = m.group(0)
  pure = not re.search(br'[0-9]', t) or not re.search(br'[a-f]', t)
  if pure and cur['data']:
    return t
  n = filt._translate_commit_hash(t)
  if n != t:
    stats['shaRewrites'] += 1
    if pure:
      stats['pureShaRewrites'] += 1
  return n

def scrub_literals(value, c):
  for literal, replacement in value._replace_text['literals']:
    c = c.replace(literal, replacement)
  return c

def file_info(filename, mode, blob_id, value):
  stats['files'] += 1
  new_name = value.apply_replace_text(filename)
  if new_name != filename:
    stats['renamed'] += 1
  if mode == b'160000':
    return (new_name, mode, blob_id)
  is_data = bool(DATA.search(filename)) and not GITLOG.search(filename)
  key = (blob_id, is_data)
  if key in cache:
    return (new_name, mode, cache[key])
  c = value.get_contents_by_identifier(blob_id)
  if value.is_binary(c):
    stats['binary'] += 1
    n = scrub_literals(value, c)
    if n != c:
      stats['binaryChanged'] += 1
  else:
    stats['text'] += 1
    cur['data'] = is_data
    n = HEX.sub(translate, value.apply_replace_text(c))
    if n != c:
      stats['changed'] += 1
  new_id = blob_id if n == c else value.insert_file_with_contents(n)
  cache[key] = new_id
  return (new_name, mode, new_id)

def replace_path(p):
  for literal, replacement in args.replace_text['literals']:
    p = p.replace(literal, replacement)
  for regex, replacement in args.replace_text['regexes']:
    p = regex.sub(replacement, p)
  return p

def commit(c, metadata):
  for ch in c.file_changes:
    if ch.type == b'D':
      ch.filename = replace_path(ch.filename)

args = fr.FilteringOptions.parse_args(sys.argv[1:])
filt = fr.RepoFilter(args, file_info_callback=file_info, commit_callback=commit)
filt.run()
print('RELEASE_REWRITE ' + json.dumps(stats), flush=True)
