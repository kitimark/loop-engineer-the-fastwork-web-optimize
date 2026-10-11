#!/bin/sh
# Upload the article clips (the ones the draft plays, in page order) to Imgur (API v3), one by one, and list the links to paste into Medium.
# For the owner to run by hand; the study's agents never run it (project rule: nothing published by agents).
#
#   1. Register a free app once at https://api.imgur.com/oauth2/addclient
#      (type "Anonymous usage without user authorization"; any callback URL) and copy its Client-ID.
#   2. Run, from the repo root:
#        IMGUR_CLIENT_ID=<your id> sh research/article-clips/upload-imgur.sh            # all 19, in page order
#        IMGUR_CLIENT_ID=<your id> sh research/article-clips/upload-imgur.sh day8-menu-60fps-strip   # one test clip first
#   3. Paste each "page" link from out/article-video/imgur-links.tsv on its own line in Medium.
#
# Uploads with a Client-ID only are anonymous (not in your Imgur account). Keep imgur-links.tsv:
# its deletehash column is the only way to delete an anonymous upload later:
#   curl -s -X DELETE -H "Authorization: Client-ID $IMGUR_CLIENT_ID" https://api.imgur.com/3/image/<deletehash>
set -eu
: "${IMGUR_CLIENT_ID:?set IMGUR_CLIENT_ID first (see the comment at the top)}"
DIR=out/article-video
OUT=$DIR/imgur-links.tsv
[ -f "$OUT" ] || printf 'clip\tpage\tmp4\tdeletehash\n' > "$OUT"
CLIPS=${*:-"hero-gesture-long-60fps-strip hero-gesture-stop-1x-strip opening-carousel-1x-strip end-openclose-take-60fps-strip day3-carousel-60fps-strip end-openclose-take-2x-strip hero-gesture-stop-2x-strip hero-gesture-stop-full-60fps-strip day8-navrise-closeup-2x day8-menu-60fps-strip day8-menu-2x-strip day9-join-closeup-2x-hq day9-logo-closeup-2x-hq day10-people-60fps-strip day10-people-wc-60fps-strip day11-reveal-60fps-strip day11-reveal-2x-strip hero-cards-return-60fps-strip middle-60fps-strip"}
for c in $CLIPS; do
  if grep -q "^$c	" "$OUT"; then echo "skip $c (already in $OUT)"; continue; fi
  echo "upload $c ..."
  resp=$(curl -sS -X POST https://api.imgur.com/3/upload \
    -H "Authorization: Client-ID $IMGUR_CLIENT_ID" \
    -F "video=@$DIR/$c.mp4" -F "type=file" -F "disable_audio=1" -F "title=$c")
  printf '%s' "$resp" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      let j; try { j = JSON.parse(s) } catch { console.error("not JSON:", s.slice(0, 200)); process.exit(1) }
      if (!j.success) { console.error("failed:", JSON.stringify(j.data).slice(0, 300)); process.exit(1) }
      const d = j.data;
      console.log([process.argv[1], "https://imgur.com/" + d.id, d.mp4 || d.link, d.deletehash].join("\t"));
    })' "$c" >> "$OUT"
  tail -1 "$OUT"
  sleep 2   # stay well under Imgur's upload rate limit
done
echo "links: $OUT"
