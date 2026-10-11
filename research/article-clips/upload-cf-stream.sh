#!/bin/sh
# Upload the article clips (page order) to Cloudflare Stream and list the Medium links (loop, autoplay, muted).
# Owner's account and token; run from the repo root. Upload = publishing: run only with the owner's OK.
#
#   1. In the Cloudflare dashboard: turn on Stream; make an API token with "Stream: Edit" (My Profile > API Tokens >
#      Create Token > Custom: Account / Stream / Edit); copy your account id (Account home, right column).
#   2. Put both in environment variables of the shell you run this from (never in a thread, a commit or a chat):
#        export CF_ACCOUNT_ID=<account id>
#        export CF_STREAM_TOKEN=$(pbpaste)      # copy the token first; this keeps it out of the shell history
#   3. Run:
#        sh research/article-clips/upload-cf-stream.sh --dry-run                 # what a run would do, per clip
#        sh research/article-clips/upload-cf-stream.sh day8-menu-60fps-strip     # one clip
#        sh research/article-clips/upload-cf-stream.sh                           # all 22, in page order
#        sh research/article-clips/upload-cf-stream.sh --delete <uid>            # remove one upload
#        sh research/article-clips/upload-cf-stream.sh --tag                     # name the clips already in the .tsv
#        sh research/article-clips/upload-cf-stream.sh --check                   # compare Stream's names and state with the .tsv
#   4. Paste each "medium" link from research/article-clips/cf-stream-links.tsv on its own line in Medium;
#      commit that file after each upload run (it holds only public ids and links, never the token).
#
# Safe to run again (owner T-170 #349). For each clip:
#   - its row in the .tsv says ready=true: skipped, no API call (use --check to look again on Stream);
#   - otherwise the clip is first looked up on Stream: every video named "$PREFIX/<clip>.mp4" (or still carrying the
#     plain file name "<clip>.mp4", e.g. a dashboard upload or a run killed before it named the upload), plus the
#     video the .tsv row points to, if it still exists:
#       one found   -> reused: its row is written or refreshed (uid, Medium link, ready), it is named if needed,
#                      nothing is uploaded; a row with ready=false is refreshed this way on every run;
#       several     -> listed, none picked, nothing uploaded: delete the extras with --delete <uid>, then run again
#                      (the script ends with exit 1 after the other clips);
#       none        -> uploaded, named, waited for (up to ~2 min), and its row written.
#   The .tsv is rewritten in place: header, then the clips of ALL in page order, then any other clips; one row per clip.
#   --dry-run changes nothing: with CF_STREAM_TOKEN and CF_ACCOUNT_ID set it does the same read-only lookups and says
#   "would reuse <uid>" or "would upload"; without them it says the lookup was skipped.
#
# API (Cloudflare Stream docs, uploading-videos/upload-video-file): POST form file=@clip to
# /client/v4/accounts/{account_id}/stream (basic upload, files under 200 MB). The clips have no audio track.
# Every upload is named "$PREFIX/<clip>.mp4" and its creator set to $PREFIX, so the dashboard search and the list API
# (?search=, ?creator=) find this study's clips apart from anything else (owner T-170 #285). Basic uploads take these
# only afterwards: POST /stream/{uid} with {"meta":{"name":..},"creator":..} (docs: manage-video-library/creator-id).
# Lookup: GET /stream?creator=$PREFIX once per run, and GET /stream?search=<clip> per clip ("a partial word match of
# the name key in the meta field", API reference stream/methods/list; up to 1000 videos per reply); exact names are
# then matched here. Whether a basic upload gets the file name as meta.name is not in the docs (UNRESOLVED); the
# plain-name match only adds a candidate when it does.
# The token goes to curl on its standard input (a curl config line), never on a command line or in the output.
#
# Overrides (for tests; defaults in brackets): CF_STREAM_DIR [out/article-video], CF_STREAM_OUT [the .tsv below],
# CF_API_BASE [https://api.cloudflare.com/client/v4], CF_STREAM_PREFIX [fastwork-web-optimize],
# CF_STREAM_POLL_S [2] and CF_STREAM_POLL_N [60] (seconds between readiness polls, and how many).
# Tests: node --test research/article-clips/test/upload-cf-stream.test.mjs (a local mock of the API, no network).
set -eu
DIR=${CF_STREAM_DIR:-out/article-video}
OUT=${CF_STREAM_OUT:-research/article-clips/cf-stream-links.tsv}   # committed (owner T-170 #268): clip, video id, Medium link, ready; no secrets
BASE=${CF_API_BASE:-https://api.cloudflare.com/client/v4}
ALL="fig2-frame-rhythms-60fps hero-gesture-long-60fps-strip hero-gesture-stop-1x-strip opening-carousel-1x-strip end-openclose-take-60fps-strip day2-laggy-same-60fps-strip day3-carousel-60fps-strip day5-breakthrough-60fps-strip end-openclose-take-2x-strip hero-gesture-stop-2x-strip hero-gesture-stop-full-60fps-strip day8-navrise-closeup-2x day8-menu-60fps-strip day8-menu-2x-strip day9-join-closeup-2x-hq day9-logo-closeup-2x-hq day10-people-60fps-strip day10-people-wc-60fps-strip day11-reveal-60fps-strip day11-reveal-2x-strip hero-cards-return-60fps-strip middle-60fps-strip"
PARAMS="loop=true&autoplay=true&muted=true"
PREFIX=${CF_STREAM_PREFIX:-fastwork-web-optimize}
POLL_S=${CF_STREAM_POLL_S:-2}
POLL_N=${CF_STREAM_POLL_N:-60}

DRY=0; DEL=""; TAG=0; CHECK=0
case "${1:-}" in
  --tag) TAG=1; shift ;;
  --check) CHECK=1; shift ;;
  --dry-run) DRY=1; shift ;;
  --delete) DEL="${2:?--delete needs a video uid}"; shift 2 ;;
