# Fix: image-size (null result, dropped)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` lists Fastwork files: keep it on local branches, never push.

**Status:** rejected. Null result: no detectable saving on the Simulator. Not landed as a fix; this README, the manifest
and the rebuild script are kept so the experiment can be repeated.
**Stage:** D (NAMED, signed by the lead 2026-10-02), then V (Simulator, functional) → FALSIFIED.
**Device class / gate:** memory (no frame-time claim). Gate: pixels, box census, Simulator decoded memory, bytes.
No phone run (T-022), and no timing (timing is deferred).
**Driver(s) behind the claims:** Sim functional (`sim.mjs session --functional`, counts only), Chrome headless
pixel and box probes (shared lane, no timing).
**Prediction:** `fixes/PREDICTIONS.md` P-066: **FALSIFIED at this metric's resolution** (no detectable saving).
**Topic:** see `fixes/TOPICS.md` (image-size)
**Files touched:** 45 raster images under `/selling/` (same URLs, same formats, markup unchanged); no JS or CSS.

**This change was never a per-frame gain.** The aim was less decoded image memory on the iPhone, as insurance:
under memory pressure iOS might drop the page's compositing layers or tiles (UNRESOLVED: no reference found, and
not observed on this page). Nothing in this README claims smoother scrolling.

## Why it might matter

45 photos on the page are stored much larger than any screen draws them, e.g. a 480x480 seller avatar drawn
59 CSS px wide on a 430 px phone, or a 1272x1272 service photo drawn 161 CSS px wide at 1440 px. Decoded at natural
size (w x h x 4 bytes), the 45 files take 95.0 MB. That is an **upper bound**, not what Safari holds:
- WebKit decodes small images synchronously at full size.
- For large images, WebKit may decode asynchronously at the drawn size (`sizeForDrawing`). Cited in P-066:
  `RenderBoxModelObject.cpp` ~336-394 and `ImageDecoderCG.cpp` ~640-652 in WebKit main. CONFIRMED in the main
  source, not checked on the iOS 26.x build, and **not tested here**.

## What changed

