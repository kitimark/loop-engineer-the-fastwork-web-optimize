#!/bin/sh
# Rebase-only history guard: CLAUDE.md "Hard rules" 1 (rebase + fast-forward only, no merge or
# squash-merge commits) and 2 (only the user pushes, after the scrub check). Called by the thin hooks next to lib/:
#
#   pre-merge-commit       any non-fast-forward `git merge` that is about to commit      -> reject
#   commit-msg             `git commit` while MERGE_HEAD or SQUASH_MSG exists             -> reject
#                          (a conflicted merge concluded by hand, or `git merge --squash`)
#   reference-transaction  any update of refs/heads/* that brings in a commit with 2+ parents
#                          (backstop: also catches --no-verify, `git merge --continue`,
#                          `git commit-tree` + `git update-ref`, `git pull` without --rebase)
#   pre-push               a delete, a tag, a non-fast-forward, a merge commit or a scrub hit in the
#                          outgoing commits (tools/release/outgoing.mjs; a missing tool or known values
#                          file refuses too)
#
# Another hook (e.g. .githooks/pre-commit) can reuse the merge-in-progress check early, before an
# editor opens:   sh "$(dirname "$0")/lib/rebase-only.sh" merge-in-progress || exit 1
#
# Fail-closed: if git itself errors while checking, the operation is refused. The human escape
# hatch for a genuine emergency is `git -c core.hooksPath=/dev/null <cmd>` (agents: forbidden).
# Docs: https://git-scm.com/docs/githooks (pre-merge-commit, commit-msg, reference-transaction,
# pre-push), https://git-scm.com/docs/git-config (core.hooksPath, merge.ff, pull.rebase).

HOW='How to land: on the branch `git rebase main`; then in the main checkout `git merge --ff-only <branch>`. If the fast-forward fails, rebase again. Never merge main into a branch (rebase instead). CLAUDE.md "Hard rules" 1.'

die() {
  printf 'rebase-only: %s\n%s\n' "$1" "$HOW" >&2
  exit 1
}

merge_in_progress() {
  mh=$(git rev-parse --git-path MERGE_HEAD) || die 'git rev-parse failed; refusing (fail-closed).'
  sq=$(git rev-parse --git-path SQUASH_MSG) || die 'git rev-parse failed; refusing (fail-closed).'
  if [ -f "$mh" ]; then
    die 'a merge is in progress (MERGE_HEAD exists): committing now would create a merge commit. Undo it with `git merge --abort` (or `git reset --merge`).'
  fi
  if [ -f "$sq" ]; then
    die 'a squash merge is pending (SQUASH_MSG exists): squash-merge commits are not allowed. Undo it with `git reset --merge`, then land the branch by rebase + fast-forward.'
  fi
}

zero_oid() {
  case $1 in
    *[!0]*) return 1 ;;
    *) return 0 ;;
  esac
}

ref_transaction() {
  state=$1
  if [ "$state" != prepared ]; then
    cat >/dev/null
    exit 0
  fi
  bad=''
  while read -r old new ref; do
    case $ref in refs/heads/*) ;; *) continue ;; esac
    case $new in ref:*) continue ;; esac
    zero_oid "$new" && continue # branch deletion
    if zero_oid "$old"; then
      # New branch: it may point at existing history, but must not add merges that no branch has.
      merges=$(git rev-list --merges -n 1 "$new" --not --branches --) || die "git rev-list failed for $ref; refusing (fail-closed)."
    else
      merges=$(git rev-list --merges -n 1 "$new" "^$old" --) || die "git rev-list failed for $ref; refusing (fail-closed)."
    fi
    [ -n "$merges" ] && bad="$bad $(printf '%s (merge %.12s)' "${ref#refs/heads/}" "$merges")"
  done
  if [ -n "$bad" ]; then
    die "refusing to move branch(es) onto a merge commit:$bad. Merge commits are not allowed on any branch."
  fi
  exit 0
}

case $1 in
  pre-merge-commit)
    die 'refusing to create a merge commit (the merge was not a fast-forward). Undo it with `git merge --abort`.'
    ;;
  commit-msg | merge-in-progress)
    merge_in_progress
    exit 0
    ;;
  reference-transaction)
    ref_transaction "$2"
    ;;
  pre-push)
    # Only the user pushes, after the scrub check (user, 2026-10-13): tools/release/outgoing.mjs reads git's ref
    # lines on stdin and refuses deletes, tags, non-fast-forwards, merge commits and any scrub hit (fail-closed:
    # anything but exit 0 refuses). Agents never push (git-guard, .claude/settings.json deny rules).
    tool="$(dirname "$0")/../../tools/release/outgoing.mjs"
    if [ ! -f "$tool" ]; then
      cat >/dev/null
      printf 'rebase-only: push refused: the scrub check %s is missing (fail-closed). CLAUDE.md "Hard rules" 2.\n' "$tool" >&2
      exit 1
    fi
    if ! node "$tool" --pre-push "$2" "$3"; then
      printf 'rebase-only: push refused by the scrub check (tools/release/outgoing.mjs, lines above; no value is printed). Fix the commits (rebase), never bypass the hook. CLAUDE.md "Hard rules" 1-2.\n' >&2
      exit 1
    fi
    exit 0
    ;;
  *)
    printf 'rebase-only: unknown mode "%s"\n' "$1" >&2
    exit 1
    ;;
esac