esac
CLIPS=${*:-$ALL}

CREDS=0
[ -n "${CF_STREAM_TOKEN:-}" ] && [ -n "${CF_ACCOUNT_ID:-}" ] && CREDS=1
if [ "$DRY" = 0 ]; then
  : "${CF_STREAM_TOKEN:?set CF_STREAM_TOKEN first (see the top of this file)}"
  : "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID first (see the top of this file)}"
fi
TOKEN=${CF_STREAM_TOKEN:-}
API="$BASE/accounts/${CF_ACCOUNT_ID:-}/stream"
TAB=$(printf '\t')
TMP=$(mktemp -d "${TMPDIR:-/tmp}/cf-stream.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# curl with the token on stdin (config line), so it is in no process list and no log.
api() { printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl -sS -K - "$@"; }

# JSON and .tsv helpers, one node script with modes (argv[1] = mode).
JS='
const fs = require("fs");
const [mode, ...a] = process.argv.slice(1);
const readJSON = (s) => { try { return JSON.parse(s) } catch { return null } };
const tsvRead = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")) : [];
if (mode === "field") {            // field <path>: one field of the reply on stdin; exit 1 with the error text
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    const j = readJSON(s);
    if (!j) { console.error("not JSON:", s.slice(0, 200)); process.exit(1) }
    if (!j.success) { console.error("failed:", JSON.stringify(j.errors).slice(0, 300)); process.exit(1) }
    const v = a[0].split(".").reduce((o, k) => o == null ? o : o[k], j.result);
    console.log(v == null ? "" : String(v));
  });
} else if (mode === "enc") {       // enc <text>: URL-encoded
  console.log(encodeURIComponent(a[0]));
} else if (mode === "row") {       // row <tsv> <clip>: "uid<TAB>ready" of the clip (last row wins) or nothing
  const r = tsvRead(a[0]).slice(1).filter((x) => x[0] === a[1]).pop();
  if (r) console.log(r[1] + "\t" + r[3]);
} else if (mode === "candidates") { // candidates <clip> <prefix> <file>...: videos of this clip, one line each
  const names = [a[1] + "/" + a[0] + ".mp4", a[0] + ".mp4"];
  const seen = new Map();
  for (const f of a.slice(2)) {
    const j = readJSON(fs.readFileSync(f, "utf8"));
    if (!j) { console.error("not JSON from Stream: " + fs.readFileSync(f, "utf8").slice(0, 200)); process.exit(1) }
    const byUid = /\.uid$/.test(f);
    if (!j.success) {
      if (byUid) continue;          // the .tsv row points to a video that is gone
      console.error("lookup failed: " + JSON.stringify(j.errors).slice(0, 300)); process.exit(1);
    }
    for (const v of [].concat(j.result || [])) {
      const name = v.meta && v.meta.name;
      if (byUid || names.includes(name)) seen.set(v.uid, v);
    }
  }
  for (const v of seen.values())
    console.log([v.uid, v.readyToStream === true, (v.status && v.status.state) || "", (v.meta && v.meta.name) || "", v.creator || ""].join("\t"));
} else if (mode === "setrow") {    // setrow <tsv> <ALL> <clip> <uid> <ready> <params>: rewrite the .tsv in order
  const [f, all, clip, uid, ready, params] = a;
  const rows = tsvRead(f);
  const head = rows.length && rows[0][0] === "clip" ? rows.shift() : ["clip", "uid", "medium", "ready"];
  const by = new Map();
  for (const r of rows) { if (by.has(r[0])) by.delete(r[0]); by.set(r[0], r) }
  if (by.has(clip)) by.delete(clip);
  by.set(clip, [clip, uid, "https://iframe.videodelivery.net/" + uid + "?" + params, ready]);
  const order = all.split(/\s+/).filter(Boolean);
  const rank = (c) => { const i = order.indexOf(c); return i < 0 ? order.length : i };
  const out = [...by.values()].map((r, i) => [r, i]).sort((x, y) => rank(x[0][0]) - rank(y[0][0]) || x[1] - y[1]).map((x) => x[0]);
  fs.writeFileSync(f + ".tmp", [head, ...out].map((r) => r.join("\t")).join("\n") + "\n");
  fs.renameSync(f + ".tmp", f);
  console.log(by.get(clip).join("\t"));
} else { console.error("unknown mode " + mode); process.exit(2) }
'
js() { node -e "$JS" "$@"; }
field() { js field "$1"; }

