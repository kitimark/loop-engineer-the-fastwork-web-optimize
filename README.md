# fastwork.com homepage: local performance mirror

A local copy of the public homepage https://fastwork.com/, made for a personal, educational
web-performance study. I'm not affiliated with Fastwork. The mirror runs the same production
bundles, so its scroll animations should lag the way the live site does. You can then try
optimizations locally, on desktop Chrome or on an iPhone on the same Wi-Fi.

> **Legal and ethics.** Everything under `site/` and `site-pretty/` (HTML, JS, CSS, images, fonts,
> and the saved third-party scripts) belongs to Fastwork or the respective vendors. Use it only
> for personal study on your own machine and LAN. Don't redeploy it publicly, don't push the
> mirrored assets to any public remote, and don't pass them around. `.gitignore` excludes `site/`,
> `site-pretty/` and `out/` so they can't be committed by accident. Only the tools and this README
> are meant to be versioned. The site's `robots.txt` is `User-agent: * / Allow: /`, and the mirror
> honours it anyway. It downloads one file at a time with a delay between requests and caches
> everything it already has.

**Repository layout.** `tools/` is the shared tooling, `research/` holds the write-ups, `site/` and
`site-pretty/` are the private mirror baseline (gitignored, main checkout only), and `fixes/<topic>/`
holds per-fix experiments developed in parallel git worktrees. The per-fix workflow (overlays, A/B
measurement, locks, the shared iPhone) is in [`fixes/README.md`](fixes/README.md) and
[`CLAUDE.md`](CLAUDE.md); proposed fixes are in [`fixes/TOPICS.md`](fixes/TOPICS.md).

## What gets mirrored

`node tools/mirror.mjs` stores each resource under `site/` at its URL path
(`https://fastwork.com/_app/immutable/nodes/2.DyWL8TcE.js` → `site/_app/immutable/nodes/2.DyWL8TcE.js`).
It finds resources in these places:

| Source | What is followed |
|---|---|
| HTML | `<link>` (stylesheet, modulepreload, icon, manifest), `<script src>`, `<img>`/`<source>` `src`/`srcset`, inline `<style>` and `style=""` `url()`, inline bootstrap `import("...")`, and the production **`Link: <…>; rel=modulepreload` response header**. `<a href>`, `<link rel=canonical/alternate>` and `<meta content>` are skipped because they are navigation or metadata, not resources. |
| JS chunks (recursive) | static `import … from`, dynamic `import()`, `new URL(…, import.meta.url)`, and every string literal that looks like a same-origin asset path. Template literals such as `` `${gD}/reviewers/r1.jpg` `` are resolved against module-level string constants (`gD=`/selling/sellers``). |
| CSS | `url()` (data: URLs skipped), `@import`, `@font-face` sources |
| SVG / webmanifest | `href`/`xlink:href`/`url()`, and `icons[].src` |
| SvelteKit plumbing | `/_app/version.json` (the client fetches it after a failed navigation). `/_app/env.js` and `__data.json` return 404 in production: the page has no dynamic public env and no server `load`, and the bootstrap passes `data: [null,null]`. |
| `--crawl` (optional) | opens the live page **once** in a dedicated Chrome at desktop and mobile sizes, scrolls to the bottom, pushes past the end to trigger the header "morph", clicks every profile-showcase tab, and adds every same-origin GET it saw. On the current build it found nothing that the static pass had missed. |
| `--vendors` (optional) | also saves the third-party **scripts** requested during the crawl, for `serve --vendors=local`. It never saves or replays beacons. |

Result for the build mirrored on 2026-09-30 (the same build as the earlier baseline, with every JS chunk
byte-identical): **251 files, 27.5 MB**. That breaks down as 13 JS, 4 CSS, 164 JPG,
27 PNG, 29 SVG, 3 AVIF, 5 WOFF2, 1 TTF, plus the manifest, icons, `version.json` and `robots.txt`.
It includes the images for every showcase profession, including tabs that load only on click.

Requests use browser-like `Accept` headers. Cloudflare injects its Web Analytics `<script … beacon.min.js>`
into the HTML only for requests that look like a browser, so a bare `curl` gets different HTML (no beacon).