Every image whose largest rendered box needs at most 0.8 of its natural size was re-saved smaller with `sips`:
- **Size:** target = min(1, need x 1.2) of the natural size.
- **need:** the largest rendered box at DPR 3 over 9 viewports, object-fit- and transform-aware.
- **Aspect ratio:** an exact-ratio target where one exists.
- **JPEG quality:** min(90, the source's own quality, estimated from its luminance table), then a lossless
  `jpegtran -optimize` pass, with decoded pixels checked identical.
- **PNG:** the chunk types sips adds that the source lacks are stripped.
- **Skipped:** 3 contain-fit logos with no exact-ratio target (`ai-automation/logo-chula`, `logo-deeplearning`,
  `logo-thammasat-cs`). Their saving is tiny and the drawn rectangle would move by ~0.1 px.
- **Overlay id:** `c5391b3e6971`, on baseline snapshot `b1789284481295-4ad4a84a`.

**Totals:**
- 45 files, bytes 3,746,422 → 2,430,627 (-1.32 MB).
- Natural-size decode 95.0 → 35.3 MB (upper bound, see above).
- 3 files grew a little at the same quality: `hero/leobeer-cover.jpg` +11.2 KB, `hero/nam-cover.jpg` +5.8 KB and
  `sellers/sound-composer/post-orchestra.jpg` +3.2 KB.

**No image bytes in git (I-067, rule 3).** `patch.diff` only lists the 45 files ("Binary files differ" plus base
sha256). The fix is reproduced from the baseline by:
- `manifest.json`: per file, the path, natural size before/after, bytes, sha256 before/after, quality, the sips
  command, need, target and where the need was measured; the tool versions (`sips-316`, libjpeg-turbo 3.1.2).
- `rebuild.mjs`: `node fixes/image-size/rebuild.mjs [outDir]` re-runs sips, jpegtran and the PNG strip, and compares
  every output with the manifest's sha256 (exit 1 on any mismatch). **Verified 2026-10-02: 45 of 45 files rebuilt
  byte-identical** into a temp dir (`out/image-size/rebuild-check`, in a `--no-timing` hold).

| file (under `/selling/`) | natural before | after | bytes before | after | JPEG q | sha256 after (12) |
|---|---|---|---|---|---|---|
| `commission/avatar-john.jpg` | 320x480 | 104x156 | 24246 | 6256 | 87 | fbf4583d67c5 |
| `commission/client-avatar-1.png` | 319x479 | 94x141 | 24571 | 5186 | 87 | e25333e4b3f0 |
| `commission/client-avatar-2.png` | 349x479 | 94x129 | 26047 | 4938 | 87 | 4ba2b8baefcb |
| `commission/client-avatar-3.png` | 320x480 | 144x216 | 24553 | 8770 | 87 | e35234fce4b6 |
| `hero/buttercup-avatar.jpg` | 250x250 | 138x138 | 8138 | 7702 | 88 | 9f007af9d7fa |
| `hero/leobeer-cover.jpg` | 1200x1148 | 900x861 | 212309 | 223529 | 86 | 0eabe80f5bcf |
| `hero/mod-avatar.jpg` | 300x300 | 136x136 | 11423 | 6185 | 86 | 6ef32a65d5e5 |
| `hero/nam-avatar.jpg` | 320x427 | 166x222 | 18867 | 9626 | 88 | 76ccf8abf053 |
| `hero/nam-cover.jpg` | 1200x1866 | 895x1392 | 388272 | 394082 | 86 | 61ffc5d1e0d4 |
| `hero/peter-avatar.jpg` | 320x480 | 140x210 | 31401 | 12607 | 88 | b1214534f85f |
| `hero/peter-cover.jpg` | 1200x2133 | 800x1422 | 351582 | 294305 | 86 | 8700a216b046 |
| `hero/slayalldeep-avatar.jpg` | 320x322 | 160x161 | 16565 | 10096 | 88 | d0aac18ff8b0 |
| `hero/weng-avatar.jpg` | 320x322 | 182x183 | 19849 | 12139 | 88 | 25ae1752e0e9 |
| `media/avatar-alt-2.jpg` | 736x920 | 144x180 | 79700 | 8853 | 80 | 9aee177ae4c1 |
| `sellers/ai-automation/avatar.jpg` | 480x480 | 260x260 | 33686 | 19251 | 88 | af448d00dacc |
| `sellers/ai-automation/logo-agicafet.jpg` | 512x512 | 166x166 | 36843 | 10445 | 90 | 1f5676c800f6 |
| `sellers/ai-automation/logo-ai-alliance.jpg` | 224x228 | 168x171 | 6414 | 6333 | 90 | 92ef717dee2b |
| `sellers/ai-automation/service-chatbot.jpg` | 1448x1086 | 832x624 | 131963 | 98827 | 86 | 775fe9e4309c |
| `sellers/ai-automation/service-setup.jpg` | 1448x1086 | 832x624 | 239197 | 154045 | 86 | c093eeddb928 |
| `sellers/ai-video-editor/avatar.jpg` | 480x480 | 138x138 | 28910 | 6162 | 88 | b985bcb59661 |
| `sellers/graphic-designer/avatar.jpg` | 480x480 | 260x260 | 43359 | 17499 | 90 | 66318351dcb1 |
| `sellers/graphic-designer/logo-sf.jpg` | 256x256 | 108x108 | 6832 | 2842 | 90 | 891ed286f3a6 |
| `sellers/graphic-designer/logo-supara.jpg` | 256x256 | 108x108 | 6459 | 2777 | 90 | 16eff570cc99 |
| `sellers/photographer/avatar.jpg` | 730x732 | 365x366 | 83341 | 32390 | 90 | 5aa2b248fb5c |
| `sellers/reviewers/r1.jpg` | 320x320 | 173x173 | 16136 | 9727 | 88 | 8e711fd1b3cb |
| `sellers/reviewers/r10.jpg` | 320x320 | 130x130 | 13926 | 6185 | 88 | aae966408167 |
| `sellers/reviewers/r11.jpg` | 320x320 | 130x130 | 15859 | 6701 | 88 | 5151d711a1a2 |
| `sellers/reviewers/r12.jpg` | 320x320 | 130x130 | 18538 | 7159 | 88 | 8bbff46aa34c |
| `sellers/reviewers/r2.jpg` | 320x320 | 173x173 | 16080 | 9962 | 88 | 3a19386f35ac |
| `sellers/reviewers/r3.jpg` | 320x320 | 173x173 | 17328 | 10094 | 88 | 0a9d1abd87d3 |
| `sellers/reviewers/r5.jpg` | 320x320 | 144x144 | 17598 | 7834 | 88 | acd80128071d |
| `sellers/reviewers/r7.jpg` | 320x320 | 130x130 | 16819 | 6888 | 88 | a52c6cceab8c |
| `sellers/reviewers/r8.jpg` | 320x320 | 159x159 | 16409 | 8690 | 88 | dc6e5e03db03 |
| `sellers/reviewers/r9.jpg` | 320x320 | 159x159 | 17596 | 8682 | 88 | e933815e7be9 |
| `sellers/sound-composer/avatar.jpg` | 640x640 | 317x317 | 30717 | 16134 | 88 | b495d5d76135 |
| `sellers/sound-composer/post-orchestra.jpg` | 1600x1067 | 1239x826 | 323367 | 326549 | 86 | 214b61b9041f |
| `sellers/sound-composer/service-feature.jpg` | 1272x1272 | 580x580 | 546320 | 151604 | 90 | a5b4bddb9c81 |
| `sellers/sound-composer/service-ost.jpg` | 900x900 | 580x580 | 67349 | 51965 | 86 | 190823ebead5 |
| `sellers/sound-composer/service-scoring.jpg` | 900x900 | 580x580 | 165829 | 120376 | 86 | 6de5a788c87d |
| `sellers/ux-ui-designer/avatar.jpg` | 640x640 | 170x170 | 67305 | 11370 | 90 | dfbefc71a627 |
| `sellers/video-editor/avatar.jpg` | 480x480 | 260x260 | 74245 | 27341 | 90 | 8a93258bbf0b |
| `sellers/video-editor/service-eye.jpg` | 1400x1099 | 800x628 | 175624 | 96437 | 90 | 005a624b98f0 |
| `sellers/web-developer/avatar.jpg` | 480x480 | 260x260 | 36449 | 21833 | 88 | d8317bbbab78 |
| `sellers/web-developer/logo-bigzweb.png` | 256x256 | 108x108 | 6603 | 2966 | png | 06a95ad540e2 |
| `sellers/web-developer/service-dd-transport.jpg` | 1400x1400 | 980x980 | 231798 | 167285 | 90 | cf9c2925b020 |

## Gate results

### Layout: box-equality census, 9 viewports

- **0 settled-size differences** over 1204 image instances.
- All 622 document-size labels equal.
- The 26 raw differences are all transient widths (1-32 px) of the animated people-o face avatar: the probe
  sampled it at different moments.

### Pixels (Chrome headless, no timing)

**Whole page, 430x932 DPR 3 (A vs B against A vs A', share of pixels with RGB sum > 48):**
- top: 0.067 % vs 0.5 %.
- bottom: 0.026 % vs 0.372 %.
- morph: 0.119 % vs 0.091 %.
- Max delta 222/224 in both pairs: the countdown and the orbit phase.

At page level the change stays within the noise of two unchanged loads, because the changed pixels are few and
small. **It is not pixel-identical.**

**Per image ("swap" probe).** In one page, the image's `src` is swapped to the new file and then back to the old
one, both as data: URLs. Diffs are taken inside the image's box. Only instances where the A/A swap is clean count.
Worst instances (max channel delta out of 255, pixels > 8):

| image | where | max | pixels > 8 |
|---|---|---|---|
| `commission/client-avatar-1.png`, 28 px avatar | 430 | 109 | 539 of 7921 (6.8 %) |
| `commission/client-avatar-2.png` | 430 / 768 | 92-103 | 220-490 |
| `sellers/web-developer/avatar.jpg`, 59 px tab avatar | 430 | 71 | 1213 of 32942 (3.7 %) |
| `sellers/video-editor/avatar.jpg` | 430 | 48 | 1436 of 32942 (4.4 %) |
| `sellers/ai-automation/avatar.jpg`, `graphic-designer/avatar.jpg` | 430 | 40 | 787-914 |
| `sellers/sound-composer/service-feature.jpg` | 1440@2 | 95 | 13310 of 80769 (16 %; A/A 201) |
| `sellers/sound-composer/service-ost.jpg` | 1440@2 | 87 | 2620 of 43491 (A/A 105) |
| `sellers/web-developer/service-dd-transport.jpg` | 1440@2 | 80 | 2118 of 54607 |
| `hero/peter-cover.jpg` | 1440@2 | 54 | 7765 of 159879 (A/A 86) |
| `hero/nam-avatar.jpg`, `hero/nam-cover.jpg`, `hero/leobeer-cover.jpg` | 768 / 1440 | 53 / 44 / 40 | 184 / 1586 / 1896 |
| reviewers `r10`-`r12`, hero avatars | 430 / 768 | 26-34 | ≤ 268 |

- **What it looks like:** small avatars come out slightly softer (eyes, hair edges), and large photos change in fine
  texture (foliage, edges).
- **Coverage:** 12 files were never caught on screen by the probe (reviewers `r1`-`r3`, `r7`-`r9`; logos `logo-sf`,
  `logo-supara`, `logo-bigzweb`; at 1440 also `r10`-`r12`). 9 more were only seen where the unchanged page itself
  moves.

**Reducing the diff did not work:**
- **Same size at JPEG quality 100:** the max delta is unchanged (client-avatar-1 109 → 107, web-developer 71 → 68).
  The count of pixels > 8 drops by 20-70 %. Bytes go +2.77 MB over the baseline.
- **Target at need x 2.0:** no lower max delta either.

The max comes from resampling: Chrome draws a 480 px source through a different downscale path than a 260 px one.

### Bytes

- The resized set per page view drops by about 0.45-0.53 MB per viewport, e.g. 430x932: 2.08 → 1.59 MB; 1440:
  1.74 → 1.21 MB.
- No new responses ≥ 400.

### Simulator decoded memory (P-066): FALSIFIED, no detectable saving

**Method:**
- Each session is `sim.mjs session --functional` in the shared lane (cold boot).
- Per arm: a fresh Safari (`sim.mjs safari-restart`), Web Inspector `Page.enable` + `Memory.enable` +
  `Memory.startTracking`, and one in-page sequence: 6 s idle at the top, walk down 0.4 vh every 250 ms, every
  `[role=tab]` clicked and its scrollers walked, 6 s hold.
- Metric: the `Memory.trackingUpdate` "images" category, peak and end. WebContent RSS from `ps` is recorded for
  information.
- Probe: `out/image-size/simmem.mjs`, gitignored.
- No session spans a Mac sleep (`pmset -g log`).
- load1 was ~3-28 in my samples; the lead saw 88 at the 14:56Z cold boot.
- Simulator MB are structure only, never a phone result.

| session (Z) | order | images peak MB per arm | walk mean MB (t 12-37 s) | note |
|---|---|---|---|---|
| s1 14:55-14:58 | C V C (V = all 45) | C 48.3, V 37.1, C 54.9 | 22.4, 24.1, 35.0 | C-C A/A 6.6 |
| s2 14:58-15:01 | V C V (all 45) | V 32.2, C 56.3, V 46.2 | 21.1, 23.9, 19.5 | V-V A/A 14.0 |
| p3 15:23-15:26 | C V C (V = 11 photos) | C 11.1, V 10.9, C 5.4 | 0.8, 0.4, 0.2 | **VOID**: both controls ~0 (F-135) |
| diag 15:30 | C | C 37.7 | 13.0 | page visible, ~58 rAF/s |
| p4 15:32-15:35 | V C V (11 photos) | V 61.9, C 37.9, V 32.8 | 35.8, 20.4, 21.3 | V-V A/A 29.1 |

**Reading:**
- Within-session V − C on the peak was -14.5 MB (s1) and -17.1 MB (s2). At first I called that a hit against s1's
  6.6 MB C-C pair.
- With every A/A pair included, the within-session A/A is 6.6, 14.0 and 29.1 MB. The control peaks span
  37.7-56.3 MB.
- The walk mean shows no consistent direction: controls 22.4/35.0/23.9 vs all-45 24.1/21.1/19.5, with A/A up to
  14.5.
- End-of-sequence values are dominated by when WebKit discards decoded data. Page totals and RSS show no signal;
  layers 0.
- By P-066's fixed rule ("~0 = within the A/A spread") the result is **falsified at this metric's resolution: no
  detectable saving.**
- The 11-photos option was not measured to a result (p3 void; p4 within noise).
- This fits the WebKit drawn-size decode for large images (cited above, not tested here). The sure part, the small
  sync-decoded avatars, is a few MB at most, below this metric's resolution.

**Void runs** (not in the table):
- 14:18-14:21Z: a DarkWake window right before a sleep; the V arm also failed because the tab host was inherited.
- 14:40, 14:45 and 14:50Z: the mirror servers had died during a Mac sleep (I-069 workaround: restart them with nohup).
- p3: see F-135.

## Why it was dropped

- No detectable saving on the Simulator.
- Not pixel-identical: up to 109/255 on small avatars, 95 on desktop photos, while the user's bar is no visible
  change.
- No per-frame gain to weigh against those.
- A three-option proposal (PR-006: all 45 / large photos only / drop; recommended: drop) was drafted and withdrawn
  before it was shown, once the A/A spread was known.

## Risks, conflicts, follow-ups

- **Pinch-zoom** (if ever revived): with only 1.2x headroom, zoomed images go soft earlier than the originals.
- **Follow-up (option 6):** `srcset`/`sizes` markup, so the browser picks a size per screen. That changes the markup
  and pixels too, so it is a separate study.
- **A better memory metric**, if this question comes back:
  - 3+ sessions, each with its own A/A pair (F-134);
  - a control floor check, so a session whose controls read ~0 is void (F-135);
  - ideally a WebKit-side count of decoded image bytes per image, rather than the noisy category total.
- **No overlap with other topics:** only image files, no JS or CSS.
- **Incidents:**
  - I-066: a leftover worktree `site/` shadowed the baseline; landed in dc5651c.
  - I-067: binaries in patch.diff; parked, the manifest + rebuild approach is used instead.
  - I-069: `safari-restart` showed a data: tab when the target server was dead (triaged to ts-i063; workaround:
    keep servers alive).
- **No measurement code changed** (`verify.mjs`, `lib/cdp.mjs` and `fix.mjs ab` untouched). The probes live in the
  gitignored `out/image-size/`.