# Name one upload "$PREFIX/<clip>.mp4" and set its creator to $PREFIX.
tag() { api -X POST -H "Content-Type: application/json" \
  --data "{\"meta\":{\"name\":\"$PREFIX/$2.mp4\"},\"creator\":\"$PREFIX\"}" "$API/$1" | field meta.name; }

# For every row of the .tsv: Stream's name, creator and state for that video id, then OK or the mismatch.
if [ "$CHECK" = 1 ]; then
  [ -f "$OUT" ] || { echo "no $OUT yet: nothing to check"; exit 1; }
  bad=0; n=0
  while IFS="$TAB" read -r c uid link ready; do
    [ "$c" = clip ] && continue
    n=$((n + 1))
    got=$(api "$API/$uid" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        let j; try { j = JSON.parse(s) } catch { console.log("not-JSON"); return }
        if (!j.success) { console.log("error " + JSON.stringify(j.errors).slice(0, 120)); return }
        const r = j.result; console.log([r.meta && r.meta.name, r.creator, r.status && r.status.state, r.readyToStream].join(" | "));
      })')
    want="$PREFIX/$c.mp4 | $PREFIX | ready | true"
    if [ "$got" = "$want" ]; then echo "OK   $c"; else echo "DIFF $c: got [$got] want [$want]"; bad=$((bad + 1)); fi
  done < "$OUT"
  echo "checked $n, mismatches $bad"
  [ "$bad" = 0 ]; exit $?
fi

if [ "$TAG" = 1 ]; then
  [ -f "$OUT" ] || { echo "no $OUT yet: nothing to name"; exit 1; }
  tail -n +2 "$OUT" | while IFS="$TAB" read -r c uid link ready; do
    echo "named $uid: $(tag "$uid" "$c")"
  done
  exit 0
fi

if [ -n "$DEL" ]; then
  api -X DELETE "$API/$DEL" -o /dev/null -w "delete $DEL: HTTP %{http_code}\n"
  exit 0
fi