`site/.mirror/manifest.json` records each file's production `content-type`, `cache-control`, `etag`
and `Link` header, its size and its sha256, plus the production CSP. It also lists the 404s and the
source-map probe result. `serve.mjs` replays those headers.

**Source maps: none are public.** The mirror probes `<file>.map` for all 17 JS and CSS files and gets
404 for every one, and no file has a `sourceMappingURL` comment. `tools/prettify.mjs` gives you a
readable copy instead (see below).

## Quick start

```sh
node tools/mirror.mjs --crawl --vendors   # first time (~1-2 min, one live visit in a private Chrome)
node tools/mirror.mjs                     # later runs: revalidates HTML, reuses everything cached
node tools/serve.mjs                      # http://localhost:5173 and a LAN URL
```

Other mirror flags: `--refresh` re-downloads everything, `--missing` also fetches paths the local
server logged as 404 (`site/.mirror/missing-local.txt`, which includes vendor scripts), `--pages /,/th/,/id/`
mirrors the other locales, and `--concurrency N` / `--delay ms` control politeness (defaults: 1 and 150 ms).

When the production build changes (new chunk hashes), just run `node tools/mirror.mjs` again. Old
hashed files stay in `site/`, which is harmless, and `index.html` points at the new ones.

## Serving

```sh
node tools/serve.mjs                    # default: --vendors=block --compress=br, port 5173, 0.0.0.0
node tools/serve.mjs --vendors=local    # run the saved GTM/GA4/Amplitude/Hotjar/CF beacons, neutered
node tools/serve.mjs --vendors=off      # additionally make first-party /analytics.js a no-op
node tools/serve.mjs --https            # HTTP/2 + TLS (auto self-signed cert, or --cert/--key from mkcert)
node tools/serve.mjs --latency 120      # add 120 ms before every response (rough CDN RTT)
node tools/serve.mjs --no-cache         # Cache-Control: no-store (handy while editing files)
node tools/serve.mjs --root site-pretty # serve the prettified copy (or your own edited copy)
node tools/serve.mjs --root site-pretty --overlay fixes/<topic>/overlay   # baseline + one fix's changed files
node tools/serve.mjs --port auto        # per-checkout port in 5200-5999 (default inside a git worktree)
node tools/serve.mjs --port 0 --state out/serve.json   # any free port; URL/port/pid written to the file
```

