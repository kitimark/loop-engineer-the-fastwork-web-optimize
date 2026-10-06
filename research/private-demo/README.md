# Private demo of the optimized page (T-212)

A password-locked copy of the v10 build, to attach to the permission request to Fastwork. One password for
everyone, checked by Vercel Routing Middleware against a salted SHA-256 hash kept in a Vercel environment variable.
No database, no accounts, no cookies, no tracking.

This folder (`research/private-demo/`) holds only our own code. The site itself (Fastwork's files) is built into
the gitignored `out/private-demo/` and never committed or pushed.

## What is in `out/private-demo/`

| file | what |
|---|---|
| `public/` | the static site: the baseline snapshot (`site-pretty/`, the tree v10 was measured and tried on) with the two v10 files on top, tracking stripped (below) |
| `middleware.ts` | the lock: HTTP Basic Auth on every path, password hashed with Web Crypto SHA-256 + salt, constant-time compare |
| `vercel.json` | headers on every path: `X-Robots-Tag: noindex, nofollow`, a same-origin-only Content-Security-Policy, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` |
| `.vercelignore` | uploads only `public/`, `middleware.ts`, `vercel.json` |
| `hash-password.mjs` | makes the two env var values from your password (asks with echo off; never from the command line, never written to disk) |
| `STRIPPED.txt` | every removal, file and line |

Rebuild it any time (worktree root): `node research/private-demo/build-public.mjs --snapshot <v10 snapshot dir>`
(the snapshot is `out/v10/snap-f5068db34a32-a4ed5432f2f7/` in int-v8's worktree). It refuses unless the baseline
is the pinned snapshot and both v10 files match the snapshot's `HASHES.txt`.

## Why HTTP Basic Auth (not a login form)

The browser sends the password itself with every same-origin request (page, JS chunks, CSS, fonts, images,
fetches), so one stateless check per request covers the whole site, with nothing to store. A login form would need a
signed session cookie (a second secret, expiry, a login page, a logout route). Basic Auth needs none of that. Any
username works; only the password counts. A reviewer sees the browser's own sign-in prompt once per browser session.
Missing or broken env vars make every request fail with 503 (fails closed, never serves the site).

## Your steps

1. **Pick a password**: 16+ random characters, or 5+ random words. Don't reuse one. (SHA-256 is fast, so the
   hash protects only a strong password.)
2. **Hash it**, in a terminal, in `out/private-demo/`:
   `node hash-password.mjs` → type it twice (nothing shows) → it prints
   `DEMO_PASS_SALT=…` and `DEMO_PASS_SHA256=…`. Run it once and use both lines from that one run.
3. **Create the Vercel project from `out/private-demo/`** (not from git: this repo must never be pushed).
   With the Vercel CLI, logged in as you: `cd out/private-demo && npx vercel@latest` → "Link to existing
   project?" No → a new project name (no "fastwork" in it is wiser) → directory `./` → framework "Other", no build
   command, output directory `public`.
4. **Set the two env vars** (Project > Settings > Environment Variables, environment Production, mark them
   **Sensitive**): `DEMO_PASS_SALT` and `DEMO_PASS_SHA256` with the values from step 2. Or with the CLI,
   `npx vercel env add DEMO_PASS_SALT production` (it asks for the value; don't put it on the command line).
5. **Turn OFF Vercel Authentication**: Project > Settings > Deployment Protection > Vercel Authentication →
   Disabled, Save. Otherwise Fastwork's reviewers meet a Vercel login before our password prompt.
6. **Deploy**: `npx vercel@latest deploy --prod` (env vars only apply to deployments made after they were set).
7. **Check it** (replace the host):
   - `curl -sI https://<project>.vercel.app/` → `401`, `www-authenticate: Basic …`, `x-robots-tag: noindex, nofollow`
   - `curl -sI https://<project>.vercel.app/_app/immutable/nodes/2.DyWL8TcE.js` → `401`
   - a private browser window → the sign-in prompt → any name + the password → the page scrolls as in our tests
   - a wrong password → the prompt again; Cancel → "Authentication required."
8. Send the URL and the password to Fastwork by separate messages. Delete the Vercel project when the request is
   settled.

To change the password: run step 2 again, replace both env vars, redeploy.

## What was stripped (in the copy only; the baseline is untouched)

| where | what | why |
|---|---|---|
| `index.html` line 13 | `<script src="/analytics.js">` removed | Google Tag Manager bootstrap: loads GTM, which loads Google Analytics, Amplitude and Hotjar, and pushes view/click events |
| `analytics.js` | not copied | the GTM bootstrap itself (dataLayer events, URL rewriting for ad params) |
| `index.html` lines 61-63 | GTM `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=…">` and its two comments removed | no-JS tracking frame |
| `index.html` line 99 | Cloudflare Web Analytics beacon `<script src="https://static.cloudflareinsights.com/beacon.min.js/…" data-cf-beacon=…>` removed | RUM beacon (posts to `/cdn-cgi/rum`) |
| `index.html` line 12 | meta CSP: GTM, Google Analytics, Hotjar, Amplitude and Cloudflare Insights origins removed from `script-src` | nothing third-party may load |
| `__vendor/` | not copied | our mirror's local copies of the GTM, gtag, Amplitude, Hotjar and Cloudflare scripts |
| `robots.txt`, `.mirror/` | not copied | as asked; `X-Robots-Tag` replaces robots.txt; `.mirror/` is our bookkeeping |
| `index.html` line 11 | added `crossorigin="use-credentials"` to the web-app manifest link | not a removal: browsers fetch a manifest without credentials, so behind Basic Auth it would get a 401 and log an error |

Left on purpose (no request leaves the demo, and the CSP header blocks every third-party host anyway):
the Cloudflare Turnstile loader in the app chunk runs only when `/api/…` answers with a challenge (the demo has no
API); the waitlist form posts only to the same-origin `/api/waitlist` (404 on the demo, so a signup goes nowhere);
the `eN({description})` "prepared analytics actions" in the page chunk are no-op descriptors (no network); og:,
twitter: and canonical/hreflang tags name `https://fastwork.com` (metadata, never fetched by the page). The v10 JS and
CSS are not edited at all, so they keep their pinned hashes.

A sweep of every text file in `public/` for GTM, gtag, dataLayer, Google Analytics, Hotjar, Amplitude, Cloudflare
Insights, `/cdn-cgi`, `sendBeacon`, Clarity, Segment, Mixpanel, PostHog, Facebook pixel and DoubleClick finds 0 hits.

## Local tests (no deploy, localhost only)

`node research/private-demo/test-local.mjs` runs `middleware.ts` in `local-server.mjs` (a stand-in for Vercel:
matcher, `x-middleware-next`, static files, `vercel.json` headers) with a throwaway random password that exists
only in the test's memory. `chrome-check.mjs` loads the demo in headless Chrome (shared lock slot, no timing).

Results, 2026-10-06 (snapshot b1789284481295-4ad4a84a, v10 JS f5068db34a32 / CSS a4ed5432f2f7):

`test-local.mjs`: **67 passed, 0 failed**.

| path | no password | 8 kinds of wrong credentials | test password | noindex | body |
|---|---|---|---|---|---|
| `/`, `/index.html` | 401 | 401 | 200 | yes | byte-identical to `public/` |
| JS: `/_app/immutable/nodes/2.DyWL8TcE.js`, a chunk | 401 | 401 | 200 | yes | identical |
| CSS: `/_app/immutable/assets/2.gBuqKVzi.css` | 401 | 401 | 200 | yes | identical |
| images: png, jpg, svg, avif, favicon.ico; a woff2 font | 401 | 401 | 200 | yes | identical |
| `/_app/version.json`, `/site.webmanifest` | 401 | 401 | 200 | yes | identical |
| `/robots.txt`, `/analytics.js`, `/__vendor/…`, `/.env`, a missing path | 401 | 401 | 404 | yes | - |

Wrong credentials tried: wrong password, empty password, password in the username slot, upper-cased, no colon,
Bearer scheme, malformed base64, the hash itself as password. Also: missing salt, missing hash or a hash that is not
64 hex -> 503 with no content even with the right password; the right password with another salt -> 401;
`hash-password.mjs` refuses a password on the command line, under 12 characters, and a non-terminal without
`--stdin`, makes a fresh salt each run, and never prints the password. The authorized response carries the CSP with
`connect-src 'self'` and no third-party host.

`chrome-check.mjs` (headless Chrome 154, 430x932 DPR 3 touch; reference = v10 exactly as the study served it,
`site-pretty` + the snapshot's V files with the mirror's local vendor copies):

| | reference (twice) | demo (signed in) | demo, prompt cancelled |
|---|---|---|---|
| requests | 117 | 108 (no analytics) | 2 (`/`, `/favicon.ico`), both 401 |
| non-localhost requests | 0 | **0** | 0 |
| failed requests | 0 | **0** | the two 401s |
| console errors / uncaught exceptions / CSP or network log errors | 0 / 0 / 0 | **0 / 0 / 0** | 0 / 0 / 2 (the 401s) |
| page shown | the site | the site, title unchanged | "Authentication required." only |
| document height | 7210 px | 7210 px | - |

Same render and scroll: the element layout of the app root (tag, class, offsetTop/Left/Width/Height of every
element) is identical to the reference at the top and at 0/25/50/75/100 % of the height (0 differing elements, as
between the two reference loads); `scrollTo` reaches the same `scrollY` at every stop. Screenshot pixels differing by
more than 32 levels, demo vs reference: 0.12 / 0.14 / 0.09 / 0 / 0.12 % at the five stops, against 0.10 / 0.05 / 0.09 /
0 / 0.10 % between two reference loads (countdown and orbit phase; the study's noise band is 0-0.4 %). A rAF
`scrollBy(40)` run stops at y = 3600 after 15 s in the reference and the demo alike (the page's own scroll handling,
not the demo).

One console warning appears in the reference and the demo alike, so it comes with v10 (or already the baseline; not checked which), not with the demo: Svelte's
"Failed to hydrate: HierarchyRequestError … appendChild" (the page then renders client-side). The reference's second
warning ("Hotjar not launching due to suspicious userAgent") is gone in the demo, with Hotjar.

## Not verifiable here (no network, no deploy)

- UNRESOLVED until the first deploy: Vercel Routing Middleware continues to the static file on a response carrying
  `x-middleware-next: 1` (what `next()` from `@vercel/functions` returns; written from memory, not checked against
  the docs because this build had no network). Step 7 decides it: if the right password gives an empty page instead
  of the site, replace that line with `import { next } from '@vercel/functions'` + `return next()` and add a
  `package.json` with `@vercel/functions`.
- Whether Vercel adds `vercel.json` headers to responses the middleware makes itself: does not matter, the
  middleware sets `X-Robots-Tag` and `Cache-Control: no-store` on its 401/503 itself.
- Safari: not tested (no iPhone or Simulator in this job); Basic Auth is standard there.