# Wait for encoding (up to POLL_N polls), then print the readiness ("true" or "false").
wait_ready() {
  r=false; i=0
  while [ "$r" != true ] && [ "$i" -lt "$POLL_N" ]; do
    sleep "$POLL_S"; i=$((i + 1))
    r=$(api "$API/$1" | field readyToStream)
  done
  echo "$r"
}

[ "$DRY" = 1 ] || [ -f "$OUT" ] || printf 'clip\tuid\tmedium\tready\n' > "$OUT"
fail=0
for c in $CLIPS; do
  row=$(js row "$OUT" "$c")
  ruid=${row%%"$TAB"*}; rready=${row#*"$TAB"}
  if [ -n "$row" ] && [ "$rready" = true ]; then echo "skip $c (ready in $OUT: $ruid)"; continue; fi
  if [ "$CREDS" = 0 ]; then   # dry run without credentials
    if [ -f "$DIR/$c.mp4" ]; then size="$(wc -c < "$DIR/$c.mp4" | tr -d ' ') bytes"; else size="MISSING $DIR/$c.mp4"; fail=1; fi
    echo "lookup skipped for $c (no CF_STREAM_TOKEN/CF_ACCOUNT_ID): reuse if on Stream, else upload ($size)${row:+; row $ruid ready=$rready}"
    continue
  fi
  # Look the clip up on Stream: this study's videos (fetched once, when first needed), a name search, the row's own uid.
  [ -f "$TMP/creator.list" ] || api "$API?creator=$(js enc "$PREFIX")" > "$TMP/creator.list"
  api "$API?search=$(js enc "$c")" > "$TMP/search.list"
  files="$TMP/creator.list $TMP/search.list"
  if [ -n "$row" ]; then api "$API/$ruid" > "$TMP/row.uid"; files="$files $TMP/row.uid"; fi
  # shellcheck disable=SC2086
  js candidates "$c" "$PREFIX" $files > "$TMP/cand"
  n=$(wc -l < "$TMP/cand" | tr -d ' ')
  if [ "$n" -gt 1 ]; then
    echo "DUPLICATE $c: $n videos on Stream, none picked, nothing uploaded:"
    while IFS="$TAB" read -r u rd st nm cr; do
      echo "  $u ready=$rd state=$st name=$nm creator=$cr$( [ "$u" = "$ruid" ] && echo ' (the .tsv row)' )"
    done < "$TMP/cand"
    echo "  keep one; delete each extra: sh $0 --delete <uid>; then run again"
    fail=1; continue
  fi
  if [ "$n" = 1 ]; then
    IFS="$TAB" read -r uid ready state name creator < "$TMP/cand"
    if [ "$state" = error ]; then
      echo "ERROR $c: $uid is on Stream with state=error; delete it (sh $0 --delete $uid) and run again"; fail=1; continue
    fi
    if [ "$DRY" = 1 ]; then echo "would reuse $uid for $c (ready=$ready, name=$name)"; continue; fi
    echo "reuse $uid for $c (on Stream, ready=$ready)"
    if [ "$name" != "$PREFIX/$c.mp4" ] || [ "$creator" != "$PREFIX" ]; then echo "named: $(tag "$uid" "$c")"; fi
    js setrow "$OUT" "$ALL" "$c" "$uid" "$ready" "$PARAMS"
    continue
  fi
  [ -f "$DIR/$c.mp4" ] || { echo "missing $DIR/$c.mp4"; fail=1; continue; }
  if [ "$DRY" = 1 ]; then echo "would upload $c ($(wc -c < "$DIR/$c.mp4" | tr -d ' ') bytes): not on Stream"; continue; fi
  echo "upload $c ..."
  uid=$(api -X POST --form "file=@$DIR/$c.mp4" "$API" | field uid)
  echo "named: $(tag "$uid" "$c")"
  js setrow "$OUT" "$ALL" "$c" "$uid" false "$PARAMS" > /dev/null   # keep the uid even if this run is stopped now
  ready=$(wait_ready "$uid")
  js setrow "$OUT" "$ALL" "$c" "$uid" "$ready" "$PARAMS"
done
[ "$DRY" = 1 ] || echo "links: $OUT"
exit "$fail"