Every start prints a machine-readable `MIRROR_URL=…` line. A fixed `--port` that is taken fails
loudly instead of moving. `--root site` / `--root site-pretty` are looked up in this checkout first
and then in the main checkout (`git rev-parse --git-common-dir`, or `$FW_MIRROR_HOME`), so a git
worktree serves the shared baseline without a copy. `--overlay` directories (comma-separated, first
wins) are checked before the root for every path, and their responses carry `x-mirror-source`.
Vendor scripts are always served from the byte-identical `site/` (some load with SRI `integrity`, so
`site-pretty/`'s reformatted copies would be refused).

What the server does to stay close to production:
- **MIME types and cache headers** come from the live responses stored in the manifest. For example,
  `_app/immutable/*` is served `max-age=1, must-revalidate` exactly as production sends it, and images
  get `max-age=31536000, immutable`. ETag/304 revalidation works, and edits to files are picked up
  because the ETag is a content hash.
- **Compression:** brotli (default) or gzip for text types, as Cloudflare does. The brotli quality
  differs, so transfer sizes differ slightly: `2.DyWL8TcE.js` is 96.5 KB locally against 116 KB live.
  Decoded bytes are identical.
- **Document headers:** production's `Link: modulepreload` header, COOP/CORP, `X-Frame-Options`,
  `Permissions-Policy`, `Referrer-Policy`, and production's CSP **with all third-party origins
  removed** (same hashes, `'self'` only for script/connect/img/frame). That CSP is the hard guarantee
  that no mirror mode can talk to an analytics vendor.
- **Fallbacks:** `/` → `index.html`, `/x` → `x.html` or `x/index.html`. The homepage needs no SPA
  fallback, because it is prerendered and makes no client-side route requests during scroll.
  `/cdn-cgi/*` (Cloudflare RUM beacon POSTs) → 204 locally. `/api/*` (the waitlist form) → 503 JSON.
  Nothing is proxied upstream.
- Any 404 is appended to `site/.mirror/missing-local.txt` so `mirror.mjs --missing` can fill the gap.

### Opening it on the iPhone

1. Run `node tools/serve.mjs`. It prints something like `LAN: http://192.168.0.55:5173/ (en0)`.
   VPN and link-local interfaces are listed separately.
2. Put the iPhone on the same Wi-Fi and open that URL in Safari. macOS may ask whether `node` can
   accept incoming connections: allow it, or add node under System Settings → Network → Firewall.
3. For Web Inspector timelines, connect the phone by cable and turn on Settings → Safari → Advanced →
   Web Inspector. Then use Safari on the Mac → Develop → *iPhone* → the page.

**Secure context:** plain `http://192.168.x.x` is not a secure context. The first-party app doesn't
need one. I grepped every chunk: there is no `crypto.randomUUID`/`crypto.subtle`, clipboard, service
worker registration or similar. The only `serviceWorker` use is a guarded `'serviceWorker' in navigator`
update after a failed navigation. Amplitude and the Cloudflare beacon fall back when `randomUUID` is
missing. **One vendor difference matters:** Hotjar refuses to start on `http:` pages
(`"http:"===location.protocol` → no launch), so to get its cost in `--vendors=local` you need HTTPS:

```sh
brew install mkcert && mkcert -install
mkcert -cert-file out/certs/lan.pem -key-file out/certs/lan-key.pem localhost 127.0.0.1 192.168.0.55
node tools/serve.mjs --https --vendors=local --cert out/certs/lan.pem --key out/certs/lan-key.pem
# iPhone: AirDrop "$(mkcert -CAROOT)/rootCA.pem" to the phone, install the profile, then enable it in
# Settings → General → About → Certificate Trust Settings.
```

Without `--cert`, `--https` creates a self-signed cert under `out/certs/`. Safari will show a warning,
and you can tap through it ("Show Details → visit this website"). HTTPS also gives you HTTP/2, like
production. Over plain http, Safari is limited to about 6 connections per host.

## Third-party scripts: three modes

Production's `/analytics.js` (first-party, hand-written) pushes dataLayer events. It also watches the
whole document with a `MutationObserver` and uses an `IntersectionObserver`, then injects GTM. GTM
loads GA4 (gtag), Amplitude (plus its session-replay config), and Hotjar (sampled; its recording
module loads on some visits). Cloudflare injects its Web Analytics beacon into the HTML, and that
beacon POSTs `/cdn-cgi/rum`.

| mode | `/analytics.js` | GTM / GA4 / Amplitude / Hotjar / CF beacon | network to vendors |
|---|---|---|---|
| `block` (default) | runs (byte-identical) | never load: the CSP refuses them, so you see 2 console CSP errors | none |
| `local` | runs | **run from local copies** (`site/__vendor/…`) | none: `vendor-shim.js` answers fetch/XHR/sendBeacon/WebSocket/pixels locally, and the CSP blocks anything it misses |
| `off` | no-op | never load | none |

`local` keeps the vendors' main-thread cost (parse, compile, observers, listeners, timers, payload
building) while nothing leaves the machine. `window.__mirrorVendorShim` shows which scripts it
rewrote and what it neutered, for example `fetch api2.amplitude.com: 1`, `fetch www.google-analytics.com: 1`.
The known differences from live are listed under "Remaining fidelity gaps".

## Rewrites (complete list)

Files in `site/` are **byte-identical to production**. Their sha256 hashes are in the manifest, so
`sha256sum` will confirm it. Everything below happens in the server at response time or in the
opt-in shim:

1. **All modes:** the document CSP header is production's policy with third-party origins stripped.
   `img-src https:` becomes `'self' data: blob:`, and `frame-src` becomes `'none'`. The HTML's own
   `<meta http-equiv=content-security-policy>` is left untouched.
2. **All modes:** `/cdn-cgi/*` and other non-GET requests are answered 204 locally. `/api/*` POST
   returns 503.
