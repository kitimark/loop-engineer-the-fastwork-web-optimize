#!/bin/sh
# Upload the article clips (page order) to Cloudflare Stream and list the Medium links (loop, autoplay, muted).
# Owner's account and token; run from the repo root. Upload = publishing: run only with the owner's OK.
#
#   1. In the Cloudflare dashboard: turn on Stream; make an API token with "Stream: Edit".
#   2. Save the token in out/cf-stream-token.txt and the account id in out/cf-account-id.txt (out/ is gitignored).
#      Never paste either into a thread, a commit or a chat.
#   3. Run:
#        sh research/article-clips/upload-cf-stream.sh --dry-run                 # list what would be uploaded
#        sh research/article-clips/upload-cf-stream.sh day8-menu-60fps-strip     # one test clip first
#        sh research/article-clips/upload-cf-stream.sh                           # all 19, in page order
#        sh research/article-clips/upload-cf-stream.sh --delete <uid>            # remove one upload
#   4. Paste each "medium" link from out/article-video/cf-stream-links.tsv on its own line in Medium.
#
# API (Cloudflare Stream docs, uploading-videos/upload-video-file): POST form file=@clip to
# /client/v4/accounts/{account_id}/stream (basic upload, files under 200 MB). The clips have no audio track.
# Already-uploaded clips (a row in the .tsv) are skipped, so a rerun resumes.
set -eu
DIR=out/article-video
OUT=$DIR/cf-stream-links.tsv
ALL="hero-gesture-long-60fps-strip hero-gesture-stop-1x-strip opening-carousel-1x-strip end-openclose-take-60fps-strip day3-carousel-60fps-strip end-openclose-take-2x-strip hero-gesture-stop-2x-strip hero-gesture-stop-full-60fps-strip day8-navrise-closeup-2x day8-menu-60fps-strip day8-menu-2x-strip day9-join-closeup-2x-hq day9-logo-closeup-2x-hq day10-people-60fps-strip day10-people-wc-60fps-strip day11-reveal-60fps-strip day11-reveal-2x-strip hero-cards-return-60fps-strip middle-60fps-strip"
PARAMS="loop=true&autoplay=true&muted=true"

DRY=0; DEL=""
case "${1:-}" in
  --dry-run) DRY=1; shift ;;
  --delete) DEL="${2:?--delete needs a video uid}"; shift 2 ;;
esac
CLIPS=${*:-$ALL}

if [ "$DRY" = 1 ]; then
  for c in $CLIPS; do
    [ -f "$DIR/$c.mp4" ] || { echo "missing $DIR/$c.mp4"; exit 1; }
    if [ -f "$OUT" ] && grep -q "^$c	" "$OUT"; then echo "skip $c (already uploaded)"; else echo "would upload $c ($(wc -c < "$DIR/$c.mp4" | tr -d ' ') bytes)"; fi
  done
  exit 0
fi

[ -s out/cf-stream-token.txt ] || { echo "save the API token in out/cf-stream-token.txt first (see the top of this file)"; exit 1; }
[ -s out/cf-account-id.txt ] || { echo "save the account id in out/cf-account-id.txt first (see the top of this file)"; exit 1; }
TOKEN=$(tr -d ' \n\r' < out/cf-stream-token.txt)
ACCT=$(tr -d ' \n\r' < out/cf-account-id.txt)
API="https://api.cloudflare.com/client/v4/accounts/$ACCT/stream"

# Read one field from the API's JSON reply; exit 1 with Cloudflare's error text when success is false.
field() { node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    let j; try { j = JSON.parse(s) } catch { console.error("not JSON:", s.slice(0, 200)); process.exit(1) }
    if (!j.success) { console.error("failed:", JSON.stringify(j.errors).slice(0, 300)); process.exit(1) }
    const v = process.argv[1].split(".").reduce((o, k) => o == null ? o : o[k], j.result);
    console.log(v == null ? "" : String(v));
  })' "$1"; }

if [ -n "$DEL" ]; then
  curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" "$API/$DEL" -o /dev/null -w "delete $DEL: HTTP %{http_code}\n"
  exit 0
fi

[ -f "$OUT" ] || printf 'clip\tuid\tmedium\tready\n' > "$OUT"
for c in $CLIPS; do
  if grep -q "^$c	" "$OUT"; then echo "skip $c (already in $OUT)"; continue; fi
  echo "upload $c ..."
  resp=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" --form "file=@$DIR/$c.mp4" "$API")
  uid=$(printf '%s' "$resp" | field uid)
  ready=false; i=0
  while [ "$ready" != true ] && [ $i -lt 60 ]; do      # wait up to ~2 min for encoding
    sleep 2; i=$((i + 1))
    ready=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/$uid" | field readyToStream)
  done
  printf '%s\t%s\thttps://iframe.videodelivery.net/%s?%s\t%s\n' "$c" "$uid" "$uid" "$PARAMS" "$ready" >> "$OUT"
  tail -1 "$OUT"
done
echo "links: $OUT"