3. **All modes:** brotli level differs from Cloudflare's (see above).
4. **`--vendors=local` only:** in `index.html`, `<script src="/__mirror/vendor-shim.js"></script>` is
   inserted directly before `<script src="/analytics.js"></script>`, and the Cloudflare beacon
   `src="https://static.cloudflareinsights.com/…"` becomes `src="/__vendor/static.cloudflareinsights.com/…"`.
   Its SRI `integrity` still matches because the bytes are the same.
5. **`--vendors=local` only, at runtime (`tools/vendor-shim.js`):** third-party `<script src>` →
   `/__vendor/<host>/<path>`. Cross-origin `fetch`/XHR/`sendBeacon`/`WebSocket`/`<img>`/`<iframe>`
   get faked local answers.
6. **`--vendors=off` only:** `/analytics.js` is served as a one-line no-op.

No first-party JS or CSS had to be changed. SvelteKit's bootstrap uses `base: ""` with root-relative
`/_app/…` imports. The JS contains no absolute `https://fastwork.com` resource URLs: the only ones are
the privacy link and `f.fastwork.co/demoday`, which are plain navigation links. The page makes no API
calls while loading or scrolling, so it hydrates on `localhost` and on a LAN IP unchanged. You can
see this in the header class `is-hero-chrome-ready` after load and the `is-morphing is-expanded` morph
at the end.

## Verification

`tools/verify.mjs` drives its **own** Chrome over CDP (a free DevTools port picked by Chrome unless
`--port N`; profile in this checkout's `out/`). It uses no DevTools tracing, so throttled runs don't
hang. Before launching Chrome it waits for the cross-worktree `chrome-measure` lock
(`tools/lock.mjs status` shows the holder and queue), so parallel agents never measure at the same
time; with several targets the order alternates per run (A B, B A, …). For each target and run it does this:

1. Opens a fresh isolated browser context, so the cache is cold.
2. Loads the page and waits until it settles.
3. Applies the CPU throttle (`--cpu`, default 4; the calibrated iPhone-like setting is 6 on the
   mobile viewport).
4. Injects a rAF frame logger and `PerformanceObserver('long-animation-frame')` with script
   attribution (`sourceURL`, `sourceCharPosition`, `forcedStyleAndLayoutDuration`).
5. Smooth-scrolls with `scrollBy({top:250, behavior:'smooth'})` every 300 ms down to the bottom
   (the "scroll" phase).
6. Pushes past the end with wheel events on desktop or touch drags on mobile (the "morph" phase).
7. Takes screenshots at top, middle and bottom from a fresh load and pixel-diffs them against the
   first target.

```sh
node tools/serve.mjs --port 5173 &  node tools/serve.mjs --port 5174 --vendors=local &
node tools/verify.mjs live=https://fastwork.com/ block=http://localhost:5173/ local=http://localhost:5174/ \
     --viewport both --runs 3 --cpu 4          # results in out/verify/*.json (+ screenshots)
```

### Results (2026-09-30, MacBook with a 120 Hz display, Chrome, CPU x4, median of 3 runs, cold cache)

Scroll phase is 40 `scrollBy` steps, about 12 s on desktop and 8.4 s on mobile. `>20ms` means rAF
intervals longer than 20 ms, which is two or more missed vsyncs at 120 Hz.

| viewport | target | fps | frames >20ms | >50ms | LoAF ms | forced layout ms (in LoAF) |
|---|---|---|---|---|---|---|
| desktop 1440x900 | **live** | 96.1 | 31 | 2 | 50 | 0-18 |
| | block (default) | 99.3 | 21 | 1 | 0 | 0-19 |
| | local vendors (http) | 95.8 | 23 | 1 | 50 | 0-15 |
| | off | 95.5 | 27 | 1 | 55 | 20 |
| | **live** (second session) | 96.2 | 33 | 3 | 58 | 0-9 |
| | local vendors, https (Hotjar active) | 95.1 | 26 | 2 | 62 | 10 |
| | local vendors, https, `--latency 150` | 95.1 | 32 | 3 | 111 | 0 |
| | block, `--latency 150` | 95.4 | 27 | 2 | 111 | 18 |
| mobile 430x932 DPR3 touch | **live** | 92.3 | 23 | 2 | 110 | 28 |
| | block | 98.5 | 16 | 1 | 0 | 0 |
| | local vendors (http) | 98.9 | 15 | 1 | 52 | 0 |
| | off | 99.4 | 13 | 1 | 52 | 18 |
| | **live** (second session) | 96.5 | 21 | 2 | 55 | 6 |
| | local vendors, https | 96.2 | 16 | 2 | 63 | 14 |
| | local vendors, https, `--latency 150` | 98.3 | 18 | 2 | 0 | 0 |
| | block, `--latency 150` | 100.3 | 12 | 2 | 52 | 5 |

Raw data is in `out/verify-full/` and `out/verify-https/`.

- **Same code runs.** Live and local load the same 11 first-party scripts with the same hashes, and
  there are no 404s. The same hydration and morph states are reached. LoAF attribution points at the
  same functions at the same char offsets in `nodes/2.DyWL8TcE.js`:
  - `:343804`: the `IntersectionObserver` callback, with about 10-15 ms of forced style and layout.
  - `:296345 f`: the profile-shrink rAF (`getBoundingClientRect` → forced layout).
  - `:302796 l`: the hero-track rAF.
  - `:75155 iE`: the shared scroll→rAF engine.
  - `:342565 T`: the morph spring rAF.
- **Visually identical.** Screenshots differ from live on 0-0.35 % of pixels, and that difference is
  the countdown seconds and orbit animation phase.
- **Local is about the same or slightly smoother than live.** Run-to-run noise is about ±7 frames
  (live desktop ranged 22-36 over 6 runs). Without latency, local shows roughly 25-35 % fewer >20 ms
  frames. With `--vendors=local --https --latency 150`, desktop matches live (32 vs 33). The gap
  comes from network timing (images decoded while you scroll arrive later from the CDN, and live
  uses h2/h3), not from different code. For "lags like live", use
  `--vendors=local --https --latency 150`.
- **Vendor delta: small.** During scroll, the only third-party code that shows up in LoAF is gtag's
  `onscrollend` listener (GA4 scroll tracking), at about 45-48 ms once per run. On live you can't see
  this, because cross-origin scripts aren't attributed. `off` vs `block` (first-party `analytics.js`)
  is within noise. The jank is first-party.
- On this Mac, CPU x4 gives only mild jank (about 96 fps average at 120 Hz), and DevTools CPU
  throttling does not slow down the GPU. The blur/backdrop-filter raster cost that hurts on the
  iPhone therefore only shows up on the real device. That is why the LAN or iPhone path matters.

### Remaining fidelity gaps

- **Network:** localhost/LAN has near-zero RTT and serves HTTP/1.1 without `--https`. Production is
  Cloudflare with h2/h3 and roughly 100-300 ms TTFB from Thailand. `--latency` is a crude
  per-response delay, not a bandwidth model. Brotli level differs, so transfer sizes differ but the
  bytes are identical.
- **Vendors in `local` mode:** analytics requests get fake success replies. Amplitude's
  session-replay config comes back `{}`, so replay stays off (whether live ever records is unknown).
  Hotjar needs `--https` (it refuses `http:`), and its recording is sampled on live
  (`rec_value: 0.0`, `vc.hotjar.io … s=0.25`), so its cost varies per visit on both sides. Hotjar and
  GTM lazy-load extra modules on some visits. They are logged as 404 and fetched by
  `mirror.mjs --vendors --missing`; restart `serve` afterwards.
- **Snapshot:** the HTML (including Cloudflare's injected beacon tag and token) is a snapshot. Re-run
  `mirror.mjs` to pick up new builds.
- **Only `/` is mirrored.** The language switch (`/th/`, `/id/`) and other links 404 locally unless
  you mirror them with `--pages`. The waitlist form (`/api/waitlist`, Turnstile) doesn't work.
- The rAF logger and LoAF observer in `verify.mjs` add a tiny, identical cost on both sides. LoAF only
  reports frames over 50 ms, so forced layouts inside shorter frames aren't counted here. Use a
  DevTools trace without throttling, or Safari Web Inspector on the iPhone, for those.


## Readable code (`tools/prettify.mjs`)

`node tools/prettify.mjs` copies `site/` to `site-pretty/` and formats every JS/CSS file, and the
saved vendor scripts, with Prettier via `npx prettier@3`, a one-off with no global install.
`index.html` is copied verbatim, because reformatting SSR markup breaks Svelte hydration. `site/`
stays byte-identical. To profile with readable line numbers, run
`node tools/serve.mjs --root site-pretty --port 5180`. Formatting doesn't change behaviour, but parse
and compile time and LoAF char positions will differ from production.

## Tests

The tools have an automated test suite (Node's built-in test runner, no dependencies). It runs on a
tiny fixture baseline in temp directories, so it needs neither the real mirror nor the network:

```sh
npm test              # unit + e2e + hook tests, no Chrome (a fake CDP endpoint stands in), ~30 s
npm run test:chrome   # opt-in: real Chrome (verify.mjs, fix.mjs ab --runs 1, vendor-shim egress), ~2 min,
                      # waits for the chrome-measure lock like any measurement
npm run test:all      # both
npm run setup         # once per clone: git config core.hooksPath .githooks (versioned pre-commit hook)
node --test tests/e2e/serve.test.mjs   # a single file
```

`tests/unit/` covers `lib/paths`, `lib/lock`, `lib/cdp`, `vendor-shim.js` and the guard-rail config;
`tests/e2e/` runs the CLIs (`serve`, `fix`, `lock`, `verify` and `fix ab` against a fake Chrome,
`iphone` lease gating with no phone, `mirror` against a local fixture origin, `prettify`), the
pre-commit hook, the fix-agent workflow in a real temp worktree, and a read-only smoke test of the
real baseline (skipped when `site/` is absent). `tests/chrome/` is the opt-in real-browser suite.
The pre-commit hook blocks staged `site/`, `site-pretty/`, `out/`, `fixes/*/overlay/`,
`.serena/cache/` and `*.pem`, and runs `npm test` when a commit touches `tools/`, `tests/`,
`.githooks/`, `.claude/hooks/`, `package.json` or `.claude/settings.json`. Tool changes are allowed
but must come with tests (CLAUDE.md "Tooling is guarded by tests").

## Files

```
tools/mirror.mjs       downloader (static discovery + optional --crawl/--vendors)
tools/serve.mjs        local server (MIME/cache/CSP/Link like production, br/gzip, LAN, https, vendor modes)
tools/vendor-shim.js   --vendors=local runtime shim (script URL rewrite + beacon neutering)
tools/verify.mjs       live-vs-local jank comparison over CDP (frames, LoAF, screenshots), under the measurement lock
tools/prettify.mjs     readable copy -> site-pretty/
tools/fix.mjs          per-fix workflow: new/edit/grep/show/diff/apply/combine/serve/ab (see fixes/README.md)
tools/lock.mjs         cross-worktree locks: chrome-measure (automatic) and the iphone lease
tools/iphone.mjs       drive the shared iPhone under the lease: status/open/scroll/record
tools/lib/cdp.mjs      tiny dependency-free Chrome DevTools Protocol client
tools/lib/paths.mjs    finds the baseline from any worktree, per-checkout ports
tools/lib/lock.mjs     named lock/lease/queue implementation (state in .git/fastwork-mirror/locks/)
tools/lib/wip.mjs      WebKit Inspector Protocol client for iOS Safari (ios_webkit_debug_proxy)
tests/                 node:test suite (unit/, e2e/, opt-in chrome/, fixtures/: fixture baseline, fake Chrome)
.githooks/pre-commit   blocks Fastwork assets; runs npm test on tooling changes (npm run setup to enable)
research/              write-ups and one-off tools of each study
fixes/                 per-fix deliverables (README.md, patch.diff, results.json), TOPICS.md, AGENT_PROMPT.md
CLAUDE.md              rules and workflow for Claude Code agents (worktrees, teams, locks)
site/                  the mirror (gitignored); site/.mirror/manifest.json = headers, hashes, 404s, vendors
site-pretty/           prettified copy (gitignored)
out/                   verify results, screenshots, Chrome profiles, certs (gitignored)
```
